using System.Security.Claims;

namespace BridgeWay.Api;

/// <summary>Who is signed in, for display in the account menu. Never used for authorization.</summary>
public static class AccountIdentity
{
    public static object From(ClaimsPrincipal user)
    {
        var email = user.FindFirstValue("email") ?? user.FindFirstValue("preferred_username") ?? "";
        var name = user.FindFirstValue("name") ?? "";
        if (name.Length > 120) name = name[..120];
        var provider = user.FindFirstValue("tid") == Settings.GoogleTenant ? "Google" : "Microsoft";
        return new { email, name, provider };
    }
}
