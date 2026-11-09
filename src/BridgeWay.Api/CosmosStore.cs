using System.Net;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

public sealed class BusinessContext
{
    public string? BusinessId { get; set; }
    public string Role { get; set; } = "";
    public string Actor { get; set; } = "";
}

public sealed class CosmosStore(CosmosClient client, IConfiguration config, Settings settings, BusinessContext? business = null)
{
    public Container Cards { get; } = client.GetContainer(config["Cosmos:Database"] ?? "bridgeway-dev", config["Cosmos:CardContainer"] ?? "card-directory");
    public Container Operations { get; } = client.GetContainer(config["Cosmos:Database"] ?? "bridgeway-dev", config["Cosmos:OperationsContainer"] ?? "business-operations");
    public string BusinessId => business?.BusinessId ?? settings.BusinessId;
    public PartitionKey BusinessKey => new(BusinessId);
    public void UseBusiness(string businessId) { if (business is not null) business.BusinessId = businessId; }

    public async Task<JObject?> Read(Container container, string id, PartitionKey key, CancellationToken ct = default)
    {
        try { return (await container.ReadItemAsync<JObject>(id, key, cancellationToken: ct)).Resource; }
        catch (CosmosException e) when (e.StatusCode == HttpStatusCode.NotFound) { return null; }
    }
    public Task<JObject?> Read(string id, CancellationToken ct = default) => Read(Operations, id, BusinessKey, ct);
    public async Task<JObject?> Card(string code, CancellationToken ct = default)
    {
        var card = await Read(Cards, code, new PartitionKey(code), ct);
        if (string.IsNullOrWhiteSpace(card?.Value<string>("businessId"))) return null;
        var businessId = card.Value<string>("businessId")!;
        var officeId = card.Value<string>("officeId"); var partnerId = card.Value<string>("partnerId");
        if (await Business(businessId, ct) is null) return null;
        // Imported cards and the legacy doctor endpoint did not create related records.
        var legacy = officeId == "default" && partnerId == code;
        if (officeId is not null)
        {
            var office = await Read(Operations, officeId, new PartitionKey(businessId), ct);
            if (!ValidCardReference(office, "office", legacy)) return null;
            card["resolvedOfficeName"] = office?.Value<string>("name") ?? card.Value<string>("officeName");
        }
        if (partnerId is not null)
        {
            var partner = await Read(Operations, partnerId, new PartitionKey(businessId), ct);
            if (!ValidCardReference(partner, "partner", legacy)) return null;
            card["resolvedPartnerName"] = partner?.Value<string>("name") ?? card.Value<string>("partnerName");
        }
        return card;
    }
    static bool ValidCardReference(JObject? document, string type, bool allowMissing) =>
        document is null ? allowMissing : document.Value<string>("type") == type && document.Value<bool?>("active") != false;

    public Task<List<JObject>> DueAlerts(string businessId, long now, CancellationToken ct) => Collect(Operations,
        new QueryDefinition("SELECT TOP 20 * FROM c WHERE c.type = 'alert' AND c.state IN ('Pending', 'Retry', 'Sending') AND c.readyAt <= @now ORDER BY c.readyAt")
            .WithParameter("@now", now), new PartitionKey(businessId), 20, ct);

