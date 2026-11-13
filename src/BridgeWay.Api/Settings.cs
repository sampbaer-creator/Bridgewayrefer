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
    public bool CustomerSignupEnabled { get; set; }
    public bool AlertsEnabled { get; set; }
    /// <summary>
    /// Set to false on candidate or rollback API revisions so only one revision sends alerts during a rollout.
    /// Defaults to true so existing deployments are unchanged.
    /// </summary>
    public bool AlertWorkerEnabled { get; set; } = true;
    public string SmtpHost { get; set; } = "smtp.gmail.com";
    public int SmtpPort { get; set; } = 465;
    public string SmtpUsername { get; set; } = "";
    public string SmtpPassword { get; set; } = "";
    public string StripeSecretKey { get; set; } = "";
    public string StripePriceId { get; set; } = "";
    /// <summary>Optional second recurring Stripe Price for the $400/month Managed Calling plan.</summary>
    public string ManagedCallingStripePriceId { get; set; } = "";
    public string StripeWebhookSecret { get; set; } = "";
    public string StripeContext { get; set; } = "";
    public string StripeApiVersion { get; set; } = "";
    public int MonthlyPriceUsd { get; set; } = 50;
    public bool StripeConfigured => StripeSecretKey.Length > 0 && StripePriceId.StartsWith("price_", StringComparison.Ordinal) && StripeWebhookSecret.StartsWith("whsec_", StringComparison.Ordinal);
    public bool ManagedCallingConfigured => ManagedCallingStripePriceId.StartsWith("price_", StringComparison.Ordinal);
    public string StripePriceFor(string plan) => plan switch
    {
        BillingPlans.Workspace => StripePriceId,
        BillingPlans.ManagedCalling when ManagedCallingConfigured => ManagedCallingStripePriceId,
        BillingPlans.ManagedCalling => throw new ApiError(503, "Managed Calling checkout is not configured yet. Contact Bridgewayrefer."),
        _ => throw new ApiError(400, "Choose a valid monthly plan."),
    };
    public int MonthlyPriceFor(string plan) => plan switch
    {
        BillingPlans.Workspace => MonthlyPriceUsd,
        BillingPlans.ManagedCalling => BillingPlans.ManagedCallingMonthlyPriceUsd,
        _ => throw new ApiError(400, "Choose a valid monthly plan."),
    };
    public string? PlanForPrice(string? priceId) =>
        priceId == StripePriceId ? BillingPlans.Workspace :
        ManagedCallingConfigured && priceId == ManagedCallingStripePriceId ? BillingPlans.ManagedCalling : null;
    public bool IdentityConfigured => TenantId.Length > 0 && ClientId.Length > 0 && ClientSecret.Length > 0;
    public bool SmtpConfigured => AlertsEnabled && SmtpUsername.Length > 0 && SmtpPassword.Length > 0;
    public bool IsPlatformAdmin(string? tenantId, string? oid) =>
        !string.IsNullOrWhiteSpace(oid) && string.Equals(tenantId, TenantId, StringComparison.OrdinalIgnoreCase) &&
        PlatformAdminObjectIds.Contains(oid, StringComparer.OrdinalIgnoreCase);
    /// <summary>When true, any Microsoft Entra tenant (and personal Microsoft accounts) may sign in. Access still requires an active membership keyed by tenant and object ID.</summary>
    public bool MultiTenantSignIn { get; set; }
    public bool AcceptsTenant(string? tenantId) =>
        !string.IsNullOrWhiteSpace(tenantId) && (MultiTenantSignIn
            ? System.Text.RegularExpressions.Regex.IsMatch(tenantId, @"\A[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\z")
            : string.Equals(tenantId, TenantId, StringComparison.OrdinalIgnoreCase));
    public string EffectiveAuthority => Authority.Length > 0 ? Authority
        : MultiTenantSignIn ? "https://login.microsoftonline.com/common/v2.0"
        : $"https://login.microsoftonline.com/{TenantId}/v2.0";
}

public static class BillingPlans
{
    public const string Workspace = "workspace";
    public const string ManagedCalling = "managed-calling";
    public const int ManagedCallingMonthlyPriceUsd = 400;
    /// <summary>Free trial length for self-serve customer signups. Checkout still collects a card up front.</summary>
    public const int SignupTrialDays = 15;
    public static bool MatchesCheckout(string? savedPlan, string requestedPlan) => Normalize(savedPlan) == Normalize(requestedPlan);
    public static string Normalize(string? plan) => string.IsNullOrWhiteSpace(plan) || plan == Workspace ? Workspace
        : plan == ManagedCalling ? ManagedCalling
        : throw new ApiError(400, "Choose a valid monthly plan.");
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

    public static bool SignupPending(Newtonsoft.Json.Linq.JObject? business) =>
        business?.Value<bool?>("customerSignup") == true && business.Value<bool?>("signupCompleted") != true;

    public static string AlertEmail(Settings settings, Newtonsoft.Json.Linq.JObject? business) =>
        settings.SmtpConfigured ? business?.Value<string>("alertEmail")?.Trim() ?? "" : "";
}
