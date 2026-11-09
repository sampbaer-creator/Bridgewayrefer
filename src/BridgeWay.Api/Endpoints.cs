using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
namespace BridgeWay.Api;

public static class Endpoints
{
    static IResult Json(object value) => Results.Text(JsonConvert.SerializeObject(value), "application/json");
    static string Actor(HttpContext ctx) => ctx.Items["actor"]?.ToString() ?? "unknown";
    static bool ValidCode(string? code) => code is not null && Regex.IsMatch(code, @"\A[A-Za-z0-9_-]{8,80}\z");
    static string Address(HttpContext context) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(context.Connection.RemoteIpAddress?.ToString() ?? "unknown")));
    static bool IsSession(HttpContext ctx) => ctx.Request.Path.Equals("/api/staff/session", StringComparison.OrdinalIgnoreCase);
    static string? RequestedBusiness(HttpContext ctx) => ctx.Request.Headers["X-BridgeWay-Business"].FirstOrDefault();

    static async Task<JObject?> BootstrapAdmin(CosmosStore store, Settings settings, string oid, string tenant, string email, CancellationToken ct)
    {
        if (!string.Equals(tenant, settings.TenantId, StringComparison.OrdinalIgnoreCase) || !settings.StaffObjectIds.Contains(oid, StringComparer.OrdinalIgnoreCase)) return null;
        var id = CosmosStore.MembershipId(tenant, oid);
        var existing = await store.Read(store.Operations, id, new Microsoft.Azure.Cosmos.PartitionKey(settings.BusinessId), ct);
        if (existing is not null) return existing.Value<bool>("active") ? existing : null;
        var member = store.Membership(settings.BusinessId, tenant, oid, email, "Admin", businessName: settings.OfficeName);
        try { await store.Operations.CreateItemAsync(member, new Microsoft.Azure.Cosmos.PartitionKey(settings.BusinessId), cancellationToken: ct); return member; }
        catch (Microsoft.Azure.Cosmos.CosmosException e) when (e.StatusCode == HttpStatusCode.Conflict) { return await store.Read(store.Operations, id, new Microsoft.Azure.Cosmos.PartitionKey(settings.BusinessId), ct); }
    }

    static async Task<JObject?> AcceptInvite(CosmosStore store, string businessId, string oid, string tenant, string email, CancellationToken ct)
    {
        var invite = (await store.PendingInvites(email, businessId, ct)).FirstOrDefault();
        if (invite is null) return null;
        var business = await store.Business(businessId, ct);
        var member = store.Membership(businessId, tenant, oid, email, invite.Value<string>("role") ?? "Staff", businessName: business?.Value<string>("name") ?? businessId, preset: business?.Value<string>("preset") ?? "dental");
        invite["state"] = "Accepted"; invite["acceptedAt"] = DateTimeOffset.UtcNow.ToString("O"); invite["acceptedBy"] = oid;
        using var batch = await store.Operations.CreateTransactionalBatch(new Microsoft.Azure.Cosmos.PartitionKey(businessId))
            .CreateItem(member).ReplaceItem(invite.Value<string>("id")!, invite, new Microsoft.Azure.Cosmos.TransactionalBatchItemRequestOptions { IfMatchEtag = invite.Value<string>("_etag") }).ExecuteAsync(ct);
        if (batch.IsSuccessStatusCode) return member;
        if (batch.Any(x => x.StatusCode == HttpStatusCode.Conflict)) return await store.Read(store.Operations, member.Value<string>("id")!, new Microsoft.Azure.Cosmos.PartitionKey(businessId), ct);
        CosmosStore.Check(batch); return null;
    }
    static object PatientView(JObject row) => new { id = row.Value<string>("id"), name = row.Value<string>("name"), firstName = row.Value<string>("firstName"), lastName = row.Value<string>("lastName"), email = row.Value<string>("email"), phone = row.Value<string>("phone"), notes = row.Value<string>("notes"), businessId = row.Value<string>("businessId"), officeId = row.Value<string>("officeId"), cardId = row.Value<string>("cardId"), doctorCode = row.Value<string>("doctorCode"), doctorName = row.Value<string>("doctorName"), partnerId = row.Value<string>("partnerId"), partnerName = row.Value<string>("partnerName") ?? row.Value<string>("doctorName"), ownerId = row.Value<string>("ownerId"), ownerName = row.Value<string>("ownerName"), serviceType = row.Value<string>("serviceType"), postalCode = row.Value<string>("postalCode"), status = row.Value<string>("status"), createdAt = row.Value<string>("createdAt"), updatedAt = row.Value<string>("updatedAt"), etag = row.Value<string>("_etag") };
    public static void MapBridgeWay(this WebApplication app, Settings settings, IWebHostEnvironment environment)
    {
        object PublicCard(JObject? card, JObject? business) => new { officeName = card?.Value<string>("resolvedOfficeName") ?? card?.Value<string>("officeName") ?? business?.Value<string>("officeName") ?? settings.OfficeName, welcomeText = card?.Value<string>("welcomeText") ?? business?.Value<string>("welcomeText") ?? "Share a few details and our team will be in touch.", accepting = settings.IntakeDeploymentGateOpen(environment) && (business?.Value<bool?>("acceptReferrals") ?? true), demo = settings.LocalDemoStaff, preset = business?.Value<string>("preset") ?? "dental", businessName = business?.Value<string>("name") ?? settings.OfficeName, logoUrl = business?.Value<string>("logoUrl") ?? "", phone = business?.Value<string>("phone") ?? "" };
        app.MapGet("/api/public/config", async (CosmosStore store, CancellationToken ct) => Results.Ok(PublicCard(null, await store.Business(settings.BusinessId, ct))));
        app.MapPost("/api/demo-requests", async (DemoRequest data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var name = data.Name?.Trim() ?? ""; var email = data.Email?.Trim() ?? ""; var businessName = data.BusinessName?.Trim() ?? "";
            if (name.Length is < 1 or > 120 || businessName.Length is < 1 or > 120 || !Regex.IsMatch(email, @"\A[^\s@]+@[^\s@]+\.[^\s@]+\z") || !data.Consent || !Guid.TryParse(data.SubmissionId, out var submissionId)) throw new ApiError(400, "Please check the demo request form.");
            store.UseBusiness("bridgeway-platform"); var id = "demo-request-" + submissionId;
            if (await store.Read(id, ct) is not null) return Results.Accepted(value: new { ok = true });
            if (!await store.Allow("demo-request-" + Address(ctx), 5, ct)) throw new ApiError(429, "Please wait before trying again.");
            var doc = store.Document("demo-request", id); doc["name"] = name; doc["email"] = email.ToLowerInvariant(); doc["businessName"] = businessName; doc["consentVersion"] = "demo-contact-v1"; doc["consentAt"] = doc["createdAt"]!.DeepClone(); doc["ttl"] = 7776000;
            try { await store.Create(doc, ct); } catch (Microsoft.Azure.Cosmos.CosmosException e) when (e.StatusCode == HttpStatusCode.Conflict) { }
            return Results.Accepted(value: new { ok = true });
        });
        app.MapGet("/api/public/cards/{code}", async (string code, CosmosStore store, CancellationToken ct) =>
        {
            if (!ValidCode(code)) throw new ApiError(404, "Not found.");
            var card = await store.Card(code, ct);
            if (card?.Value<bool>("active") != true) throw new ApiError(404, "Not found.");
            var businessId = card.Value<string>("businessId")!; store.UseBusiness(businessId);
            return Results.Ok(PublicCard(card, await store.Business(businessId, ct)));
        });
        app.MapPost("/api/referrals", async (Submission data, HttpContext context, CosmosStore store, CancellationToken ct) =>
        {
            if (!settings.IntakeDeploymentGateOpen(environment)) throw new ApiError(503, "Online requests are not open yet.");
            data.Validate(); JObject? card = null;
            if (!string.IsNullOrEmpty(data.Code))
            {
                card = await store.Card(data.Code, ct);
                if (card?.Value<bool>("active") != true) throw new ApiError(400, "This referral link is unavailable.");
            }
            store.UseBusiness(card?.Value<string>("businessId") ?? settings.BusinessId);
            if ((await store.Business(store.BusinessId, ct))?.Value<bool>("acceptReferrals") == false) throw new ApiError(503, "Online requests are not open yet.");
            var id = "ref-" + Guid.Parse(data.SubmissionId);
            if (await store.Read(id, ct) is not null) return Results.Json(new { ok = true, idempotent = true }, statusCode: 200);
            if (!await store.Allow("submit-" + Address(context), 10, ct)) throw new ApiError(429, "Please wait before trying again.");
            var record = store.Document("referral", id);
            record["firstName"] = data.FirstName.Trim(); record["lastName"] = data.LastName.Trim(); record["name"] = data.FirstName.Trim() + " " + data.LastName.Trim(); record["email"] = data.Email.Trim(); record["phone"] = data.Phone.Trim(); record["notes"] = data.Notes.Trim();
            record["cardId"] = card?.Value<string>("id") ?? "direct"; record["businessId"] = store.BusinessId;
            record["doctorCode"] = data.Code; record["doctorName"] = card?.Value<string>("resolvedOfficeName") ?? card?.Value<string>("officeName") ?? "Direct request";
            record["officeId"] = card?.Value<string>("officeId") ?? "default"; record["partnerId"] = card?.Value<string>("partnerId") ?? "direct";
            record["partnerName"] = card?.Value<string>("resolvedPartnerName") ?? card?.Value<string>("partnerName") ?? card?.Value<string>("officeName") ?? "Direct request";
            if (!string.IsNullOrWhiteSpace(data.ServiceType)) record["serviceType"] = data.ServiceType.Trim();
            if (!string.IsNullOrWhiteSpace(data.PostalCode)) record["postalCode"] = data.PostalCode.Trim();
            record["status"] = "New"; record["updatedAt"] = record["createdAt"]!.DeepClone();
            record["consentVersion"] = "contact-v1"; record["consentAt"] = record["createdAt"]!.DeepClone();
            var history = store.Document("status-history", "history-" + Guid.Parse(data.SubmissionId)); history["referralId"] = id; history["status"] = "New"; history["actor"] = "system"; history["changedAt"] = record["createdAt"]!.DeepClone();
            var batch = store.Operations.CreateTransactionalBatch(store.BusinessKey).CreateItem(record).CreateItem(history);
            if (settings.AlertsEnabled) batch.CreateItem(AlertWorker.NewAlert(store, "alert-" + Guid.Parse(data.SubmissionId)));
            using var response = await batch.ExecuteAsync(ct);
            if (response.IsSuccessStatusCode) return Results.Json(new { ok = true, idempotent = false }, statusCode: 201);
            if (response.StatusCode == HttpStatusCode.Conflict && await store.Read(id, ct) is { } existing && existing.Value<string>("type") == "referral") return Results.Json(new { ok = true, idempotent = true }, statusCode: 200);
            CosmosStore.Check(response); throw new ApiError(503, "Service unavailable. Please try again.");
        });
        app.MapPost("/api/link-opens", async (LinkOpen data, HttpContext context, CosmosStore store, CancellationToken ct) =>
        {
            if (!ValidCode(data.Code) || !Guid.TryParse(data.EventId, out var eventId)) throw new ApiError(400, "Please check the request.");
            var card = await store.Card(data.Code, ct);
            if (card?.Value<bool>("active") != true) throw new ApiError(404, "Not found.");
            store.UseBusiness(card.Value<string>("businessId")!);
            var id = "open-" + eventId;
            if (await store.Read(id, ct) is not null) return Results.Ok(new { ok = true });
            if (!await store.Allow("opens-" + Address(context), 300, ct)) throw new ApiError(429, "Please wait before trying again.");
            var doc = store.Document("link-open", id); doc["doctorCode"] = data.Code; doc["doctorName"] = card.Value<string>("resolvedPartnerName") ?? card.Value<string>("partnerName") ?? card.Value<string>("officeName"); doc["partnerId"] = card.Value<string>("partnerId"); doc["partnerName"] = card.Value<string>("resolvedPartnerName") ?? card.Value<string>("partnerName") ?? card.Value<string>("officeName"); doc["officeId"] = card.Value<string>("officeId");
            try { await store.Create(doc, ct); } catch (CosmosException e) when (e.StatusCode == HttpStatusCode.Conflict) { }
            return Results.Json(new { ok = true }, statusCode: 201);
        });
        var staff = app.MapGroup("/api/staff");
        staff.AddEndpointFilter(async (context, next) =>
        {
            var http = context.HttpContext;
            var businessContext = http.RequestServices.GetRequiredService<BusinessContext>();
            var store = http.RequestServices.GetRequiredService<CosmosStore>();
            if (settings.LocalDemoStaff)
            {
                if (!environment.IsDevelopment() || http.Connection.RemoteIpAddress is not { } ip || !IPAddress.IsLoopback(ip)) throw new ApiError(403, "Access denied.");
                var requestedDemoBusiness = RequestedBusiness(http) ?? settings.BusinessId;
                var demoMembership = (await store.Memberships("local-demo", "local-demo", http.RequestAborted)).FirstOrDefault(m => m.Value<string>("businessId") == requestedDemoBusiness);
                if (demoMembership is null) throw new ApiError(403, "No active membership was found for this workspace.");
                http.Items["actor"] = "local-demo"; http.Items["memberships"] = await store.Memberships("local-demo", "local-demo", http.RequestAborted);
                businessContext.Actor = "local-demo"; businessContext.BusinessId = requestedDemoBusiness; businessContext.Role = demoMembership.Value<string>("role") ?? "Admin"; store.UseBusiness(requestedDemoBusiness);
            }
            else
            {
                if (http.User.Identity?.IsAuthenticated != true) throw new ApiError(401, "Please sign in.");
                var oid = http.User.FindFirstValue("oid"); var tid = http.User.FindFirstValue("tid");
                if (string.IsNullOrWhiteSpace(oid) || string.IsNullOrWhiteSpace(tid) || !string.Equals(tid, settings.TenantId, StringComparison.OrdinalIgnoreCase)) throw new ApiError(403, "Access denied.");
                var email = (http.User.FindFirstValue("email") ?? http.User.FindFirstValue("preferred_username") ?? "").Trim().ToLowerInvariant();
                var memberships = await store.Memberships(oid, tid, http.RequestAborted);
                if (memberships.Count == 0)
                {
                    var bootstrap = await BootstrapAdmin(store, settings, oid, tid, email, http.RequestAborted);
                    if (bootstrap is not null) memberships.Add(bootstrap);
                }
                var requested = RequestedBusiness(http);
                if (requested is null && memberships.Count == 0 && email.Length > 0)
                {
                    var invitations = await store.PendingInvites(email, ct: http.RequestAborted);
                    if (invitations.Count == 1) requested = invitations[0].Value<string>("businessId");
                }
                var selected = TenantAuthorization.SelectActiveMembership(memberships, requested);
                if (selected is null && requested is not null)
                {
                    var claimed = await AcceptInvite(store, requested, oid, tid, email, http.RequestAborted);
                    if (claimed is not null) { memberships.Add(claimed); selected = claimed; }
                }
                if (selected is null && requested is null && memberships.Count == 1) selected = memberships[0];
                if (selected is null && requested is null && memberships.Count == 0)
                {
                    var claimedInvites = email.Length == 0 ? [] : await store.PendingInvites(email, ct: http.RequestAborted);
                    if (claimedInvites.Count == 1)
                    {
                        var businessId = claimedInvites[0].Value<string>("businessId")!;
                        selected = await AcceptInvite(store, businessId, oid, tid, email, http.RequestAborted);
                        if (selected is not null) memberships.Add(selected);
                    }
                }
                if (selected is null && memberships.Count > 1 && !IsSession(http)) throw new ApiError(409, "Choose a workspace before continuing.");
                if (selected is null && !IsSession(http)) throw new ApiError(403, "No active membership was found for this workspace.");
                if (selected is not null)
                {
                    businessContext.BusinessId = selected.Value<string>("businessId"); businessContext.Role = selected.Value<string>("role") ?? "Staff";
                    store.UseBusiness(businessContext.BusinessId!);
                }
                businessContext.Actor = oid; http.Items["actor"] = oid; http.Items["memberships"] = memberships;
            }
            var path = http.Request.Path.Value ?? "";
            if ((HttpMethods.IsPost(http.Request.Method) || HttpMethods.IsPatch(http.Request.Method) || HttpMethods.IsDelete(http.Request.Method)) &&
                (path.EndsWith("/doctors", StringComparison.OrdinalIgnoreCase) || path.Contains("/doctors/", StringComparison.OrdinalIgnoreCase) || path.Contains("/invitations", StringComparison.OrdinalIgnoreCase) || path.Contains("/businesses", StringComparison.OrdinalIgnoreCase) || path.Contains("/business/", StringComparison.OrdinalIgnoreCase) || path.Contains("/offices", StringComparison.OrdinalIgnoreCase) || path.Contains("/partners", StringComparison.OrdinalIgnoreCase) || path.Contains("/cards", StringComparison.OrdinalIgnoreCase) || path.Contains("/billing/checkout", StringComparison.OrdinalIgnoreCase) || path.Contains("/billing/portal", StringComparison.OrdinalIgnoreCase)) && businessContext.Role != "Admin")
                throw new ApiError(403, "Administrator access is required.");
            return await next(context);
        });
        staff.MapGet("/session", async (HttpContext ctx, CosmosStore store, BusinessContext scope, CancellationToken ct) =>
        {
            var rows = ctx.Items["memberships"] as List<JObject> ?? [];
            var businesses = await Task.WhenAll(rows.Select(async row =>
            {
                var businessId = row.Value<string>("businessId")!;
                var profile = await store.Business(businessId, ct);
                return new
                {
                    businessId,
                    name = profile?.Value<string>("name") ?? row.Value<string>("businessName") ?? businessId,
                    preset = profile is null ? row.Value<string>("preset") ?? "dental" : profile.Value<string>("preset") ?? "dental",
                    role = row.Value<string>("role") ?? "Staff"
                };
            }));
            return Results.Ok(new { ok = true, demo = settings.LocalDemoStaff, businessId = scope.BusinessId, role = scope.Role, businesses });
        });
        staff.MapPost("/businesses", async (BusinessCreate data, HttpContext ctx, CosmosStore store, BusinessContext scope, CancellationToken ct) =>
        {
            var name = data.Name?.Trim() ?? ""; var preset = data.Preset?.Trim().ToLowerInvariant() ?? "";
            if (name.Length is < 2 or > 120 || preset is not ("dental" or "trades")) throw new ApiError(400, "Choose a business name and a dental or trades preset.");
            var businessId = "biz-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(12)).ToLowerInvariant();
            var identity = ctx.User; var oid = identity.FindFirstValue("oid") ?? "local-demo"; var tenant = identity.FindFirstValue("tid") ?? "local-demo"; var email = identity.FindFirstValue("email") ?? identity.FindFirstValue("preferred_username") ?? "local-demo@localhost";
            var business = store.Document("business", "business", businessId); business["name"] = name; business["officeName"] = name; business["preset"] = preset; business["acceptReferrals"] = false; business["monthlyPriceUsd"] = 50; business["billingStatus"] = "not_configured";
            var office = store.Document("office", "office-main", businessId); office["name"] = name; office["active"] = true;
            var member = store.Membership(businessId, tenant, oid, email, "Admin", businessName: name, preset: preset);
            var audit = store.Document("audit", "audit-" + Guid.NewGuid().ToString("N"), businessId); audit["actor"] = oid; audit["action"] = "create-business"; audit["target"] = businessId;
            using var batch = await store.Operations.CreateTransactionalBatch(new Microsoft.Azure.Cosmos.PartitionKey(businessId)).CreateItem(business).CreateItem(office).CreateItem(member).CreateItem(audit).ExecuteAsync(ct);
            CosmosStore.Check(batch);
            return Results.Json(new { businessId, name, preset, role = "Admin" }, statusCode: 201);
        });
        staff.MapGet("/business/profile", async (CosmosStore store, CancellationToken ct) =>
        {
            var business = await store.Business(store.BusinessId, ct) ?? throw new ApiError(404, "Business not found.");
            return Results.Ok(new { name = business.Value<string>("name"), officeName = business.Value<string>("officeName"), preset = business.Value<string>("preset") ?? "dental", welcomeText = business.Value<string>("welcomeText") ?? "Share a few details and our team will be in touch.", phone = business.Value<string>("phone") ?? "", logoUrl = business.Value<string>("logoUrl") ?? "", acceptReferrals = business.Value<bool?>("acceptReferrals") ?? false, billingStatus = business.Value<string>("billingStatus") ?? business.Value<string>("subscriptionStatus") ?? "not_configured", monthlyPriceUsd = business.Value<int?>("monthlyPriceUsd") ?? 50, etag = business.Value<string>("_etag") });
        });
        staff.MapPatch("/business/profile", async (BusinessProfileUpdate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var name = data.Name?.Trim() ?? ""; var preset = data.Preset?.Trim().ToLowerInvariant() ?? ""; var welcome = data.WelcomeText?.Trim() ?? ""; var phone = data.Phone?.Trim() ?? ""; var logo = data.LogoUrl?.Trim() ?? "";
            var logoValid = logo.Length == 0 || (logo.StartsWith("/", StringComparison.Ordinal) && !logo.StartsWith("//", StringComparison.Ordinal) && !logo.Contains("..", StringComparison.Ordinal)) || (Uri.TryCreate(logo, UriKind.Absolute, out var logoUri) && logoUri.Scheme == Uri.UriSchemeHttps);
            if (name.Length is < 2 or > 120 || preset is not ("dental" or "trades") || welcome.Length > 500 || phone.Length > 40 || !logoValid || string.IsNullOrWhiteSpace(data.Etag)) throw new ApiError(400, "Please check the business settings.");
            var business = await store.Business(store.BusinessId, ct) ?? throw new ApiError(404, "Business not found.");
            business["name"] = name; business["officeName"] = name; business["preset"] = preset; business["welcomeText"] = welcome; business["phone"] = phone; business["logoUrl"] = logo; business["acceptReferrals"] = data.AcceptReferrals;
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey).ReplaceItem("business", business, new Microsoft.Azure.Cosmos.TransactionalBatchItemRequestOptions { IfMatchEtag = data.Etag }).CreateItem(store.Audit(Actor(ctx), "update-business-profile", store.BusinessId)).ExecuteAsync(ct);
            CosmosStore.Check(batch); return Results.Ok(new { ok = true });
        });
        staff.MapGet("/offices", async (CosmosStore store, CancellationToken ct) => Results.Ok(new { offices = (await store.Query("office", ct: ct)).Select(x => new { id = x.Value<string>("id"), name = x.Value<string>("name"), active = x.Value<bool>("active"), etag = x.Value<string>("_etag") }) }));
        staff.MapPost("/offices", async (OfficeCreate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var name = data.Name?.Trim() ?? ""; if (name.Length is < 2 or > 120) throw new ApiError(400, "Enter an office name, up to 120 characters.");
            var id = "office-" + Guid.NewGuid().ToString("N"); var office = store.Document("office", id); office["name"] = name; office["active"] = true;
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey).CreateItem(store.Audit(Actor(ctx), "create-office", id)).CreateItem(office).ExecuteAsync(ct); CosmosStore.Check(batch);
            return Results.Json(new { id, name, active = true }, statusCode: 201);
        });
        staff.MapGet("/members", async (CosmosStore store, CancellationToken ct) => Results.Ok(new { members = (await store.Query("membership", ct: ct)).Where(m => m.Value<bool>("active")).Select(m => new { id = m.Value<string>("oid"), name = m.Value<string>("name") ?? m.Value<string>("email") ?? "Staff member", email = m.Value<string>("email"), role = m.Value<string>("role") }) }));
        staff.MapGet("/invitations", async (HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            if (ctx.RequestServices.GetRequiredService<BusinessContext>().Role != "Admin") throw new ApiError(403, "Administrator access is required.");
            return Results.Ok(new { invitations = (await store.Query("membership-invite", ct: ct)).Select(i => new { id = i.Value<string>("id"), email = i.Value<string>("email"), role = i.Value<string>("role"), state = i.Value<string>("state"), expiresAt = i.Value<string>("expiresAt") }) });
        });
        staff.MapPost("/invitations", async (InvitationCreate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var email = data.Email?.Trim().ToLowerInvariant() ?? "";
            if (!Regex.IsMatch(email, @"\A[^\s@]+@[^\s@]+\.[^\s@]+\z") || data.Role is not ("Admin" or "Staff")) throw new ApiError(400, "Enter a valid email and choose Admin or Staff.");
            var invite = store.Document("membership-invite", "invite-" + Guid.NewGuid().ToString("N")); invite["email"] = email; invite["role"] = data.Role; invite["state"] = "Pending"; invite["expiresAt"] = DateTimeOffset.UtcNow.AddDays(7).ToString("O"); invite["createdBy"] = Actor(ctx);
            await store.Create(invite, ct);
            return Results.Json(new { invitationId = invite.Value<string>("id"), email, role = data.Role, expiresAt = invite.Value<string>("expiresAt"), inviteUrl = settings.PublicOrigin + "/staff/login?workspace=" + Uri.EscapeDataString(store.BusinessId) }, statusCode: 201);
        });
        staff.MapGet("/partners", async (CosmosStore store, CancellationToken ct) => Results.Ok(new { partners = (await store.Partners(ct)).Select(p => new { id = p.Value<string>("id"), name = p.Value<string>("name"), active = p.Value<bool>("active"), etag = p.Value<string>("_etag") }) }));
        staff.MapPost("/partners", async (PartnerCreate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var name = data.Name?.Trim() ?? ""; if (name.Length is < 2 or > 120) throw new ApiError(400, "Enter a partner name, up to 120 characters.");
            var id = "partner-" + Guid.NewGuid().ToString("N"); var partner = store.Document("partner", id); partner["name"] = name; partner["active"] = true;
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey).CreateItem(store.Audit(Actor(ctx), "create-partner", id)).CreateItem(partner).ExecuteAsync(ct); CosmosStore.Check(batch);
            return Results.Json(new { id, name, active = true }, statusCode: 201);
        });
        staff.MapGet("/cards", async (CosmosStore store, CancellationToken ct) => Results.Ok(new { cards = (await store.Doctors(ct)).Select(c => new { id = c.Value<string>("id"), partnerId = c.Value<string>("partnerId"), partnerName = c.Value<string>("partnerName") ?? c.Value<string>("officeName"), officeName = c.Value<string>("officeName"), active = c.Value<bool>("active"), etag = c.Value<string>("_etag"), url = settings.PublicOrigin + "/r/" + c.Value<string>("id") }) }));
        staff.MapPost("/cards", async (CardCreate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            var partner = await store.Read(data.PartnerId ?? "", ct);
            if (partner?.Value<string>("type") != "partner" || partner.Value<bool>("active") != true) throw new ApiError(400, "Choose an active referring partner.");
            var officeId = string.IsNullOrWhiteSpace(data.OfficeId) ? "office-main" : data.OfficeId;
            var office = await store.Read(officeId, ct);
            if (office?.Value<string>("type") != "office" || office.Value<bool>("active") != true) throw new ApiError(400, "Choose an active receiving office.");
            var code = Convert.ToHexString(RandomNumberGenerator.GetBytes(18)).ToLowerInvariant();
            await store.Create(store.Audit(Actor(ctx), "create-card", code), ct);
            var officeName = office.Value<string>("name") ?? settings.OfficeName;
            var card = new JObject { ["id"] = code, ["businessId"] = store.BusinessId, ["officeId"] = string.IsNullOrWhiteSpace(data.OfficeId) ? "office-main" : data.OfficeId, ["partnerId"] = partner.Value<string>("id"), ["partnerName"] = partner.Value<string>("name"), ["officeName"] = officeName, ["active"] = true, ["welcomeText"] = "Share a few details and our team will be in touch.", ["createdAt"] = DateTimeOffset.UtcNow.ToString("O") };
            await store.Cards.CreateItemAsync(card, new Microsoft.Azure.Cosmos.PartitionKey(code), cancellationToken: ct);
            return Results.Json(new { id = code, partnerId = card.Value<string>("partnerId"), partnerName = card.Value<string>("partnerName"), officeName, active = true, url = settings.PublicOrigin + "/r/" + code }, statusCode: 201);
        });
        staff.MapGet("/referrals", async (HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            await store.AuditRead(Actor(ctx), "list-referrals", ct);
            var query = new QueryDefinition("SELECT TOP 501 * FROM c WHERE c.businessId = @b AND c.type = 'referral' ORDER BY c.createdAt DESC").WithParameter("@b", store.BusinessId);
            var rows = new List<JObject>(); using var iterator = store.Operations.GetItemQueryIterator<JObject>(query, requestOptions: new QueryRequestOptions { PartitionKey = store.BusinessKey });
            while (iterator.HasMoreResults) rows.AddRange(await iterator.ReadNextAsync(ct));
            return Json(new { referrals = rows.Take(500).Select(PatientView), limited = rows.Count > 500 });
        });
        staff.MapPatch("/referrals/{id}", async (string id, StatusUpdate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            if (!id.StartsWith("ref-") || !Submission.Statuses.Contains(data.Status) || string.IsNullOrEmpty(data.Etag)) throw new ApiError(400, "Please check the update.");
            var doc = await store.Read(id, ct);
            if (doc?.Value<string>("type") != "referral") throw new ApiError(404, "Not found.");
            var business = await store.Business(store.BusinessId, ct); var allowedStatuses = business?.Value<string>("preset") == "trades" ? new[] { "New", "Contacted", "Quoted", "Won", "Closed" } : new[] { "New", "Contacted", "Scheduled", "Completed", "Closed" };
            if (!allowedStatuses.Contains(data.Status)) throw new ApiError(400, "Choose a status for this business type.");
            doc["status"] = data.Status; doc["updatedAt"] = DateTimeOffset.UtcNow.ToString("O");
            var history = store.Document("status-history", "history-" + Guid.NewGuid()); history["referralId"] = id; history["status"] = data.Status; history["actor"] = Actor(ctx); history["changedAt"] = doc["updatedAt"]!.DeepClone(); history["partnerId"] = doc["partnerId"]?.DeepClone() ?? doc["doctorCode"]?.DeepClone();
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey).ReplaceItem(id, doc, new TransactionalBatchItemRequestOptions { IfMatchEtag = data.Etag }).CreateItem(store.Audit(Actor(ctx), "status:" + data.Status, id)).CreateItem(history).ExecuteAsync(ct);
            CosmosStore.Check(batch); return Results.Ok(new { ok = true });
        });
        staff.MapGet("/referrals/{id}/history", async (string id, CosmosStore store, CancellationToken ct) =>
        {
            if (!id.StartsWith("ref-", StringComparison.Ordinal)) throw new ApiError(404, "Not found.");
            var referral = await store.Read(id, ct); if (referral?.Value<string>("type") != "referral") throw new ApiError(404, "Not found.");
            var history = (await store.Query("status-history", ct: ct)).Where(x => x.Value<string>("referralId") == id).OrderBy(x => x.Value<string>("changedAt"), StringComparer.Ordinal).Select(x => new { status = x.Value<string>("status"), actor = x.Value<string>("actor"), changedAt = x.Value<string>("changedAt") });
            return Results.Ok(new { history });
        });
        staff.MapPatch("/referrals/{id}/assignment", async (string id, AssignmentUpdate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            if (!id.StartsWith("ref-", StringComparison.Ordinal) || string.IsNullOrWhiteSpace(data.Etag) || (data.OwnerId?.Length ?? 0) > 80 || (data.OwnerName?.Length ?? 0) > 120) throw new ApiError(400, "Please check the assignment.");
            var referral = await store.Read(id, ct); if (referral?.Value<string>("type") != "referral") throw new ApiError(404, "Not found.");
            if (string.IsNullOrWhiteSpace(data.OwnerId)) { referral.Remove("ownerId"); referral.Remove("ownerName"); }
            else
            {
                var members = await store.Query("membership", ct: ct);
                var owner = members.FirstOrDefault(m => m.Value<string>("oid") == data.OwnerId && m.Value<bool?>("active") == true);
                if (owner is null) throw new ApiError(400, "Choose an active member of this business.");
                referral["ownerId"] = owner.Value<string>("oid"); referral["ownerName"] = owner.Value<string>("email") ?? owner.Value<string>("businessName") ?? "Staff member";
            }
            referral["updatedAt"] = DateTimeOffset.UtcNow.ToString("O");
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey).ReplaceItem(id, referral, new Microsoft.Azure.Cosmos.TransactionalBatchItemRequestOptions { IfMatchEtag = data.Etag }).CreateItem(store.Audit(Actor(ctx), "assignment:" + (data.OwnerId ?? "unassigned"), id)).ExecuteAsync(ct);
            CosmosStore.Check(batch); return Results.Ok(new { ok = true });
        });
        staff.MapGet("/doctors", async (CosmosStore store, CancellationToken ct) => Json(new { doctors = (await store.Doctors(ct)).Select(d => new { id = d.Value<string>("id"), name = d.Value<string>("officeName"), active = d.Value<bool>("active"), etag = d.Value<string>("_etag"), url = settings.PublicOrigin + "/r/" + d.Value<string>("id") }) }));
        staff.MapPost("/doctors", async (DoctorCreate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(data.Name) || data.Name.Trim().Length > 120) throw new ApiError(400, "Enter an office name, up to 120 characters.");
            var code = Convert.ToHexString(RandomNumberGenerator.GetBytes(18)).ToLowerInvariant();
            await store.Create(store.Audit(Actor(ctx), "create-doctor", code), ct);
            var card = new JObject { ["id"] = code, ["businessId"] = store.BusinessId, ["officeId"] = "default", ["partnerId"] = code, ["partnerName"] = data.Name.Trim(), ["officeName"] = data.Name.Trim(), ["active"] = true, ["welcomeText"] = "Share a few details and our team will be in touch.", ["createdAt"] = DateTimeOffset.UtcNow.ToString("O") };
            await store.Cards.CreateItemAsync(card, new PartitionKey(code), cancellationToken: ct);
            return Results.Json(new { code, url = settings.PublicOrigin + "/r/" + code }, statusCode: 201);
        });
        staff.MapPatch("/doctors/{code}", async (string code, CardUpdate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            if (!ValidCode(code) || string.IsNullOrEmpty(data.Etag)) throw new ApiError(400, "Please check the update.");
            var card = await store.Read(store.Cards, code, new PartitionKey(code), ct);
            if (card?.Value<string>("businessId") != store.BusinessId) throw new ApiError(404, "Not found.");
            await store.Create(store.Audit(Actor(ctx), "card-active:" + data.Active, code), ct);
            card["active"] = data.Active;
            try { await store.Cards.ReplaceItemAsync(card, code, new PartitionKey(code), new ItemRequestOptions { IfMatchEtag = data.Etag }, ct); }
            catch (CosmosException e) when (e.StatusCode == HttpStatusCode.PreconditionFailed) { throw new ApiError(409, "This record changed. Refresh and try again."); }
            return Results.Ok(new { ok = true });
        });
        staff.MapGet("/analytics", async (string? month, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            if (month is not null) MonthlyReport.ParseMonth(month);
            await store.AuditRead(Actor(ctx), "monthly-referral-counts", ct);
            var forms = store.Query("referral", summaries: true, ct: ct); var cards = store.Doctors(ct); var partners = store.Partners(ct); var opens = store.Query("link-open", summaries: true, ct: ct); var histories = store.Query("status-history", summaries: true, ct: ct); var business = store.Business(store.BusinessId, ct);
            await Task.WhenAll(forms, cards, partners, opens, histories, business);
            return Json(MonthlyReport.Build(await forms, (await partners).Concat(await cards).ToList(), await opens, month, histories: await histories, preset: (await business)?.Value<string>("preset") ?? "dental"));
        });
        staff.MapGet("/alerts", async (CosmosStore store, CancellationToken ct) =>
        {
            var pending = (await store.Query("alert", ct: ct)).Where(a => a.Value<string>("state") != "Accepted").ToList();
            return Results.Ok(new { enabled = settings.AlertsConfiguredFor(store.BusinessId), recipient = settings.AlertRecipientFor(store.BusinessId), waiting = pending.Count, retrying = pending.Count(a => a.Value<int>("attempts") > 0) });
        });
        staff.MapPost("/alerts/test", async (HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            if (!settings.AlertsConfiguredFor(store.BusinessId)) throw new ApiError(503, "Email alerts are not configured yet.");
            if (!await store.Allow("alert-test-" + Actor(ctx), 10, ct)) throw new ApiError(429, "Please wait before trying again.");
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey).CreateItem(store.Audit(Actor(ctx), "test-email-alert", "configured-recipient")).CreateItem(AlertWorker.NewAlert(store, "alert-test-" + Guid.NewGuid())).ExecuteAsync(ct);
            CosmosStore.Check(batch); return Results.Accepted(value: new { ok = true });
        });
        staff.MapGet("/billing", async (CosmosStore store, StripeBillingService stripe, CancellationToken ct) =>
        {
            var business = await store.Business(store.BusinessId, ct) ?? throw new ApiError(404, "Business not found.");
            return Results.Ok(new { amountUsd = 50, interval = "month", status = business.Value<string>("billingStatus") ?? business.Value<string>("subscriptionStatus") ?? "not_configured", renewalAt = business.Value<string>("billingRenewalAt"), cancelAtPeriodEnd = business.Value<bool?>("billingCancelAtPeriodEnd") ?? false, configured = stripe.TestCredentialsReady && settings.StripePriceId.StartsWith("price_", StringComparison.Ordinal) && settings.StripeWebhookSecret.StartsWith("whsec_", StringComparison.Ordinal), testMode = true, customerLinked = !string.IsNullOrWhiteSpace(business.Value<string>("stripeCustomerId")) });
        });
        staff.MapPost("/billing/checkout", async (CosmosStore store, StripeBillingService stripe, CancellationToken ct) =>
        {
            if (!settings.StripeConfigured || !stripe.TestCredentialsReady) throw new ApiError(503, "Stripe test billing is not configured yet.");
            await stripe.ValidateTestPrice(ct);
            var business = await store.Business(store.BusinessId, ct) ?? throw new ApiError(404, "Business not found.");
            if (business.Value<string>("billingStatus") is "active" or "trialing") throw new ApiError(409, "This business already has an active subscription. Use Manage Billing.");
            var now = DateTimeOffset.UtcNow;
            if (business.Value<string>("checkoutSessionUrl") is string existingUrl && DateTimeOffset.TryParse(business.Value<string>("checkoutSessionExpiresAt"), out var expires) && expires > now)
                return Results.Ok(new { url = existingUrl });

            var lockId = "billing-checkout-lock"; var lockDoc = await store.Read(lockId, ct); var lockUntil = lockDoc?.Value<long?>("lockedUntil") ?? 0;
            var attempts = (lockDoc?.Value<int>("attempts") ?? 0) + 1;
            var lease = store.Document("billing-checkout-lock", lockId); lease["state"] = "InProgress"; lease["attempts"] = attempts; lease["lockedUntil"] = now.AddMinutes(3).ToUnixTimeSeconds(); lease["ttl"] = 86400;
            if (lockDoc is not null && lockUntil > now.ToUnixTimeSeconds()) throw new ApiError(409, "Checkout is already being prepared. Please retry in a moment.");
            try
            {
                if (lockDoc is null) await store.Create(lease, ct);
                else await store.Operations.ReplaceItemAsync(lease, lockId, store.BusinessKey, new ItemRequestOptions { IfMatchEtag = lockDoc.Value<string>("_etag") }, ct);
            }
            catch (CosmosException e) when (e.StatusCode is HttpStatusCode.Conflict or HttpStatusCode.PreconditionFailed) { throw new ApiError(409, "Checkout is already being prepared. Please retry in a moment."); }

            try
            {
                var customerId = business.Value<string>("stripeCustomerId");
                if (string.IsNullOrWhiteSpace(customerId))
                {
                    customerId = await stripe.CreateCustomer(store.BusinessId, business.Value<string>("name") ?? store.BusinessId, "bridgeway-customer-" + store.BusinessId, ct);
                    business["stripeCustomerId"] = customerId;
                    var savedCustomer = await store.Operations.ReplaceItemAsync(business, "business", store.BusinessKey, new ItemRequestOptions { IfMatchEtag = business.Value<string>("_etag") }, ct); business["_etag"] = savedCustomer.ETag;
                }
                var session = await stripe.CreateCheckout(store.BusinessId, business.Value<string>("name") ?? store.BusinessId, customerId, settings.PublicOrigin + "/staff?billing=pending", settings.PublicOrigin + "/staff?billing=cancelled", "bridgeway-checkout-" + store.BusinessId + "-" + attempts, ct);
                var checkoutUrl = session.Value<string>("url") ?? throw new ApiError(503, "Stripe did not return a test Checkout URL.");
                var expiresAt = DateTimeOffset.FromUnixTimeSeconds(session.Value<long>("expires_at")).ToString("O");
                business["checkoutSessionId"] = session.Value<string>("id"); business["checkoutSessionUrl"] = checkoutUrl; business["checkoutSessionExpiresAt"] = expiresAt;
                await store.Operations.ReplaceItemAsync(business, "business", store.BusinessKey, new ItemRequestOptions { IfMatchEtag = business.Value<string>("_etag") }, ct);
                var finalLock = await store.Read(lockId, ct); if (finalLock is not null) { finalLock["state"] = "Completed"; finalLock["lockedUntil"] = 0; await store.Operations.ReplaceItemAsync(finalLock, lockId, store.BusinessKey, new ItemRequestOptions { IfMatchEtag = finalLock.Value<string>("_etag") }, ct); }
                return Results.Ok(new { url = checkoutUrl });
            }
            catch
            {
                var failedLock = await store.Read(lockId, ct);
                if (failedLock is not null) { failedLock["state"] = "Failed"; failedLock["lockedUntil"] = 0; try { await store.Operations.ReplaceItemAsync(failedLock, lockId, store.BusinessKey, new ItemRequestOptions { IfMatchEtag = failedLock.Value<string>("_etag") }, ct); } catch (CosmosException e) when (e.StatusCode == HttpStatusCode.PreconditionFailed) { } }
                throw;
            }
        });
        staff.MapPost("/billing/portal", async (CosmosStore store, StripeBillingService stripe, CancellationToken ct) =>
        {
            if (!stripe.TestCredentialsReady) throw new ApiError(503, "Stripe test billing is not configured yet.");
            var business = await store.Business(store.BusinessId, ct) ?? throw new ApiError(404, "Business not found.");
            var customerId = business.Value<string>("stripeCustomerId"); if (string.IsNullOrWhiteSpace(customerId)) throw new ApiError(409, "Subscribe before opening Manage Billing.");
            var url = await stripe.CreatePortal(customerId, settings.PublicOrigin + "/staff#billing", ct);
            return Results.Ok(new { url });
        });
    }
}
