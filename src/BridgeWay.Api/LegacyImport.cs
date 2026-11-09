using System.Net;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json.Linq;
namespace BridgeWay.Api;

public static class LegacyImport
{
    // Offline, explicit per-business import. Never auto-reads old patient databases.
    public static async Task Run(CosmosStore store, Settings settings, string path)
    {
        var rows = JArray.Parse(await File.ReadAllTextAsync(path)); int imported = 0, existing = 0;
        foreach (var row in rows.Cast<JObject>())
        {
            var partition = row.Value<string>("PartitionKey"); var key = row.Value<string>("RowKey") ?? throw new InvalidOperationException("Missing legacy row key.");
            JObject doc; Container container; PartitionKey pk;
            if (partition == "doctors")
            {
                doc = new JObject { ["id"] = key, ["businessId"] = settings.BusinessId, ["officeId"] = "default", ["partnerId"] = key, ["officeName"] = row["name"]?.DeepClone(), ["active"] = row["active"]?.DeepClone() ?? true, ["welcomeText"] = "Share a few details and our team will be in touch.", ["createdAt"] = row["createdAt"]?.DeepClone() };
                container = store.Cards; pk = new PartitionKey(key);
            }
            else if ((partition == "records" && (key.StartsWith("ref-") || key.StartsWith("audit-") || key.StartsWith("alert-"))) || (partition == "traffic" && key.StartsWith("open-")))
            {
                var type = key.StartsWith("ref-") ? "referral" : key.StartsWith("audit-") ? "audit" : key.StartsWith("open-") ? "link-open" : "alert";
                doc = (JObject)row.DeepClone(); doc.Remove("PartitionKey"); doc.Remove("RowKey"); doc.Remove("Timestamp"); doc.Remove("etag");
                doc["id"] = key; doc["businessId"] = settings.BusinessId; doc["type"] = type;
                if (type == "alert")
                {
                    // Import preserves history, but does not resend historic notifications.
                    doc["state"] = "Imported"; doc["readyAt"] = long.MaxValue;
                }
                container = store.Operations; pk = store.BusinessKey;
            }
            else continue; // Expired rate buckets do not need migrating.
            foreach (var name in doc.Properties().Where(p => p.Name.StartsWith('_')).Select(p => p.Name).ToList()) doc.Remove(name);
            try { await container.CreateItemAsync(doc, pk); imported++; }
            catch (CosmosException e) when (e.StatusCode == HttpStatusCode.Conflict) { existing++; }
        }
        Console.WriteLine($"Import complete: {imported} created; {existing} already existed. Record contents suppressed.");
    }
}
