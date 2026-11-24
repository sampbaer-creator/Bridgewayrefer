using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

/// <summary>
/// Admin-led customer onboarding. A platform admin pre-creates a business in a pending-payment state and
/// sends the owner a single-use, expiring link. The owner signs in, the server binds that identity and
/// the business to a Stripe Checkout Session, and only a verified Stripe webhook grants the owner an
/// Admin membership (see <see cref="OnboardingRules.ApplyActivation"/>).
/// </summary>
public static class OnboardingRules
{
    public const string Corporate = "corporate";
    public const string AwaitingPayment = "AwaitingPayment";
    public const string ManualFollowUp = "ManualFollowUp";
    public const string Active = "Active";
    public const string NeedsAttention = "NeedsAttention";
    public const int LinkDays = 14;

    public static string NormalizePlan(string? plan) => plan switch
    {
        BillingPlans.Workspace or BillingPlans.ManagedCalling or Corporate => plan,
        _ => throw new ApiError(400, "Choose Workspace, Managed Calling, or Corporate/Custom."),
    };

    /// <summary>Only the SHA-256 of the 256-bit token is stored; the raw token exists only in the owner's link.</summary>
    public static string? InviteId(string? token) =>
        token is not null && Regex.IsMatch(token, @"\A[0-9a-f]{64}\z")
            ? "onboarding-invite-" + Convert.ToHexString(SHA256.HashData(Encoding.ASCII.GetBytes(token))).ToLowerInvariant()
            : null;

