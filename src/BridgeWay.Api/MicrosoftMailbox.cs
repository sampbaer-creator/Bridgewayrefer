using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Azure.Cosmos;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using MimeKit;
using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

public interface IMicrosoftMailboxStore
{
    Task<JObject?> Read(CancellationToken ct);
    Task Save(JObject doc, CancellationToken ct);
}

public sealed class CosmosMailboxStore(IServiceScopeFactory scopes) : IMicrosoftMailboxStore
{
    const string Id = "microsoft-sender";
    public async Task<JObject?> Read(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var store = scope.ServiceProvider.GetRequiredService<CosmosStore>(); store.UseBusiness(CosmosStore.PlatformPartition);
        return await store.Read(Id, ct);
    }
    public async Task Save(JObject doc, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var store = scope.ServiceProvider.GetRequiredService<CosmosStore>(); store.UseBusiness(CosmosStore.PlatformPartition);
        if (doc.Value<string>("_etag") is string etag)
            await store.Operations.ReplaceItemAsync(doc, Id, store.BusinessKey, new ItemRequestOptions { IfMatchEtag = etag }, ct);
        else
        {
            var created = store.Document("mailbox", Id); created.Merge(doc);
            await store.Create(created, ct);
        }
    }
}

public sealed class MicrosoftMailbox(IMicrosoftMailboxStore store, IHttpClientFactory clients, IDataProtectionProvider protection, Settings settings)
{
    public const string Scheme = "BridgeWayMailbox";
    public const string Callback = "/signin-mailbox";
    const string Scopes = "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access";
    readonly IDataProtector protector = protection.CreateProtector("BridgeWay.MicrosoftMailbox.v1");
    readonly SemaphoreSlim gate = new(1, 1);
    string? cachedAccess;
    DateTimeOffset accessExpires;

    public static bool RequiresOAuth(string address) => address.EndsWith("@outlook.com", StringComparison.OrdinalIgnoreCase) || address.EndsWith("@hotmail.com", StringComparison.OrdinalIgnoreCase) || address.EndsWith("@live.com", StringComparison.OrdinalIgnoreCase);
    public static string Actor(ClaimsPrincipal user) => (user.FindFirstValue("tid") ?? "") + ":" + (user.FindFirstValue("oid") ?? "");
    public bool Required => RequiresOAuth(settings.SmtpUsername);

    public async Task<object> Status(CancellationToken ct)
    {
        if (!Required) return new { required = false, connected = false, email = settings.SmtpUsername };
        var doc = await store.Read(ct);
        return new { required = true, connected = doc?.Value<string>("state") == "Connected" && string.Equals(doc.Value<string>("email"), settings.SmtpUsername, StringComparison.OrdinalIgnoreCase), email = settings.SmtpUsername };
    }

    public async Task Connect(string accessToken, string refreshToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await clients.CreateClient().SendAsync(request, ct);
        if (!response.IsSuccessStatusCode) throw new IOException("Could not verify the sender mailbox.");
        var profile = JObject.Parse(await response.Content.ReadAsStringAsync(ct));
        var email = profile.Value<string>("mail") ?? profile.Value<string>("userPrincipalName");
        if (!string.Equals(email, settings.SmtpUsername, StringComparison.OrdinalIgnoreCase)) throw new ApiError(400, "Sign in with the configured BridgeWay sender mailbox.");
        if (string.IsNullOrWhiteSpace(refreshToken)) throw new IOException("Microsoft did not grant background email access.");
        await gate.WaitAsync(ct);
        try
        {
            var doc = await store.Read(ct) ?? new JObject();
            doc["email"] = email; doc["state"] = "Connected"; doc["refreshToken"] = protector.Protect(refreshToken); doc["connectedAt"] = DateTimeOffset.UtcNow.ToString("O");
            await store.Save(doc, ct);
            cachedAccess = null;
        }
        finally { gate.Release(); }
    }

