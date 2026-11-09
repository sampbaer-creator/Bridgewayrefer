using System.Net;
using System.Text.RegularExpressions;
using Azure.Identity;
using BridgeWay.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.Azure.Cosmos;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);
var settings = new Settings();
builder.Configuration.GetSection("BridgeWay").Bind(settings);
if (!Regex.IsMatch(settings.BusinessId, @"\A[A-Za-z0-9_-]{1,80}\z")) throw new InvalidOperationException("Configure a valid business ID.");
if (!Uri.TryCreate(settings.PublicOrigin, UriKind.Absolute, out var origin) || origin.AbsolutePath != "/" || origin.Query.Length > 0 || origin.Fragment.Length > 0 || origin.UserInfo.Length > 0) throw new InvalidOperationException("PublicOrigin must be an origin without a path.");
if (!builder.Environment.IsDevelopment() && (settings.LocalDemoStaff || origin.Scheme != "https")) throw new InvalidOperationException("Production requires HTTPS and authenticated staff.");
if (settings.LocalDemoStaff && !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WEBSITE_INSTANCE_ID"))) throw new InvalidOperationException("Local demo staff cannot run in Azure.");
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
    if (!builder.Environment.IsDevelopment()) throw new InvalidOperationException("Use managed identity outside Development.");
    return new CosmosClient(endpoint, key, options);
});
builder.Services.AddSingleton<IXmlRepository, CosmosXmlRepository>();
builder.Services.AddDataProtection().SetApplicationName("BridgeWay");
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
    options.Authority = $"https://login.microsoftonline.com/{settings.TenantId}/v2.0";
    options.ClientId = settings.ClientId; options.ClientSecret = settings.ClientSecret;
    options.ResponseType = OpenIdConnectResponseType.Code; options.UsePkce = true;
    options.Scope.Add("email");
    options.SaveTokens = false; options.MapInboundClaims = false; options.CallbackPath = "/signin-oidc";
    options.Events.OnRedirectToIdentityProvider = ctx => { ctx.ProtocolMessage.RedirectUri = settings.PublicOrigin + "/signin-oidc"; return Task.CompletedTask; };
    options.Events.OnAuthorizationCodeReceived = ctx => { if (ctx.TokenEndpointRequest is not null) ctx.TokenEndpointRequest.RedirectUri = settings.PublicOrigin + "/signin-oidc"; return Task.CompletedTask; };
    options.Events.OnRemoteFailure = ctx => { ctx.HandleResponse(); ctx.Response.Redirect("/sign-in?error=signin"); return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
var app = builder.Build();
if (args.Contains("--seed")) { if (!app.Environment.IsDevelopment()) throw new InvalidOperationException("Seed data is restricted to Development."); await using var scope = app.Services.CreateAsyncScope(); await scope.ServiceProvider.GetRequiredService<CosmosStore>().Seed(); Console.WriteLine("Fictional demo businesses seeded in Cosmos."); return; }
var importIndex = Array.IndexOf(args, "--import");
if (importIndex >= 0)
{
    if (importIndex + 1 >= args.Length) throw new InvalidOperationException("Supply a local JSON export path after --import.");
    await using var scope = app.Services.CreateAsyncScope(); await LegacyImport.Run(scope.ServiceProvider.GetRequiredService<CosmosStore>(), settings, args[importIndex + 1]); return;
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
app.MapGet("/staff/login", (string? workspace) => settings.LocalDemoStaff ? Results.Redirect("/staff") : settings.IdentityConfigured
    ? Results.Challenge(new AuthenticationProperties { RedirectUri = settings.PublicOrigin + "/staff" + (string.IsNullOrWhiteSpace(workspace) ? "" : "?workspace=" + Uri.EscapeDataString(workspace)) }, [OpenIdConnectDefaults.AuthenticationScheme])
    : Results.Redirect("/sign-in?error=configuration"));
app.MapPost("/api/logout", async (HttpContext ctx) => { await ctx.SignOutAsync(); return Results.Ok(new { ok = true }); });
app.MapBridgeWay(settings, builder.Environment);
app.MapStripeWebhook();
app.Run();
public partial class Program { }
