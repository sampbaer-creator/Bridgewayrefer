using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

public sealed class StripeBillingService(HttpClient http, Settings settings)
{
    const string Api = "https://api.stripe.com/v1/";

    public bool TestCredentialsReady => settings.StripeSecretKey.StartsWith("sk_test_", StringComparison.Ordinal) ||
        settings.StripeSecretKey.StartsWith("sk_org_test_", StringComparison.Ordinal);

    void Configure(HttpRequestMessage request, string? idempotencyKey = null)
    {
        if (!TestCredentialsReady) throw new ApiError(503, "Billing is not configured for Stripe test mode.");
        var isOrganizationKey = settings.StripeSecretKey.StartsWith("sk_org_test_", StringComparison.Ordinal);
        if (isOrganizationKey && (!System.Text.RegularExpressions.Regex.IsMatch(settings.StripeContext, @"\Aacct_[A-Za-z0-9]+\z") || string.IsNullOrWhiteSpace(settings.StripeApiVersion)))
            throw new ApiError(503, "Set the Stripe test account context and API version for the organization key.");
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
        if (!response.IsSuccessStatusCode) throw new ApiError(503, "Stripe test mode could not complete this billing request. Check the test Price ID, account context, and API key permissions.");
        try { return JObject.Parse(body); } catch (Newtonsoft.Json.JsonException) { throw new ApiError(503, "Stripe returned an invalid billing response."); }
    }

    public async Task ValidateTestPrice(CancellationToken ct)
    {
        if (!TestCredentialsReady || !settings.StripePriceId.StartsWith("price_", StringComparison.Ordinal)) throw new ApiError(503, "Configure a Stripe test-mode key and recurring Price ID.");
        using var request = new HttpRequestMessage(HttpMethod.Get, Api + "prices/" + Uri.EscapeDataString(settings.StripePriceId));
        var price = await Send(request, ct);
        if (price.Value<bool>("livemode") || price.Value<int?>("unit_amount") != 5000 || price.Value<string>("currency") != "usd" ||
            price["recurring"]?.Value<string>("interval") != "month" || price.Value<bool?>("active") != true)
            throw new ApiError(503, "The configured Stripe Price must be an active $50 USD monthly test Price.");
    }

    public async Task<string> CreateCustomer(string businessId, string businessName, string idempotencyKey, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, Api + "customers");
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["name"] = businessName, ["metadata[businessId]"] = businessId });
        Configure(request, idempotencyKey);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode) throw new ApiError(503, "Stripe could not create a test customer. Check the test key permissions.");
        return JObject.Parse(body).Value<string>("id") ?? throw new ApiError(503, "Stripe did not return a customer ID.");
    }

    public async Task<JObject> CreateCheckout(string businessId, string businessName, string customerId, string successUrl, string cancelUrl, string idempotencyKey, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, Api + "checkout/sessions");
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["mode"] = "subscription", ["customer"] = customerId, ["client_reference_id"] = businessId,
            ["line_items[0][price]"] = settings.StripePriceId, ["line_items[0][quantity]"] = "1",
            ["success_url"] = successUrl, ["cancel_url"] = cancelUrl,
            ["metadata[businessId]"] = businessId, ["metadata[businessName]"] = businessName,
            ["subscription_data[metadata][businessId]"] = businessId,
        });
        Configure(request, idempotencyKey);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode) throw new ApiError(503, "Stripe could not create a test Checkout Session.");
        return JObject.Parse(body);
    }

    public async Task<string> CreatePortal(string customerId, string returnUrl, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, Api + "billing_portal/sessions");
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["customer"] = customerId, ["return_url"] = returnUrl });
        var result = await Send(request, ct);
        return result.Value<string>("url") ?? throw new ApiError(503, "Stripe did not return a billing portal URL.");
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
