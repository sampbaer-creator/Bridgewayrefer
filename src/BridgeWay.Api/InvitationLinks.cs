using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

public static class InvitationLinks
{
    public sealed record Redemption(string? Workspace, string? Token);

    public static string? DocumentId(string? token) =>
        token is not null && Regex.IsMatch(token, @"\A[0-9a-f]{64}\z")
            ? "invite-" + Convert.ToHexString(SHA256.HashData(Encoding.ASCII.GetBytes(token))).ToLowerInvariant()
            : null;

    public static (JObject Document, string Url) Create(CosmosStore store, Settings settings, string email, string role, string actor, int days)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var invite = store.Document("membership-invite", DocumentId(token)!);
        invite["email"] = email;
        invite["role"] = role;
        invite["state"] = "Pending";
        invite["expiresAt"] = DateTimeOffset.UtcNow.AddDays(days).ToString("O");
        invite["createdBy"] = actor;
        return (invite, settings.PublicOrigin + "/staff#invite=" + token + "&workspace=" + Uri.EscapeDataString(store.BusinessId));
    }

    public static async Task<IResult> Accept(Redemption data, HttpContext ctx, CosmosStore store, Settings settings, CancellationToken ct)
    {
        if (ctx.User.Identity?.IsAuthenticated != true) throw new ApiError(401, "Sign in to accept this invitation.");
        var oid = ctx.User.FindFirstValue("oid");
        var tenant = ctx.User.FindFirstValue("tid");
        if (string.IsNullOrWhiteSpace(oid) || string.IsNullOrWhiteSpace(tenant) || !settings.AcceptsStaffTenant(tenant))
            throw new ApiError(403, "Access denied.");

        var businessId = data.Workspace;
        var id = DocumentId(data.Token);
        if (id is null || businessId is null || !Regex.IsMatch(businessId, @"\A[A-Za-z0-9_-]{1,80}\z"))
            throw new ApiError(400, "This invitation link is invalid.");

        var email = (ctx.User.FindFirstValue("email") ?? ctx.User.FindFirstValue("preferred_username") ?? "").Trim().ToLowerInvariant();
        if (email.Length == 0 || (tenant == Settings.GoogleTenant && ctx.User.FindFirstValue("bridgeway_google_email_authoritative") != "true"))
            throw new ApiError(403, "Sign in with the account that received this invitation.");

        store.UseBusiness(businessId);
        var invite = await store.Read(id, ct);
        if (!TenantAuthorization.IsValidInvite(invite, businessId, email, DateTimeOffset.UtcNow))
            throw new ApiError(403, "This invitation is unavailable or was sent to another account.");

        var business = await store.Business(businessId, ct) ?? throw new ApiError(403, "This workspace is unavailable.");
        if (BusinessRules.IsArchived(business)) throw new ApiError(403, "This workspace is unavailable.");
        var memberId = CosmosStore.MembershipId(tenant, oid);
        var existing = await store.Read(memberId, ct);
        var batch = store.Operations.CreateTransactionalBatch(store.BusinessKey);
        if (!TenantAuthorization.IsActiveMembershipFor(existing, businessId, tenant, oid))
        {
            var member = store.Membership(businessId, tenant, oid, email, invite!.Value<string>("role")!, businessName: business.Value<string>("name") ?? businessId);
            if (existing is null) batch.CreateItem(member);
            else throw new ApiError(403, "This membership was revoked. Contact your workspace administrator.");
        }
        else
        {
            // Prevent a concurrent revocation from consuming an invite without granting access.
            batch.ReplaceItem(memberId, existing!, new TransactionalBatchItemRequestOptions { IfMatchEtag = existing!.Value<string>("_etag") });
        }

        invite!["state"] = "Accepted";
        invite["acceptedAt"] = DateTimeOffset.UtcNow.ToString("O");
        invite["acceptedBy"] = oid;
        invite["acceptedByTenant"] = tenant;
        using var result = await batch
            .ReplaceItem(id, invite, new TransactionalBatchItemRequestOptions { IfMatchEtag = invite.Value<string>("_etag") })
            .CreateItem(store.Audit(oid, "accept-invitation", id))
            .ExecuteAsync(ct);
        if (result.Any(item => item.StatusCode is HttpStatusCode.PreconditionFailed or HttpStatusCode.Conflict))
            throw new ApiError(409, "The invitation or membership changed. Open the workspace or try the link again.");
        CosmosStore.Check(result);
        return Results.Ok(new { businessId });
    }
}
