using System.Net;
using System.Security.Claims;
using System.Text.Encodings.Web;
using BridgeWay.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using Xunit;

public class ParityTests
{
    static JObject Report(string month, params string[] stamps) => JObject.FromObject(MonthlyReport.Build(stamps.Select(s => new JObject { ["doctorCode"] = "office-a", ["doctorName"] = "Office A", ["createdAt"] = s, ["name"] = "PRIVATE VALUE" }).ToList(), [], [], month, DateTimeOffset.Parse("2026-11-05T12:00:00Z")));
    [Fact] public void MountainTimeMonthBoundariesAndDstMatchLegacy()
    {
        var stamps = new[] { "2026-11-01T05:59:59Z", "2026-11-01T06:00:00Z", "2026-12-01T06:59:59Z", "2026-12-01T07:00:00Z" };
        Assert.Equal(1, Report("2026-10", stamps).Value<int>("total")); Assert.Equal(2, Report("2026-11", stamps).Value<int>("total")); Assert.Equal(1, Report("2026-12", stamps).Value<int>("total"));
    }
    [Fact] public void ReportingIncludesAllRowsAndOmitsPatientDetails()
    {
        var report = Report("2026-11", Enumerable.Repeat("2026-11-02T15:00:00Z", 12002).ToArray());
        Assert.Equal(12002, report.Value<int>("total")); Assert.Equal(12, ((JArray)report["trend"]!).Count); Assert.DoesNotContain("PRIVATE", report.ToString());
        Assert.Equal(29, ((JArray)Report("2024-02")["days"]!).Count);
    }
    [Fact] public void InactiveAndFormerOfficesRetainHistoryAndSeparateOpens()
    {
        var report = JObject.FromObject(MonthlyReport.Build([new JObject { ["doctorCode"] = "old", ["doctorName"] = "Former office", ["createdAt"] = "2026-11-03T12:00:00Z", ["status"] = "Closed" }],
            [new JObject { ["id"] = "zero", ["officeName"] = "Zero", ["active"] = false }], [new JObject { ["doctorCode"] = "old", ["createdAt"] = "2026-11-02T12:00:00Z" }], "2026-11"));
        Assert.Equal(1, report.Value<int>("total")); Assert.Equal(1, report.Value<int>("linkOpens")); Assert.Equal(2, ((JArray)report["offices"]!).Count);
    }
    [Theory] [InlineData("2026-13")] [InlineData("bad")] [InlineData("1999-01")] [InlineData("2026-1")]
    public void RejectInvalidReportingMonth(string month) => Assert.Throws<ApiError>(() => MonthlyReport.ParseMonth(month));
    [Fact] public void InvalidDateIsCountedWithoutDisclosure() { var report = Report("2026-11", "PRIVATE-BROKEN-DATE"); Assert.Equal(1, report.Value<int>("invalidDates")); Assert.DoesNotContain("PRIVATE", report.ToString()); }
    static Submission Valid => new("Fictional Patient", "fictional@example.invalid", "8015550100", "Fictional only", true, "demo-west-office", Guid.NewGuid().ToString());
    [Fact] public void SubmissionValidatesConsentLimitsHoneypotAndIdempotencyToken()
    {
        Valid.Validate();
        foreach (var invalid in new[] { Valid with { Consent = false }, Valid with { Name = new string('a', 121) }, Valid with { Email = "bad" }, Valid with { Phone = "123" }, Valid with { Website = "bot" }, Valid with { SubmissionId = "invalid" }, Valid with { Code = "../../private" } }) Assert.Throws<ApiError>(invalid.Validate);
    }
    [Fact] public async Task StaffAuthorizationRejectsAnonymousSpoofedHeadersWrongTenantAndWrongUser()
    {
        await using var app = Factory(); using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/staff/session")).StatusCode);
        client.DefaultRequestHeaders.Add("X-MS-CLIENT-PRINCIPAL", "spoofed");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/staff/session")).StatusCode);
        foreach (var value in new[] { "wrong:allowed", "tenant:wrong" })
        {
            client.DefaultRequestHeaders.Remove("X-Test-Identity"); client.DefaultRequestHeaders.Add("X-Test-Identity", value);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/staff/session")).StatusCode);
        }
        client.DefaultRequestHeaders.Remove("X-Test-Identity"); client.DefaultRequestHeaders.Add("X-Test-Identity", "tenant:allowed");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/staff/session")).StatusCode);
    }
    [Fact] public async Task WriteGuardRejectsCrossOriginAndNonJsonBeforeStorage()
    {
        await using var app = Factory(); using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync("/api/referrals", new StringContent("{}"))).StatusCode);
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:3000");
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await client.PostAsync("/api/referrals", new StringContent("{}"))).StatusCode);
    }
    static WebApplicationFactory<Program> Factory() => new WebApplicationFactory<Program>().WithWebHostBuilder(web =>
    {
        web.UseEnvironment("Development").UseSetting("Cosmos:Endpoint", "https://example.documents.azure.com/").UseSetting("BridgeWay:LocalDemoStaff", "false").UseSetting("BridgeWay:TenantId", "tenant").UseSetting("BridgeWay:StaffObjectIds:0", "allowed");
        web.ConfigureServices(services =>
        {
            services.AddAuthentication().AddScheme<AuthenticationSchemeOptions, TestAuth>("Test", _ => {});
            services.PostConfigure<AuthenticationOptions>(options => options.DefaultAuthenticateScheme = "Test");
        });
    });
}
public sealed class TestAuth(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var parts = Request.Headers["X-Test-Identity"].ToString().Split(':');
        return Task.FromResult(parts.Length == 2 ? AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity([new Claim("tid", parts[0]), new Claim("oid", parts[1])], "Test")), "Test")) : AuthenticateResult.NoResult());
    }
}
