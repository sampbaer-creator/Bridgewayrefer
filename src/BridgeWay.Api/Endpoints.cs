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
    static object PatientView(JObject row) => new { id = row.Value<string>("id"), name = row.Value<string>("name"), email = row.Value<string>("email"), phone = row.Value<string>("phone"), notes = row.Value<string>("notes"), doctorCode = row.Value<string>("doctorCode"), doctorName = row.Value<string>("doctorName"), status = row.Value<string>("status"), createdAt = row.Value<string>("createdAt"), updatedAt = row.Value<string>("updatedAt"), etag = row.Value<string>("_etag") };
    public static void MapBridgeWay(this WebApplication app, Settings settings, IWebHostEnvironment environment)
    {
        object PublicCard(JObject? card) => new { officeName = card?.Value<string>("officeName") ?? settings.OfficeName, welcomeText = card?.Value<string>("welcomeText") ?? "Share a few details and our team will be in touch.", accepting = settings.AcceptReferrals, demo = settings.LocalDemoStaff };
        app.MapGet("/api/public/config", () => Results.Ok(PublicCard(null)));
        app.MapGet("/api/public/cards/{code}", async (string code, CosmosStore store, CancellationToken ct) =>
        {
            if (!ValidCode(code)) throw new ApiError(404, "Not found.");
            var card = await store.Card(code, ct);
            if (card?.Value<bool>("active") != true) throw new ApiError(404, "Not found.");
            return Results.Ok(PublicCard(card));
        });
        app.MapPost("/api/referrals", async (Submission data, HttpContext context, CosmosStore store, CancellationToken ct) =>
        {
            if (!settings.AcceptReferrals) throw new ApiError(503, "Online requests are not open yet.");
            data.Validate(); JObject? card = null;
            if (!string.IsNullOrEmpty(data.Code))
            {
                card = await store.Card(data.Code, ct);
                if (card?.Value<bool>("active") != true) throw new ApiError(400, "This referral link is unavailable.");
            }
            var id = "ref-" + Guid.Parse(data.SubmissionId);
            if (await store.Read(id, ct) is not null) return Results.Json(new { ok = true }, statusCode: 201);
            if (!await store.Allow("submit-" + Address(context), 10, ct)) throw new ApiError(429, "Please wait before trying again.");
            var record = store.Document("referral", id);
            record["name"] = data.Name.Trim(); record["email"] = data.Email.Trim(); record["phone"] = data.Phone.Trim(); record["notes"] = data.Notes.Trim();
            record["doctorCode"] = data.Code; record["doctorName"] = card?.Value<string>("officeName") ?? "Direct request";
            record["officeId"] = card?.Value<string>("officeId") ?? "default";
            record["status"] = "New"; record["updatedAt"] = record["createdAt"]!.DeepClone();
            record["consentVersion"] = "contact-v1"; record["consentAt"] = record["createdAt"]!.DeepClone();
            var batch = store.Operations.CreateTransactionalBatch(store.BusinessKey).CreateItem(record);
            if (settings.AlertsEnabled) batch.CreateItem(AlertWorker.NewAlert(store, "alert-" + Guid.Parse(data.SubmissionId)));
            using var response = await batch.ExecuteAsync(ct);
            if (!response.IsSuccessStatusCode && response.StatusCode != HttpStatusCode.Conflict) CosmosStore.Check(response);
            return Results.Json(new { ok = true }, statusCode: 201);
        });
        app.MapPost("/api/link-opens", async (LinkOpen data, HttpContext context, CosmosStore store, CancellationToken ct) =>
        {
            if (!ValidCode(data.Code) || !Guid.TryParse(data.EventId, out var eventId)) throw new ApiError(400, "Please check the request.");
            var card = await store.Card(data.Code, ct);
            if (card?.Value<bool>("active") != true) throw new ApiError(404, "Not found.");
            var id = "open-" + eventId;
            if (await store.Read(id, ct) is not null) return Results.Ok(new { ok = true });
            if (!await store.Allow("opens-" + Address(context), 300, ct)) throw new ApiError(429, "Please wait before trying again.");
            var doc = store.Document("link-open", id); doc["doctorCode"] = data.Code; doc["doctorName"] = card.Value<string>("officeName");
            try { await store.Create(doc, ct); } catch (CosmosException e) when (e.StatusCode == HttpStatusCode.Conflict) { }
            return Results.Json(new { ok = true }, statusCode: 201);
        });
        var staff = app.MapGroup("/api/staff");
        staff.AddEndpointFilter(async (context, next) =>
        {
            var http = context.HttpContext;
            if (settings.LocalDemoStaff)
            {
                if (!environment.IsDevelopment() || http.Connection.RemoteIpAddress is not { } ip || !IPAddress.IsLoopback(ip)) throw new ApiError(403, "Access denied.");
                http.Items["actor"] = "local-demo";
            }
            else
            {
                if (http.User.Identity?.IsAuthenticated != true) throw new ApiError(401, "Please sign in.");
                var oid = http.User.FindFirstValue("oid"); var tid = http.User.FindFirstValue("tid");
                if (!string.Equals(tid, settings.TenantId, StringComparison.OrdinalIgnoreCase) || !settings.StaffObjectIds.Contains(oid ?? "", StringComparer.OrdinalIgnoreCase)) throw new ApiError(403, "Access denied.");
                http.Items["actor"] = oid;
            }
            return await next(context);
        });
        staff.MapGet("/session", () => Results.Ok(new { ok = true, demo = settings.LocalDemoStaff, officeName = settings.OfficeName }));
        staff.MapGet("/referrals", async (HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            await store.AuditRead(Actor(ctx), "list-referrals", ct);
            var query = new QueryDefinition("SELECT TOP 501 * FROM c WHERE c.businessId = @b AND c.type = 'referral' ORDER BY c.createdAt DESC").WithParameter("@b", settings.BusinessId);
            var rows = new List<JObject>(); using var iterator = store.Operations.GetItemQueryIterator<JObject>(query, requestOptions: new QueryRequestOptions { PartitionKey = store.BusinessKey });
            while (iterator.HasMoreResults) rows.AddRange(await iterator.ReadNextAsync(ct));
            return Json(new { referrals = rows.Take(500).Select(PatientView), limited = rows.Count > 500 });
        });
        staff.MapPatch("/referrals/{id}", async (string id, StatusUpdate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            if (!id.StartsWith("ref-") || !Submission.Statuses.Contains(data.Status) || string.IsNullOrEmpty(data.Etag)) throw new ApiError(400, "Please check the update.");
            var doc = await store.Read(id, ct);
            if (doc?.Value<string>("type") != "referral") throw new ApiError(404, "Not found.");
            doc["status"] = data.Status; doc["updatedAt"] = DateTimeOffset.UtcNow.ToString("O");
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey).ReplaceItem(id, doc, new TransactionalBatchItemRequestOptions { IfMatchEtag = data.Etag }).CreateItem(store.Audit(Actor(ctx), "status:" + data.Status, id)).ExecuteAsync(ct);
            CosmosStore.Check(batch); return Results.Ok(new { ok = true });
        });
        staff.MapGet("/doctors", async (CosmosStore store, CancellationToken ct) => Json(new { doctors = (await store.Doctors(ct)).Select(d => new { id = d.Value<string>("id"), name = d.Value<string>("officeName"), active = d.Value<bool>("active"), etag = d.Value<string>("_etag"), url = settings.PublicOrigin + "/r/" + d.Value<string>("id") }) }));
        staff.MapPost("/doctors", async (DoctorCreate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(data.Name) || data.Name.Trim().Length > 120) throw new ApiError(400, "Enter an office name, up to 120 characters.");
            var code = Convert.ToHexString(RandomNumberGenerator.GetBytes(18)).ToLowerInvariant();
            await store.Create(store.Audit(Actor(ctx), "create-doctor", code), ct);
            var card = new JObject { ["id"] = code, ["businessId"] = settings.BusinessId, ["officeId"] = "default", ["partnerId"] = code, ["officeName"] = data.Name.Trim(), ["active"] = true, ["welcomeText"] = "Share a few details and our team will be in touch.", ["createdAt"] = DateTimeOffset.UtcNow.ToString("O") };
            await store.Cards.CreateItemAsync(card, new PartitionKey(code), cancellationToken: ct);
            return Results.Json(new { code, url = settings.PublicOrigin + "/r/" + code }, statusCode: 201);
        });
        staff.MapPatch("/doctors/{code}", async (string code, CardUpdate data, HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            if (!ValidCode(code) || string.IsNullOrEmpty(data.Etag)) throw new ApiError(400, "Please check the update.");
            var card = await store.Card(code, ct) ?? throw new ApiError(404, "Not found.");
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
            var forms = store.Query("referral", summaries: true, ct: ct); var offices = store.Doctors(ct); var opens = store.Query("link-open", summaries: true, ct: ct);
            await Task.WhenAll(forms, offices, opens);
            return Json(MonthlyReport.Build(await forms, await offices, await opens, month));
        });
        staff.MapGet("/alerts", async (CosmosStore store, CancellationToken ct) =>
        {
            var pending = (await store.Query("alert", ct: ct)).Where(a => a.Value<string>("state") != "Accepted").ToList();
            return Results.Ok(new { enabled = settings.AlertsConfigured, recipient = settings.AlertRecipient, waiting = pending.Count, retrying = pending.Count(a => a.Value<int>("attempts") > 0) });
        });
        staff.MapPost("/alerts/test", async (HttpContext ctx, CosmosStore store, CancellationToken ct) =>
        {
            if (!settings.AlertsConfigured) throw new ApiError(503, "Email alerts are not configured yet.");
            if (!await store.Allow("alert-test-" + Actor(ctx), 10, ct)) throw new ApiError(429, "Please wait before trying again.");
            using var batch = await store.Operations.CreateTransactionalBatch(store.BusinessKey).CreateItem(store.Audit(Actor(ctx), "test-email-alert", "configured-recipient")).CreateItem(AlertWorker.NewAlert(store, "alert-test-" + Guid.NewGuid())).ExecuteAsync(ct);
            CosmosStore.Check(batch); return Results.Accepted(value: new { ok = true });
        });
    }
}
