using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

public static class StripeBillingEndpoints
{
    public static DateTimeOffset? RenewalAt(JObject subscription)
    {
        var seconds = subscription.Value<long?>("current_period_end");
        if (seconds is null)
        {
            seconds = (subscription["items"]?["data"] as JArray)?
                .OfType<JObject>()
                .Select(item => item.Value<long?>("current_period_end"))
                .Where(value => value.HasValue)
                .Select(value => value!.Value)
                .DefaultIfEmpty()
                .Max();
            if (seconds == 0) seconds = null;
        }
        if (seconds is null or <= 0) return null;
        try { return DateTimeOffset.FromUnixTimeSeconds(seconds.Value); }
        catch (ArgumentOutOfRangeException) { return null; }
    }

    public static bool IsTerminal(string? status) => status is "canceled" or "incomplete_expired";

    public static bool MatchesReplacementCheckout(JObject session, string sessionId, string businessId, string customerId, string subscriptionId, bool liveMode = false) =>
        session.Value<string>("id") == sessionId &&
        session.Value<bool?>("livemode") == liveMode &&
        session.Value<string>("mode") == "subscription" &&
        session.Value<string>("status") == "complete" &&
        session.Value<string>("client_reference_id") == businessId &&
        session.Value<string>("customer") == customerId &&
        session.Value<string>("subscription") == subscriptionId;

    public static void ApplySubscription(JObject business, JObject subscription, Settings settings, DateTimeOffset now)
    {
        var subscriptionId = subscription.Value<string>("id");
        var newSubscription = business.Value<string>("stripeSubscriptionId") != subscriptionId;
        business["stripeSubscriptionId"] = subscriptionId;
        if (subscription.Value<bool?>("livemode") is bool liveMode) business["billingLiveMode"] = liveMode;
        var status = subscription.Value<string>("status") ?? "unknown";
        business["billingStatus"] = status;
        var priceId = (subscription["items"]?["data"] as JArray)?.OfType<JObject>().Select(item => item["price"]?.Value<string>("id")).FirstOrDefault(id => !string.IsNullOrWhiteSpace(id));
        var subscriptionPlan = settings.PlanForPrice(priceId) ?? subscription["metadata"]?.Value<string>("plan");
        if (subscriptionPlan is BillingPlans.Workspace or BillingPlans.ManagedCalling)
        {
            business["subscriptionPlan"] = subscriptionPlan; business["selectedPlan"] = subscriptionPlan;
            business["monthlyPriceUsd"] = settings.MonthlyPriceFor(subscriptionPlan);
            if (!string.IsNullOrWhiteSpace(priceId)) business["subscriptionPriceId"] = priceId;
        }
        if (business.Value<bool?>("customerSignup") == true && (status is "active" or "trialing"))
            business["signupCompleted"] = true;
        business["billingCancelAtPeriodEnd"] = subscription.Value<bool?>("cancel_at_period_end") ?? false;
        var periodEnd = RenewalAt(subscription);
        business["billingRenewalAt"] = periodEnd is null ? JValue.CreateNull() : periodEnd.Value.ToString("O");
        business["billingUpdatedAt"] = now.ToString("O");
        // Events for the existing subscription must leave a pending replacement checkout intact.
        if (newSubscription)
        {
            business.Remove("checkoutSessionId");
            business.Remove("checkoutSessionPlan");
            business.Remove("checkoutSessionUrl");
            business.Remove("checkoutSessionExpiresAt");
        }
    }

    public static void MapStripeWebhook(this WebApplication app)
    {
        app.MapPost("/api/stripe/webhook", async (HttpRequest request, CosmosStore store, StripeBillingService stripe, Settings settings, CancellationToken ct) =>
        {
            if (!settings.StripeConfigured || !stripe.KeyReady) return Results.StatusCode(503);
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
            if (subscription.Value<bool>("livemode") != stripe.LiveMode || payload.Value<bool?>("livemode") is bool eventLive && eventLive != stripe.LiveMode || subscription.Value<string>("id") != subscriptionId || string.IsNullOrWhiteSpace(subscriptionBusinessId) || (businessId is not null && subscriptionBusinessId != businessId) || !System.Text.RegularExpressions.Regex.IsMatch(subscriptionBusinessId, @"\A[A-Za-z0-9_-]{1,80}\z")) return Results.Ok(new { received = true });
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
                if (business is null || business.Value<string>("stripeCustomerId") != customerId) return Results.Ok(new { received = true });
                var knownSubscription = business.Value<string>("stripeSubscriptionId");
                var newSubscription = knownSubscription != subscriptionId;
                if (newSubscription && !string.IsNullOrWhiteSpace(knownSubscription))
                {
                    if (!IsTerminal(business.Value<string>("billingStatus")) ||
                        business.Value<string>("checkoutSessionId") is not { Length: > 0 } sessionId)
                        return Results.Ok(new { received = true });

                    var session = await stripe.GetCheckout(sessionId, ct);
                    if (!MatchesReplacementCheckout(session, sessionId, businessId, customerId, subscriptionId, stripe.LiveMode))
                        return Results.Ok(new { received = true });
                }
                ApplySubscription(business, subscription, settings, DateTimeOffset.UtcNow);
                // Admin-led onboarding: grant the bound owner Admin access only now, from the verified webhook.
                JObject? ownerMembership = null;
                if (OnboardingRules.IsPending(business) && business.Value<string>("ownerOid") is { Length: > 0 } ownerOid && business.Value<string>("ownerTenant") is { Length: > 0 } ownerTenant)
                {
                    var existingMember = await store.Read(store.Operations, CosmosStore.MembershipId(ownerTenant, ownerOid), businessKey, ct);
                    store.UseBusiness(businessId);
                    ownerMembership = OnboardingRules.ApplyActivation(business, existingMember, store, DateTimeOffset.UtcNow);
                }
                var eventDoc = new JObject { ["id"] = eventDocumentId, ["businessId"] = businessId, ["type"] = "stripe-event", ["eventId"] = eventId, ["eventType"] = eventType, ["createdAt"] = DateTimeOffset.UtcNow.ToString("O"), ["ttl"] = 7776000 };
                var pending = store.Operations.CreateTransactionalBatch(businessKey)
                    .CreateItem(eventDoc)
                    .ReplaceItem("business", business, new TransactionalBatchItemRequestOptions { IfMatchEtag = business.Value<string>("_etag") });
                if (ownerMembership is not null)
                    pending.CreateItem(ownerMembership).CreateItem(store.Audit("stripe-webhook", "onboarding-owner-activated", businessId));
                using var batch = await pending.ExecuteAsync(ct);
                if (batch.IsSuccessStatusCode) return Results.Ok(new { received = true });
                if (batch.Any(x => x.StatusCode == HttpStatusCode.Conflict)) return Results.Ok(new { received = true, duplicate = true });
                if (batch.Any(x => x.StatusCode == HttpStatusCode.PreconditionFailed)) continue;
                CosmosStore.Check(batch);
            }
            return Results.StatusCode(503);
        });
    }
}

