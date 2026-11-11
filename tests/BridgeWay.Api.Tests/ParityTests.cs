using System.Net;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Xml.Linq;
using BridgeWay.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Configuration;
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
    [Fact] public void PartnerOutcomesUseOutcomeEventMonthAndStatusHistory()
    {
        var referrals = new List<JObject>
        {
            new() { ["id"] = "ref-a", ["partnerId"] = "partner-a", ["partnerName"] = "Builder One", ["status"] = "Closed", ["createdAt"] = "2026-11-03T12:00:00Z" },
            new() { ["id"] = "ref-b", ["partnerId"] = "partner-a", ["partnerName"] = "Builder One", ["status"] = "New", ["createdAt"] = "2026-11-05T12:00:00Z" },
            new() { ["id"] = "ref-c", ["partnerId"] = "partner-b", ["partnerName"] = "Builder Two", ["status"] = "Closed", ["createdAt"] = "2026-11-07T12:00:00Z" },
        };
        var partners = new List<JObject> { new() { ["id"] = "partner-a", ["type"] = "partner", ["name"] = "Builder One", ["active"] = true }, new() { ["id"] = "partner-b", ["type"] = "partner", ["name"] = "Builder Two", ["active"] = true } };
        var history = new List<JObject> { new() { ["referralId"] = "ref-a", ["status"] = "Completed", ["changedAt"] = "2026-11-08T12:00:00Z", ["partnerId"] = "partner-a" }, new() { ["referralId"] = "ref-a", ["status"] = "Won", ["changedAt"] = "2026-11-09T12:00:00Z", ["partnerId"] = "partner-a" }, new() { ["referralId"] = "ref-c", ["status"] = "Completed", ["changedAt"] = "2026-11-09T12:00:00Z", ["partnerId"] = "partner-b" } };
        var report = JObject.FromObject(MonthlyReport.Build(referrals, partners, [], "2026-11", DateTimeOffset.Parse("2026-11-10T12:00:00Z"), history));
        Assert.Equal(3, report.Value<int>("total")); Assert.Equal(2, report.Value<int>("outcomes")); Assert.True(report.Value<bool>("hasSubmissions"));
        var a = ((JArray)report["offices"]!).Single(x => x.Value<string>("officeId") == "partner-a");
        Assert.Equal(2, a.Value<int>("count")); Assert.Equal(1, a.Value<int>("outcomes")); Assert.Null(a["outcomeRate"]);
        Assert.Equal("Completed requests this month", report.Value<string>("outcomeLabel"));
    }
    [Fact] public void OutcomesFollowTheEventMonthWhenReferralCohortIsEarlier()
    {
        var referral = new JObject { ["id"] = "ref-cross-month", ["partnerId"] = "partner-a", ["partnerName"] = "HVAC Partner", ["status"] = "Completed", ["createdAt"] = "2026-11-30T19:00:00-07:00", ["updatedAt"] = "2026-12-02T09:30:00-07:00" };
        var history = new List<JObject> { new() { ["referralId"] = "ref-cross-month", ["status"] = "Completed", ["changedAt"] = "2026-12-02T09:30:00-07:00", ["partnerId"] = "partner-a" } };
        var partners = new List<JObject> { new() { ["id"] = "partner-a", ["type"] = "partner", ["name"] = "HVAC Partner", ["active"] = true } };
        var november = JObject.FromObject(MonthlyReport.Build([referral], partners, [], "2026-11", DateTimeOffset.Parse("2026-12-10T12:00:00Z"), history));
        var december = JObject.FromObject(MonthlyReport.Build([referral], partners, [], "2026-12", DateTimeOffset.Parse("2026-12-10T12:00:00Z"), history));
        Assert.Equal(1, november.Value<int>("total")); Assert.Equal(0, november.Value<int>("outcomes"));
        Assert.Equal(0, december.Value<int>("total")); Assert.Equal(1, december.Value<int>("outcomes"));
        Assert.Contains("2026-12", december["availableMonths"]!.Values<string>());
        var attributedWithoutCohortRead = JObject.FromObject(MonthlyReport.Build([], partners, [], "2026-12", DateTimeOffset.Parse("2026-12-10T12:00:00Z"), history));
        Assert.Equal(1, attributedWithoutCohortRead.Value<int>("outcomes"));
    }
    [Fact] public void TestReferralsAndTheirHistoryNeverEnterNormalReports()
    {
        var referral = new JObject { ["id"] = "ref-test-one", ["isTest"] = true, ["partnerId"] = "partner-a", ["status"] = "Completed", ["createdAt"] = "2026-11-02T12:00:00Z", ["updatedAt"] = "2026-11-05T12:00:00Z" };
        var history = new List<JObject> { new() { ["isTest"] = true, ["referralId"] = "ref-test-one", ["status"] = "Completed", ["changedAt"] = "2026-11-05T12:00:00Z", ["partnerId"] = "partner-a" } };
        var report = JObject.FromObject(MonthlyReport.Build([referral], [], [], "2026-11", DateTimeOffset.Parse("2026-11-10T12:00:00Z"), history));
        Assert.Equal(0, report.Value<int>("total")); Assert.Equal(0, report.Value<int>("outcomes"));
    }
    [Fact] public void TestReferralIsSyntheticAttributedAndNeverCreatesAnAlert()
    {
        using var client = new Microsoft.Azure.Cosmos.CosmosClient("https://localhost:8081", "bG9jYWwtdGVzdC1rZXk=");
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Cosmos:Database"] = "bridgeway-tests" }).Build();
        var store = new CosmosStore(client, config, new Settings()); store.UseBusiness("orthodontics-stage-a");
        var card = new JObject { ["id"] = "card-code-a", ["businessId"] = "orthodontics-stage-a", ["active"] = true, ["partnerId"] = "partner-a", ["officeId"] = "office-a", ["resolvedPartnerName"] = "General Dentist", ["resolvedOfficeName"] = "Orthodontics" };
        Assert.True(TestReferralRules.IsCardForWorkspace(card, "orthodontics-stage-a"));
        Assert.False(TestReferralRules.IsCardForWorkspace(card, "hvac-stage-b"));
        Assert.False(TestReferralRules.IsCardForWorkspace(new JObject(card) { ["active"] = false }, "orthodontics-stage-a"));
        Assert.False(TestReferralRules.IsCardForWorkspace(new JObject { ["id"] = "legacy-card", ["businessId"] = "orthodontics-stage-a", ["active"] = true }, "orthodontics-stage-a"));
        var id = Guid.Parse("d8c782b0-cd57-4ba3-bfe6-e09c2ae75c81");
        var (referral, history) = TestReferralRules.Create(store, card, "admin-a", id);
        Assert.Equal("orthodontics-stage-a", referral.Value<string>("businessId")); Assert.Equal("partner-a", referral.Value<string>("partnerId"));
        Assert.Equal("office-a", referral.Value<string>("officeId")); Assert.True(referral.Value<bool>("isTest"));
        Assert.True(history.Value<bool>("isTest")); Assert.Equal(referral.Value<string>("id"), history.Value<string>("referralId"));
        Assert.Equal("test-referral@bridgeway.invalid", referral.Value<string>("email"));
        Assert.Equal(new[] { "referral", "status-history" }, new[] { referral.Value<string>("type"), history.Value<string>("type") });
        Assert.Equal("ref-test-" + id, TestReferralRules.Id(id));
        Assert.True(TestReferralRules.IsRepeat(new JObject { ["type"] = "referral", ["isTest"] = true }));
        Assert.False(TestReferralRules.IsRepeat(new JObject { ["type"] = "referral", ["isTest"] = false }));
        Assert.Equal(new[] { "CardCode", "SubmissionId" }, typeof(TestReferralCreate).GetProperties().Select(p => p.Name));
    }
    [Fact] public void MembershipSelectionNeverFallsBackToAnotherBusiness()
    {
        var memberships = new[]
        {
            new JObject { ["businessId"] = "dental-a", ["active"] = true, ["role"] = "Staff" },
            new JObject { ["businessId"] = "trades-b", ["active"] = true, ["role"] = "Admin" },
            new JObject { ["businessId"] = "closed-c", ["active"] = false, ["role"] = "Admin" },
        };
        Assert.Equal("dental-a", TenantAuthorization.SelectActiveMembership(memberships, "dental-a")?.Value<string>("businessId"));
        Assert.Null(TenantAuthorization.SelectActiveMembership(memberships, "not-a-member"));
        Assert.Null(TenantAuthorization.SelectActiveMembership(memberships, "closed-c"));
        Assert.False(TenantAuthorization.HasRole(memberships[0], "Admin")); Assert.True(TenantAuthorization.HasRole(memberships[1], "Admin"));
        Assert.NotEqual(CosmosStore.MembershipId("tenant-a", "user"), CosmosStore.MembershipId("tenant-b", "user"));
    }
    [Fact] public void InviteConflictCannotRestoreInactiveOrCrossTenantMembership()
    {
        var member = new JObject { ["active"] = true, ["businessId"] = "dental-a", ["tenantId"] = "tenant-a", ["oid"] = "guest-1", ["role"] = "Staff" };
        Assert.True(TenantAuthorization.IsActiveMembershipFor(member, "dental-a", "tenant-a", "guest-1"));
        Assert.False(TenantAuthorization.IsActiveMembershipFor(new JObject(member) { ["active"] = false }, "dental-a", "tenant-a", "guest-1"));
        Assert.False(TenantAuthorization.IsActiveMembershipFor(member, "dental-a", "tenant-b", "guest-1"));
        Assert.False(TenantAuthorization.IsActiveMembershipFor(member, "trades-b", "tenant-a", "guest-1"));
        Assert.False(TenantAuthorization.IsActiveMembershipFor(member, "dental-a", "tenant-a", "guest-2"));
    }
    [Fact] public void GuestInvitesRequireMatchingEmailWorkspaceRoleAndUnexpiredPendingState()
    {
        var now = DateTimeOffset.Parse("2026-11-09T12:00:00Z");
        var invite = new JObject { ["type"] = "membership-invite", ["businessId"] = "dental-a", ["state"] = "Pending", ["email"] = "Guest@Example.Invalid", ["role"] = "Staff", ["expiresAt"] = now.AddMinutes(1).ToString("O") };
        Assert.True(TenantAuthorization.IsValidInvite(invite, "dental-a", "guest@example.invalid", now));
        Assert.False(TenantAuthorization.IsValidInvite(invite, "trades-b", "guest@example.invalid", now));
        Assert.False(TenantAuthorization.IsValidInvite(invite, "dental-a", "other@example.invalid", now));
        Assert.False(TenantAuthorization.IsValidInvite(new JObject(invite) { ["expiresAt"] = now.ToString("O") }, "dental-a", "guest@example.invalid", now));
        Assert.False(TenantAuthorization.IsValidInvite(new JObject(invite) { ["state"] = "Accepted" }, "dental-a", "guest@example.invalid", now));
        Assert.False(TenantAuthorization.IsValidInvite(new JObject(invite) { ["role"] = "Owner" }, "dental-a", "guest@example.invalid", now));
    }
    [Fact] public void AlertRetriesUseBoundedBackoffAndExposeTerminalFailure()
    {
        Assert.Equal(("Retry", 1060L), AlertWorker.FailureDisposition(1, 1000));
        Assert.Equal(("Retry", 4600L), AlertWorker.FailureDisposition(7, 1000));
        Assert.Equal(("Failed", 0L), AlertWorker.FailureDisposition(AlertWorker.MaximumAttempts, 1000));
    }
    [Fact] public void StripeRenewalSupportsSubscriptionItemPeriods()
    {
        var expected = DateTimeOffset.FromUnixTimeSeconds(1794240000);
        Assert.Equal(expected, StripeBillingEndpoints.RenewalAt(new JObject { ["items"] = new JObject { ["data"] = new JArray(new JObject { ["current_period_end"] = 1794240000L }) } }));
        Assert.Equal(expected, StripeBillingEndpoints.RenewalAt(new JObject { ["current_period_end"] = 1794240000L }));
        Assert.Null(StripeBillingEndpoints.RenewalAt(new JObject { ["items"] = new JObject { ["data"] = new JArray() } }));
    }
    [Theory]
    [InlineData("canceled", true)]
    [InlineData("incomplete_expired", true)]
    [InlineData("active", false)]
    [InlineData("past_due", false)]
    [InlineData("unpaid", false)]
    public void OnlyTerminalStripeSubscriptionsCanBeReplaced(string status, bool terminal) =>
        Assert.Equal(terminal, StripeBillingEndpoints.IsTerminal(status));

    [Fact] public void ReplacementStripeSubscriptionMustMatchTheCompletedCheckout()
    {
        var session = new JObject
        {
            ["id"] = "cs_test_new", ["livemode"] = false, ["mode"] = "subscription", ["status"] = "complete",
            ["client_reference_id"] = "business-a", ["customer"] = "cus_a", ["subscription"] = "sub_new"
        };
        bool Matches(JObject value) => StripeBillingEndpoints.MatchesReplacementCheckout(value, "cs_test_new", "business-a", "cus_a", "sub_new");
        Assert.True(Matches(session));
        foreach (var (field, value) in new (string, JToken)[]
        {
            ("id", "cs_test_other"), ("livemode", true), ("mode", "payment"), ("status", "open"),
            ("client_reference_id", "business-b"), ("customer", "cus_b"), ("subscription", "sub_old")
        })
            Assert.False(Matches(new JObject(session) { [field] = value }));
    }

    [Fact] public void IntakeRequiresKillSwitchEnabledUnsuspendedAndPaidOrExempt()
    {
        var on = new Settings { AcceptReferrals = true };
        JObject Business(string status = "active", bool accept = true, bool suspended = false, bool exempt = false) => new() { ["acceptReferrals"] = accept, ["suspended"] = suspended, ["billingExempt"] = exempt, ["billingStatus"] = status };
        Assert.True(BusinessRules.AcceptsReferrals(on, Business()));
        Assert.True(BusinessRules.AcceptsReferrals(on, Business("trialing")));
        Assert.True(BusinessRules.AcceptsReferrals(on, Business("past_due")));
        Assert.True(BusinessRules.AcceptsReferrals(on, Business("not_configured", exempt: true)));
        Assert.False(BusinessRules.AcceptsReferrals(on, Business("canceled")));
        Assert.False(BusinessRules.AcceptsReferrals(on, Business("not_configured")));
        Assert.False(BusinessRules.AcceptsReferrals(on, Business(suspended: true)));
        Assert.False(BusinessRules.AcceptsReferrals(on, Business(accept: false)));
        Assert.False(BusinessRules.AcceptsReferrals(new Settings { AcceptReferrals = false }, Business()));
        Assert.False(BusinessRules.AcceptsReferrals(on, null));
    }
    [Theory] [InlineData("2026-13")] [InlineData("bad")] [InlineData("1999-01")] [InlineData("2026-1")]
    public void RejectInvalidReportingMonth(string month) => Assert.Throws<ApiError>(() => MonthlyReport.ParseMonth(month));
    [Fact] public void InvalidDateIsCountedWithoutDisclosure() { var report = Report("2026-11", "PRIVATE-BROKEN-DATE"); Assert.Equal(1, report.Value<int>("invalidDates")); Assert.DoesNotContain("PRIVATE", report.ToString()); }
    static Submission Valid => new("Fictional", "Patient", "fictional@example.invalid", "8015550100", "Fictional only", true, "a1b2c3d4e5f6a7b8", Guid.NewGuid().ToString());
    [Fact] public void SubmissionValidatesConsentLimitsHoneypotAndIdempotencyToken()
    {
        Valid.Validate();
        foreach (var invalid in new[] { Valid with { Consent = false }, Valid with { FirstName = new string('a', 81) }, Valid with { FirstName = "" }, Valid with { LastName = "" }, Valid with { Email = "bad" }, Valid with { Phone = "123" }, Valid with { Website = "bot" }, Valid with { SubmissionId = "invalid" }, Valid with { Code = "../../private" } }) Assert.Throws<ApiError>(invalid.Validate);
    }
    [Fact] public async Task StaffAuthorizationRejectsAnonymousSpoofedHeadersWrongTenantAndWrongUser()
    {
        await using var app = Factory(); using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/staff/session")).StatusCode);
        client.DefaultRequestHeaders.Add("X-MS-CLIENT-PRINCIPAL", "spoofed");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/staff/session")).StatusCode);
        foreach (var value in new[] { "wrong:allowed", "other:wrong" })
        {
            client.DefaultRequestHeaders.Remove("X-Test-Identity"); client.DefaultRequestHeaders.Add("X-Test-Identity", value);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/staff/session")).StatusCode);
        }
        client.DefaultRequestHeaders.Remove("X-Test-Identity"); client.DefaultRequestHeaders.Add("X-Test-Identity", "wrong:allowed");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/staff/session")).StatusCode);
    }
    [Fact] public void AlertRecipientComesFromTheBusinessAndRequiresSmtp()
    {
        var smtp = new Settings { AlertsEnabled = true, SmtpUsername = "sender", SmtpPassword = "configured" };
        var business = new JObject { ["alertEmail"] = "office@example.invalid" };
        Assert.Equal("office@example.invalid", BusinessRules.AlertEmail(smtp, business));
        Assert.Empty(BusinessRules.AlertEmail(smtp, new JObject()));
        Assert.Empty(BusinessRules.AlertEmail(new Settings { AlertsEnabled = false, SmtpUsername = "sender", SmtpPassword = "configured" }, business));
        Assert.Empty(BusinessRules.AlertEmail(new Settings { AlertsEnabled = true }, business));
    }
    [Fact] public async Task PlatformAdminConsoleRejectsEveryoneButConfiguredAdmins()
    {
        await using var app = Factory(); using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/session")).StatusCode);
        foreach (var value in new[] { "tenant:someone-else", "other:platform-owner" })
        {
            client.DefaultRequestHeaders.Remove("X-Test-Identity"); client.DefaultRequestHeaders.Add("X-Test-Identity", value);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/session")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/businesses")).StatusCode);
        }
        client.DefaultRequestHeaders.Remove("X-Test-Identity"); client.DefaultRequestHeaders.Add("X-Test-Identity", "tenant:platform-owner");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/session")).StatusCode);
    }
    [Fact] public void StripeReplacementCheckoutMustMatchKeyMode()
    {
        var live = new JObject { ["id"] = "cs_live", ["livemode"] = true, ["mode"] = "subscription", ["status"] = "complete", ["client_reference_id"] = "b", ["customer"] = "c", ["subscription"] = "s" };
        Assert.True(StripeBillingEndpoints.MatchesReplacementCheckout(live, "cs_live", "b", "c", "s", liveMode: true));
        Assert.False(StripeBillingEndpoints.MatchesReplacementCheckout(live, "cs_live", "b", "c", "s", liveMode: false));
    }
    [Fact] public async Task WriteGuardRejectsCrossOriginAndNonJsonBeforeStorage()
    {
        await using var app = Factory(); using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync("/api/referrals", new StringContent("{}"))).StatusCode);
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:3000");
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await client.PostAsync("/api/referrals", new StringContent("{}"))).StatusCode);
    }
    [Fact] public async Task InvitationDeleteAcceptsJsonAndRequiresStaffAuthentication()
    {
        await using var app = Factory(); using var client = app.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Delete, "/api/staff/invitations/invite-1234567890abcdef");
        request.Headers.Add("Origin", "http://localhost:3000");
        request.Content = new StringContent("""{"etag":"test"}""", System.Text.Encoding.UTF8, "application/json");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(request)).StatusCode);
    }
    [Fact] public async Task PlatformCardDirectoryRejectsAnonymousAndOrdinaryStaff()
    {
        await using var app = Factory(); using var client = app.CreateClient();
        const string directory = "/api/admin/businesses";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(directory)).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Identity", "tenant:allowed");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(directory)).StatusCode);
    }

    [Fact] public async Task SignupRequiresAuthenticationAndAnEnabledCheckout()
    {
        var signup = System.Text.Json.JsonSerializer.Deserialize<CustomerSignup>("""{"name":"Fictional Business","officeName":"Main office","alertEmail":"team@example.com"}""", new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        Assert.NotNull(signup);
        Assert.Equal("Fictional Business", signup.Name);
        Assert.Equal("Main office", signup.OfficeName);
        Assert.Equal("team@example.com", signup.AlertEmail);
        var businessOnly = System.Text.Json.JsonSerializer.Deserialize<CustomerSignup>("""{"name":"Fictional Business"}""", new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        Assert.NotNull(businessOnly);
        Assert.Null(businessOnly.OfficeName);
        Assert.Null(businessOnly.AlertEmail);
        await using var app = Factory(); using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:3000");
        static StringContent Business() => new("""{"name":"Fictional Business"}""", System.Text.Encoding.UTF8, "application/json");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/signup", Business())).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Identity", "tenant:allowed");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.PostAsync("/api/signup", Business())).StatusCode);
    }

    sealed class TestKeyRepository : IXmlRepository
    {
        readonly List<XElement> elements = [];
        public IReadOnlyCollection<XElement> GetAllElements()
        {
            lock (elements) return elements.Select(element => new XElement(element)).ToArray();
        }

        public void StoreElement(XElement element, string friendlyName)
        {
            lock (elements) elements.Add(new XElement(element));
        }
    }
    static WebApplicationFactory<Program> Factory() => new WebApplicationFactory<Program>().WithWebHostBuilder(web =>
    {
        web.UseEnvironment("Development").UseSetting("Cosmos:Endpoint", "https://example.documents.azure.com/").UseSetting("BridgeWay:TenantId", "tenant").UseSetting("BridgeWay:PlatformAdminObjectIds:0", "platform-owner");
        web.ConfigureServices(services =>
        {
            services.Replace(ServiceDescriptor.Singleton<IXmlRepository, TestKeyRepository>());
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
