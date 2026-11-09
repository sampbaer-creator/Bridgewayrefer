using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

public static class TenantAuthorization
{
    public static JObject? SelectActiveMembership(IEnumerable<JObject> memberships, string? requestedBusinessId) =>
        string.IsNullOrWhiteSpace(requestedBusinessId) ? null : memberships.FirstOrDefault(m =>
            m.Value<bool>("active") && string.Equals(m.Value<string>("businessId"), requestedBusinessId, StringComparison.Ordinal));

    public static bool HasRole(JObject? membership, string role) =>
        membership?.Value<bool>("active") == true && string.Equals(membership.Value<string>("role"), role, StringComparison.Ordinal);
}
