using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

/// <summary>
/// Platform owner console: create businesses, invite their first admin, issue and assign NFC card links,
/// and see usage across every business. Restricted to Bridgewayrefer:PlatformAdminObjectIds.
/// </summary>
public static class AdminEndpoints
{
    static readonly Regex BusinessIdPattern = new(@"\A[A-Za-z0-9_-]{1,80}\z", RegexOptions.Compiled);
    static readonly Regex CardCodePattern = new(@"\A[A-Za-z0-9_-]{8,80}\z", RegexOptions.Compiled);
    const int MaxCardsPerRequest = 50;

    static string Actor(HttpContext ctx) => "platform:" + (ctx.User.FindFirstValue("oid") ?? "unknown");
    static string CardUrl(Settings settings, string code) => settings.PublicOrigin + "/r/" + code;
    static string NewCode() => Convert.ToHexString(RandomNumberGenerator.GetBytes(18)).ToLowerInvariant();

    static async Task<JObject> RequireBusiness(CosmosStore store, string businessId, CancellationToken ct)
    {
        if (!BusinessIdPattern.IsMatch(businessId)) throw new ApiError(404, "Business not found.");
        store.UseBusiness(businessId);
        var business = await store.Business(businessId, ct);
        if (business is null || business.Value<string>("deletedAt") is not null)
            throw new ApiError(404, "Business not found.");
        return business;
    }

    static bool MatchesStripeSubscription(JObject subscription, JObject business, StripeBillingService stripe) =>
        subscription.Value<string>("id") == business.Value<string>("stripeSubscriptionId") &&
        business.Value<string>("stripeCustomerId") is { Length: > 0 } customerId &&
        subscription.Value<string>("customer") == customerId &&
        subscription["metadata"]?.Value<string>("businessId") == business.Value<string>("businessId") &&
        subscription.Value<bool?>("livemode") == stripe.LiveMode;

    static async Task<JObject> ReadStripeSubscription(JObject business, StripeBillingService stripe, CancellationToken ct)
    {
        var subscriptionId = business.Value<string>("stripeSubscriptionId");
        if (string.IsNullOrWhiteSpace(subscriptionId)) throw new ApiError(409, "This business has no linked Stripe subscription.");
        var subscription = await stripe.GetSubscription(subscriptionId, ct);
        if (!MatchesStripeSubscription(subscription, business, stripe))
            throw new ApiError(409, "The Stripe subscription could not be verified for this business.");
        return subscription;
    }

    static object StripeSummary(JObject subscription, Settings settings, StripeBillingService stripe)
    {
        var id = Uri.EscapeDataString(subscription.Value<string>("id")!);
        var path = new List<string>();
        if (!string.IsNullOrEmpty(settings.StripeContext)) path.Add(Uri.EscapeDataString(settings.StripeContext));
        if (!stripe.LiveMode) path.Add("test");
        path.Add("subscriptions");
        path.Add(id);
        return new
        {
            status = subscription.Value<string>("status") ?? "unknown",
            cancelAtPeriodEnd = subscription.Value<bool?>("cancel_at_period_end") == true,
            periodEnd = StripeBillingEndpoints.RenewalAt(subscription),
            dashboardUrl = "https://dashboard.stripe.com/" + string.Join("/", path),
        };
    }

    static object Summary(JObject b, Dictionary<(string Business, string Type), long> counts, Settings settings)
    {
        var id = b.Value<string>("businessId") ?? "";
        long Count(string type) => counts.TryGetValue((id, type), out var n) ? n : 0;
        return new
        {
            patientCardCode = b.Value<string>("patientCardCode") ?? "",
            welcomeText = b.Value<string>("welcomeText") ?? "", phone = b.Value<string>("phone") ?? "",
            businessId = id, name = b.Value<string>("name"), archived = BusinessRules.IsArchived(b), logoUrl = b.Value<string>("logoUrl") ?? "",
            createdAt = b.Value<string>("createdAt"), suspended = b.Value<bool?>("suspended") ?? false,
            acceptReferrals = b.Value<bool?>("acceptReferrals") ?? false, billingExempt = b.Value<bool?>("billingExempt") ?? false,
            intakeOpen = BusinessRules.AcceptsReferrals(settings, b),
            checkoutExpiresAt = b.Value<string>("checkoutSessionExpiresAt"),
            hasStripeSubscription = b.Value<string>("stripeSubscriptionId") is { Length: > 0 },
            billingStatus = b.Value<string>("billingStatus") ?? "not_configured", alertEmail = b.Value<string>("alertEmail") ?? "",
            cards = Count("card"), taps = Count("link-open"), referrals = Count("referral"), etag = b.Value<string>("_etag"),
        };
    }

