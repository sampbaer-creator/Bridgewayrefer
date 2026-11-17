using System.Security.Claims;
using BridgeWay.Api;
using Xunit;

public class GoogleAdminTests
{
    [Theory]
    [InlineData("google", "bridgewayrefer@gmail.com", "true", true)]
    [InlineData("google", "BRIDGEWAYREFER@gmail.com", "true", true)]
    [InlineData("google", "someone@gmail.com", "true", false)]
    [InlineData("google", "bridgewayrefer@gmail.com", "false", false)]
    [InlineData("other", "bridgewayrefer@gmail.com", "true", false)]
    public void GoogleAdminRequiresAuthoritativeAllowedIdentity(string tenant, string email, string authoritative, bool allowed)
    {
        var settings = new Settings { PlatformAdminGoogleEmails = ["bridgewayrefer@gmail.com"] };
        var claims = new[] { new Claim("tid", tenant), new Claim("email", email), new Claim("bridgeway_google_email_authoritative", authoritative) };
        Assert.Equal(allowed, settings.IsPlatformAdmin(new ClaimsPrincipal(new ClaimsIdentity(claims, "Google"))));
        Assert.False(settings.IsPlatformAdmin(new ClaimsPrincipal(new ClaimsIdentity(claims))));
    }
}
