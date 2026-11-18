using System.Globalization;
using Microsoft.Azure.Cosmos;

namespace BridgeWay.Api;

public static class ReferralSearch
{
    const string Unresolved = "c.status NOT IN ('Completed', 'Won', 'Closed')";
    // Mirrors isOverdue/attention rules in bridgeway-web/lib/follow-up.ts.
    const string Attention = "(" + Unresolved + " AND (c.status = 'New' OR NOT IS_DEFINED(c.ownerId) OR IS_NULL(c.ownerId) OR c.ownerId = '' OR (IS_STRING(c.nextActionAt) AND c.nextActionAt < @now)))";

    public static QueryDefinition Build(string businessId, string? search, string? status, string? partner, string? from, string? to, bool unresolved, bool attention = false, DateTimeOffset? now = null)
    {
        var (where, parameters) = Filters(businessId, search, status, partner, from, to, unresolved, attention, now);
        return Create("SELECT * FROM c WHERE " + where + " ORDER BY c.createdAt DESC", parameters);
    }

    /// <summary>Per-status totals for every referral matching the filters other than status, so the status chips stay stable while paging.</summary>
    public static QueryDefinition BuildStatusCounts(string businessId, string? search, string? partner, string? from, string? to, bool unresolved, bool attention = false, DateTimeOffset? now = null)
    {
        var (where, parameters) = Filters(businessId, search, null, partner, from, to, unresolved, attention, now);
        return Create("SELECT c.status AS status, COUNT(1) AS total FROM c WHERE " + where + " GROUP BY c.status", parameters);
    }

    /// <summary>Workspace-wide count of open referrals that are new, unassigned or overdue.</summary>
    public static QueryDefinition BuildAttentionCount(string businessId, DateTimeOffset? now = null)
    {
        var (where, parameters) = Filters(businessId, null, null, null, null, null, false, true, now);
        return Create("SELECT VALUE COUNT(1) FROM c WHERE " + where, parameters);
    }

    static QueryDefinition Create(string text, Dictionary<string, object> parameters)
    {
        var query = new QueryDefinition(text);
        foreach (var parameter in parameters) query.WithParameter(parameter.Key, parameter.Value);
        return query;
    }

    static (string Where, Dictionary<string, object> Parameters) Filters(string businessId, string? search, string? status, string? partner, string? from, string? to, bool unresolved, bool attention, DateTimeOffset? now)
    {
        var text = "c.businessId = @business AND c.type = 'referral' AND (NOT IS_DEFINED(c.isTest) OR c.isTest = false)";
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
        if (unresolved) text += " AND " + Unresolved;
        if (attention)
        {
            text += " AND " + Attention;
            parameters["@now"] = (now ?? DateTimeOffset.UtcNow).UtcDateTime.ToString("O", CultureInfo.InvariantCulture);
        }
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
        return (text, parameters);
    }
}
