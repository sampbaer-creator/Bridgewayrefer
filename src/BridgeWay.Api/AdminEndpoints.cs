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
        return await store.Business(businessId, ct) ?? throw new ApiError(404, "Business not found.");
    }

    static object Summary(JObject b, Dictionary<(string Business, string Type), long> counts)
    {
        var id = b.Value<string>("businessId") ?? "";
        long Count(string type) => counts.TryGetValue((id, type), out var n) ? n : 0;
        return new
        {
            businessId = id, name = b.Value<string>("name"),
            createdAt = b.Value<string>("createdAt"), suspended = b.Value<bool?>("suspended") ?? false,
            acceptReferrals = b.Value<bool?>("acceptReferrals") ?? false, billingExempt = b.Value<bool?>("billingExempt") ?? false,
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
            if (!settings.IsPlatformAdmin(user.FindFirstValue("tid"), user.FindFirstValue("oid"))) throw new ApiError(403, "Platform administrator access is required.");
            return await next(context);
        });

        admin.MapGet("/session", (HttpContext ctx) => Results.Ok(new
        {
            ok = true, email = ctx.User.FindFirstValue("email") ?? ctx.User.FindFirstValue("preferred_username") ?? "",
            acceptingGlobally = settings.AcceptReferrals, smtpConfigured = settings.SmtpConfigured,
            stripeConfigured = settings.StripeConfigured, monthlyPriceUsd = settings.MonthlyPriceUsd,
        }));

        admin.MapGet("/businesses", async (CosmosStore store, CancellationToken ct) =>
        {
            var businesses = store.AllBusinesses(ct); var counts = store.CountsByBusiness(ct);
            await Task.WhenAll(businesses, counts);
            var rows = (await businesses).Select(b => Summary(b, counts.Result)).ToList();
            return Results.Ok(new
            {
                businesses = rows,
                totals = new { businesses = rows.Count, cards = counts.Result.Where(x => x.Key.Type == "card").Sum(x => x.Value), taps = counts.Result.Where(x => x.Key.Type == "link-open").Sum(x => x.Value), referrals = counts.Result.Where(x => x.Key.Type == "referral").Sum(x => x.Value) },
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
            var invite = store.Document("membership-invite", "invite-" + Guid.NewGuid().ToString("N")); invite["email"] = adminEmail; invite["role"] = "Admin"; invite["state"] = "Pending"; invite["expiresAt"] = DateTimeOffset.UtcNow.AddDays(14).ToString("O"); invite["createdBy"] = Actor(ctx);
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey)
                .CreateItem(business).CreateItem(office).CreateItem(invite).CreateItem(store.Audit(Actor(ctx), "platform-create-business", businessId)).ExecuteAsync(ct);
            CosmosStore.Check(batch);
            return Results.Json(new { businessId, name, inviteUrl = settings.PublicOrigin + "/staff/login?workspace=" + Uri.EscapeDataString(businessId) }, statusCode: 201);
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
                business = Summary(business, counts.Result),
                cards = cards.Result.OrderByDescending(c => c.Value<string>("createdAt"), StringComparer.Ordinal).Select(c => new
                {
                    id = c.Value<string>("id"), label = c.Value<string>("label") ?? "", partnerId = c.Value<string>("partnerId"), partnerName = c.Value<string>("partnerName"),
                    officeName = c.Value<string>("officeName"), active = c.Value<bool>("active"), createdAt = c.Value<string>("createdAt"), etag = c.Value<string>("_etag"),
                    url = CardUrl(settings, c.Value<string>("id")!), taps = opensByCard.GetValueOrDefault(c.Value<string>("id") ?? ""), referrals = referralsByCard.GetValueOrDefault(c.Value<string>("id") ?? ""),
                }),
                partners = partners.Result.Select(p => new { id = p.Value<string>("id"), name = p.Value<string>("name"), active = p.Value<bool>("active") }),
                offices = offices.Result.Select(o => new { id = o.Value<string>("id"), name = o.Value<string>("name"), active = o.Value<bool>("active") }),
                members = members.Result.Where(m => m.Value<bool>("active")).Select(m => new { email = m.Value<string>("email"), role = m.Value<string>("role") }),
                invitations = invites.Result.Where(i => i.Value<string>("state") == "Pending").Select(i => new { email = i.Value<string>("email"), role = i.Value<string>("role"), expiresAt = i.Value<string>("expiresAt") }),
            });
        });

        admin.MapPatch("/businesses/{businessId}", async (string businessId, AdminBusinessUpdate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var business = await RequireBusiness(store, businessId, ct);
            if (string.IsNullOrWhiteSpace(data.Etag)) throw new ApiError(400, "Refresh and try again.");
            var alertEmail = data.AlertEmail?.Trim().ToLowerInvariant();
            if (alertEmail is { Length: > 0 } && !Endpoints.ValidEmail(alertEmail)) throw new ApiError(400, "Enter a valid alert email or leave it blank.");
            var changes = new List<string>();
            if (data.Suspended is bool suspended) { business["suspended"] = suspended; changes.Add("suspended:" + suspended); }
            if (data.BillingExempt is bool exempt) { business["billingExempt"] = exempt; changes.Add("billingExempt:" + exempt); }
            if (alertEmail is not null) { business["alertEmail"] = alertEmail; changes.Add("alertEmail"); }
            if (changes.Count == 0) return Results.Ok(new { ok = true });
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey)
                .ReplaceItem("business", business, new TransactionalBatchItemRequestOptions { IfMatchEtag = data.Etag })
                .CreateItem(store.Audit(Actor(ctx), "platform-update:" + string.Join(",", changes), businessId)).ExecuteAsync(ct);
            CosmosStore.Check(batch); return Results.Ok(new { ok = true });
        });

        admin.MapPost("/businesses/{businessId}/invitations", async (string businessId, InvitationCreate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            await RequireBusiness(store, businessId, ct);
            var email = data.Email?.Trim().ToLowerInvariant() ?? "";
            if (!Endpoints.ValidEmail(email) || data.Role is not ("Admin" or "Staff")) throw new ApiError(400, "Enter a valid email and choose Admin or Staff.");
            var invite = store.Document("membership-invite", "invite-" + Guid.NewGuid().ToString("N")); invite["email"] = email; invite["role"] = data.Role; invite["state"] = "Pending"; invite["expiresAt"] = DateTimeOffset.UtcNow.AddDays(14).ToString("O"); invite["createdBy"] = Actor(ctx);
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey).CreateItem(invite).CreateItem(store.Audit(Actor(ctx), "platform-invite:" + data.Role, email)).ExecuteAsync(ct);
            CosmosStore.Check(batch);
            return Results.Json(new { email, role = data.Role, inviteUrl = settings.PublicOrigin + "/staff/login?workspace=" + Uri.EscapeDataString(businessId) }, statusCode: 201);
        });

        admin.MapPost("/businesses/{businessId}/cards", async (string businessId, CardCreate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var business = await RequireBusiness(store, businessId, ct);
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

        admin.MapPatch("/cards/{code}", async (string code, CardUpdate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            if (!CardCodePattern.IsMatch(code) || string.IsNullOrEmpty(data.Etag)) throw new ApiError(400, "Please check the update.");
            var card = await store.Read(store.Cards, code, new PartitionKey(code), ct) ?? throw new ApiError(404, "Card not found.");
            store.UseBusiness(card.Value<string>("businessId") ?? throw new ApiError(404, "Card not found."));
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
            return Results.Ok(new { requests = rows.OrderByDescending(r => r.Value<string>("createdAt"), StringComparer.Ordinal).Select(r => new { name = r.Value<string>("name"), email = r.Value<string>("email"), businessName = r.Value<string>("businessName"), createdAt = r.Value<string>("createdAt") }) });
        });
    }
}