    public static void MapPlatformAdmin(this WebApplication app, Settings settings)
    {
        var admin = app.MapGroup("/api/admin");
        admin.AddEndpointFilter(async (context, next) =>
        {
            var user = context.HttpContext.User;
            if (user.Identity?.IsAuthenticated != true) throw new ApiError(401, "Please sign in.");
            if (!settings.IsPlatformAdmin(user)) throw new ApiError(403, "Platform administrator access is required.");
            return await next(context);
        });

        admin.MapGet("/session", (HttpContext ctx) => Results.Ok(new
        {
            ok = true, email = ctx.User.FindFirstValue("email") ?? ctx.User.FindFirstValue("preferred_username") ?? "", account = AccountIdentity.From(ctx.User),
            acceptingGlobally = settings.AcceptReferrals, smtpConfigured = settings.SmtpConfigured,
            stripeConfigured = settings.StripeConfigured, monthlyPriceUsd = settings.MonthlyPriceUsd,
            publicOrigin = settings.PublicOrigin, canonicalOriginReady = new Uri(settings.PublicOrigin).Host == "bridgewayrefer.com",
        }));

        admin.MapGet("/businesses", async (CosmosStore store, CancellationToken ct) =>
        {
            var businesses = store.AllBusinesses(ct); var counts = store.CountsByBusiness(ct);
            await Task.WhenAll(businesses, counts);
            var rows = (await businesses).Select(b => Summary(b, counts.Result, settings)).ToList();
            var visibleIds = businesses.Result.Select(b => b.Value<string>("businessId") ?? "").ToHashSet(StringComparer.Ordinal);
            long Total(string type) => counts.Result.Where(x => x.Key.Type == type && visibleIds.Contains(x.Key.Business)).Sum(x => x.Value);
            return Results.Ok(new
            {
                businesses = rows,
                totals = new { businesses = businesses.Result.Count(b => !BusinessRules.IsArchived(b)), cards = Total("card"), taps = Total("link-open"), referrals = Total("referral") },
            });
        });

        admin.MapPost("/businesses", async (BusinessCreate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var name = data.Name?.Trim() ?? "";
            var adminEmail = data.AdminEmail?.Trim().ToLowerInvariant() ?? ""; var alertEmail = data.AlertEmail?.Trim().ToLowerInvariant() ?? "";
            if (name.Length is < 2 or > 120) throw new ApiError(400, "Enter a valid business name.");
            if (!Endpoints.ValidEmail(adminEmail)) throw new ApiError(400, "Enter the email of the business's first administrator.");
            if (alertEmail.Length > 0 && !Endpoints.ValidEmail(alertEmail)) throw new ApiError(400, "Enter a valid alert email or leave it blank.");
            var businessId = "biz-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(12)).ToLowerInvariant();
            store.UseBusiness(businessId);
            var business = store.Document("business", "business"); business["name"] = name; business["officeName"] = name; business["welcomeText"] = "Share a few details and our team will be in touch.";
            business["acceptReferrals"] = true; business["suspended"] = false; business["billingExempt"] = data.BillingExempt; business["billingStatus"] = "not_configured";
            business["alertEmail"] = alertEmail.Length > 0 ? alertEmail : adminEmail; business["createdBy"] = Actor(ctx);
            var office = store.Document("office", "office-main"); office["name"] = name; office["active"] = true;
            var (invite, inviteUrl) = InvitationLinks.Create(store, settings, adminEmail, "Admin", Actor(ctx), 14);
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey)
                .CreateItem(business).CreateItem(office).CreateItem(invite).CreateItem(store.Audit(Actor(ctx), "platform-create-business", businessId)).ExecuteAsync(ct);
            CosmosStore.Check(batch);
            return Results.Json(new { businessId, name, inviteUrl }, statusCode: 201);
        });

