using System.Net;
using BridgeWay.Api;
using Microsoft.AspNetCore.DataProtection;
using MimeKit;
using Newtonsoft.Json.Linq;
using Xunit;

public class MicrosoftMailboxTests
{
    static Settings Settings() => new() { SmtpUsername = "bridgewayrefer@outlook.com", ClientId = "client", ClientSecret = "secret", TenantId = "tenant", AlertsEnabled = true };
    sealed class Store : IMicrosoftMailboxStore
    {
        public JObject? Document;
        public int Writes;
        public Task<JObject?> Read(CancellationToken ct) => Task.FromResult(Document is null ? null : new JObject(Document));
        public Task Save(JObject doc, CancellationToken ct) { Document = new JObject(doc); Writes++; return Task.CompletedTask; }
    }
    sealed class Http(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler, IHttpClientFactory
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => send(request);
        public HttpClient CreateClient(string name) => new(this, false);
    }
    static HttpResponseMessage Json(string body, HttpStatusCode status = HttpStatusCode.OK) => new(status) { Content = new StringContent(body) };

    [Fact]
    public async Task WrongMailboxNeverReplacesTheSavedAuthorization()
    {
        var store = new Store();
        var http = new Http(_ => Task.FromResult(Json("{\"mail\":\"someone@example.invalid\"}")));
        var mail = new MicrosoftMailbox(store, http, new EphemeralDataProtectionProvider(), Settings());
        await Assert.ThrowsAsync<ApiError>(() => mail.Connect("access", "refresh", default));
        Assert.Equal(0, store.Writes);
    }

    [Fact]
    public async Task ConnectEncryptsTheRefreshTokenAndSendRotatesItWithoutExposingTokens()
    {
        var store = new Store(); var protection = new EphemeralDataProtectionProvider();
        var sent = 0; var refreshed = 0;
        var http = new Http(async request =>
        {
            if (request.RequestUri!.AbsolutePath == "/v1.0/me") return Json("{\"mail\":\"bridgewayrefer@outlook.com\"}");
            if (request.RequestUri.AbsolutePath.EndsWith("/token"))
            {
                refreshed++;
                Assert.Contains("refresh_token=first-refresh", await request.Content!.ReadAsStringAsync());
                return Json("{\"access_token\":\"mail-access\",\"refresh_token\":\"rotated-refresh\",\"expires_in\":3600}");
            }
            Assert.Equal("/v1.0/me/sendMail", request.RequestUri.AbsolutePath);
            Assert.Equal("Bearer", request.Headers.Authorization!.Scheme);
            Assert.Equal("mail-access", request.Headers.Authorization.Parameter);
            var mime = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(await request.Content!.ReadAsStringAsync()));
            Assert.Contains("bridgewayrefer@outlook.com", mime);
            Assert.Contains("Reply-To: customer@example.invalid", mime);
            sent++;
            return new HttpResponseMessage(HttpStatusCode.Accepted);
        });
        var mail = new MicrosoftMailbox(store, http, protection, Settings());
        await mail.Connect("initial-access", "first-refresh", default);
        Assert.DoesNotContain("first-refresh", store.Document!.ToString());
        Assert.DoesNotContain("initial-access", store.Document.ToString());
        var message = new MimeMessage(); message.To.Add(MailboxAddress.Parse("owner@example.invalid")); message.ReplyTo.Add(MailboxAddress.Parse("customer@example.invalid")); message.Body = new TextPart("plain") { Text = "Test" };
        await mail.Send(message, default); await mail.Send(message, default);
        Assert.Equal(1, refreshed); Assert.Equal(2, sent);
        Assert.Equal("rotated-refresh", protection.CreateProtector("BridgeWay.MicrosoftMailbox.v1").Unprotect(store.Document.Value<string>("refreshToken")!));
    }

    [Fact]
    public async Task MissingConnectionDoesNotTryPasswordAuthentication()
    {
        var mail = new MicrosoftMailbox(new Store(), new Http(_ => throw new Exception("No network call expected")), new EphemeralDataProtectionProvider(), Settings());
        await Assert.ThrowsAsync<IOException>(() => mail.Send(new MimeMessage(), default));
    }

    [Fact]
    public async Task RevokedConsentMarksTheConnectionForReauthorization()
    {
        var store = new Store(); var protection = new EphemeralDataProtectionProvider();
        store.Document = new JObject { ["email"] = "bridgewayrefer@outlook.com", ["state"] = "Connected", ["refreshToken"] = protection.CreateProtector("BridgeWay.MicrosoftMailbox.v1").Protect("revoked") };
        var mail = new MicrosoftMailbox(store, new Http(_ => Task.FromResult(Json("{}", HttpStatusCode.BadRequest))), protection, Settings());
        await Assert.ThrowsAsync<IOException>(() => mail.Send(new MimeMessage(), default));
        Assert.Equal("Reconnect", store.Document.Value<string>("state"));
    }
}