    public static (string Token, string Id) NewToken()
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        return (token, InviteId(token)!);
    }

    public static string Link(Settings settings, string businessId, string token) =>
        settings.PublicOrigin + "/onboard#token=" + token + "&workspace=" + Uri.EscapeDataString(businessId);

    public static bool IsPending(JObject? business) =>
        business?.Value<bool?>("adminOnboarding") == true && business.Value<string>("onboardingStatus") != Active;

    /// <summary>The link is usable only if it is the business's current invite, still pending and unexpired.</summary>
    public static bool IsUsableInvite(JObject? invite, JObject? business, string businessId, DateTimeOffset now) =>
        invite?.Value<string>("type") == "onboarding-invite" &&
        string.Equals(invite.Value<string>("businessId"), businessId, StringComparison.Ordinal) &&
        invite.Value<string>("state") == "Pending" &&
        business?.Value<bool?>("adminOnboarding") == true &&
        string.Equals(business.Value<string>("onboardingInviteId"), invite.Value<string>("id"), StringComparison.Ordinal) &&
        DateTimeOffset.TryParse(invite.Value<string>("expiresAt"), out var expires) && expires > now;

    /// <summary>The signed-in account must be the invited owner and, once bound, the same identity.</summary>
    public static bool OwnerMatches(JObject business, string email, string tenant, string oid)
    {
        if (!string.Equals(business.Value<string>("ownerEmail")?.Trim(), email.Trim(), StringComparison.OrdinalIgnoreCase)) return false;
        var boundOid = business.Value<string>("ownerOid");
        return string.IsNullOrEmpty(boundOid) ||
            (string.Equals(boundOid, oid, StringComparison.OrdinalIgnoreCase) && string.Equals(business.Value<string>("ownerTenant"), tenant, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Called by the verified Stripe webhook after the subscription is applied. Returns the owner membership to
    /// create (or null) and marks the business active. Payment must be active or trialing, on the plan the admin
    /// chose, for a business whose owner identity was bound before Checkout.
    /// </summary>
    public static JObject? ApplyActivation(JObject business, JObject? existingMembership, CosmosStore store, DateTimeOffset now)
    {
        if (business.Value<bool?>("adminOnboarding") != true || business.Value<string>("onboardingStatus") == Active) return null;
        var status = business.Value<string>("billingStatus");
        if (status is not ("active" or "trialing")) return null;
        var businessId = business.Value<string>("businessId")!;
        var tenant = business.Value<string>("ownerTenant"); var oid = business.Value<string>("ownerOid");
        if (string.IsNullOrWhiteSpace(tenant) || string.IsNullOrWhiteSpace(oid) ||
            business.Value<string>("subscriptionPlan") != business.Value<string>("onboardingPlan"))
        {
            business["onboardingStatus"] = NeedsAttention;
            return null;
        }
        business["onboardingStatus"] = Active;
        business["onboardingCompletedAt"] = now.ToString("O");
        business["signupCompleted"] = true;
        if (existingMembership is not null) return null;
        return store.Membership(businessId, tenant, oid, business.Value<string>("ownerEmail") ?? "", "Admin", businessName: business.Value<string>("name") ?? businessId);
    }

    public static string DisplayStatus(JObject business, DateTimeOffset now)
    {
        var state = business.Value<string>("onboardingStatus");
        if (state == ManualFollowUp) return "Manual follow-up";
        if (state == Active) return "Owner account connected";
        if (state == NeedsAttention) return "Needs attention";
        var billing = business.Value<string>("billingStatus");
        if (billing is "active" or "trialing") return "Payment confirmed";
        if (billing is "past_due" or "unpaid" or "incomplete" or "canceled" or "incomplete_expired") return "Needs attention";
        if (DateTimeOffset.TryParse(business.Value<string>("onboardingLinkExpiresAt"), out var expires) && expires <= now) return "Link expired";
        return "Awaiting payment";
    }
}

public sealed record OnboardingCreate(string Name, string OwnerEmail, string? OwnerName, string? AlertEmail, string? Industry, string? Specialty, string? Plan, bool SendEmail = true, string? Notes = null);
public sealed record OnboardingLinkRequest(bool SendEmail = true);
public sealed record OnboardingRedeem(string? Workspace, string? Token);

public static class OnboardingEndpoints
{
    static readonly Regex BusinessIdPattern = new(@"\A[A-Za-z0-9_-]{1,80}\z", RegexOptions.Compiled);
    static string Actor(HttpContext ctx) => "platform:" + (ctx.User.FindFirstValue("oid") ?? "unknown");

    static string PlanLabel(string plan) => plan switch { BillingPlans.ManagedCalling => "Managed Calling", OnboardingRules.Corporate => "Corporate/Custom", _ => "Workspace" };

    static async Task RequirePaidPlanReady(string plan, Settings settings, StripeBillingService stripe, CancellationToken ct)
    {
        if (!settings.StripeConfigured)
            throw new ApiError(503, "Stripe is not configured. Set Bridgewayrefer:StripeSecretKey, Bridgewayrefer:StripePriceId and Bridgewayrefer:StripeWebhookSecret.");
        if (!stripe.KeyReady)
            throw new ApiError(503, "The Stripe key is a test key and test mode is not allowed here (Bridgewayrefer:AllowStripeTestMode).");
        if (plan == BillingPlans.ManagedCalling && !settings.ManagedCallingConfigured)
            throw new ApiError(503, "Managed Calling is not configured. Set Bridgewayrefer:ManagedCallingStripePriceId to a $400/month Stripe Price.");
        if (!settings.IdentityConfigured)
            throw new ApiError(503, "Owner sign-in is not configured. Set the Microsoft identity settings (TenantId, ClientId, ClientSecret).");
        await stripe.ValidatePrice(plan, ct);
    }

    /// <summary>Sends the onboarding link. Returns "sent", "failed" or "not_configured" so the admin sees the real outcome.</summary>
    static async Task<string> EmailLink(Settings settings, ILogger logger, string to, string? ownerName, string businessName, string plan, string url)
    {
        if (!settings.SmtpConfigured) return "not_configured";
        try
        {
            var message = new MimeKit.MimeMessage();
            message.From.Add(MimeKit.MailboxAddress.Parse(settings.SmtpUsername));
            message.To.Add(MimeKit.MailboxAddress.Parse(to));
            message.Subject = "Finish setting up " + businessName + " on BridgeWay";
            message.Body = new MimeKit.TextPart("plain")
            {
                Text = string.Join(Environment.NewLine,
                    (string.IsNullOrWhiteSpace(ownerName) ? "Hello," : "Hi " + ownerName + ","), "",
                    "Your BridgeWay workspace for " + businessName + " is ready.", "",
                    "Plan: " + PlanLabel(plan), "",
                    "Open this link, sign in with this email address (" + to + "), and complete payment to open your dashboard:",
                    url, "", "The link expires in " + OnboardingRules.LinkDays + " days. Do not forward it.")
            };
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            await AlertWorker.SendEmail(settings, message, timeout.Token);
            return "sent";
        }
        catch (Exception e) { logger.LogWarning("Onboarding email failed ({Error}).", e.GetType().Name); return "failed"; }
    }

    /// <summary>Expires an open Checkout so a superseded link cannot be paid. Returns false if it was already paid.</summary>
    static async Task<bool> RetireCheckout(JObject business, StripeBillingService stripe, CancellationToken ct)
    {
        var sessionId = business.Value<string>("checkoutSessionId");
        if (string.IsNullOrWhiteSpace(sessionId)) return true;
        var session = await stripe.GetCheckout(sessionId, ct);
        if (session.Value<string>("status") == "complete") return false;
        if (session.Value<string>("status") == "open") await stripe.ExpireCheckout(sessionId, ct);
        foreach (var field in new[] { "checkoutSessionId", "checkoutSessionPlan", "checkoutSessionUrl", "checkoutSessionExpiresAt", "checkoutSessionInviteId" }) business.Remove(field);
        return true;
    }

    static object Row(JObject b, DateTimeOffset now) => new
    {
        businessId = b.Value<string>("businessId"), name = b.Value<string>("name"), ownerEmail = b.Value<string>("ownerEmail"), ownerName = b.Value<string>("ownerName"), notes = b.Value<string>("onboardingNotes"),
        plan = b.Value<string>("onboardingPlan"), status = OnboardingRules.DisplayStatus(b, now), billingStatus = b.Value<string>("billingStatus"),
        createdAt = b.Value<string>("createdAt"), linkExpiresAt = b.Value<string>("onboardingLinkExpiresAt"),
        ownerSignedIn = !string.IsNullOrEmpty(b.Value<string>("ownerOid")), lastEmail = b.Value<string>("onboardingLastEmail"),
        canIssueLink = b.Value<string>("onboardingPlan") != OnboardingRules.Corporate && b.Value<string>("onboardingStatus") is OnboardingRules.AwaitingPayment or OnboardingRules.NeedsAttention,
        etag = b.Value<string>("_etag"),
    };

    public static void MapCustomerOnboarding(this WebApplication app, Settings settings)
    {
        // ---------- Platform admin ----------
        var admin = app.MapGroup("/api/admin/onboarding");
        admin.AddEndpointFilter(async (context, next) =>
        {
            var user = context.HttpContext.User;
            if (user.Identity?.IsAuthenticated != true) throw new ApiError(401, "Please sign in.");
            if (!settings.IsPlatformAdmin(user)) throw new ApiError(403, "Platform administrator access is required.");
            return await next(context);
        });

        admin.MapGet("", async (CosmosStore store, CancellationToken ct) =>
        {
            var now = DateTimeOffset.UtcNow;
            var rows = (await store.AllBusinesses(ct)).Where(b => b.Value<bool?>("adminOnboarding") == true && b.Value<string>("deletedAt") is null)
                .OrderByDescending(b => b.Value<string>("createdAt"), StringComparer.Ordinal).Select(b => Row(b, now));
            return Results.Ok(new
            {
                customers = rows,
                config = new { stripe = settings.StripeConfigured, managedCalling = settings.ManagedCallingConfigured, email = settings.SmtpConfigured, identity = settings.IdentityConfigured },
            });
        });

        admin.MapPost("", async (OnboardingCreate data, HttpContext ctx, CosmosStore store, StripeBillingService stripe, ILoggerFactory loggers, CancellationToken ct) =>
        {
            var name = data.Name?.Trim() ?? ""; var ownerEmail = data.OwnerEmail?.Trim().ToLowerInvariant() ?? ""; var alertEmail = data.AlertEmail?.Trim().ToLowerInvariant() ?? "";
            var industry = data.Industry?.Trim() ?? ""; var specialty = data.Specialty?.Trim() ?? "";
            var ownerName = data.OwnerName?.Trim() ?? ""; var notes = data.Notes?.Trim() ?? "";
            if (ownerName.Length is < 1 or > 120 || ownerName.Any(char.IsControl)) throw new ApiError(400, "Enter the owner's name.");
            if (notes.Length > 1000) throw new ApiError(400, "Keep notes under 1,000 characters.");
            if (name.Length is < 2 or > 120) throw new ApiError(400, "Enter a business name between 2 and 120 characters.");
            if (!Endpoints.ValidEmail(ownerEmail)) throw new ApiError(400, "Enter the owner's email address.");
            if (alertEmail.Length > 0 && !Endpoints.ValidEmail(alertEmail)) throw new ApiError(400, "Enter a valid alert email or leave it blank.");
            if (industry is not ("healthcare" or "trades" or "other") || specialty.Length is < 1 or > 120 || specialty.Any(char.IsControl))
                throw new ApiError(400, "Choose an industry and enter a specialty, up to 120 characters.");
            var plan = OnboardingRules.NormalizePlan(data.Plan);
            var paid = plan != OnboardingRules.Corporate;
            if (paid) await RequirePaidPlanReady(plan, settings, stripe, ct);

            var businessId = "biz-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(12)).ToLowerInvariant();
            store.UseBusiness(businessId);
            var now = DateTimeOffset.UtcNow;
            var business = store.Document("business", "business");
            business["name"] = name; business["officeName"] = name; business["welcomeText"] = "Share a few details and our team will be in touch.";
            business["acceptReferrals"] = true; business["suspended"] = false; business["billingExempt"] = false; business["billingStatus"] = "not_configured";
            business["alertEmail"] = alertEmail.Length > 0 ? alertEmail : ownerEmail; business["createdBy"] = Actor(ctx);
            business["industry"] = industry; business["specialty"] = specialty;
            business["adminOnboarding"] = true; business["ownerEmail"] = ownerEmail; business["ownerName"] = ownerName; business["onboardingPlan"] = plan;
            if (notes.Length > 0) business["onboardingNotes"] = notes;
            business["onboardingStatus"] = paid ? OnboardingRules.AwaitingPayment : OnboardingRules.ManualFollowUp;
            if (paid) { business["selectedPlan"] = plan; business["monthlyPriceUsd"] = settings.MonthlyPriceFor(plan); }
            var office = store.Document("office", "office-main"); office["name"] = name; office["active"] = true;

            string? token = null; JObject? invite = null;
            if (paid)
            {
                business["stripeCustomerId"] = await stripe.CreateCustomer(businessId, name, "bridgeway-customer-" + businessId, ct, ownerEmail);
                (token, var inviteId) = OnboardingRules.NewToken();
                invite = store.Document("onboarding-invite", inviteId); invite["state"] = "Pending"; invite["expiresAt"] = now.AddDays(OnboardingRules.LinkDays).ToString("O"); invite["createdBy"] = Actor(ctx);
                business["onboardingInviteId"] = inviteId; business["onboardingLinkExpiresAt"] = invite["expiresAt"]!.DeepClone();
            }
            var batch = store.Operations.CreateTransactionalBatch(store.BusinessKey).CreateItem(business).CreateItem(office)
                .CreateItem(store.Audit(Actor(ctx), "platform-onboard-customer", businessId));
            if (invite is not null) batch.CreateItem(invite);
            using (var result = await batch.ExecuteAsync(ct)) CosmosStore.Check(result);

            var url = token is null ? null : OnboardingRules.Link(settings, businessId, token);
            var email = url is not null && data.SendEmail ? await EmailLink(settings, loggers.CreateLogger("Onboarding"), ownerEmail, ownerName, name, plan, url) : "skipped";
            if (email != "skipped") await RecordEmail(store, businessId, email, ct);
            return Results.Json(new { businessId, name, plan, link = url, email }, statusCode: 201);
        });

        // Issues a new link (and optionally emails it). The previous link and any open Checkout stop working.
        admin.MapPost("/{businessId}/link", async (string businessId, OnboardingLinkRequest data, HttpContext ctx, CosmosStore store, StripeBillingService stripe, ILoggerFactory loggers, CancellationToken ct) =>
        {
            if (!BusinessIdPattern.IsMatch(businessId)) throw new ApiError(404, "Customer not found.");
            store.UseBusiness(businessId);
            var business = await store.Business(businessId, ct);
            if (business is null || business.Value<bool?>("adminOnboarding") != true || business.Value<string>("deletedAt") is not null) throw new ApiError(404, "Customer not found.");
            var plan = business.Value<string>("onboardingPlan") ?? "";
            if (plan == OnboardingRules.Corporate) throw new ApiError(409, "Corporate/Custom customers are handled by manual follow-up, not a payment link.");
            if (business.Value<string>("onboardingStatus") == OnboardingRules.Active) throw new ApiError(409, "This customer has already paid and connected their account.");
            if (business.Value<string>("billingStatus") is "active" or "trialing") throw new ApiError(409, "Payment is already confirmed for this customer.");
            await RequirePaidPlanReady(plan, settings, stripe, ct);
            if (!await RetireCheckout(business, stripe, ct)) throw new ApiError(409, "The current Checkout was already paid. Wait for Stripe to confirm it.");

            var now = DateTimeOffset.UtcNow;
            var oldInvite = business.Value<string>("onboardingInviteId") is { Length: > 0 } oldId ? await store.Read(oldId, ct) : null;
            var (token, inviteId) = OnboardingRules.NewToken();
            var invite = store.Document("onboarding-invite", inviteId); invite["state"] = "Pending"; invite["expiresAt"] = now.AddDays(OnboardingRules.LinkDays).ToString("O"); invite["createdBy"] = Actor(ctx);
            business["onboardingInviteId"] = inviteId; business["onboardingLinkExpiresAt"] = invite["expiresAt"]!.DeepClone();
            business["onboardingStatus"] = OnboardingRules.AwaitingPayment;
            // A new link may go to a corrected owner account, so release the previous identity binding.
            business.Remove("ownerOid"); business.Remove("ownerTenant");
            var batch = store.Operations.CreateTransactionalBatch(store.BusinessKey)
                .ReplaceItem("business", business, new TransactionalBatchItemRequestOptions { IfMatchEtag = business.Value<string>("_etag") })
                .CreateItem(invite).CreateItem(store.Audit(Actor(ctx), "platform-onboarding-new-link", businessId));
            if (oldInvite is not null) { oldInvite["state"] = "Superseded"; oldInvite["supersededAt"] = now.ToString("O"); batch.ReplaceItem(oldInvite.Value<string>("id")!, oldInvite, new TransactionalBatchItemRequestOptions { IfMatchEtag = oldInvite.Value<string>("_etag") }); }
            using (var result = await batch.ExecuteAsync(ct))
            {
                if (result.Any(r => r.StatusCode == HttpStatusCode.PreconditionFailed)) throw new ApiError(409, "This customer changed while the link was being issued. Refresh and try again.");
                CosmosStore.Check(result);
            }
            var url = OnboardingRules.Link(settings, businessId, token);
            var email = data.SendEmail ? await EmailLink(settings, loggers.CreateLogger("Onboarding"), business.Value<string>("ownerEmail")!, business.Value<string>("ownerName"), business.Value<string>("name") ?? businessId, plan, url) : "skipped";
            if (email != "skipped") await RecordEmail(store, businessId, email, ct);
            return Results.Ok(new { businessId, link = url, email });
        });

        // ---------- Invited owner ----------
        app.MapPost("/api/onboarding/status", async (OnboardingRedeem data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var (business, _, _, _) = await Redeem(data, ctx, store, settings, ct);
            var active = business.Value<string>("onboardingStatus") == OnboardingRules.Active;
            return Results.Ok(new { businessName = business.Value<string>("name"), plan = business.Value<string>("onboardingPlan"), status = active ? "active" : "awaiting_payment", paymentConfirmed = business.Value<string>("billingStatus") is "active" or "trialing" });
        });

        app.MapPost("/api/onboarding/checkout", async (OnboardingRedeem data, HttpContext ctx, CosmosStore store, StripeBillingService stripe, CancellationToken ct) =>
        {
            var (business, tenant, oid, inviteId) = await Redeem(data, ctx, store, settings, ct);
            if (business.Value<string>("onboardingStatus") == OnboardingRules.Active) return Results.Ok(new { active = true });
            if (business.Value<string>("billingStatus") is "active" or "trialing") return Results.Ok(new { paymentConfirmed = true });
            var plan = business.Value<string>("onboardingPlan")!;
            if (!settings.StripeConfigured || !stripe.KeyReady) throw new ApiError(503, "Payment is not available right now. Contact BridgeWay.");
            var now = DateTimeOffset.UtcNow;
            if (business.Value<string>("checkoutSessionUrl") is string openUrl && business.Value<string>("checkoutSessionInviteId") == inviteId &&
                DateTimeOffset.TryParse(business.Value<string>("checkoutSessionExpiresAt"), out var expires) && expires > now.AddMinutes(2))
                return Results.Ok(new { url = openUrl });

            // Bind the owner identity first; the etag makes concurrent attempts fail instead of double-creating sessions.
            var attempt = (business.Value<int?>("onboardingCheckoutAttempts") ?? 0) + 1;
            business["ownerOid"] = oid; business["ownerTenant"] = tenant; business["onboardingCheckoutAttempts"] = attempt;
            try { business["_etag"] = (await store.Operations.ReplaceItemAsync(business, "business", store.BusinessKey, new ItemRequestOptions { IfMatchEtag = business.Value<string>("_etag") }, ct)).ETag; }
            catch (CosmosException e) when (e.StatusCode == HttpStatusCode.PreconditionFailed) { throw new ApiError(409, "Checkout is already being prepared. Try again in a moment."); }

            var businessId = store.BusinessId;
            var session = await stripe.CreateCheckout(businessId, business.Value<string>("name") ?? businessId, business.Value<string>("stripeCustomerId")!, plan,
                settings.PublicOrigin + "/onboard?checkout=success", settings.PublicOrigin + "/onboard?checkout=cancelled",
                "bridgeway-onboard-" + businessId + "-" + attempt, ct,
                extraMetadata: new Dictionary<string, string> { ["onboarding"] = "admin", ["ownerEmail"] = business.Value<string>("ownerEmail") ?? "" });
            var url = session.Value<string>("url") ?? throw new ApiError(503, "Stripe did not return a Checkout URL.");
            business["checkoutSessionId"] = session.Value<string>("id"); business["checkoutSessionPlan"] = plan; business["checkoutSessionUrl"] = url;
            business["checkoutSessionExpiresAt"] = DateTimeOffset.FromUnixTimeSeconds(session.Value<long>("expires_at")).ToString("O"); business["checkoutSessionInviteId"] = inviteId;
            using (var result = await store.Operations.CreateTransactionalBatch(store.BusinessKey)
                .ReplaceItem("business", business, new TransactionalBatchItemRequestOptions { IfMatchEtag = business.Value<string>("_etag") })
                .CreateItem(store.Audit(oid, "onboarding-checkout", businessId)).ExecuteAsync(ct))
            {
                if (result.Any(r => r.StatusCode == HttpStatusCode.PreconditionFailed)) throw new ApiError(409, "This setup link changed. Refresh and try again.");
                CosmosStore.Check(result);
            }
            return Results.Ok(new { url });
        });
    }

    static async Task RecordEmail(CosmosStore store, string businessId, string outcome, CancellationToken ct)
    {
        for (var i = 0; i < 3; i++)
        {
            var business = await store.Business(businessId, ct); if (business is null) return;
            business["onboardingLastEmail"] = outcome + " " + DateTimeOffset.UtcNow.ToString("O");
            try { await store.Operations.ReplaceItemAsync(business, "business", new PartitionKey(businessId), new ItemRequestOptions { IfMatchEtag = business.Value<string>("_etag") }, ct); return; }
            catch (CosmosException e) when (e.StatusCode == HttpStatusCode.PreconditionFailed) { }
        }
    }

    /// <summary>Validates the signed-in owner, the opaque token, and the business it is bound to.</summary>
    static async Task<(JObject Business, string Tenant, string Oid, string InviteId)> Redeem(OnboardingRedeem data, HttpContext ctx, CosmosStore store, Settings settings, CancellationToken ct)
    {
        if (ctx.User.Identity?.IsAuthenticated != true) throw new ApiError(401, "Sign in to continue setup.");
        var oid = ctx.User.FindFirstValue("oid"); var tenant = ctx.User.FindFirstValue("tid");
        if (string.IsNullOrWhiteSpace(oid) || string.IsNullOrWhiteSpace(tenant) || !settings.AcceptsStaffTenant(tenant)) throw new ApiError(403, "Access denied.");
        var inviteId = OnboardingRules.InviteId(data.Token);
        var businessId = data.Workspace;
        if (inviteId is null || businessId is null || !BusinessIdPattern.IsMatch(businessId)) throw new ApiError(400, "This setup link is invalid.");
        var email = (ctx.User.FindFirstValue("email") ?? ctx.User.FindFirstValue("preferred_username") ?? "").Trim().ToLowerInvariant();
        if (email.Length == 0 || (tenant == Settings.GoogleTenant && ctx.User.FindFirstValue("bridgeway_google_email_authoritative") != "true"))
            throw new ApiError(403, "Sign in with the email address that received this setup link.");
        store.UseBusiness(businessId);
        var business = await store.Business(businessId, ct);
        var invite = await store.Read(inviteId, ct);
        if (business is null || BusinessRules.IsArchived(business) || business.Value<string>("deletedAt") is not null) throw new ApiError(404, "This setup link is no longer available.");
        if (business.Value<string>("onboardingStatus") == OnboardingRules.Active)
        {
            // Already finished: let the owner continue to the dashboard, but never reveal it to anyone else.
            if (!OnboardingRules.OwnerMatches(business, email, tenant, oid)) throw new ApiError(403, "This setup link was sent to another account.");
            return (business, tenant, oid, inviteId);
        }
        if (!OnboardingRules.IsUsableInvite(invite, business, businessId, DateTimeOffset.UtcNow))
            throw new ApiError(410, "This setup link has expired or was replaced. Ask BridgeWay for a new link.");
        if (!OnboardingRules.OwnerMatches(business, email, tenant, oid))
            throw new ApiError(403, "This setup link was sent to another account. Sign in with the invited email address.");
        return (business, tenant, oid, inviteId);
    }
}