    async Task<string> AccessToken(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            if (cachedAccess is not null && accessExpires > DateTimeOffset.UtcNow.AddMinutes(2)) return cachedAccess;
            var doc = await store.Read(ct);
            if (doc?.Value<string>("state") != "Connected" || !string.Equals(doc.Value<string>("email"), settings.SmtpUsername, StringComparison.OrdinalIgnoreCase)) throw new IOException("Connect the Microsoft sender mailbox in Customer onboarding.");
            using var response = await clients.CreateClient().PostAsync("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = settings.ClientId, ["client_secret"] = settings.ClientSecret, ["grant_type"] = "refresh_token",
                ["refresh_token"] = protector.Unprotect(doc.Value<string>("refreshToken")!), ["scope"] = Scopes,
            }), ct);
            if (!response.IsSuccessStatusCode)
            {
                if (response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized)
                {
                    doc["state"] = "Reconnect";
                    await store.Save(doc, ct);
                }
                throw new IOException("Microsoft mailbox authorization needs attention.");
            }
            var tokens = JObject.Parse(await response.Content.ReadAsStringAsync(ct));
            if (tokens.Value<string>("refresh_token") is string refresh)
            {
                doc["refreshToken"] = protector.Protect(refresh);
                await store.Save(doc, ct);
            }
            cachedAccess = tokens.Value<string>("access_token") ?? throw new IOException("Microsoft did not return an email token.");
            accessExpires = DateTimeOffset.UtcNow.AddSeconds(Math.Clamp(tokens.Value<int>("expires_in"), 0, 86400));
            return cachedAccess;
        }
        finally { gate.Release(); }
    }

    public async Task Send(MimeMessage message, CancellationToken ct)
    {
        if (!Required) { await AlertWorker.SendSmtp(settings, message, ct); return; }
        var access = await AccessToken(ct);
        // MIME preserves Reply-To, message IDs and the existing plain text templates.
        message.From.Clear(); message.From.Add(new MailboxAddress("BridgeWay Refer", settings.SmtpUsername));
        using var stream = new MemoryStream(); await message.WriteToAsync(stream, ct);
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://graph.microsoft.com/v1.0/me/sendMail");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
        request.Content = new StringContent(Convert.ToBase64String(stream.ToArray()), Encoding.ASCII, "text/plain");
        using var response = await clients.CreateClient().SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            if (response.StatusCode == HttpStatusCode.Unauthorized) cachedAccess = null;
            throw new IOException("Microsoft did not accept the email (HTTP " + (int)response.StatusCode + ").");
        }
    }

    public static void ConfigureAuthentication(AuthenticationBuilder auth, Settings settings)
    {
        if (!settings.IdentityConfigured) return;
        auth.AddOpenIdConnect(Scheme, options =>
        {
            options.Authority = "https://login.microsoftonline.com/consumers/v2.0";
            options.ClientId = settings.ClientId; options.ClientSecret = settings.ClientSecret;
            options.CallbackPath = Callback; options.ResponseType = OpenIdConnectResponseType.Code;
            options.ResponseMode = OpenIdConnectResponseMode.Query; options.UsePkce = true;
            options.MapInboundClaims = false; options.SaveTokens = true;
            options.Scope.Clear(); options.Scope.Add("openid"); options.Scope.Add("profile");
            foreach (var item in Scopes.Split(' ')) options.Scope.Add(item);
            options.Events.OnRedirectToIdentityProvider = ctx =>
            {
                ctx.ProtocolMessage.RedirectUri = settings.PublicOrigin + Callback;
                ctx.ProtocolMessage.Prompt = "select_account";
                ctx.ProtocolMessage.LoginHint = settings.SmtpUsername;
                return Task.CompletedTask;
            };
            options.Events.OnAuthorizationCodeReceived = ctx => { if (ctx.TokenEndpointRequest is not null) ctx.TokenEndpointRequest.RedirectUri = settings.PublicOrigin + Callback; return Task.CompletedTask; };
            options.Events.OnTicketReceived = async ctx =>
            {
                ctx.HandleResponse();
                var session = await ctx.HttpContext.AuthenticateAsync(CookieAuthenticationDefaults.AuthenticationScheme);
                if (session.Principal is null || !settings.IsPlatformAdmin(session.Principal) || (ctx.Properties is null || !ctx.Properties.Items.TryGetValue("mailboxAdmin", out var initiator) || initiator != Actor(session.Principal)))
                { ctx.Response.Redirect("/admin?mailbox=session"); return; }
                try
                {
                    await ctx.HttpContext.RequestServices.GetRequiredService<MicrosoftMailbox>().Connect(ctx.Properties.GetTokenValue("access_token") ?? "", ctx.Properties.GetTokenValue("refresh_token") ?? "", ctx.HttpContext.RequestAborted);
                    ctx.Response.Redirect("/admin?mailbox=connected");
                }
                catch (ApiError) { ctx.Response.Redirect("/admin?mailbox=wrong-account"); }
                catch (Exception) { ctx.Response.Redirect("/admin?mailbox=failed"); }
            };
            options.Events.OnRemoteFailure = ctx => { ctx.HandleResponse(); ctx.Response.Redirect("/admin?mailbox=failed"); return Task.CompletedTask; };
        });
    }

    public static void MapEndpoints(WebApplication app, Settings settings)
    {
        var admin = app.MapGroup("/api/admin/email");
        admin.AddEndpointFilter(async (ctx, next) =>
        {
            if (ctx.HttpContext.User.Identity?.IsAuthenticated != true) throw new ApiError(401, "Please sign in.");
            if (!settings.IsPlatformAdmin(ctx.HttpContext.User)) throw new ApiError(403, "Platform administrator access is required.");
            return await next(ctx);
        });
        admin.MapGet("", (MicrosoftMailbox mail, CancellationToken ct) => mail.Status(ct));
        admin.MapGet("/connect", (HttpContext ctx) =>
        {
            if (!settings.IdentityConfigured || !RequiresOAuth(settings.SmtpUsername)) throw new ApiError(503, "Microsoft sender sign-in is not configured.");
            var properties = new AuthenticationProperties { RedirectUri = settings.PublicOrigin + "/admin?mailbox=connected" };
            properties.Items["mailboxAdmin"] = Actor(ctx.User);
            return Results.Challenge(properties, [Scheme]);
        });
        admin.MapPost("/test", async (MicrosoftMailbox mail, CancellationToken ct) =>
        {
            var message = new MimeMessage(); message.From.Add(MailboxAddress.Parse(settings.SmtpUsername)); message.To.Add(MailboxAddress.Parse(settings.SmtpUsername));
            message.Subject = "BridgeWay email connection test";
            message.Body = new TextPart("plain") { Text = "Your BridgeWay sender connection is working. Walkthrough acknowledgments and onboarding invitations use this mailbox." };
            await mail.Send(message, ct);
            return Results.Ok(new { accepted = true });
        });
    }
}
