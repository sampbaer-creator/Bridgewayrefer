using System.Globalization;
using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

public static class MonthlyReport
{
    static readonly TimeZoneInfo Mountain = TimeZoneInfo.FindSystemTimeZoneById("America/Denver");
    public static object Build(List<JObject> referrals, List<JObject> doctors, List<JObject> opens, string? month, DateTimeOffset? clock = null, List<JObject>? histories = null)
    {
        var today = TimeZoneInfo.ConvertTime(clock ?? DateTimeOffset.UtcNow, Mountain);
        var selected = month is null ? new DateTime(today.Year, today.Month, 1) : ParseMonth(month);
        string Key(DateTime date) => date.ToString("yyyy-MM", CultureInfo.InvariantCulture);
        var selectedKey = Key(selected);
        var partnerDocuments = doctors.Where(d => d.Value<string>("type") == "partner").ToDictionary(d => d.Value<string>("id")!, d => (Name: d.Value<string>("name") ?? "Former referring partner", Active: d.Value<bool>("active")));
        var cardToPartner = doctors.Where(d => d.Value<string>("type") != "partner" && d.Value<string>("partnerId") is not null).ToDictionary(d => d.Value<string>("id")!, d => d.Value<string>("partnerId")!);
        var offices = new Dictionary<string, (string Name, bool Active)>(partnerDocuments);
        foreach (var card in doctors.Where(d => d.Value<string>("type") != "partner"))
        {
            var id = cardToPartner.GetValueOrDefault(card.Value<string>("id") ?? "", card.Value<string>("id") ?? "direct");
            if (!offices.ContainsKey(id)) offices[id] = (card.Value<string>("partnerName") ?? card.Value<string>("officeName") ?? "Former referring partner", card.Value<bool>("active"));
        }
        referrals = referrals.Where(d => d.Value<bool?>("isTest") != true).ToList();
        opens = opens.Where(d => d.Value<bool?>("isTest") != true).ToList();
        histories = (histories ?? []).Where(d => d.Value<bool?>("isTest") != true).ToList();
        var forms = new List<(string Month, string Office, int Day)>(); var visits = new List<(string Month, string Office, int Day)>();
        var referralCohorts = new Dictionary<string, (string Month, string Office)>();
        int invalid = 0;
        foreach (var (source, destination) in new[] { (referrals, forms), (opens, visits) })
        foreach (var doc in source)
        {
            if (!DateTimeOffset.TryParse(doc.Value<string>("createdAt"), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var stamp)) { invalid++; continue; }
            stamp = TimeZoneInfo.ConvertTime(stamp, Mountain);
            if (stamp.Year < 2000 || stamp.Year > today.Year + 1) { invalid++; continue; }
            var office = doc.Value<string>("partnerId") ?? doc.Value<string>("doctorCode");
            if (office is not null && cardToPartner.TryGetValue(office, out var partnerId)) office = partnerId;
            if (string.IsNullOrEmpty(office)) office = "direct";
            if (!offices.ContainsKey(office)) offices[office] = (office == "direct" ? "Direct requests" : doc.Value<string>("partnerName") ?? doc.Value<string>("doctorName") ?? "Former referring partner", office == "direct");
            destination.Add((stamp.ToString("yyyy-MM"), office, stamp.Day));
            if (ReferenceEquals(source, referrals) && !string.IsNullOrWhiteSpace(doc.Value<string>("id"))) referralCohorts[doc.Value<string>("id")!] = (stamp.ToString("yyyy-MM"), office);
        }
        var outcomeStatuses = new HashSet<string>(["Completed", "Won"], StringComparer.OrdinalIgnoreCase);
        var outcomesByReferral = new Dictionary<string, (DateTimeOffset At, string Month, string Office)>(StringComparer.Ordinal);
        var outcomeHistoryIds = new HashSet<string>(StringComparer.Ordinal);
        void AddOutcome(string referralId, string? eventAt, string? attributedPartner)
        {
            if (string.IsNullOrWhiteSpace(eventAt) || !DateTimeOffset.TryParse(eventAt, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var eventStamp)) { invalid++; return; }
            eventStamp = TimeZoneInfo.ConvertTime(eventStamp, Mountain);
            if (eventStamp.Year < 2000 || eventStamp.Year > today.Year + 1) { invalid++; return; }
            var office = attributedPartner;
            if (office is not null && cardToPartner.TryGetValue(office, out var partnerId)) office = partnerId;
            if (string.IsNullOrEmpty(office) && referralCohorts.TryGetValue(referralId, out var cohort)) office = cohort.Office;
            if (string.IsNullOrEmpty(office)) office = "direct";
            if (!offices.ContainsKey(office)) offices[office] = ("Former referring partner", false);
            var key = (Month: eventStamp.ToString("yyyy-MM", CultureInfo.InvariantCulture), Office: office);
            if (!outcomesByReferral.TryGetValue(referralId, out var prior) || eventStamp < prior.At)
                outcomesByReferral[referralId] = (eventStamp, key.Month, key.Office);
        }
        foreach (var history in histories)
            if (outcomeStatuses.Contains(history.Value<string>("status") ?? "") && history.Value<string>("referralId") is string referralId)
            {
                outcomeHistoryIds.Add(referralId);
                AddOutcome(referralId, history.Value<string>("changedAt"), history.Value<string>("partnerId"));
            }
        // Legacy records without an outcome history use their latest update as the best available event date.
        foreach (var referral in referrals)
            if (outcomeStatuses.Contains(referral.Value<string>("status") ?? "") && referral.Value<string>("id") is string referralId && !outcomeHistoryIds.Contains(referralId))
                AddOutcome(referralId, referral.Value<string>("updatedAt") ?? referral.Value<string>("createdAt"), referral.Value<string>("partnerId") ?? referral.Value<string>("doctorCode"));
        int Outcomes(string key, string office) => outcomesByReferral.Values.Count(outcome => outcome.Month == key && outcome.Office == office);
        int Count(List<(string Month, string Office, int Day)> data, string key, string? office = null) => data.Count(x => x.Month == key && (office is null || x.Office == office));
        int calendarDays = DateTime.DaysInMonth(selected.Year, selected.Month);
        int days = selectedKey == today.ToString("yyyy-MM") ? today.Day : calendarDays;
        var rows = offices.Select(o => { var count = Count(forms, selectedKey, o.Key); var outcomes = Outcomes(selectedKey, o.Key); return new { officeId = o.Key, name = o.Value.Name, active = o.Value.Active, count, opens = Count(visits, selectedKey, o.Key), outcomes, cumulative = Enumerable.Range(1, days).Select(day => forms.Count(f => f.Office == o.Key && f.Month == selectedKey && f.Day <= day)).ToArray() }; }).OrderByDescending(o => o.count).ThenBy(o => o.name).ToArray();
        var trend = Enumerable.Range(-11, 12).Select(offset => Key(selected.AddMonths(offset))).Select(key => new { month = key, total = Count(forms, key), opens = Count(visits, key), outcomes = offices.Keys.Sum(id => Outcomes(key, id)), offices = offices.Keys.ToDictionary(id => id, id => Count(forms, key, id)), officeOpens = offices.Keys.ToDictionary(id => id, id => Count(visits, key, id)) }).ToArray();
        var earliest = new DateTime(today.Year, today.Month, 1).AddMonths(-11);
        var outcomeMonths = outcomesByReferral.Values.Select(outcome => outcome.Month).ToArray();
        foreach (var key in forms.Select(x => x.Month).Concat(visits.Select(x => x.Month)).Concat(outcomeMonths)) if (ParseMonth(key) < earliest) earliest = ParseMonth(key);
        var latest = new DateTime(today.Year, today.Month, 1);
        foreach (var key in forms.Select(x => x.Month).Concat(visits.Select(x => x.Month)).Concat(outcomeMonths)) if (ParseMonth(key) > latest) latest = ParseMonth(key);
        var months = new List<string>(); for (var date = earliest; date <= latest; date = date.AddMonths(1)) months.Add(Key(date));
        months.Add(selectedKey);
        return new { month = selectedKey, monthLabel = selected.ToString("MMMM yyyy", CultureInfo.InvariantCulture), timezone = "America/Denver", availableMonths = months.Distinct().OrderDescending().ToArray(), days = Enumerable.Range(1, days), calendarDays, isCurrentMonth = selectedKey == today.ToString("yyyy-MM"), total = rows.Sum(r => r.count), outcomes = rows.Sum(r => r.outcomes), outcomeLabel = "Completed requests this month", hasSubmissions = rows.Sum(r => r.count) > 0, linkOpens = rows.Sum(r => r.opens), referringOffices = rows.Count(r => r.officeId != "direct" && r.count > 0), offices = rows, invalidDates = invalid, previousTotal = Count(forms, Key(selected.AddMonths(-1))), trend };
    }
    public static DateTime ParseMonth(string month)
    {
        if (!DateTime.TryParseExact(month, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) || date.Year < 2000 || date.Year > 9998) throw new ApiError(400, "Choose a valid month.");
        return date;
    }
}
