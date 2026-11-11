using Newtonsoft.Json.Linq;

namespace BridgeWay.Api;

public static class TestReferralRules
{
    public static string Id(Guid submissionId) => "ref-test-" + submissionId;
    public static bool IsRepeat(JObject? existing) => existing?.Value<string>("type") == "referral" && existing.Value<bool?>("isTest") == true;
    public static bool IsCardForWorkspace(JObject? card, string businessId) =>
        card?.Value<bool>("active") == true && card.Value<string>("businessId") == businessId &&
        !string.IsNullOrWhiteSpace(card.Value<string>("partnerId")) && card.Value<string>("partnerId") != "direct" &&
        !string.IsNullOrWhiteSpace(card.Value<string>("officeId")) && card.Value<string>("officeId") != "default";

    public static (JObject Referral, JObject History) Create(CosmosStore store, JObject card, string actor, Guid submissionId)
    {
        var id = Id(submissionId);
        var now = DateTimeOffset.UtcNow.ToString("O");
        var referral = store.Document("referral", id);
        referral["isTest"] = true; referral["testKind"] = "activation"; referral["name"] = "BridgeWay test referral";
        referral["firstName"] = "BridgeWay"; referral["lastName"] = "Test"; referral["email"] = "test-referral@bridgeway.invalid"; referral["phone"] = "0000000000";
        referral["notes"] = "Synthetic activation check. No customer data."; referral["status"] = "New"; referral["updatedAt"] = now;
        referral["cardId"] = card.Value<string>("id"); referral["officeId"] = card.Value<string>("officeId") ?? "default"; referral["partnerId"] = card.Value<string>("partnerId") ?? "direct";
        referral["partnerName"] = card.Value<string>("resolvedPartnerName") ?? card.Value<string>("partnerName") ?? ""; referral["doctorCode"] = card.Value<string>("id"); referral["doctorName"] = card.Value<string>("resolvedOfficeName") ?? card.Value<string>("officeName") ?? "";
        var history = store.Document("status-history", "history-test-" + submissionId);
        history["isTest"] = true; history["referralId"] = id; history["status"] = "New"; history["actor"] = actor; history["changedAt"] = now;
        history["partnerId"] = referral["partnerId"]!.DeepClone(); history["officeId"] = referral["officeId"]!.DeepClone(); history["cardId"] = referral["cardId"]!.DeepClone();
        return (referral, history);
    }
}
