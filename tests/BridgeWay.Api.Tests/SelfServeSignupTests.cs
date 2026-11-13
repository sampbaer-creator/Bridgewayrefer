using BridgeWay.Api;
using Xunit;

public class SelfServeSignupTests
{
    const string WorkforceTenant = "2350d410-ab62-411c-8137-fb736f39c181";
    const string CustomerTenant = "11111111-2222-3333-4444-555555555555";

    static Settings Config(bool multiTenant) => new()
    {
        TenantId = WorkforceTenant,
        MultiTenantSignIn = multiTenant,
    };

    [Fact]
    public void SingleTenantModeAcceptsOnlyTheWorkforceTenant()
    {
        var settings = Config(multiTenant: false);
        Assert.True(settings.AcceptsTenant(WorkforceTenant));
        Assert.False(settings.AcceptsTenant(CustomerTenant));
        Assert.False(settings.AcceptsTenant(""));
        Assert.False(settings.AcceptsTenant(null));
    }

    [Fact]
    public void MultiTenantModeAcceptsAnyTenantGuidButNotMalformedValues()
    {
        var settings = Config(multiTenant: true);
        Assert.True(settings.AcceptsTenant(WorkforceTenant));
        Assert.True(settings.AcceptsTenant(CustomerTenant));
        Assert.True(settings.AcceptsTenant("9188040d-6c67-4c5b-b112-36a304b66dad")); // personal Microsoft accounts
        Assert.False(settings.AcceptsTenant("not-a-tenant"));
        Assert.False(settings.AcceptsTenant("11111111-2222-3333-4444-555555555555/../x"));
        Assert.False(settings.AcceptsTenant(null));
    }

    [Fact]
    public void AuthorityDefaultsToCommonOnlyInMultiTenantMode()
    {
        Assert.Equal($"https://login.microsoftonline.com/{WorkforceTenant}/v2.0", Config(false).EffectiveAuthority);
        Assert.Equal("https://login.microsoftonline.com/common/v2.0", Config(true).EffectiveAuthority);
    }

    [Fact]
    public void ExplicitAuthorityOverridesTheDefault()
    {
        var settings = Config(multiTenant: true);
        settings.Authority = "https://example.ciamlogin.com/custom/v2.0";
        Assert.Equal("https://example.ciamlogin.com/custom/v2.0", settings.EffectiveAuthority);
    }

    [Fact]
    public void SignupTrialIsFifteenDays()
    {
        Assert.Equal(15, BillingPlans.SignupTrialDays);
    }
}
