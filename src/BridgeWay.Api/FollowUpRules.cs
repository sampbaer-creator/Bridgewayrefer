using System.Globalization;

namespace BridgeWay.Api;

public static class FollowUpRules
{
    public static bool Terminal(string? status) => status is "Completed" or "Won" or "Closed";

    public static string? ValidateDueAt(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        // Require an explicit offset so a workstation timezone cannot silently change the deadline.
        if (value.Length > 40 || !(value.EndsWith('Z') || System.Text.RegularExpressions.Regex.IsMatch(value, @"[+-]\d{2}:\d{2}$")) ||
            !DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var stamp) || stamp.Year < 2000 || stamp.Year > 9998)
            throw new ApiError(400, "Choose a valid follow-up date and time.");
        return stamp.ToUniversalTime().ToString("O");
    }
}