        admin.MapGet("/businesses/{businessId}", async (string businessId, CosmosStore store, CancellationToken ct) =>
        {
            var business = await RequireBusiness(store, businessId, ct);
            var cards = store.BusinessCards(businessId, ct); var partners = store.Query("partner", ct: ct); var offices = store.Query("office", ct: ct);
            var members = store.Query("membership", ct: ct); var invites = store.Query("membership-invite", ct: ct); var counts = store.CountsByBusiness(ct);
            await Task.WhenAll(cards, partners, offices, members, invites, counts);
            var opensByCard = (await store.Query("link-open", summaries: true, ct: ct)).GroupBy(o => o.Value<string>("doctorCode") ?? "").ToDictionary(g => g.Key, g => g.Count());
            var referralsByCard = (await store.Query("referral", summaries: true, ct: ct)).GroupBy(r => r.Value<string>("doctorCode") ?? "").ToDictionary(g => g.Key, g => g.Count());
            return Results.Ok(new
            {
                business = Summary(business, counts.Result, settings),
                cards = cards.Result.OrderByDescending(c => c.Value<string>("createdAt"), StringComparer.Ordinal).Select(c => new
                {
                    id = c.Value<string>("id"), label = c.Value<string>("label") ?? "", partnerId = c.Value<string>("partnerId"), partnerName = c.Value<string>("partnerName"),
                    officeId = c.Value<string>("officeId"), officeName = c.Value<string>("officeName"), active = c.Value<bool>("active"), createdAt = c.Value<string>("createdAt"), etag = c.Value<string>("_etag"),
                    url = CardUrl(settings, c.Value<string>("id")!), taps = opensByCard.GetValueOrDefault(c.Value<string>("id") ?? ""), referrals = referralsByCard.GetValueOrDefault(c.Value<string>("id") ?? ""),
                }),
                partners = partners.Result.Select(p => new { id = p.Value<string>("id"), name = p.Value<string>("name"), active = p.Value<bool>("active") }),
                offices = offices.Result.Select(o => new { id = o.Value<string>("id"), name = o.Value<string>("name"), logoUrl = o.Value<string>("logoUrl"), active = o.Value<bool>("active") }),
                members = members.Result.Where(m => m.Value<bool>("active")).Select(m => new { id = m.Value<string>("id"), etag = m.Value<string>("_etag"), email = m.Value<string>("email"), role = m.Value<string>("role") }),
                invitations = invites.Result.Where(i => i.Value<string>("state") == "Pending").Select(i => new { id = i.Value<string>("id"), etag = i.Value<string>("_etag"), email = i.Value<string>("email"), role = i.Value<string>("role"), expiresAt = i.Value<string>("expiresAt") }),
            });
        });

