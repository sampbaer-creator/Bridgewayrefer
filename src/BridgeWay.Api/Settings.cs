namespace BridgeWay.Api;

public sealed class Settings
{
    /// <summary>Optional. Only used by the offline --import command to choose the target business.</summary>
    public string BusinessId { get; set; } = "";
    public string PublicOrigin { get; set; } = "http://localhost:3000";
    /// <summary>Global intake kill switch. When false, no business accepts referrals.</summary>
    public bool AcceptReferrals { get; set; }
    public string TenantId { get; set; } = "";
    /// <summary>
    /// OIDC authority. Defaults to the workforce tenant. For customer staff who are not in your Entra tenant,
    /// use an Entra External ID tenant: https://YOURTENANT.ciamlogin.com/TENANT-ID/v2.0
    /// </summary>
    public string Authority { get; set; } = "";
    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    /// <summary>Entra object IDs allowed into the platform admin console (/admin).</summary>
    public string[] PlatformAdminObjectIds { get; set; } = [];
    public bool AlertsEnabled { get; set; }
    public string SmtpHost { get; set; } = "smtp.gmail.com";
    public int SmtpPort { get; set; } = 465;
    public string SmtpUsername { get; set; } = "";
    public string SmtpPassword { get; set; } = "";
    public string StripeSecretKey { get; set; } = "";
    public string StripePriceId { get; set; } = "";
    public string StripeWebhookSecret { get; set; } = "";
    public string StripeContext { get; set; } = "";
    public string StripeApiVersion { get; set; } = "";
    public int MonthlyPriceUsd { get; set; } = 50;
    public bool StripeConfigured => StripeSecretKey.Length > 0 && StripePriceId.StartsWith("price_", StringComparison.Ordinal) && StripeWebhookSecret.StartsWith("whsec_", StringComparison.Ordinal);
    public bool IdentityConfigured => TenantId.Length > 0 && ClientId.Length > 0 && ClientSecret.Length > 0;
    public bool SmtpConfigured => AlertsEnabled && SmtpUsername.Length > 0 && SmtpPassword.Length > 0;
    public bool IsPlatformAdmin(string? tenantId, string? oid) =>
        !string.IsNullOrWhiteSpace(oid) && string.Equals(tenantId, TenantId, StringComparison.OrdinalIgnoreCase) &&
        PlatformAdminObjectIds.Contains(oid, StringComparer.OrdinalIgnoreCase);
}

public sealed class ApiError(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

public static class BusinessRules
{
    public static readonly string[] PaidStatuses = ["active", "trialing", "past_due"];

    /// <summary>
    /// A business takes referrals only when the platform kill switch is on, the business has intake enabled,
    /// the platform admin has not suspended it, and it either has a paid subscription or was marked billing-exempt.
    /// </summary>
    public static bool AcceptsReferrals(Settings settings, Newtonsoft.Json.Linq.JObject? business) =>
        settings.AcceptReferrals && business is not null &&
        business.Value<bool?>("acceptReferrals") == true &&
        business.Value<bool?>("suspended") != true &&
        (business.Value<bool?>("billingExempt") == true || PaidStatuses.Contains(business.Value<string>("billingStatus")));

    public static string AlertEmail(Settings settings, Newtonsoft.Json.Linq.JObject? business) =>
        settings.SmtpConfigured ? business?.Value<string>("alertEmail")?.Trim() ?? "" : "";
}
