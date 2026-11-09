using System.Net;
using Azure.Identity;
using BridgeWay.Api;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Configuration;
using Newtonsoft.Json.Linq;
using Xunit;

public sealed class LiveFactAttribute : FactAttribute
{
    public LiveFactAttribute() { if (Environment.GetEnvironmentVariable("BRIDGEWAY_LIVE_TESTS") != "1") Skip = "Opt in to fictional Azure writes with BRIDGEWAY_LIVE_TESTS=1."; }
}
public class CosmosLiveTests
{
    [LiveFact] public async Task CosmosIsolationTransactionsRateLimitsAndOutboxLeases()
    {
        using var client = new CosmosClient("https://bridgeway-dev-nosql.documents.azure.com:443/", new AzureCliCredential(), new CosmosClientOptions { ConnectionMode = ConnectionMode.Gateway });
        var settings = new Settings { BusinessId = "verification-" + Guid.NewGuid().ToString("N") };
        var store = new CosmosStore(client, new ConfigurationBuilder().Build(), settings);
        var foreignStore = new CosmosStore(client, new ConfigurationBuilder().Build(), new Settings { BusinessId = "different-business" });
        var cardId = "verification-" + Guid.NewGuid().ToString("N");
        try
        {
            var rate = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => store.Allow("concurrent", 10, default)));
            Assert.Equal(10, rate.Count(x => x));
            var referral = store.Document("referral", "ref-test"); referral["name"] = "Fictional test";
            var alert = AlertWorker.NewAlert(store, "alert-test");
            using (var created = await store.Operations.CreateTransactionalBatch(store.BusinessKey).CreateItem(referral).CreateItem(alert).ExecuteAsync()) Assert.True(created.IsSuccessStatusCode);
            using (var duplicate = await store.Operations.CreateTransactionalBatch(store.BusinessKey).CreateItem(referral).CreateItem(AlertWorker.NewAlert(store, "alert-duplicate")).ExecuteAsync()) Assert.False(duplicate.IsSuccessStatusCode);
            Assert.Null(await store.Read("alert-duplicate"));
            Assert.Null(await foreignStore.Read("ref-test"));
            var stored = (await store.Read("alert-test"))!;
            stored["state"] = "Sending"; stored["readyAt"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 300;
            var etag = stored.Value<string>("_etag");
            await store.Operations.ReplaceItemAsync(stored, "alert-test", store.BusinessKey, new ItemRequestOptions { IfMatchEtag = etag });
            var stale = await Assert.ThrowsAsync<CosmosException>(() => store.Operations.ReplaceItemAsync(stored, "alert-test", store.BusinessKey, new ItemRequestOptions { IfMatchEtag = etag }));
            Assert.Equal(HttpStatusCode.PreconditionFailed, stale.StatusCode);
            await store.Cards.CreateItemAsync(new JObject { ["id"] = cardId, ["businessId"] = settings.BusinessId, ["active"] = true }, new PartitionKey(cardId));
            Assert.NotNull(await store.Card(cardId)); Assert.Null(await foreignStore.Card(cardId));
            var exportPath = Path.Combine(Path.GetTempPath(), "bridgeway-fictional-export-" + Guid.NewGuid() + ".json");
            try
            {
                var export = new JArray(new JObject { ["PartitionKey"] = "records", ["RowKey"] = "ref-import", ["name"] = "Fictional import", ["status"] = "Closed", ["createdAt"] = "2026-10-01T12:00:00Z", ["consentAt"] = "2026-10-01T12:00:00Z" }, new JObject { ["PartitionKey"] = "records", ["RowKey"] = "alert-import", ["state"] = "Retry", ["attempts"] = 2 });
                await File.WriteAllTextAsync(exportPath, export.ToString());
                await LegacyImport.Run(store, settings, exportPath); await LegacyImport.Run(store, settings, exportPath);
                Assert.Equal(2, (await store.Query("referral")).Count);
                Assert.Equal("Closed", (await store.Read("ref-import"))!.Value<string>("status"));
                Assert.Equal("Imported", (await store.Read("alert-import"))!.Value<string>("state"));
            }
            finally { File.Delete(exportPath); }
        }
        finally
        {
            foreach (var type in new[] { "rate", "referral", "alert" }) foreach (var doc in await store.Query(type)) await store.Operations.DeleteItemAsync<JObject>(doc.Value<string>("id")!, store.BusinessKey);
            if (await store.Card(cardId) is not null) await store.Cards.DeleteItemAsync<JObject>(cardId, new PartitionKey(cardId));
        }
    }
}
