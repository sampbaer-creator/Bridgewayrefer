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
public sealed record TestReferralCreate(string CardCode, string SubmissionId);
public sealed record LinkOpen(string Code, string EventId);
public sealed record StatusUpdate(string Status, string Etag, string? NextActionAt = null, string? NextAction = null);
public sealed record CardUpdate(bool Active, string Etag);
public sealed record CustomerSignup(string Name, string? OfficeName = null, string? AlertEmail = null, string? Plan = null, string? Industry = null, string? Specialty = null)
{
    public void ValidateBusinessType()
    {
        var industry = Industry?.Trim() ?? "";
        var specialty = Specialty?.Trim() ?? "";
        // Older clients can omit both fields; new signups supply both.
        if (industry.Length == 0 && specialty.Length == 0) return;
        if (industry is not ("healthcare" or "trades" or "other") || specialty.Length is < 1 or > 120 || specialty.Any(char.IsControl))
            throw new ApiError(400, "Choose an industry and enter a business specialty, up to 120 characters.");
    }
}
public sealed record BillingCheckout(string? Plan = null);
public sealed record BusinessCreate(string Name, string AdminEmail, string? AlertEmail = null, bool BillingExempt = false);
public sealed record PartnerCreate(string Name);
public sealed record CardCreate(string? PartnerId = null, string? PartnerName = null, string? OfficeId = null, int Quantity = 1, string? Label = null);
public sealed record InvitationCreate(string Email, string Role);
public sealed record MemberStatusUpdate(bool Active, string Etag);
public sealed record InvitationCancel(string Etag);
public sealed record AssignmentUpdate(string? OwnerId, string? OwnerName, string Etag);
public sealed record DemoRequest(string Name, string Email, string BusinessName, string SubmissionId, bool Consent, string? Interest = null, int? NfcCardQuantity = null, string? Notes = null, string? Phone = null);
public sealed record BusinessProfileUpdate(string Name, string WelcomeText, string Phone, bool AcceptReferrals, string LogoUrl, string Etag, string? AlertEmail = null);
public sealed record AdminLogoUpload(string Etag, string? Image);
public sealed record AdminMemberUpdate(string Etag, string? Role, bool Revoke = false);
public sealed record AdminInvitationUpdate(string Etag, bool Replace = false);
public sealed record AdminStripeUpdate(bool? CancelAtPeriodEnd);
public sealed record AdminBusinessDelete(string Etag, string? Name);
public sealed record AdminBusinessUpdate(string Etag, bool? Suspended = null, bool? BillingExempt = null, string? AlertEmail = null, string? LogoUrl = null, bool? Archived = null, bool? AcceptReferrals = null, string? WelcomeText = null, string? Phone = null, string? PatientCardCode = null, PatientFormDesign? PatientForm = null);
public sealed record OfficeCreate(string Name);
public sealed record OfficeLogoUpdate(string? LogoUrl, string Etag);


public sealed record FollowUpUpdate(string? NextAction, string? NextActionAt, string Etag);



public sealed record PatientFormDesign(string? Template = null, string? Headline = null, string? Introduction = null,
    string? FormHeading = null, string? SubmitLabel = null, string? SuccessHeading = null, string? WebsiteUrl = null)
{
    internal static PatientFormDesign? Read(Newtonsoft.Json.Linq.JObject? business) =>
        (business?["patientForm"] as Newtonsoft.Json.Linq.JObject)?.ToObject<PatientFormDesign>();

    internal PatientFormDesign Validate()
    {
        var template = Template ?? "general";
        var website = Clean(WebsiteUrl, 2048);
        if (template is not ("general" or "consultation"))
            throw new ApiError(400, "Choose a patient form layout.");
        if (website is not null && (!Uri.TryCreate(website, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps || string.IsNullOrEmpty(uri.Host) || uri.UserInfo.Length != 0 || website.Contains('\\')))
            throw new ApiError(400, "Enter an HTTPS office website URL.");
        return new PatientFormDesign(template, Clean(Headline, 120), Clean(Introduction, 500),
            Clean(FormHeading, 100), Clean(SubmitLabel, 60), Clean(SuccessHeading, 120), website);
    }

    static string? Clean(string? value, int maxLength)
    {
        var cleaned = value?.Trim();
        if (cleaned?.Length > maxLength) throw new ApiError(400, "Shorten the patient form text and try again.");
        return string.IsNullOrEmpty(cleaned) ? null : cleaned;
    }
}