    public Task<JObject?> Business(string businessId, CancellationToken ct = default) => Read(Operations, "business", new PartitionKey(businessId), ct);
    public Task<List<JObject>> Memberships(string oid, string tenantId, CancellationToken ct = default) => Collect(Operations,
        new QueryDefinition("SELECT * FROM c WHERE c.type = 'membership' AND c.oid = @oid AND c.tenantId = @tenant AND c.active = true")
            .WithParameter("@oid", oid).WithParameter("@tenant", tenantId), null, null, ct);
    public Task<List<JObject>> PendingInvites(string email, string? businessId = null, CancellationToken ct = default)
    {
        var query = new QueryDefinition("SELECT * FROM c WHERE c.type = 'membership-invite' AND c.email = @email AND c.state = 'Pending' AND c.expiresAt > @now" + (businessId is null ? "" : " AND c.businessId = @business"))
            .WithParameter("@email", email.Trim().ToLowerInvariant()).WithParameter("@now", DateTimeOffset.UtcNow.ToString("O"));
        if (businessId is not null) query.WithParameter("@business", businessId);
        return Collect(Operations, query, null, null, ct);
    }
    public static string MembershipId(string tenantId, string oid) => "member-" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(tenantId + ":" + oid))).ToLowerInvariant();
    public JObject Membership(string businessId, string tenantId, string oid, string email, string role, bool active = true, string businessName = "", string preset = "dental")
    {
        var doc = new JObject { ["id"] = MembershipId(tenantId, oid), ["businessId"] = businessId, ["type"] = "membership", ["tenantId"] = tenantId, ["oid"] = oid, ["email"] = email, ["role"] = role, ["active"] = active, ["businessName"] = businessName, ["preset"] = preset, ["createdAt"] = DateTimeOffset.UtcNow.ToString("O") };
        return doc;
    }
    public async Task<List<JObject>> Query(string type, int? limit = null, bool summaries = false, CancellationToken ct = default)
    {
        var select = summaries ? type == "status-history" ? "c.id,c.type,c.referralId,c.status,c.changedAt,c.partnerId" : "c.id,c.type,c.doctorCode,c.doctorName,c.partnerId,c.partnerName,c.status,c.createdAt" : "*";
        var query = new QueryDefinition($"SELECT {select} FROM c WHERE c.businessId = @business AND c.type = @type")
            .WithParameter("@business", BusinessId).WithParameter("@type", type);
        return await Collect(Operations, query, BusinessKey, limit, ct);
    }
    public Task<List<JObject>> Doctors(CancellationToken ct = default) => Collect(Cards,
        new QueryDefinition("SELECT * FROM c WHERE c.businessId = @business").WithParameter("@business", BusinessId), null, null, ct);
    public Task<List<JObject>> BusinessDirectory(CancellationToken ct) => Collect(Operations,
        new QueryDefinition("SELECT c.businessId,c.name FROM c WHERE c.type = 'business' AND (NOT IS_DEFINED(c.testFixture) OR c.testFixture = false)"),
        null, null, ct);

    public Task<List<JObject>> Partners(CancellationToken ct = default) => Query("partner", ct: ct);
    static async Task<List<JObject>> Collect(Container container, QueryDefinition query, PartitionKey? key, int? limit, CancellationToken ct)
    {
        var rows = new List<JObject>();
        using var iterator = container.GetItemQueryIterator<JObject>(query, requestOptions: new QueryRequestOptions { PartitionKey = key, MaxItemCount = 100 });
        while (iterator.HasMoreResults && (!limit.HasValue || rows.Count < limit.Value))
            rows.AddRange(await iterator.ReadNextAsync(ct));
        return limit.HasValue ? rows.Take(limit.Value).ToList() : rows;
    }
    public JObject Document(string type, string id, string? businessId = null) => new() { ["id"] = id, ["businessId"] = businessId ?? BusinessId, ["type"] = type, ["createdAt"] = DateTimeOffset.UtcNow.ToString("O") };
    public JObject Audit(string actor, string action, string target)
    {
        var doc = Document("audit", "audit-" + Guid.NewGuid());
        doc["actor"] = actor; doc["action"] = action; doc["target"] = target;
        return doc;
    }
    public Task<ItemResponse<JObject>> Create(JObject doc, CancellationToken ct = default) => Operations.CreateItemAsync(doc, BusinessKey, cancellationToken: ct);
    public async Task AuditRead(string actor, string action, CancellationToken ct) => await Create(Audit(actor, action, "dashboard"), ct);
    public static void Check(TransactionalBatchResponse response)
    {
        if (response.IsSuccessStatusCode) return;
        var statuses = Enumerable.Range(0, response.Count).Select(i => response[i].StatusCode).ToList();
        if (statuses.Contains(HttpStatusCode.PreconditionFailed)) throw new ApiError(409, "This record changed. Refresh and try again.");
        if (statuses.Contains(HttpStatusCode.Conflict)) throw new ApiError(409, "This record already exists.");
        throw new ApiError(503, "Storage is temporarily unavailable.");
    }
    public async Task<bool> Allow(string key, int limit, CancellationToken ct)
    {
        var id = "rate-" + DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 3600 + "-" + key;
        for (var retry = 0; retry < 8; retry++)
        {
            var old = await Read(id, ct);
            if (old?.Value<int>("count") >= limit) return false;
            var doc = old ?? Document("rate", id);
            doc["count"] = (old?.Value<int>("count") ?? 0) + 1; doc["ttl"] = 7200;
            try
            {
                if (old is null) await Create(doc, ct);
                else await Operations.ReplaceItemAsync(doc, id, BusinessKey, new ItemRequestOptions { IfMatchEtag = old.Value<string>("_etag") }, ct);
                return true;
            }
            catch (CosmosException e) when (e.StatusCode is HttpStatusCode.Conflict or HttpStatusCode.PreconditionFailed) { }
        }
        return false;
    }
    public async Task Seed(CancellationToken ct = default)
    {
        var business = Document("business", "business"); business["name"] = "West Office Demo"; business["officeName"] = settings.OfficeName; business["preset"] = "dental"; business["acceptReferrals"] = settings.AcceptReferrals || settings.LocalDemoStaff; business["monthlyPriceUsd"] = 50; business["subscriptionStatus"] = "not_configured";
        var existingBusiness = await Read("business", ct);
        if (existingBusiness is null) await Create(business, ct);
        else if (settings.LocalDemoStaff && existingBusiness.Value<bool?>("acceptReferrals") != true) { existingBusiness["acceptReferrals"] = true; await Operations.ReplaceItemAsync(existingBusiness, "business", BusinessKey, cancellationToken: ct); }
        var partnerId = "demo-referring-office";
        var partner = Document("partner", partnerId); partner["name"] = "West Office Demo"; partner["active"] = true;
        if (await Read(partnerId, ct) is null) await Create(partner, ct);
        var mainOffice = Document("office", "west-office"); mainOffice["name"] = "West Office Demo"; mainOffice["active"] = true;
        if (await Read("west-office", ct) is null) await Create(mainOffice, ct);
        var card = await Read(Cards, "demo-west-office", new PartitionKey("demo-west-office"), ct);
        card ??= new JObject { ["id"] = "demo-west-office", ["active"] = true, ["officeName"] = "West Office Demo", ["welcomeText"] = "This is a fictional BridgeWay office." };
        if (card.Value<string>("businessId") is string owner && owner != BusinessId) throw new InvalidOperationException("Demo card belongs to another business.");
        card["businessId"] = BusinessId; card["officeId"] = "west-office"; card["partnerId"] = partnerId; card["partnerName"] = "West Office Demo";
        card["createdAt"] ??= DateTimeOffset.UtcNow.ToString("O");
        await Cards.UpsertItemAsync(card, new PartitionKey("demo-west-office"), cancellationToken: ct);
        if (settings.StaffObjectIds.Length > 0 && settings.TenantId.Length > 0)
        {
            var member = Membership(BusinessId, settings.TenantId, settings.StaffObjectIds[0], "", "Admin", businessName: "West Office Demo");
            try { await Operations.CreateItemAsync(member, BusinessKey, cancellationToken: ct); } catch (Microsoft.Azure.Cosmos.CosmosException e) when (e.StatusCode == HttpStatusCode.Conflict) { }
        }
        var tradesId = "demo-trades";
        var tradesBusiness = Document("business", "business", tradesId); tradesBusiness["name"] = "North Star HVAC Demo"; tradesBusiness["officeName"] = "North Star HVAC Demo"; tradesBusiness["preset"] = "trades"; tradesBusiness["acceptReferrals"] = true; tradesBusiness["monthlyPriceUsd"] = 50; tradesBusiness["subscriptionStatus"] = "not_configured";
        try { await Operations.CreateItemAsync(tradesBusiness, new PartitionKey(tradesId), cancellationToken: ct); } catch (Microsoft.Azure.Cosmos.CosmosException e) when (e.StatusCode == HttpStatusCode.Conflict) { if (settings.LocalDemoStaff) { var old = await Read(Operations, "business", new PartitionKey(tradesId), ct); if (old is not null && old.Value<bool?>("acceptReferrals") != true) { old["acceptReferrals"] = true; await Operations.ReplaceItemAsync(old, "business", new PartitionKey(tradesId), cancellationToken: ct); } } }
        var tradesOffice = Document("office", "north-star", tradesId); tradesOffice["name"] = "North Star HVAC Demo"; tradesOffice["active"] = true;
        try { await Operations.CreateItemAsync(tradesOffice, new PartitionKey(tradesId), cancellationToken: ct); } catch (Microsoft.Azure.Cosmos.CosmosException e) when (e.StatusCode == HttpStatusCode.Conflict) { }
        var tradesPartner = Document("partner", "demo-builder-network", tradesId); tradesPartner["name"] = "Builder Network"; tradesPartner["active"] = true;
        try { await Operations.CreateItemAsync(tradesPartner, new PartitionKey(tradesId), cancellationToken: ct); } catch (Microsoft.Azure.Cosmos.CosmosException e) when (e.StatusCode == HttpStatusCode.Conflict) { }
        var tradesCard = new JObject { ["id"] = "demo-hvac-referral", ["businessId"] = tradesId, ["officeId"] = "north-star", ["partnerId"] = "demo-builder-network", ["partnerName"] = "Builder Network", ["officeName"] = "North Star HVAC Demo", ["active"] = true, ["welcomeText"] = "Tell us about the service you need.", ["createdAt"] = DateTimeOffset.UtcNow.ToString("O") };
        try { await Cards.CreateItemAsync(tradesCard, new PartitionKey("demo-hvac-referral"), cancellationToken: ct); } catch (Microsoft.Azure.Cosmos.CosmosException e) when (e.StatusCode == HttpStatusCode.Conflict) { }
        foreach (var businessId in new[] { BusinessId, tradesId })
        {
            var demoMember = Membership(businessId, "local-demo", "local-demo", "local-demo@localhost", "Admin", businessName: businessId == tradesId ? "North Star HVAC Demo" : "West Office Demo", preset: businessId == tradesId ? "trades" : "dental");
            try { await Operations.CreateItemAsync(demoMember, new PartitionKey(businessId), cancellationToken: ct); } catch (Microsoft.Azure.Cosmos.CosmosException e) when (e.StatusCode == HttpStatusCode.Conflict) { }
        }
    }
}
