using System.Text.RegularExpressions;
namespace BridgeWay.Api;
public sealed record Submission(string FirstName = "", string LastName = "", string Email = "", string Phone = "", string Notes = "", bool Consent = false, string Code = "", string SubmissionId = "", string Website = "", string ServiceType = "", string PostalCode = "")
{
    public static readonly string[] Statuses = ["New", "Contacted", "Scheduled", "Completed", "Quoted", "Won", "Closed"];
    public void Validate()
    {
        if (FirstName is null || LastName is null || Email is null || Phone is null || Notes is null) throw new ApiError(400, "Please check the form.");
        foreach (var (value, max, required) in new[] { (FirstName, 80, true), (LastName, 100, true), (Email, 254, true), (Phone, 40, true), (Notes, 2000, false) })
            if (value is null || value.Trim().Length > max || (required && string.IsNullOrWhiteSpace(value))) throw new ApiError(400, "Please check the form.");
        if (!string.IsNullOrEmpty(Website) || !Consent || !Guid.TryParse(SubmissionId, out _) || Code is null || (Code.Length > 0 && !Regex.IsMatch(Code, @"\A[A-Za-z0-9_-]{8,80}\z"))) throw new ApiError(400, "Please check the form.");
        if (!Regex.IsMatch(Email.Trim(), @"\A[^\s@]+@[^\s@]+\.[^\s@]+\z") || Regex.Replace(Phone, @"\D", "").Length is < 10 or > 15) throw new ApiError(400, "Please enter a valid email and phone number.");
        if (ServiceType is null || PostalCode is null || ServiceType.Length > 80 || PostalCode.Length > 20) throw new ApiError(400, "Please check the form.");
    }
}
public sealed record LinkOpen(string Code, string EventId);
public sealed record StatusUpdate(string Status, string Etag);
public sealed record DoctorCreate(string Name);
public sealed record CardUpdate(bool Active, string Etag);
public sealed record BusinessCreate(string Name, string Preset, bool TestFixture = false);
public sealed record PartnerCreate(string Name);
public sealed record CardCreate(string PartnerId, string OfficeId = "");
public sealed record InvitationCreate(string Email, string Role);
public sealed record MemberStatusUpdate(bool Active, string Etag);
public sealed record InvitationCancel(string Etag);
public sealed record AssignmentUpdate(string? OwnerId, string? OwnerName, string Etag);
public sealed record DemoRequest(string Name, string Email, string BusinessName, string SubmissionId, bool Consent);
public sealed record BusinessProfileUpdate(string Name, string Preset, string WelcomeText, string Phone, bool AcceptReferrals, string LogoUrl, string Etag);
public sealed record OfficeCreate(string Name);
