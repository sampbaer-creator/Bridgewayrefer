using System.Net;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

public sealed class CosmosStore(CosmosClient client, IConfiguration config, Settings settings)
{
    public Container Cards { get; } = client.GetContainer(config["Cosmos:Database"] ?? "bridgeway-dev", config["Cosmos:CardContainer"] ?? "card-directory");
    public Container Operations { get; } = client.GetContainer(config["Cosmos:Database"] ?? "bridgeway-dev", config["Cosmos:OperationsContainer"] ?? "business-operations");
    public PartitionKey BusinessKey => new(settings.BusinessId);

    public async Task<JObject?> Read(Container container, string id, PartitionKey key, CancellationToken ct = default)
    {
        try { return (await container.ReadItemAsync<JObject>(id, key, cancellationToken: ct)).Resource; }
        catch (CosmosException e) when (e.StatusCode == HttpStatusCode.NotFound) { return null; }
    }
    public Task<JObject?> Read(string id, CancellationToken ct = default) => Read(Operations, id, BusinessKey, ct);
    public async Task<JObject?> Card(string code, CancellationToken ct = default)
    {
        var card = await Read(Cards, code, new PartitionKey(code), ct);
        return card?.Value<string>("businessId") == settings.BusinessId ? card : null;
    }
    public async Task<List<JObject>> Query(string type, int? limit = null, bool summaries = false, CancellationToken ct = default)
    {
        var select = summaries ? "c.id,c.type,c.doctorCode,c.doctorName,c.createdAt" : "*";
        var query = new QueryDefinition($"SELECT {select} FROM c WHERE c.businessId = @business AND c.type = @type")
            .WithParameter("@business", settings.BusinessId).WithParameter("@type", type);
        return await Collect(Operations, query, BusinessKey, limit, ct);
    }
    public Task<List<JObject>> Doctors(CancellationToken ct = default) => Collect(Cards,
        new QueryDefinition("SELECT * FROM c WHERE c.businessId = @business").WithParameter("@business", settings.BusinessId), null, null, ct);
    static async Task<List<JObject>> Collect(Container container, QueryDefinition query, PartitionKey? key, int? limit, CancellationToken ct)
    {
        var rows = new List<JObject>();
        using var iterator = container.GetItemQueryIterator<JObject>(query, requestOptions: new QueryRequestOptions { PartitionKey = key, MaxItemCount = 100 });
        while (iterator.HasMoreResults && (!limit.HasValue || rows.Count < limit.Value))
            rows.AddRange(await iterator.ReadNextAsync(ct));
        return limit.HasValue ? rows.Take(limit.Value).ToList() : rows;
    }
    public JObject Document(string type, string id) => new() { ["id"] = id, ["businessId"] = settings.BusinessId, ["type"] = type, ["createdAt"] = DateTimeOffset.UtcNow.ToString("O") };
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
        var business = Document("business", "business"); business["officeName"] = settings.OfficeName;
        if (await Read("business", ct) is null) await Create(business, ct);
        var card = await Read(Cards, "demo-west-office", new PartitionKey("demo-west-office"), ct);
        card ??= new JObject { ["id"] = "demo-west-office", ["active"] = true, ["officeName"] = "West Office Demo", ["welcomeText"] = "This is a fictional BridgeWay office." };
        if (card.Value<string>("businessId") is string owner && owner != settings.BusinessId) throw new InvalidOperationException("Demo card belongs to another business.");
        card["businessId"] = settings.BusinessId; card["officeId"] = "west-office"; card["partnerId"] = "demo-west-office";
        card["createdAt"] ??= DateTimeOffset.UtcNow.ToString("O");
        await Cards.UpsertItemAsync(card, new PartitionKey("demo-west-office"), cancellationToken: ct);
    }
}
