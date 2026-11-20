using System.Security.Claims;
using System.Text.Json;
using BridgeWay.Api;
using Xunit;

public class AccountIdentityTests
{
    static JsonElement Identity(params Claim[] claims) =>
        JsonSerializer.SerializeToElement(AccountIdentity.From(new ClaimsPrincipal(new ClaimsIdentity(claims, "test"))));

    [Fact]
    public void MicrosoftSignInReportsNameEmailAndProvider()
    {
        var id = Identity(new Claim("tid", "tenant-a"), new Claim("name", "Sam Baer"), new Claim("preferred_username", "sam@example.com"));
        Assert.Equal("Sam Baer", id.GetProperty("name").GetString());
        Assert.Equal("sam@example.com", id.GetProperty("email").GetString());
        Assert.Equal("Microsoft", id.GetProperty("provider").GetString());
    }

    [Fact]
    public void GoogleSignInIsLabelledGoogleAndPrefersEmailClaim()
    {
        var id = Identity(new Claim("tid", "google"), new Claim("email", "a@gmail.com"), new Claim("preferred_username", "other"));
        Assert.Equal("a@gmail.com", id.GetProperty("email").GetString());
        Assert.Equal("Google", id.GetProperty("provider").GetString());
        Assert.Equal("", id.GetProperty("name").GetString());
    }

    [Fact]
    public void LongDisplayNamesAreTrimmed()
    {
        var id = Identity(new Claim("tid", "t"), new Claim("name", new string('x', 500)));
        Assert.Equal(120, id.GetProperty("name").GetString()!.Length);
    }
}
