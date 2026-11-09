namespace BridgeWay.Api;

public sealed class Settings
{
    public string BusinessId { get; set; } = "demo-business";
    public string OfficeName { get; set; } = "West Office Demo";
    public string PublicOrigin { get; set; } = "http://localhost:3000";
    public bool AcceptReferrals { get; set; }
    public bool LocalDemoStaff { get; set; }
    public string TenantId { get; set; } = "";
    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    public string[] StaffObjectIds { get; set; } = [];
    public bool AlertsEnabled { get; set; }
    public string AlertRecipient { get; set; } = "";
    public string SmtpHost { get; set; } = "smtp.gmail.com";
    public int SmtpPort { get; set; } = 465;
    public string SmtpUsername { get; set; } = "";
    public string SmtpPassword { get; set; } = "";
    public bool IdentityConfigured => TenantId.Length > 0 && ClientId.Length > 0 && ClientSecret.Length > 0 && StaffObjectIds.Length > 0;
    public bool AlertsConfigured => AlertsEnabled && AlertRecipient.Length > 0 && SmtpUsername.Length > 0 && SmtpPassword.Length > 0;
}

public sealed class ApiError(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}
