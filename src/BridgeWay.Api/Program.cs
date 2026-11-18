using System.Net;
using System.Security.Claims;
using System.Text.RegularExpressions;
using Azure.Identity;
using BridgeWay.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.Azure.Cosmos;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);
var settings = new Settings();
builder.Configuration.GetSection("BridgeWay").Bind(settings); // Preserve existing deployment settings.
builder.Configuration.GetSection("Bridgewayrefer").Bind(settings);
var production = !builder.Environment.IsDevelopment();
if (!production) settings.AllowStripeTestMode = true;
if (settings.BusinessId.Length > 0 && !Regex.IsMatch(settings.BusinessId, @"\A[A-Za-z0-9_-]{1,80}\z")) throw new InvalidOperationException("BusinessId contains invalid characters.");
if (!Uri.TryCreate(settings.PublicOrigin, UriKind.Absolute, out var origin) || origin.AbsolutePath != "/" || origin.Query.Length > 0 || origin.Fragment.Length > 0 || origin.UserInfo.Length > 0) throw new InvalidOperationException("PublicOrigin must be an origin without a path.");
if (production && origin.Scheme != "https") throw new InvalidOperationException("Production requires an HTTPS PublicOrigin.");
if (production && !settings.IdentityConfigured) throw new InvalidOperationException("Production requires Bridgewayrefer:TenantId, ClientId and ClientSecret for staff sign-in.");
if (production && settings.PlatformAdminObjectIds.Length == 0) throw new InvalidOperationException("Set Bridgewayrefer:PlatformAdminObjectIds:0 to your Entra object ID so someone can reach /admin.");
var cosmosDatabase = builder.Configuration["Cosmos:Database"];
if (string.IsNullOrWhiteSpace(cosmosDatabase))
{
    if (production) throw new InvalidOperationException("Set Cosmos:Database. Production never falls back to a development database.");
    builder.Configuration["Cosmos:Database"] = "bridgeway-dev";
}
settings.PublicOrigin = settings.PublicOrigin.TrimEnd('/');
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 524288);
builder.Services.AddSingleton(settings);
builder.Services.AddHttpClient<StripeBillingService>();
builder.Services.AddSingleton(_ =>
{
    var endpoint = builder.Configuration["Cosmos:Endpoint"] ?? throw new InvalidOperationException("Set Cosmos:Endpoint.");
    if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || uri.Scheme != "https") throw new InvalidOperationException("Cosmos endpoint must use HTTPS.");
    var options = new CosmosClientOptions { ConnectionMode = ConnectionMode.Gateway };
    var key = builder.Configuration["Cosmos:Key"];
    if (string.IsNullOrWhiteSpace(key)) return new CosmosClient(endpoint, new DefaultAzureCredential(), options);
    if (production) throw new InvalidOperationException("Use managed identity outside Development.");
    return new CosmosClient(endpoint, key, options);
});
builder.Services.AddSingleton<IXmlRepository, CosmosXmlRepository>();
var dataProtection = builder.Services.AddDataProtection().SetApplicationName("BridgeWay");
var keyVaultKey = builder.Configuration["DataProtection:KeyVaultKeyUri"];
if (!string.IsNullOrWhiteSpace(keyVaultKey))
{
    if (!Uri.TryCreate(keyVaultKey, UriKind.Absolute, out var keyUri) || keyUri.Scheme != "https") throw new InvalidOperationException("DataProtection:KeyVaultKeyUri must be an HTTPS Key Vault key identifier.");
    dataProtection.ProtectKeysWithAzureKeyVault(keyUri, new DefaultAzureCredential());
}
else if (production) throw new InvalidOperationException("Set DataProtection:KeyVaultKeyUri so the cookie key ring stored in Cosmos is encrypted at rest.");
builder.Services.AddOptions<KeyManagementOptions>().Configure<IXmlRepository>((options, repository) => options.XmlRepository = repository);
builder.Services.AddScoped<BusinessContext>();
builder.Services.AddScoped<CosmosStore>();
builder.Services.Configure<ForwardedHeadersOptions>(options => { options.ForwardedHeaders = ForwardedHeaders.XForwardedFor; options.ForwardLimit = 1; });
builder.Services.AddHostedService<AlertWorker>();
var auth = builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.Cookie.Name = "BridgeWay.Staff"; options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax; options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromHours(1); options.SlidingExpiration = false;
    options.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
    options.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
});
if (settings.IdentityConfigured) auth.AddOpenIdConnect(OpenIdConnectDefaults.AuthenticationScheme, options =>
{
    options.Authority = settings.EffectiveAuthority;
    if (settings.MultiTenantSignIn)
    {
        // Multi-tenant tokens carry the signing tenant's issuer. Accept only Microsoft login issuers for a tenant GUID;
        // access is then decided by the active membership keyed by tid and oid.
        options.TokenValidationParameters.IssuerValidator = (issuer, _, _) =>
            System.Text.RegularExpressions.Regex.IsMatch(issuer ?? "", @"\Ahttps://login\.microsoftonline\.com/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/v2\.0\z")
                ? issuer!
                : throw new Microsoft.IdentityModel.Tokens.SecurityTokenInvalidIssuerException("Issuer is not a Microsoft sign-in tenant.");
    }
    options.ClientId = settings.ClientId; options.ClientSecret = settings.ClientSecret;
    options.ResponseType = OpenIdConnectResponseType.Code; options.UsePkce = true;
    options.Scope.Add("email");
    options.SaveTokens = false; options.MapInboundClaims = false; options.CallbackPath = "/signin-oidc";
    options.Events.OnRedirectToIdentityProvider = ctx =>
    {
        ctx.ProtocolMessage.RedirectUri = settings.PublicOrigin + "/signin-oidc";
        // Invited email-code guests must authenticate in the resource directory.
        // The common endpoint cannot discover an email-only guest identity.
        if (ctx.Properties.RedirectUri == settings.PublicOrigin + "/admin")
            ctx.ProtocolMessage.IssuerAddress = $"https://login.microsoftonline.com/{settings.TenantId}/oauth2/v2.0/authorize";
        return Task.CompletedTask;
    };
    options.Events.OnAuthorizationCodeReceived = ctx => { if (ctx.TokenEndpointRequest is not null) ctx.TokenEndpointRequest.RedirectUri = settings.PublicOrigin + "/signin-oidc"; return Task.CompletedTask; };
    options.Events.OnRemoteFailure = ctx => { ctx.HandleResponse(); ctx.Response.Redirect("/sign-in?error=signin"); return Task.CompletedTask; };
});
const string googleScheme = "Google";
var googleClientId = builder.Configuration["Authentication:Google:ClientId"];
var googleClientSecret = builder.Configuration["Authentication:Google:ClientSecret"];
var googleConfigured = !string.IsNullOrWhiteSpace(googleClientId) && !string.IsNullOrWhiteSpace(googleClientSecret);
if (googleConfigured)
{
    auth.AddOpenIdConnect(googleScheme, options =>
    {
        options.Authority = "https://accounts.google.com";
        options.ClientId = googleClientId!;
        options.ClientSecret = googleClientSecret!;
        options.ResponseType = OpenIdConnectResponseType.Code;
        options.ResponseMode = OpenIdConnectResponseMode.Query;
        options.UsePkce = true;
        options.MapInboundClaims = false;
        options.SaveTokens = false;
        options.Scope.Add("email");
        options.CallbackPath = "/signin-google";
        options.Events.OnRedirectToIdentityProvider = ctx =>
        {
            ctx.ProtocolMessage.RedirectUri = settings.PublicOrigin + "/signin-google";
            return Task.CompletedTask;
        };
        options.Events.OnAuthorizationCodeReceived = ctx =>
        {
            if (ctx.TokenEndpointRequest is not null)
                ctx.TokenEndpointRequest.RedirectUri = settings.PublicOrigin + "/signin-google";
            return Task.CompletedTask;
        };
        options.Events.OnTokenValidated = ctx =>
        {
            var subject = ctx.Principal?.FindFirstValue("sub");
            var email = ctx.Principal?.FindFirstValue("email");
            var verified = ctx.Principal?.FindFirstValue("email_verified");
            if (string.IsNullOrWhiteSpace(subject) || !Endpoints.ValidEmail(email) ||
                !string.Equals(verified, "true", StringComparison.OrdinalIgnoreCase))
            {
                ctx.Fail("Google must provide a verified email.");
                return Task.CompletedTask;
            }
            var identity = new ClaimsIdentity(googleScheme);
            identity.AddClaim(new Claim("tid", Settings.GoogleTenant));
            // Encode the subject so the existing case-insensitive membership lookup retains exact identity.
            identity.AddClaim(new Claim("oid", "google-" + Convert.ToHexString(System.Text.Encoding.UTF8.GetBytes(subject))));
            identity.AddClaim(new Claim("email", email!));
            if (email!.EndsWith("@gmail.com", StringComparison.OrdinalIgnoreCase) ||
                !string.IsNullOrWhiteSpace(ctx.Principal?.FindFirstValue("hd")))
                identity.AddClaim(new Claim("bridgeway_google_email_authoritative", "true"));
            ctx.Principal = new ClaimsPrincipal(identity);
            return Task.CompletedTask;
        };
        options.Events.OnRemoteFailure = ctx =>
        {
            ctx.HandleResponse();
            ctx.Response.Redirect("/sign-in?error=signin");
            return Task.CompletedTask;
        };
    });
}
builder.Services.AddAuthorization();
var app = builder.Build();
if (args.Contains("--purge-demo-data"))
{
    await using var scope = app.Services.CreateAsyncScope();
    var removed = await scope.ServiceProvider.GetRequiredService<CosmosStore>().PurgeDemoData();
    Console.WriteLine($"Removed {removed} demo and test records."); return;
}
var importIndex = Array.IndexOf(args, "--import");
if (importIndex >= 0)
{
    if (importIndex + 1 >= args.Length) throw new InvalidOperationException("Supply a local JSON export path after --import.");
    if (settings.BusinessId.Length == 0) throw new InvalidOperationException("Set Bridgewayrefer:BusinessId to the business that should receive the import.");
    await using var scope = app.Services.CreateAsyncScope(); var importStore = scope.ServiceProvider.GetRequiredService<CosmosStore>(); importStore.UseBusiness(settings.BusinessId); await LegacyImport.Run(importStore, settings, args[importIndex + 1]); return;
}
app.UseForwardedHeaders();
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "same-origin";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    try
    {
        if ((context.Request.Method is "POST" or "PATCH" or "PUT" or "DELETE") && context.Request.Path.StartsWithSegments("/api"))
        {
            if (!context.Request.Path.Equals("/api/stripe/webhook") && context.Request.Headers.Origin != settings.PublicOrigin) throw new ApiError(403, "Access denied.");
            if (!context.Request.HasJsonContentType()) throw new ApiError(415, "JSON required.");
        }
        await next(context);
    }
    catch (ApiError e) { context.Response.StatusCode = e.Status; await context.Response.WriteAsJsonAsync(new { error = e.Message }); }
    catch (BadHttpRequestException e) { context.Response.StatusCode = e.StatusCode; await context.Response.WriteAsJsonAsync(new { error = "Please check the request." }); }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
    catch (Exception e)
    {
        app.Logger.LogWarning("Request failed ({Kind}, HTTP {Status}); record details suppressed.", e.GetType().Name, e is CosmosException cosmos ? (int)cosmos.StatusCode : 0);
        context.Response.StatusCode = e is Newtonsoft.Json.JsonException ? 400 : 503;
        await context.Response.WriteAsJsonAsync(new { error = e is Newtonsoft.Json.JsonException ? "Please check the form." : "Service unavailable. Please try again." });
    }
});
app.UseAuthentication(); app.UseAuthorization();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/health/cosmos", async (CosmosStore store, CancellationToken ct) =>
{
    await store.Cards.ReadContainerAsync(cancellationToken: ct); await store.Operations.ReadContainerAsync(cancellationToken: ct);
    return Results.Ok(new { status = "connected" });
});
app.MapGet("/admin/login", () => settings.IdentityConfigured
    ? Results.Challenge(new AuthenticationProperties { RedirectUri = settings.PublicOrigin + "/admin" }, [OpenIdConnectDefaults.AuthenticationScheme])
    : Results.Redirect("/sign-in?error=configuration"));
app.MapGet("/api/auth/providers", () => Results.Ok(new { google = googleConfigured }));
app.MapGet("/staff/login", (string? workspace, string? flow, string? provider) =>
{
    var useGoogle = provider == "google";
    if (useGoogle ? !googleConfigured : !settings.IdentityConfigured)
        return Results.Redirect("/sign-in?error=configuration");
    var destination = flow switch
    {
        "signup" => "/signup",
        "admin" => "/admin",
        _ => "/staff" + (string.IsNullOrWhiteSpace(workspace) ? "" : "?workspace=" + Uri.EscapeDataString(workspace))
    };
    return Results.Challenge(new AuthenticationProperties { RedirectUri = settings.PublicOrigin + destination }, [useGoogle ? googleScheme : OpenIdConnectDefaults.AuthenticationScheme]);
});
app.MapPost("/api/logout", async (HttpContext ctx) => { await ctx.SignOutAsync(); return Results.Ok(new { ok = true }); });
app.MapBridgeWay(settings);
app.MapPlatformAdmin(settings);
app.MapStripeWebhook();
app.Run();
public partial class Program { }
