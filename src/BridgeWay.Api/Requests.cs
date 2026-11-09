using System.Text.RegularExpressions;
namespace BridgeWay.Api;
public sealed record Submission(string Name = "", string Email = "", string Phone = "", string Notes = "", bool Consent = false, string Code = "", string SubmissionId = "", string Website = "")
{
    public static readonly string[] Statuses = ["New", "Contacted", "Scheduled", "Completed", "Closed"];
    public void Validate()
    {
        foreach (var (value, max, required) in new[] { (Name, 120, true), (Email, 254, true), (Phone, 40, true), (Notes, 2000, false) })
            if (value is null || value.Trim().Length > max || (required && string.IsNullOrWhiteSpace(value))) throw new ApiError(400, "Please check the form.");
        if (!string.IsNullOrEmpty(Website) || !Consent || !Guid.TryParse(SubmissionId, out _) || Code is null || (Code.Length > 0 && !Regex.IsMatch(Code, @"\A[A-Za-z0-9_-]{8,80}\z"))) throw new ApiError(400, "Please check the form.");
        if (!Regex.IsMatch(Email.Trim(), @"\A[^\s@]+@[^\s@]+\.[^\s@]+\z") || Regex.Replace(Phone, @"\D", "").Length is < 10 or > 15) throw new ApiError(400, "Please enter a valid email and phone number.");
    }
}
public sealed record LinkOpen(string Code, string EventId);
public sealed record StatusUpdate(string Status, string Etag);
public sealed record DoctorCreate(string Name);
public sealed record CardUpdate(bool Active, string Etag);
