using System.Net.Http.Headers;
using System.Text;
using System.Text.RegularExpressions;
using BridgeWay.Api;
using Newtonsoft.Json.Linq;
using Xunit;

public sealed class StripeSandboxFactAttribute : FactAttribute
{
    public StripeSandboxFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("BRIDGEWAY_STRIPE_SANDBOX_TESTS") != "1")
            Skip = "Opt in with BRIDGEWAY_STRIPE_SANDBOX_TESTS=1, BRIDGEWAY_STRIPE_SANDBOX_KEY, and BRIDGEWAY_STRIPE_SANDBOX_EVENTS (three comma-separated event IDs for active, past_due, and canceled).";
    }
}

public class StripeLifecycleTests
{
    static readonly string[] States = ["active", "past_due", "canceled"];
    const string SandboxPrice = "price_workspace";

    [Fact]
    public void SubscriptionLifecycleUpdatesSignupAndIntake()
    {
        var subscriptions = States.Select(status => new JObject
        {
            ["id"] = "sub_fixture",
            ["customer"] = "cus_fixture",
            ["livemode"] = false,
            ["status"] = status,
            ["cancel_at_period_end"] = false,
            ["items"] = new JObject { ["data"] = new JArray(new JObject
            {
                ["price"] = new JObject { ["id"] = SandboxPrice },
                ["current_period_end"] = 1794240000L
            }) }
        }).ToArray();

        VerifyLifecycle(subscriptions, SandboxPrice);
    }

    [StripeSandboxFact]
    public async Task ExistingStripeSandboxEventsMatchTheSubscriptionLifecycle()
    {
        var key = Environment.GetEnvironmentVariable("BRIDGEWAY_STRIPE_SANDBOX_KEY") ?? "";
        Assert.True(key.StartsWith("sk_test_", StringComparison.Ordinal) || key.StartsWith("rk_test_", StringComparison.Ordinal),
            "Use a Stripe sandbox key with read access to Events.");
        var ids = (Environment.GetEnvironmentVariable("BRIDGEWAY_STRIPE_SANDBOX_EVENTS") ?? "").Split(',', StringSplitOptions.TrimEntries);
        Assert.True(ids.Length == States.Length && ids.All(id => Regex.IsMatch(id, @"\Aevt_[A-Za-z0-9]+\z")),
            "Supply three existing Stripe event IDs in lifecycle order.");
        using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(15) };
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(key + ":")));
        var snapshots = new List<JObject>();
        var lastCreated = 0L;
        foreach (var id in ids)
        {
            using var response = await http.GetAsync("https://api.stripe.com/v1/events/" + id);
            Assert.True(response.IsSuccessStatusCode, $"Stripe sandbox event lookup returned {(int)response.StatusCode}.");
            var snapshot = JObject.Parse(await response.Content.ReadAsStringAsync());
            Assert.False(snapshot.Value<bool?>("livemode") ?? true);
            Assert.StartsWith("customer.subscription.", snapshot.Value<string>("type"));
            var created = snapshot.Value<long>("created");
            Assert.True(created >= lastCreated);
            lastCreated = created;
            snapshots.Add(Assert.IsType<JObject>(snapshot["data"]?["object"]));
        }

        var price = snapshots[0]["items"]?["data"]?.FirstOrDefault()?["price"]?.Value<string>("id");
        Assert.StartsWith("price_", price);
        VerifyLifecycle(snapshots, price!);
    }

    static void VerifyLifecycle(IReadOnlyList<JObject> subscriptions, string price)
    {
        var settings = new Settings { AcceptReferrals = true, StripePriceId = price, StripeSecretKey = "sk_test_fixture", AllowStripeTestMode = true };
        var business = new JObject { ["customerSignup"] = true, ["acceptReferrals"] = true, ["checkoutSessionId"] = "cs_test_fixture" };
        Assert.True(BusinessRules.SignupPending(business));
        Assert.False(BusinessRules.AcceptsReferrals(settings, business));
        for (var i = 0; i < subscriptions.Count; i++)
        {
            var subscription = subscriptions[i];
            Assert.False(subscription.Value<bool?>("livemode") ?? true);
            Assert.Equal(subscriptions[0].Value<string>("id"), subscription.Value<string>("id"));
            StripeBillingEndpoints.ApplySubscription(business, subscription, settings, DateTimeOffset.UnixEpoch);
            Assert.Equal(States[i], business.Value<string>("billingStatus"));
            Assert.Equal(BillingPlans.Workspace, business.Value<string>("subscriptionPlan"));
            Assert.False(BusinessRules.SignupPending(business));
            Assert.Equal(i < 2, BusinessRules.AcceptsReferrals(settings, business));
            Assert.Null(business["checkoutSessionId"]);
        }
    }
}
