using System.Net;
using System.Text;
using BridgeWay.Api;
using Newtonsoft.Json.Linq;
using Xunit;

public class BillingPlanTests
{
    static Settings Config() => new()
    {
        StripeSecretKey = "sk_test_example",
        StripePriceId = "price_workspace",
        ManagedCallingStripePriceId = "price_managed_calling",
        StripeWebhookSecret = "whsec_example",
    };

    [Fact]
    public void WorkspaceRemainsDefaultAndManagedCallingIsAnOptionalSeparatePrice()
    {
        var settings = Config();
        Assert.Equal(BillingPlans.Workspace, BillingPlans.Normalize(null));
        Assert.Equal(BillingPlans.Workspace, BillingPlans.Normalize("workspace"));
        Assert.Equal("price_workspace", settings.StripePriceFor(BillingPlans.Workspace));
        Assert.Equal("price_managed_calling", settings.StripePriceFor(BillingPlans.ManagedCalling));
        Assert.Equal(50, settings.MonthlyPriceFor(BillingPlans.Workspace));
        Assert.Equal(400, settings.MonthlyPriceFor(BillingPlans.ManagedCalling));
        Assert.Equal(BillingPlans.ManagedCalling, settings.PlanForPrice("price_managed_calling"));
        Assert.Equal(BillingPlans.Workspace, settings.PlanForPrice("price_workspace"));
        Assert.True(BillingPlans.MatchesCheckout(null, BillingPlans.Workspace));
        Assert.True(BillingPlans.MatchesCheckout(BillingPlans.ManagedCalling, BillingPlans.ManagedCalling));
        Assert.False(BillingPlans.MatchesCheckout(BillingPlans.Workspace, BillingPlans.ManagedCalling));
    }

    [Fact]
    public void ManagedCallingCannotCheckoutUntilItsPriceIsConfigured()
    {
        var settings = Config(); settings.ManagedCallingStripePriceId = "";
        Assert.False(settings.ManagedCallingConfigured);
        Assert.Throws<ApiError>(() => settings.StripePriceFor(BillingPlans.ManagedCalling));
        Assert.Throws<ApiError>(() => BillingPlans.Normalize("industry-plan"));
    }

    [Fact]
    public async Task ManagedCallingCheckoutUsesTheDedicatedMonthlyStripePriceAndPlanMetadata()
    {
        var settings = Config();
        string? postedForm = null;
        var handler = new CaptureHandler(async request =>
        {
            postedForm = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""{"id":"cs_test_managed","url":"https://checkout.stripe.test/session"}""", Encoding.UTF8, "application/json") };
        });
        var stripe = new StripeBillingService(new HttpClient(handler), settings);

        var session = await stripe.CreateCheckout("business-a", "Office A", "cus_test", BillingPlans.ManagedCalling,
            "https://bridgewayrefer.com/staff?billing=pending", "https://bridgewayrefer.com/staff?billing=cancelled", "checkout-managed-a", CancellationToken.None);

        Assert.Equal("https://checkout.stripe.test/session", session.Value<string>("url"));
        var form = System.Web.HttpUtility.ParseQueryString(postedForm!);
        Assert.Equal("price_managed_calling", form["line_items[0][price]"]);
        Assert.Equal("managed-calling", form["metadata[plan]"]);
        Assert.Equal("managed-calling", form["subscription_data[metadata][plan]"]);
        Assert.Equal("business-a", form["subscription_data[metadata][businessId]"]);
    }

    [Fact]
    public async Task ManagedCallingPriceMustBeActiveFourHundredUsdMonthlyAndInTheSameMode()
    {
        var settings = Config();
        string? requestedUrl = null;
        var handler = new CaptureHandler(request =>
        {
            requestedUrl = request.RequestUri!.ToString();
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""{"id":"price_managed_calling","livemode":false,"unit_amount":40000,"currency":"usd","recurring":{"interval":"month"},"active":true}""", Encoding.UTF8, "application/json") });
        });
        var stripe = new StripeBillingService(new HttpClient(handler), settings);

        await stripe.ValidatePrice(BillingPlans.ManagedCalling, CancellationToken.None);

        Assert.EndsWith("/prices/price_managed_calling", requestedUrl);
    }

    [Fact]
    public void SignupRequestCanResumeWithTheChosenManagedCallingPlan()
    {
        var options = new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var request = System.Text.Json.JsonSerializer.Deserialize<CustomerSignup>("""{"name":"Sample Office","plan":"managed-calling"}""", options);
        Assert.NotNull(request);
        Assert.Equal(BillingPlans.ManagedCalling, BillingPlans.Normalize(request.Plan));

        var resumed = System.Text.Json.JsonSerializer.Deserialize<BillingCheckout>("""{"plan":"managed-calling"}""", options);
        Assert.NotNull(resumed);
        Assert.Equal(BillingPlans.ManagedCalling, BillingPlans.Normalize(resumed.Plan));
    }

    sealed class CaptureHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => respond(request);
    }
}
