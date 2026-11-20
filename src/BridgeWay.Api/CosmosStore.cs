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
    static string Database(IConfiguration config) => config["Cosmos:Database"] is { Length: > 0 } name ? name : throw new InvalidOperationException("Set Cosmos:Database.");
    public Container Cards { get; } = client.GetContainer(Database(config), config["Cosmos:CardContainer"] ?? "card-directory");
    public Container Operations { get; } = client.GetContainer(Database(config), config["Cosmos:OperationsContainer"] ?? "business-operations");
    public const string PlatformPartition = "bridgeway-platform";
    string? selected = business?.BusinessId;
    public string BusinessId => selected ?? throw new InvalidOperationException("No business selected for this request.");
    public PartitionKey BusinessKey => new(BusinessId);
    public void UseBusiness(string businessId) { selected = businessId; if (business is not null) business.BusinessId = businessId; }

    public async Task<JObject?> Read(Container container, string id, PartitionKey key, CancellationToken ct = default)
    {
        try { return (await container.ReadItemAsync<JObject>(id, key, cancellationToken: ct)).Resource; }
        catch (CosmosException e) when (e.StatusCode == HttpStatusCode.NotFound) { return null; }
    }
    public Task<JObject?> Read(string id, CancellationToken ct = default) => Read(Operations, id, BusinessKey, ct);
    public async Task<JObject?> Card(string code, CancellationToken ct = default, bool requireActiveAssociations = false, string? expectedBusinessId = null)
    {
        var card = await Read(Cards, code, new PartitionKey(code), ct);
        if (string.IsNullOrWhiteSpace(card?.Value<string>("businessId"))) return null;
        var businessId = card.Value<string>("businessId")!;
        if (expectedBusinessId is not null && !string.Equals(expectedBusinessId, businessId, StringComparison.Ordinal)) return null;
        var officeId = card.Value<string>("officeId"); var partnerId = card.Value<string>("partnerId");
        if (await Business(businessId, ct) is null) return null;
        // Imported cards and the legacy doctor endpoint did not create related records.
        var legacy = officeId == "default" && partnerId == code;
        if (officeId is not null)
        {
            var office = await Read(Operations, officeId, new PartitionKey(businessId), ct);
            if (!ValidCardReference(office, "office", legacy) || (requireActiveAssociations && (office?.Value<bool?>("active") != true || office.Value<string>("type") != "office"))) return null;
            card["resolvedOfficeLogoUrl"] = office?.Value<string>("logoUrl");
            card["resolvedOfficeName"] = office?.Value<string>("name") ?? card.Value<string>("officeName");
        }
        if (partnerId is not null)
        {
            var partner = await Read(Operations, partnerId, new PartitionKey(businessId), ct);
            if (!ValidCardReference(partner, "partner", legacy) || (requireActiveAssociations && (partner?.Value<bool?>("active") != true || partner.Value<string>("type") != "partner"))) return null;
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
    public static string MembershipId(string tenantId, string oid) => "member-" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(tenantId + ":" + oid))).ToLowerInvariant();
    public JObject Membership(string businessId, string tenantId, string oid, string email, string role, bool active = true, string businessName = "")
    {
        var doc = new JObject { ["id"] = MembershipId(tenantId, oid), ["businessId"] = businessId, ["type"] = "membership", ["tenantId"] = tenantId, ["oid"] = oid, ["email"] = email, ["role"] = role, ["active"] = active, ["businessName"] = businessName, ["createdAt"] = DateTimeOffset.UtcNow.ToString("O") };
        return doc;
    }
    public async Task<List<JObject>> Query(string type, int? limit = null, bool summaries = false, CancellationToken ct = default)
    {
        var select = summaries ? type == "status-history" ? "c.id,c.type,c.referralId,c.status,c.changedAt,c.partnerId,c.officeId,c.cardId" : "c.id,c.type,c.doctorCode,c.doctorName,c.partnerId,c.partnerName,c.status,c.createdAt,c.officeId,c.cardId" : "*";
        var testFilter = type is "referral" or "status-history" ? " AND (NOT IS_DEFINED(c.isTest) OR c.isTest = false)" : "";
        var query = new QueryDefinition($"SELECT {select} FROM c WHERE c.businessId = @business AND c.type = @type{testFilter}")
            .WithParameter("@business", BusinessId).WithParameter("@type", type);
        return await Collect(Operations, query, BusinessKey, limit, ct);
    }
    public Task<List<JObject>> ReferralHistory(string referralId, CancellationToken ct) => Collect(Operations,
        new QueryDefinition("""
            SELECT c.type, c.status, c.actor, c.changedAt, c.createdAt, c.action, c.ownerName FROM c
            WHERE c.businessId = @business AND (
                (c.type = 'status-history' AND c.referralId = @referral AND (NOT IS_DEFINED(c.isTest) OR c.isTest = false))
                OR (c.type = 'audit' AND c.target = @referral AND STARTSWITH(c.action, 'assignment:'))
            )
            """).WithParameter("@business", BusinessId).WithParameter("@referral", referralId), BusinessKey, null, ct);
    public Task<List<JObject>> TestReferrals(CancellationToken ct = default) => Collect(Operations,
        new QueryDefinition("SELECT TOP 201 * FROM c WHERE c.businessId = @business AND c.type = 'referral' AND c.isTest = true ORDER BY c.createdAt DESC")
            .WithParameter("@business", BusinessId), BusinessKey, 201, ct);
    /// <summary>Card directory is partitioned by card code for O(1) public taps, so listing a business's cards is a cross-partition query.</summary>
    public Task<List<JObject>> BusinessCards(string? businessId = null, CancellationToken ct = default) => Collect(Cards,
        new QueryDefinition("SELECT * FROM c WHERE c.businessId = @business").WithParameter("@business", businessId ?? BusinessId), null, 2000, ct);
    public Task<List<JObject>> AllBusinesses(CancellationToken ct = default) => Collect(Operations,
        new QueryDefinition("SELECT * FROM c WHERE c.type = 'business' AND c.id = 'business'"), null, 5000, ct);
    public async Task<Dictionary<(string Business, string Type), long>> CountsByBusiness(CancellationToken ct = default)
    {
        var rows = await Collect(Operations, new QueryDefinition("SELECT c.businessId, c.type, COUNT(1) AS n FROM c WHERE (c.type = 'referral' AND (NOT IS_DEFINED(c.isTest) OR c.isTest = false)) OR c.type = 'link-open' GROUP BY c.businessId, c.type"), null, null, ct);
        var cards = await Collect(Cards, new QueryDefinition("SELECT c.businessId, COUNT(1) AS n FROM c GROUP BY c.businessId"), null, null, ct);
        var result = new Dictionary<(string, string), long>();
        foreach (var row in rows) result[(row.Value<string>("businessId") ?? "", row.Value<string>("type") ?? "")] = row.Value<long>("n");
        foreach (var row in cards) result[(row.Value<string>("businessId") ?? "", "card")] = row.Value<long>("n");
        return result;
    }
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
    /// <summary>
    /// One-time cleanup of the fictional records the old --seed command and browser tests created.
    /// Deletes only well-known demo partitions, test-e2e-* partitions, their cards, and local-demo memberships.
    /// </summary>
    public async Task<int> PurgeDemoData(CancellationToken ct = default)
    {
        var businesses = new HashSet<string>(StringComparer.Ordinal) { "demo-business", "demo-trades" };
        using (var iterator = Operations.GetItemQueryIterator<string>(new QueryDefinition("SELECT DISTINCT VALUE c.businessId FROM c WHERE STARTSWITH(c.businessId, 'test-e2e-') OR STARTSWITH(c.businessId, 'verification-')")))
            while (iterator.HasMoreResults) foreach (var id in await iterator.ReadNextAsync(ct)) if (!string.IsNullOrWhiteSpace(id)) businesses.Add(id);
        var removed = 0;
        foreach (var businessId in businesses)
        {
            var key = new PartitionKey(businessId);
            foreach (var row in await Collect(Operations, new QueryDefinition("SELECT c.id FROM c"), key, null, ct))
            {
                try { await Operations.DeleteItemAsync<JObject>(row.Value<string>("id")!, key, cancellationToken: ct); removed++; }
                catch (CosmosException e) when (e.StatusCode == HttpStatusCode.NotFound) { }
            }
            foreach (var card in await BusinessCards(businessId, ct))
            {
                try { await Cards.DeleteItemAsync<JObject>(card.Value<string>("id")!, new PartitionKey(card.Value<string>("id")!), cancellationToken: ct); removed++; }
                catch (CosmosException e) when (e.StatusCode == HttpStatusCode.NotFound) { }
            }
        }
        foreach (var code in new[] { "demo-west-office", "demo-hvac-referral" })
        {
            try { await Cards.DeleteItemAsync<JObject>(code, new PartitionKey(code), cancellationToken: ct); removed++; }
            catch (CosmosException e) when (e.StatusCode == HttpStatusCode.NotFound) { }
        }
        foreach (var member in await Collect(Operations, new QueryDefinition("SELECT c.id, c.businessId FROM c WHERE c.type = 'membership' AND c.tenantId = 'local-demo'"), null, null, ct))
        {
            try { await Operations.DeleteItemAsync<JObject>(member.Value<string>("id")!, new PartitionKey(member.Value<string>("businessId")!), cancellationToken: ct); removed++; }
            catch (CosmosException e) when (e.StatusCode == HttpStatusCode.NotFound) { }
        }
        return removed;
    }
}
