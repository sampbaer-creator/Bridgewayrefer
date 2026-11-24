using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

/// <summary>Persist these messages in the same partition and transaction as the request.</summary>
public static class WalkthroughEmails
{
    public static IEnumerable<JObject> Create(CosmosStore store, Settings settings, string id, string name, string email, string businessName, string? phone, string? notes)
    {
        var receipt = AlertWorker.NewAlert(store, id + "-receipt");
        receipt["recipient"] = email.ToLowerInvariant();
        receipt["subject"] = "We received your BridgeWay walkthrough request";
        receipt["body"] = "Hi " + name + ",\n\nThank you for your interest in BridgeWay Refer! We have received your walkthrough request for " + businessName + ". Our team will be in touch soon to learn more about your needs and arrange a convenient time to show you around.\n\nWe look forward to connecting!\nThe BridgeWay Refer Team";
        receipt["ttl"] = 7776000;
        yield return receipt;
        foreach (var recipient in settings.WalkthroughNotifyEmails.Select(r => r.Trim()).Where(Endpoints.ValidEmail).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var notice = AlertWorker.NewAlert(store, id + "-notice-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(recipient.ToLowerInvariant()))));
            notice["recipient"] = recipient; notice["replyTo"] = email;
            notice["subject"] = "New walkthrough request - " + businessName;
            notice["body"] = "Name: " + name + "\nBusiness: " + businessName + "\nEmail: " + email + "\nPhone: " + phone + "\nNotes: " + notes + "\n\nView requests: " + settings.PublicOrigin + "/admin";
            notice["ttl"] = 7776000;
            yield return notice;
        }
    }
}
