using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

public static class TenantAuthorization
{
    public static bool IsActiveMembershipFor(JObject? membership, string businessId, string tenantId, string oid) =>
        membership?.Value<bool?>("active") == true &&
        string.Equals(membership.Value<string>("businessId"), businessId, StringComparison.Ordinal) &&
        string.Equals(membership.Value<string>("tenantId"), tenantId, StringComparison.OrdinalIgnoreCase) &&
        string.Equals(membership.Value<string>("oid"), oid, StringComparison.OrdinalIgnoreCase);

    public static bool IsValidInvite(JObject? invite, string businessId, string email, DateTimeOffset now)
    {
        if (invite?.Value<string>("type") != "membership-invite" ||
            !string.Equals(invite.Value<string>("businessId"), businessId, StringComparison.Ordinal) ||
            !string.Equals(invite.Value<string>("state"), "Pending", StringComparison.Ordinal) ||
            !string.Equals(invite.Value<string>("email")?.Trim(), email.Trim(), StringComparison.OrdinalIgnoreCase) ||
            invite.Value<string>("role") is not ("Admin" or "Staff") ||
            !DateTimeOffset.TryParse(invite.Value<string>("expiresAt"), out var expiresAt)) return false;
        return expiresAt > now;
    }

    public static JObject? SelectActiveMembership(IEnumerable<JObject> memberships, string? requestedBusinessId) =>
        string.IsNullOrWhiteSpace(requestedBusinessId) ? null : memberships.FirstOrDefault(m =>
            m.Value<bool>("active") && string.Equals(m.Value<string>("businessId"), requestedBusinessId, StringComparison.Ordinal));

    public static bool HasRole(JObject? membership, string role) =>
        membership?.Value<bool>("active") == true && string.Equals(membership.Value<string>("role"), role, StringComparison.Ordinal);
}
