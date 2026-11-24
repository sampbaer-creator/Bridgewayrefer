using System.Net;
using System.Net.Http.Json;
using System.Xml.Linq;
using BridgeWay.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Newtonsoft.Json.Linq;
using Xunit;

public class CustomerOnboardingTests
{
    static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-11-24T12:00:00Z");

    static JObject PendingBusiness(string plan = "workspace") => new()
    {
        ["id"] = "business", ["businessId"] = "biz-a", ["name"] = "Fictional Dental", ["adminOnboarding"] = true,
        ["onboardingStatus"] = OnboardingRules.AwaitingPayment, ["onboardingPlan"] = plan, ["ownerEmail"] = "owner@example.invalid",
        ["onboardingInviteId"] = "onboarding-invite-current", ["onboardingLinkExpiresAt"] = Now.AddDays(3).ToString("O"), ["billingStatus"] = "not_configured",
    };

    static JObject Invite(string id = "onboarding-invite-current", string businessId = "biz-a", string state = "Pending", double days = 3) => new()
    {
        ["id"] = id, ["type"] = "onboarding-invite", ["businessId"] = businessId, ["state"] = state, ["expiresAt"] = Now.AddDays(days).ToString("O"),
    };

    static CosmosStore Store(CosmosClient client)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Cosmos:Database"] = "bridgeway-tests" }).Build();
        var store = new CosmosStore(client, config, new Settings()); store.UseBusiness("biz-a"); return store;
    }

    [Fact]
    public void TokensAreOpaqueAndOnlyTheirHashIsStored()
    {
        var (token, id) = OnboardingRules.NewToken();
        Assert.Matches("^[0-9a-f]{64}$", token);
        Assert.StartsWith("onboarding-invite-", id);
        Assert.DoesNotContain(token, id);
        Assert.Equal(id, OnboardingRules.InviteId(token));
        Assert.Null(OnboardingRules.InviteId(id));
        Assert.Null(OnboardingRules.InviteId("not-a-token"));
        var link = OnboardingRules.Link(new Settings { PublicOrigin = "https://bridgewayrefer.com" }, "biz-a", token);
        Assert.StartsWith("https://bridgewayrefer.com/onboard#token=", link); // fragment: never sent to the server or logs
    }

    [Fact]
    public void OnlyTheCurrentPendingUnexpiredInviteForThisBusinessIsUsable()
    {
        var business = PendingBusiness();
        Assert.True(OnboardingRules.IsUsableInvite(Invite(), business, "biz-a", Now));
        Assert.False(OnboardingRules.IsUsableInvite(Invite(days: -1), business, "biz-a", Now));                    // expired
        Assert.False(OnboardingRules.IsUsableInvite(Invite(state: "Superseded"), business, "biz-a", Now));        // replaced
        Assert.False(OnboardingRules.IsUsableInvite(Invite(id: "onboarding-invite-old"), business, "biz-a", Now)); // not the current link
        Assert.False(OnboardingRules.IsUsableInvite(Invite(businessId: "biz-b"), business, "biz-a", Now));        // another business
        Assert.False(OnboardingRules.IsUsableInvite(Invite(), business, "biz-b", Now));
        Assert.False(OnboardingRules.IsUsableInvite(null, business, "biz-a", Now));
        Assert.False(OnboardingRules.IsUsableInvite(new JObject(Invite()) { ["type"] = "membership-invite" }, business, "biz-a", Now));
    }

    [Fact]
    public void OwnerMustMatchInvitedEmailAndStayBoundToTheFirstIdentity()
    {
        var business = PendingBusiness();
        Assert.True(OnboardingRules.OwnerMatches(business, "Owner@Example.invalid", "google", "oid-1"));
        Assert.False(OnboardingRules.OwnerMatches(business, "someone-else@example.invalid", "google", "oid-1"));
        business["ownerTenant"] = "google"; business["ownerOid"] = "oid-1";
        Assert.True(OnboardingRules.OwnerMatches(business, "owner@example.invalid", "google", "oid-1"));
        Assert.False(OnboardingRules.OwnerMatches(business, "owner@example.invalid", "google", "oid-2"));
        Assert.False(OnboardingRules.OwnerMatches(business, "owner@example.invalid", "tenant-x", "oid-1"));
    }

    [Fact]
    public void VerifiedPaymentGrantsOnlyAnAdminMembershipForTheBoundOwnerAndIsIdempotent()
    {
        using var client = new CosmosClient("https://localhost:8081", "bG9jYWwtdGVzdC1rZXk=");
        var store = Store(client);
        var business = PendingBusiness();
        business["ownerTenant"] = "google"; business["ownerOid"] = "oid-1"; business["subscriptionPlan"] = "workspace";

        // No access before payment is confirmed.
        Assert.Null(OnboardingRules.ApplyActivation(business, null, store, Now));
        Assert.True(OnboardingRules.IsPending(business));

        business["billingStatus"] = "active";
        var member = OnboardingRules.ApplyActivation(business, null, store, Now);
        Assert.NotNull(member);
        Assert.Equal("Admin", member!.Value<string>("role"));
        Assert.Equal("biz-a", member.Value<string>("businessId"));
        Assert.Equal("oid-1", member.Value<string>("oid"));
        Assert.Equal(CosmosStore.MembershipId("google", "oid-1"), member.Value<string>("id"));
        Assert.Equal(OnboardingRules.Active, business.Value<string>("onboardingStatus"));
        Assert.False(OnboardingRules.IsPending(business));

        // Repeated webhook events never create a second membership.
        Assert.Null(OnboardingRules.ApplyActivation(business, null, store, Now));
        var again = PendingBusiness(); again["ownerTenant"] = "google"; again["ownerOid"] = "oid-1"; again["subscriptionPlan"] = "workspace"; again["billingStatus"] = "active";
        Assert.Null(OnboardingRules.ApplyActivation(again, member, store, Now));
        Assert.Equal(OnboardingRules.Active, again.Value<string>("onboardingStatus"));
    }

    [Theory]
    [InlineData("managed-calling", true)]   // paid for a different plan than the admin chose
    [InlineData("workspace", false)]        // no owner identity was bound before Checkout
    public void MismatchedPlanOrUnboundOwnerNeedsAttentionInsteadOfGrantingAccess(string paidPlan, bool bindOwner)
    {
        using var client = new CosmosClient("https://localhost:8081", "bG9jYWwtdGVzdC1rZXk=");
        var business = PendingBusiness(); business["billingStatus"] = "active"; business["subscriptionPlan"] = paidPlan;
        if (bindOwner) { business["ownerTenant"] = "google"; business["ownerOid"] = "oid-1"; }
        Assert.Null(OnboardingRules.ApplyActivation(business, null, Store(client), Now));
        Assert.Equal(OnboardingRules.NeedsAttention, business.Value<string>("onboardingStatus"));
        Assert.True(OnboardingRules.IsPending(business));
    }

    [Fact]
    public void RegularWorkspacesAreNeverTouchedByOnboardingRules()
    {
        using var client = new CosmosClient("https://localhost:8081", "bG9jYWwtdGVzdC1rZXk=");
        var regular = new JObject { ["businessId"] = "biz-a", ["billingStatus"] = "active" };
        Assert.False(OnboardingRules.IsPending(regular));
        Assert.Null(OnboardingRules.ApplyActivation(regular, null, Store(client), Now));
        Assert.Null(regular["onboardingStatus"]);
    }

    [Fact]
    public void StatusesAreClearForTheAdmin()
    {
        Assert.Equal("Awaiting payment", OnboardingRules.DisplayStatus(PendingBusiness(), Now));
        Assert.Equal("Link expired", OnboardingRules.DisplayStatus(PendingBusiness(), Now.AddDays(4)));
        Assert.Equal("Payment confirmed", OnboardingRules.DisplayStatus(new JObject(PendingBusiness()) { ["billingStatus"] = "active" }, Now));
        Assert.Equal("Needs attention", OnboardingRules.DisplayStatus(new JObject(PendingBusiness()) { ["billingStatus"] = "past_due" }, Now));
        Assert.Equal("Needs attention", OnboardingRules.DisplayStatus(new JObject(PendingBusiness()) { ["onboardingStatus"] = OnboardingRules.NeedsAttention }, Now));
        Assert.Equal("Owner account connected", OnboardingRules.DisplayStatus(new JObject(PendingBusiness()) { ["onboardingStatus"] = OnboardingRules.Active }, Now));
        Assert.Equal("Manual follow-up", OnboardingRules.DisplayStatus(new JObject(PendingBusiness("corporate")) { ["onboardingStatus"] = OnboardingRules.ManualFollowUp }, Now));
    }

    [Theory]
    [InlineData("workspace")]
    [InlineData("managed-calling")]
    [InlineData("corporate")]
    public void SupportedPlansAreAccepted(string plan) => Assert.Equal(plan, OnboardingRules.NormalizePlan(plan));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("enterprise")]
    [InlineData("WORKSPACE")]
    public void UnknownPlansAreRejected(string? plan) => Assert.Throws<ApiError>(() => OnboardingRules.NormalizePlan(plan));

    [Fact]
    public async Task AdminOnboardingRequiresAPlatformAdmin()
    {
        await using var app = Factory(); using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:3000");
        var body = new { name = "Fictional Dental", ownerName = "Pat Owner", ownerEmail = "owner@example.invalid", industry = "healthcare", specialty = "Orthodontics", plan = "workspace" };
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/onboarding")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/admin/onboarding", body)).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Identity", "tenant:regular-staff");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/onboarding")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/admin/onboarding", body)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/admin/onboarding/biz-a/link", new { sendEmail = false })).StatusCode);
    }

    [Fact]
    public async Task PaidPlansExplainMissingStripeConfigurationInsteadOfCreatingBrokenLinks()
    {
        await using var app = Factory(); using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:3000");
        client.DefaultRequestHeaders.Add("X-Test-Identity", "tenant:platform-owner");
        var response = await client.PostAsJsonAsync("/api/admin/onboarding", new { name = "Fictional Dental", ownerName = "Pat Owner", ownerEmail = "owner@example.invalid", industry = "healthcare", specialty = "Orthodontics", plan = "workspace" });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("StripePriceId", await response.Content.ReadAsStringAsync());
        var invalid = await client.PostAsJsonAsync("/api/admin/onboarding", new { name = "Fictional Dental", ownerName = "Pat Owner", ownerEmail = "not-an-email", industry = "healthcare", specialty = "Orthodontics", plan = "workspace" });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        var noOwner = await client.PostAsJsonAsync("/api/admin/onboarding", new { name = "Fictional Dental", ownerEmail = "owner@example.invalid", industry = "healthcare", specialty = "Orthodontics", plan = "workspace" });
        Assert.Equal(HttpStatusCode.BadRequest, noOwner.StatusCode);
        var badPlan = await client.PostAsJsonAsync("/api/admin/onboarding", new { name = "Fictional Dental", ownerName = "Pat Owner", ownerEmail = "owner@example.invalid", industry = "healthcare", specialty = "Orthodontics", plan = "free" });
        Assert.Equal(HttpStatusCode.BadRequest, badPlan.StatusCode);
    }

    [Fact]
    public async Task OwnerRedemptionRequiresSignInAValidTokenAndAVerifiedEmail()
    {
        await using var app = Factory(); using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:3000");
        var token = new string('a', 64);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/onboarding/checkout", new { workspace = "biz-a", token })).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Identity", "tenant:owner");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/onboarding/checkout", new { workspace = "biz-a", token = OnboardingRules.InviteId(token) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/onboarding/checkout", new { workspace = "../biz-a", token })).StatusCode);
        // The test identity carries no email claim, so it can never be matched to an invited owner.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/onboarding/status", new { workspace = "biz-a", token })).StatusCode);
    }

    static WebApplicationFactory<Program> Factory() => new WebApplicationFactory<Program>().WithWebHostBuilder(web =>
    {
        web.UseEnvironment("Development")
            .UseSetting("Cosmos:Endpoint", "https://example.documents.azure.com/")
            .UseSetting("Bridgewayrefer:PublicOrigin", "http://localhost:3000")
            .UseSetting("Bridgewayrefer:TenantId", "tenant")
            .UseSetting("Bridgewayrefer:MultiTenantSignIn", "false")
            .UseSetting("Bridgewayrefer:PlatformAdminObjectIds:0", "platform-owner")
            .UseSetting("Bridgewayrefer:StripeSecretKey", "");
        web.ConfigureServices(services =>
        {
            services.Replace(ServiceDescriptor.Singleton<IXmlRepository, KeyRepository>());
            services.AddAuthentication().AddScheme<AuthenticationSchemeOptions, TestAuth>("Test", _ => { });
            services.PostConfigure<AuthenticationOptions>(options => options.DefaultAuthenticateScheme = "Test");
        });
    });

    sealed class KeyRepository : IXmlRepository
    {
        readonly List<XElement> keys = [];
        public IReadOnlyCollection<XElement> GetAllElements() => keys.ToList();
        public void StoreElement(XElement element, string friendlyName) => keys.Add(element);
    }
}
