using BridgeWay.Api;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Configuration;
using Newtonsoft.Json.Linq;
using Xunit;

public class WalkthroughEmailTests
{
    [Fact]
    public void RequestAndEmailsSharePartitionWithStableIdsAndSeparateRecipients()
    {
        using var client = new CosmosClient("https://localhost:8081", "bG9jYWwtdGVzdC1rZXk=");
        var store = new CosmosStore(client, new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Cosmos:Database"] = "tests" }).Build(), new Settings());
        store.UseBusiness(CosmosStore.PlatformPartition);
        var settings = new Settings { WalkthroughNotifyEmails = [" Bridgewayrefer@outlook.com ", "bridgewayrefer@outlook.com", "invalid"] };
        var messages = WalkthroughEmails.Create(store, settings, "demo-request-fixed", "Pat", "Pat@example.invalid", "Fictional Dental", "123", "Call tomorrow").ToArray();
        Assert.Equal(2, messages.Length);
        Assert.All(messages, m => { Assert.Equal(CosmosStore.PlatformPartition, m.Value<string>("businessId")); Assert.Equal("Pending", m.Value<string>("state")); Assert.Equal(0, m.Value<int>("attempts")); Assert.Equal(7776000, m.Value<int>("ttl")); });
        Assert.Equal("pat@example.invalid", messages[0].Value<string>("recipient"));
        Assert.Contains("will be in touch soon", messages[0].Value<string>("body"));
        Assert.DoesNotContain("Call tomorrow", messages[0].Value<string>("body"));
        Assert.Equal("Bridgewayrefer@outlook.com", messages[1].Value<string>("recipient"));
        Assert.Equal("Pat@example.invalid", messages[1].Value<string>("replyTo"));
        Assert.Contains("Call tomorrow", messages[1].Value<string>("body"));
        var retry = WalkthroughEmails.Create(store, settings, "demo-request-fixed", "Pat", "Pat@example.invalid", "Fictional Dental", "123", "Call tomorrow").ToArray();
        Assert.Equal(messages.Select(m => m.Value<string>("id")), retry.Select(m => m.Value<string>("id")));
    }
}
