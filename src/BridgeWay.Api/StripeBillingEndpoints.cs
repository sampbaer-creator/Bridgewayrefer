using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

public static class StripeBillingEndpoints
{
    public static void MapStripeWebhook(this WebApplication app)
    {
        app.MapPost("/api/stripe/webhook", async (HttpRequest request, CosmosStore store, StripeBillingService stripe, Settings settings, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(settings.StripeWebhookSecret) || !stripe.TestCredentialsReady) return Results.StatusCode(503);
            if (request.ContentLength is > 524288) return Results.StatusCode(413);
            await using var buffer = new MemoryStream(); await request.Body.CopyToAsync(buffer, ct); var rawBody = buffer.ToArray();
            if (!StripeWebhookSignature.Verify(rawBody, request.Headers["Stripe-Signature"].FirstOrDefault(), settings.StripeWebhookSecret)) return Results.Unauthorized();
            JObject payload;
            try { payload = JObject.Parse(Encoding.UTF8.GetString(rawBody)); } catch (Newtonsoft.Json.JsonException) { return Results.BadRequest(); }
            var eventId = payload.Value<string>("id"); var eventType = payload.Value<string>("type"); var stripeObject = payload["data"]?["object"] as JObject;
            if (string.IsNullOrWhiteSpace(eventId) || stripeObject is null) return Results.BadRequest();
            var handled = eventType is "checkout.session.completed" or "customer.subscription.created" or "customer.subscription.updated" or "customer.subscription.deleted" or "invoice.payment_failed" or "invoice.paid" or "checkout.session.async_payment_failed";
            if (!handled) return Results.Ok(new { received = true });

            var businessId = stripeObject["metadata"]?.Value<string>("businessId");
            var subscriptionToken = stripeObject["subscription"] ?? stripeObject["parent"]?["subscription_details"]?["subscription"];
            var subscriptionId = subscriptionToken?.Type == JTokenType.String ? subscriptionToken.Value<string>() : subscriptionToken?.Value<string>("id");
            if (eventType?.StartsWith("customer.subscription.", StringComparison.Ordinal) == true) subscriptionId = stripeObject.Value<string>("id");
            if (string.IsNullOrWhiteSpace(subscriptionId)) return Results.Ok(new { received = true });

            var subscription = await stripe.GetSubscription(subscriptionId, ct);
            var subscriptionBusinessId = subscription["metadata"]?.Value<string>("businessId");
            if (subscription.Value<bool>("livemode") || string.IsNullOrWhiteSpace(subscriptionBusinessId) || (businessId is not null && subscriptionBusinessId != businessId) || !System.Text.RegularExpressions.Regex.IsMatch(subscriptionBusinessId, @"\A[A-Za-z0-9_-]{1,80}\z")) return Results.Ok(new { received = true });
            businessId = subscriptionBusinessId;
            var customerToken = subscription["customer"];
            var customerId = customerToken?.Type == JTokenType.String ? customerToken.Value<string>() : customerToken?.Value<string>("id");
            if (string.IsNullOrWhiteSpace(customerId)) return Results.Ok(new { received = true });

            var businessKey = new PartitionKey(businessId);
            var idHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(eventId))).ToLowerInvariant();
            var eventDocumentId = "stripe-event-" + idHash;
            for (var attempt = 0; attempt < 4; attempt++)
            {
                if (await store.Read(store.Operations, eventDocumentId, businessKey, ct) is not null) return Results.Ok(new { received = true, duplicate = true });
                var business = await store.Read(store.Operations, "business", businessKey, ct);
                if (business is null || (business.Value<string>("stripeCustomerId") is string knownCustomer && knownCustomer != customerId)) return Results.Ok(new { received = true });
                business["stripeCustomerId"] = customerId; business["stripeSubscriptionId"] = subscriptionId;
                business["billingStatus"] = subscription.Value<string>("status") ?? "unknown";
                business["billingCancelAtPeriodEnd"] = subscription.Value<bool?>("cancel_at_period_end") ?? false;
                var periodEnd = subscription.Value<long?>("current_period_end");
                business["billingRenewalAt"] = periodEnd is null ? JValue.CreateNull() : DateTimeOffset.FromUnixTimeSeconds(periodEnd.Value).ToString("O");
                business["billingUpdatedAt"] = DateTimeOffset.UtcNow.ToString("O");
                business.Remove("checkoutSessionId"); business.Remove("checkoutSessionUrl"); business.Remove("checkoutSessionExpiresAt");
                var eventDoc = new JObject { ["id"] = eventDocumentId, ["businessId"] = businessId, ["type"] = "stripe-event", ["eventId"] = eventId, ["eventType"] = eventType, ["createdAt"] = DateTimeOffset.UtcNow.ToString("O"), ["ttl"] = 7776000 };
                using var batch = await store.Operations.CreateTransactionalBatch(businessKey)
                    .CreateItem(eventDoc)
                    .ReplaceItem("business", business, new TransactionalBatchItemRequestOptions { IfMatchEtag = business.Value<string>("_etag") })
                    .ExecuteAsync(ct);
                if (batch.IsSuccessStatusCode) return Results.Ok(new { received = true });
                if (batch.Any(x => x.StatusCode == HttpStatusCode.Conflict)) return Results.Ok(new { received = true, duplicate = true });
                if (batch.Any(x => x.StatusCode == HttpStatusCode.PreconditionFailed)) continue;
                CosmosStore.Check(batch);
            }
            return Results.StatusCode(503);
        });
    }
}