        admin.MapPatch("/businesses/{businessId}", async (string businessId, AdminBusinessUpdate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var business = await RequireBusiness(store, businessId, ct);
            if (string.IsNullOrWhiteSpace(data.Etag)) throw new ApiError(400, "Refresh and try again.");
            var alertEmail = data.AlertEmail?.Trim().ToLowerInvariant();
            if (alertEmail is { Length: > 0 } && !Endpoints.ValidEmail(alertEmail)) throw new ApiError(400, "Enter a valid alert email or leave it blank.");
            var logo = data.LogoUrl?.Trim();
            if (logo is not null && !BusinessRules.ValidLogoUrl(logo))
                throw new ApiError(400, "Enter an HTTPS logo URL or leave it blank.");
            if (BusinessRules.IsArchived(business) && data.Archived != false)
                throw new ApiError(409, "Restore this business before making changes.");
            var welcome = data.WelcomeText?.Trim();
            var phone = data.Phone?.Trim();
            if (welcome?.Length > 500 || phone?.Length > 40)
                throw new ApiError(400, "Please check the patient form settings.");
            var changes = new List<string>();
            if (welcome is not null) { business["welcomeText"] = welcome; changes.Add("welcomeText"); }
            if (phone is not null) { business["phone"] = phone; changes.Add("phone"); }
            if (data.PatientCardCode is { } code)
            {
                if (code.Length != 0)
                {
                    var card = CardCodePattern.IsMatch(code) ? await store.Card(code, ct, expectedBusinessId: businessId) : null;
                    if (card?.Value<bool>("active") != true) throw new ApiError(400, "Choose an active card from this business.");
                }
                business["patientCardCode"] = code;
                changes.Add("patientCardCode");
            }
            if (data.Archived is bool archived)
            {
                business["archived"] = archived;
                changes.Add(archived ? "archived" : "restored");
            }
            if (logo is not null) { business["logoUrl"] = logo; changes.Add("logoUrl"); }
            if (data.AcceptReferrals is bool accepting) { business["acceptReferrals"] = accepting; changes.Add("acceptReferrals:" + accepting); }
            if (data.Suspended is bool suspended) { business["suspended"] = suspended; changes.Add("suspended:" + suspended); }
            if (data.BillingExempt is bool exempt) { business["billingExempt"] = exempt; changes.Add("billingExempt:" + exempt); }
            if (alertEmail is not null) { business["alertEmail"] = alertEmail; changes.Add("alertEmail"); }
            if (changes.Count == 0) return Results.Ok(new { ok = true });
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey)
                .ReplaceItem("business", business, new TransactionalBatchItemRequestOptions { IfMatchEtag = data.Etag })
                .CreateItem(store.Audit(Actor(ctx), "platform-update:" + string.Join(",", changes), businessId)).ExecuteAsync(ct);
            CosmosStore.Check(batch); return Results.Ok(new { ok = true });
        });

        admin.MapPost("/businesses/{businessId}/logo", async (string businessId, HttpContext ctx, CosmosStore store, BusinessLogoStorage logos, CancellationToken ct) =>
        {
            var business = await RequireBusiness(store, businessId, ct);
            if (BusinessRules.IsArchived(business)) throw new ApiError(409, "Restore this business before updating its logo.");
            var sizeLimit = ctx.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpMaxRequestBodySizeFeature>();
            if (sizeLimit is { IsReadOnly: false }) sizeLimit.MaxRequestBodySize = BusinessLogoStorage.MaxRequestBytes;
            var data = await ctx.Request.ReadFromJsonAsync<AdminLogoUpload>(ct);
            if (data is null || string.IsNullOrEmpty(data.Etag) || data.Etag != business.Value<string>("_etag"))
                throw new ApiError(409, "This business changed. Refresh and try again.");

            var logoUrl = await logos.Upload(data.Image, ct);
            business["logoUrl"] = logoUrl;
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey)
                .ReplaceItem("business", business, new TransactionalBatchItemRequestOptions { IfMatchEtag = data.Etag })
                .CreateItem(store.Audit(Actor(ctx), "platform-upload-business-logo", businessId)).ExecuteAsync(ct);
            CosmosStore.Check(batch);
            return Results.Ok(new { logoUrl });
        });

        admin.MapGet("/businesses/{businessId}/stripe", async (string businessId, CosmosStore store, StripeBillingService stripe, CancellationToken ct) =>
        {
            var business = await RequireBusiness(store, businessId, ct);
            return Results.Ok(StripeSummary(await ReadStripeSubscription(business, stripe, ct), settings, stripe));
        });

        admin.MapPatch("/businesses/{businessId}/stripe", async (string businessId, AdminStripeUpdate data, HttpContext ctx, CosmosStore store, StripeBillingService stripe, CancellationToken ct) =>
        {
            if (data.CancelAtPeriodEnd is not bool cancel) throw new ApiError(400, "Choose a renewal action.");
            var business = await RequireBusiness(store, businessId, ct);
            var subscription = await ReadStripeSubscription(business, stripe, ct);
            if (StripeBillingEndpoints.IsTerminal(subscription.Value<string>("status")))
                throw new ApiError(409, "This subscription has ended.");

            var cancelAtPeriodEnd = subscription.Value<bool?>("cancel_at_period_end") == true;
            if (cancelAtPeriodEnd == cancel)
                return Results.Ok(StripeSummary(subscription, settings, stripe));

            var action = cancel ? "schedule-cancellation" : "undo-cancellation";
            await store.Create(store.Audit(Actor(ctx), "platform-stripe-request:" + action, businessId), ct);
            var updated = await stripe.SetCancelAtPeriodEnd(subscription.Value<string>("id")!, cancel, ct);
            if (!MatchesStripeSubscription(updated, business, stripe) || updated.Value<bool?>("cancel_at_period_end") != cancel)
                throw new ApiError(503, "Stripe did not confirm the change. Refresh the subscription status before retrying.");

            return Results.Ok(StripeSummary(updated, settings, stripe));
        });

        admin.MapDelete("/businesses/{businessId}", async (string businessId, [Microsoft.AspNetCore.Mvc.FromBody] AdminBusinessDelete data, HttpContext ctx, CosmosStore store, StripeBillingService stripe, CancellationToken ct) =>
        {
            var business = await RequireBusiness(store, businessId, ct);
            if (string.IsNullOrEmpty(data.Etag) || data.Name != business.Value<string>("name"))
                throw new ApiError(400, "Confirm the business name and try again.");
            if (!BusinessRules.IsArchived(business))
                throw new ApiError(409, "Archive this business before deleting it.");
            if (DateTimeOffset.TryParse(business.Value<string>("checkoutSessionExpiresAt"), out var checkoutExpiry) &&
                checkoutExpiry > DateTimeOffset.UtcNow)
                throw new ApiError(409, "Wait for the open Stripe checkout to expire before deleting this business.");
            if (business.Value<string>("stripeSubscriptionId") is { Length: > 0 })
            {
                var subscription = await ReadStripeSubscription(business, stripe, ct);
                if (!StripeBillingEndpoints.IsTerminal(subscription.Value<string>("status")))
                    throw new ApiError(409, "End the Stripe subscription before deleting this business.");
            }
            else if (BusinessRules.PaidStatuses.Contains(business.Value<string>("billingStatus")))
            {
                throw new ApiError(409, "Resolve the billing status before deleting this business.");
            }

            business["deletedAt"] = DateTimeOffset.UtcNow.ToString("O");
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey)
                .ReplaceItem("business", business, new TransactionalBatchItemRequestOptions { IfMatchEtag = data.Etag })
                .CreateItem(store.Audit(Actor(ctx), "platform-delete-business", businessId)).ExecuteAsync(ct);
            CosmosStore.Check(batch);
            return Results.Ok(new { ok = true });
        });

        admin.MapPost("/businesses/{businessId}/invitations", async (string businessId, InvitationCreate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var business = await RequireBusiness(store, businessId, ct);
            if (BusinessRules.IsArchived(business)) throw new ApiError(409, "Restore this business before inviting people.");
            var email = data.Email?.Trim().ToLowerInvariant() ?? "";
            if (!Endpoints.ValidEmail(email) || data.Role is not ("Admin" or "Staff")) throw new ApiError(400, "Enter a valid email and choose Admin or Staff.");
            var (invite, inviteUrl) = InvitationLinks.Create(store, settings, email, data.Role, Actor(ctx), 14);
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey).CreateItem(invite).CreateItem(store.Audit(Actor(ctx), "platform-invite:" + data.Role, email)).ExecuteAsync(ct);
            CosmosStore.Check(batch);
            return Results.Json(new { email, role = data.Role, inviteUrl }, statusCode: 201);
        });

        admin.MapGet("/businesses/{businessId}/activity", async (string businessId, CosmosStore store, CancellationToken ct) =>
        {
            await RequireBusiness(store, businessId, ct);
            return Results.Ok(new { activity = await store.AdminActivity(ct) });
        });

        admin.MapPatch("/businesses/{businessId}/members/{id}", async (string businessId, string id, AdminMemberUpdate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var business = await RequireBusiness(store, businessId, ct);
            if (BusinessRules.IsArchived(business)) throw new ApiError(409, "Restore the business before changing access.");
            if (!Regex.IsMatch(id, @"\Amember-[a-f0-9]{64}\z") || string.IsNullOrEmpty(data.Etag) ||
                (!data.Revoke && data.Role is not ("Admin" or "Staff")))
                throw new ApiError(400, "Please check the member update.");
            var member = await store.Read(id, ct);
            if (member?.Value<string>("type") != "membership" || member.Value<bool?>("active") != true)
                throw new ApiError(404, "Active member not found.");

            await store.UpdateMember(member, data.Etag, data.Role, data.Revoke, Actor(ctx), ct);
            return Results.Ok(new { ok = true });
        });

        admin.MapPatch("/businesses/{businessId}/invitations/{id}", async (string businessId, string id, AdminInvitationUpdate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var business = await RequireBusiness(store, businessId, ct);
            if (BusinessRules.IsArchived(business)) throw new ApiError(409, "Restore the business before changing invitations.");
            if (!Regex.IsMatch(id, @"\Ainvite-[a-f0-9]{64}\z") || string.IsNullOrEmpty(data.Etag))
                throw new ApiError(400, "Please check the invitation update.");
            var invite = await store.Read(id, ct);
            if (invite?.Value<string>("type") != "membership-invite" || invite.Value<string>("state") != "Pending")
                throw new ApiError(404, "Pending invitation not found.");

            invite["state"] = "Canceled";
            invite["canceledAt"] = DateTimeOffset.UtcNow.ToString("O");
            invite["canceledBy"] = Actor(ctx);
            var batch = store.Operations.CreateTransactionalBatch(store.BusinessKey)
                .ReplaceItem(id, invite, new TransactionalBatchItemRequestOptions { IfMatchEtag = data.Etag });
            string? inviteUrl = null;
            if (data.Replace)
            {
                var replacement = InvitationLinks.Create(store, settings, invite.Value<string>("email")!, invite.Value<string>("role")!, Actor(ctx), 14);
                batch.CreateItem(replacement.Document);
                inviteUrl = replacement.Url;
            }
            using var result = await batch.CreateItem(store.Audit(Actor(ctx), data.Replace ? "platform-replace-invite" : "platform-revoke-invite", id)).ExecuteAsync(ct);
            CosmosStore.Check(result);
            var sent = false;
            if (inviteUrl is not null && settings.SmtpConfigured)
            {
                var message = new MimeKit.MimeMessage();
                message.From.Add(MimeKit.MailboxAddress.Parse(settings.SmtpUsername));
                message.To.Add(MimeKit.MailboxAddress.Parse(invite.Value<string>("email")!));
                message.Subject = "Your BridgeWay workspace invitation";
                message.Body = new MimeKit.TextPart("plain") { Text =
                    "You have been invited to " + business.Value<string>("name") + ".\n\nOpen this link to accept:\n" + inviteUrl };
                try
                {
                    await AlertWorker.SendEmail(settings, message, ct);
                    sent = true;
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
                catch (Exception exception) when (exception is IOException or MailKit.ProtocolException or MailKit.CommandException or System.Net.Sockets.SocketException or MailKit.Security.AuthenticationException or TimeoutException)
                {
                    // The new invite is already committed. Return it for manual delivery.
                }
            }
            return Results.Ok(new { inviteUrl, sent });
        });

        admin.MapPost("/businesses/{businessId}/cards", async (string businessId, CardCreate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var business = await RequireBusiness(store, businessId, ct);
            if (BusinessRules.IsArchived(business)) throw new ApiError(409, "Restore this business before issuing cards.");
            if (BusinessRules.SignupPending(business)) throw new ApiError(409, "This business is still awaiting its first payment.");
            if (data.Quantity is < 1 or > MaxCardsPerRequest) throw new ApiError(400, $"Create between 1 and {MaxCardsPerRequest} cards at a time.");
            var label = data.Label?.Trim() ?? ""; if (label.Length > 80) throw new ApiError(400, "Keep the card label under 80 characters.");
            JObject partner;
            if (!string.IsNullOrWhiteSpace(data.PartnerId))
            {
                partner = await store.Read(data.PartnerId, ct) ?? throw new ApiError(400, "Choose an active referring partner.");
                if (partner.Value<string>("type") != "partner" || partner.Value<bool>("active") != true) throw new ApiError(400, "Choose an active referring partner.");
            }
            else
            {
                var partnerName = data.PartnerName?.Trim() ?? "";
                if (partnerName.Length is < 2 or > 120) throw new ApiError(400, "Choose a partner or enter a new partner name.");
                partner = store.Document("partner", "partner-" + Guid.NewGuid().ToString("N")); partner["name"] = partnerName; partner["active"] = true;
                using var created = await store.Operations.CreateTransactionalBatch(store.BusinessKey).CreateItem(partner).CreateItem(store.Audit(Actor(ctx), "platform-create-partner", partner.Value<string>("id")!)).ExecuteAsync(ct);
                CosmosStore.Check(created);
            }
            var officeId = string.IsNullOrWhiteSpace(data.OfficeId) ? "office-main" : data.OfficeId;
            var office = await store.Read(officeId, ct);
            if (office?.Value<string>("type") != "office" || office.Value<bool>("active") != true) throw new ApiError(400, "Choose an active receiving office.");
            var issued = new List<object>();
            for (var i = 0; i < data.Quantity; i++)
            {
                var code = NewCode();
                var cardLabel = data.Quantity == 1 ? label : (label.Length > 0 ? label + " " : "Card ") + (i + 1);
                await store.Create(store.Audit(Actor(ctx), "platform-create-card", code), ct);
                var card = new JObject
                {
                    ["id"] = code, ["businessId"] = businessId, ["officeId"] = officeId, ["partnerId"] = partner.Value<string>("id"), ["partnerName"] = partner.Value<string>("name"),
                    ["officeName"] = office.Value<string>("name"), ["label"] = cardLabel, ["active"] = true, ["welcomeText"] = "Share a few details and our team will be in touch.",
                    ["createdAt"] = DateTimeOffset.UtcNow.ToString("O"), ["createdBy"] = Actor(ctx),
                };
                await store.Cards.CreateItemAsync(card, new PartitionKey(code), cancellationToken: ct);
                issued.Add(new { id = code, label = cardLabel, url = CardUrl(settings, code) });
            }
            return Results.Json(new { partnerId = partner.Value<string>("id"), partnerName = partner.Value<string>("name"), cards = issued }, statusCode: 201);
        });

        admin.MapGet("/businesses/{businessId}/cards/{code}/preview", async (string businessId, string code, CosmosStore store, CancellationToken ct) =>
        {
            var business = await RequireBusiness(store, businessId, ct);
            var card = CardCodePattern.IsMatch(code) && !BusinessRules.IsArchived(business)
                ? await store.Card(code, ct, expectedBusinessId: businessId)
                : null;
            if (card?.Value<bool>("active") != true) throw new ApiError(404, "Active card not found.");
            return Results.Ok(Endpoints.PublicCard(settings, card, business));
        });

        admin.MapPatch("/cards/{code}", async (string code, CardUpdate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            if (!CardCodePattern.IsMatch(code) || string.IsNullOrEmpty(data.Etag)) throw new ApiError(400, "Please check the update.");
            var card = await store.Read(store.Cards, code, new PartitionKey(code), ct) ?? throw new ApiError(404, "Card not found.");
            var business = await RequireBusiness(store, card.Value<string>("businessId") ?? throw new ApiError(404, "Card not found."), ct);
            if (BusinessRules.IsArchived(business)) throw new ApiError(409, "Restore this business before updating cards.");
            card["active"] = data.Active;
            try { await store.Cards.ReplaceItemAsync(card, code, new PartitionKey(code), new ItemRequestOptions { IfMatchEtag = data.Etag }, ct); }
            catch (CosmosException e) when (e.StatusCode == HttpStatusCode.PreconditionFailed) { throw new ApiError(409, "This card changed. Refresh and try again."); }
            await store.Create(store.Audit(Actor(ctx), "platform-card-active:" + data.Active, code), ct);
            return Results.Ok(new { ok = true });
        });

        admin.MapGet("/demo-requests", async (CosmosStore store, CancellationToken ct) =>
        {
            store.UseBusiness(CosmosStore.PlatformPartition);
            var rows = await store.Query("demo-request", limit: 200, ct: ct);
            return Results.Ok(new { requests = rows.OrderByDescending(r => r.Value<string>("createdAt"), StringComparer.Ordinal).Select(r => new { name = r.Value<string>("name"), email = r.Value<string>("email"), businessName = r.Value<string>("businessName"), interest = r.Value<string>("interest"), createdAt = r.Value<string>("createdAt") }) });
        });
    }
}


