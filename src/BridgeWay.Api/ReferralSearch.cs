using System.Globalization;
using Microsoft.Azure.Cosmos;

namespace BridgeWay.Api;

public static class ReferralSearch
{
    public static QueryDefinition Build(string businessId, string? search, string? status, string? partner, string? from, string? to, bool unresolved, string? owner = null)
    {
        var text = "SELECT * FROM c WHERE c.businessId = @business AND c.type = 'referral' AND (NOT IS_DEFINED(c.isTest) OR c.isTest = false)";
        var parameters = new Dictionary<string, object> { ["@business"] = businessId };
        if (!string.IsNullOrWhiteSpace(search))
        {
            if (search.Length > 120) throw new ApiError(400, "Keep the search under 120 characters.");
            text += " AND (CONTAINS(c.name, @search, true) OR CONTAINS(c.email, @search, true) OR CONTAINS(c.phone, @search, true) OR CONTAINS(c.partnerName, @search, true))";
            parameters["@search"] = search.Trim();
        }
        if (!string.IsNullOrEmpty(status))
        {
            if (!Submission.Statuses.Contains(status)) throw new ApiError(400, "Choose a valid referral status.");
            text += " AND c.status = @status"; parameters["@status"] = status;
        }
        if (!string.IsNullOrEmpty(partner))
        {
            if (partner.Length > 80) throw new ApiError(400, "Choose a valid partner.");
            text += " AND (c.partnerId = @partner OR c.doctorCode = @partner)"; parameters["@partner"] = partner;
        }
        if (!string.IsNullOrEmpty(owner))
        {
            if (owner.Length > 80) throw new ApiError(400, "Choose a valid staff member.");
            if (owner == "unassigned") text += " AND (NOT IS_DEFINED(c.ownerId) OR IS_NULL(c.ownerId) OR c.ownerId = '')";
            else { text += " AND c.ownerId = @owner"; parameters["@owner"] = owner; }
        }
        if (unresolved) text += " AND c.status NOT IN ('Completed', 'Won', 'Closed')";
        foreach (var (value, name, comparison) in new[] { (from, "@from", ">="), (to, "@to", "<") })
        {
            if (string.IsNullOrEmpty(value)) continue;
            if (!DateTime.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) || date.Year < 2000 || date.Year > 9998)
                throw new ApiError(400, "Choose valid received dates.");
            if (name == "@to") date = date.AddDays(1);
            text += $" AND c.createdAt {comparison} {name}";
            parameters[name] = date.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture);
        }
        if (!string.IsNullOrEmpty(from) && !string.IsNullOrEmpty(to) && string.CompareOrdinal(from, to) > 0) throw new ApiError(400, "The start date must be before the end date.");
        var query = new QueryDefinition(text + " ORDER BY c.createdAt DESC");
        foreach (var parameter in parameters) query.WithParameter(parameter.Key, parameter.Value);
        return query;
    }
}
