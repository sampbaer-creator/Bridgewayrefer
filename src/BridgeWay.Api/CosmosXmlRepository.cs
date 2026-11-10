using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.Azure.Cosmos;

namespace BridgeWay.Api;

/// <summary>
/// Stores the ASP.NET Core Data Protection key ring in the existing operations
/// container so cookies and OIDC state survive API revisions and restarts.
/// </summary>
public sealed class CosmosXmlRepository(CosmosClient client, IConfiguration configuration) : IXmlRepository
{
    const string PartitionId = "bridgeway-platform";
    readonly Container container = client.GetContainer(
        configuration["Cosmos:Database"] ?? throw new InvalidOperationException("Set Cosmos:Database."),
        configuration["Cosmos:OperationsContainer"] ?? "business-operations");

    public IReadOnlyCollection<XElement> GetAllElements()
    {
        var query = new QueryDefinition("SELECT c.xml FROM c WHERE c.type = @type")
            .WithParameter("@type", "data-protection-key");
        using var iterator = container.GetItemQueryIterator<XmlRow>(query,
            requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(PartitionId) });
        var elements = new List<XElement>();
        while (iterator.HasMoreResults)
        {
            var page = iterator.ReadNextAsync().GetAwaiter().GetResult();
            elements.AddRange(page.Select(row => XElement.Parse(row.Xml)));
        }
        return elements;
    }

    public void StoreElement(XElement element, string? friendlyName = null)
    {
        var row = new XmlRow
        {
            Id = "dataprotection-" + Guid.NewGuid().ToString("N"),
            BusinessId = PartitionId,
            Type = "data-protection-key",
            FriendlyName = friendlyName ?? "",
            Xml = element.ToString(SaveOptions.DisableFormatting),
            CreatedAt = DateTimeOffset.UtcNow.ToString("O")
        };
        container.CreateItemAsync(row, new PartitionKey(PartitionId)).GetAwaiter().GetResult();
    }

    sealed class XmlRow
    {
        [Newtonsoft.Json.JsonProperty("id")]
        public string Id { get; set; } = "";
        [Newtonsoft.Json.JsonProperty("businessId")]
        public string BusinessId { get; set; } = "";
        [Newtonsoft.Json.JsonProperty("type")]
        public string Type { get; set; } = "";
        [Newtonsoft.Json.JsonProperty("friendlyName")]
        public string FriendlyName { get; set; } = "";
        [Newtonsoft.Json.JsonProperty("xml")]
        public string Xml { get; set; } = "";
        [Newtonsoft.Json.JsonProperty("createdAt")]
        public string CreatedAt { get; set; } = "";
    }
}
