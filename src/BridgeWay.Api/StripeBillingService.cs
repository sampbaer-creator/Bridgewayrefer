using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

public sealed class StripeBillingService(HttpClient http, Settings settings)
{
    const string Api = "https://api.stripe.com/v1/";

    static readonly string[] TestPrefixes = ["sk_test_", "rk_test_", "sk_org_test_"];
    static readonly string[] LivePrefixes = ["sk_live_", "rk_live_", "sk_org_live_"];
    public bool TestMode => TestPrefixes.Any(p => settings.StripeSecretKey.StartsWith(p, StringComparison.Ordinal));
    public bool LiveMode => LivePrefixes.Any(p => settings.StripeSecretKey.StartsWith(p, StringComparison.Ordinal));
    /// <summary>True when a Stripe secret or restricted key of a known mode is configured. Every object read back must match this mode.</summary>
    public bool KeyReady => TestMode || LiveMode;

    void Configure(HttpRequestMessage request, string? idempotencyKey = null)
    {
        if (!KeyReady) throw new ApiError(503, "Billing is not configured yet.");
        var isOrganizationKey = settings.StripeSecretKey.StartsWith("sk_org_", StringComparison.Ordinal);
        if (isOrganizationKey && (!System.Text.RegularExpressions.Regex.IsMatch(settings.StripeContext, @"\Aacct_[A-Za-z0-9]+\z") || string.IsNullOrWhiteSpace(settings.StripeApiVersion)))
            throw new ApiError(503, "Set the Stripe account context and API version for the organization key.");
        var encoded = Convert.ToBase64String(Encoding.UTF8.GetBytes(settings.StripeSecretKey + ":"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", encoded);
        if (isOrganizationKey)
        {
            request.Headers.TryAddWithoutValidation("Stripe-Context", settings.StripeContext);
            request.Headers.TryAddWithoutValidation("Stripe-Version", settings.StripeApiVersion);
        }
        if (!string.IsNullOrWhiteSpace(idempotencyKey)) request.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);
    }

    async Task<JObject> Send(HttpRequestMessage request, CancellationToken ct)
    {
        Configure(request);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode) throw new ApiError(503, "Stripe could not complete this billing request. Check the Price ID, account context, and API key permissions.");
        try { return JObject.Parse(body); } catch (Newtonsoft.Json.JsonException) { throw new ApiError(503, "Stripe returned an invalid billing response."); }
    }

    public async Task ValidatePrice(string plan, CancellationToken ct)
    {
        var priceId = settings.StripePriceFor(plan);
        if (!KeyReady || !priceId.StartsWith("price_", StringComparison.Ordinal)) throw new ApiError(503, "Configure a Stripe key and recurring Price ID.");
        using var request = new HttpRequestMessage(HttpMethod.Get, Api + "prices/" + Uri.EscapeDataString(priceId));
        var price = await Send(request, ct);
        var monthlyAmount = settings.MonthlyPriceFor(plan);
        if (price.Value<string>("id") != priceId || price.Value<bool>("livemode") != LiveMode || price.Value<int?>("unit_amount") != monthlyAmount * 100 || price.Value<string>("currency") != "usd" ||
            price["recurring"]?.Value<string>("interval") != "month" || price.Value<bool?>("active") != true)
            throw new ApiError(503, $"The configured Stripe Price for {PlanLabel(plan)} must be an active ${monthlyAmount} USD monthly Price in the same mode as the API key.");
    }

    static string PlanLabel(string plan) => plan == BillingPlans.ManagedCalling ? "Managed Calling" : "Workspace";

    public async Task<string> CreateCustomer(string businessId, string businessName, string idempotencyKey, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, Api + "customers");
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["name"] = businessName, ["metadata[businessId]"] = businessId });
        Configure(request, idempotencyKey);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode) throw new ApiError(503, "Stripe could not create a customer. Check the key permissions.");
        return JObject.Parse(body).Value<string>("id") ?? throw new ApiError(503, "Stripe did not return a customer ID.");
    }

    public async Task<JObject> CreateCheckout(string businessId, string businessName, string customerId, string plan, string successUrl, string cancelUrl, string idempotencyKey, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, Api + "checkout/sessions");
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["mode"] = "subscription", ["customer"] = customerId, ["client_reference_id"] = businessId,
            ["line_items[0][price]"] = settings.StripePriceFor(plan), ["line_items[0][quantity]"] = "1",
            ["success_url"] = successUrl, ["cancel_url"] = cancelUrl,
            ["metadata[businessId]"] = businessId, ["metadata[businessName]"] = businessName, ["metadata[plan]"] = plan,
            ["subscription_data[metadata][businessId]"] = businessId, ["subscription_data[metadata][plan]"] = plan,
        });
        Configure(request, idempotencyKey);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode) throw new ApiError(503, "Stripe could not create a Checkout Session.");
        return JObject.Parse(body);
    }

    public async Task<string> CreatePortal(string customerId, string returnUrl, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, Api + "billing_portal/sessions");
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["customer"] = customerId, ["return_url"] = returnUrl });
        var result = await Send(request, ct);
        return result.Value<string>("url") ?? throw new ApiError(503, "Stripe did not return a billing portal URL.");
    }

    public async Task<JObject> GetCheckout(string sessionId, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, Api + "checkout/sessions/" + Uri.EscapeDataString(sessionId));
        return await Send(request, ct);
    }

    public async Task<JObject> GetSubscription(string subscriptionId, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, Api + "subscriptions/" + Uri.EscapeDataString(subscriptionId));
        return await Send(request, ct);
    }
}

public static class StripeWebhookSignature
{
    public static bool Verify(ReadOnlySpan<byte> body, string? signatureHeader, string secret, DateTimeOffset? now = null)
    {
        if (string.IsNullOrWhiteSpace(signatureHeader) || !secret.StartsWith("whsec_", StringComparison.Ordinal)) return false;
        long timestamp = 0; var signatures = new List<byte[]>();
        foreach (var field in signatureHeader.Split(','))
        {
            var parts = field.Split('=', 2); if (parts.Length != 2) continue;
            if (parts[0] == "t") long.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out timestamp);
            if (parts[0] == "v1")
            {
                try { signatures.Add(Convert.FromHexString(parts[1])); } catch (FormatException) { }
            }
        }
        var current = (now ?? DateTimeOffset.UtcNow).ToUnixTimeSeconds();
        if (timestamp <= 0 || Math.Abs(current - timestamp) > 300 || signatures.Count == 0) return false;
        var prefix = Encoding.UTF8.GetBytes(timestamp.ToString(CultureInfo.InvariantCulture) + "."); var signed = new byte[prefix.Length + body.Length];
        prefix.CopyTo(signed, 0); body.CopyTo(signed.AsSpan(prefix.Length));
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret)); var expected = hmac.ComputeHash(signed);
        return signatures.Any(candidate => candidate.Length == expected.Length && CryptographicOperations.FixedTimeEquals(candidate, expected));
    }
}
