using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json.Linq;
using MimeKit;

namespace BridgeWay.Api;

/// <summary>Sends approved Bridgewayrefer.com sender addresses through Cloudflare Email Sending.</summary>
public sealed class CloudflareEmailSender(IHttpClientFactory clients, Settings settings)
{
    public bool CanSend(MimeMessage message)
    {
        var address = message.From.Mailboxes.FirstOrDefault()?.Address;
        return settings.CloudflareEmailSendingConfigured && settings.IsCloudflareSender(address);
    }

    public async Task Send(MimeMessage message, CancellationToken ct)
    {
        var from = message.From.Mailboxes.FirstOrDefault()?.Address;
        if (from is null || !settings.IsCloudflareSender(from)) throw new IOException("The requested sender address is not configured.");
        var recipients = message.To.Mailboxes.Concat(message.Cc.Mailboxes).Concat(message.Bcc.Mailboxes)
            .Select(address => address.Address).Where(address => !string.IsNullOrWhiteSpace(address)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (recipients.Length == 0) throw new IOException("The email has no recipients.");

        await using var stream = new MemoryStream();
        await message.WriteToAsync(stream, ct);
        var payload = new JObject
        {
            ["from"] = from,
            ["recipients"] = new JArray(recipients),
            ["mime_message"] = Encoding.UTF8.GetString(stream.ToArray()),
        };
        using var request = new HttpRequestMessage(HttpMethod.Post,
            "https://api.cloudflare.com/client/v4/accounts/" + Uri.EscapeDataString(settings.CloudflareEmailSendingAccountId) + "/email/sending/send_raw");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.CloudflareEmailSendingApiToken);
        request.Content = new StringContent(payload.ToString(Newtonsoft.Json.Formatting.None), Encoding.UTF8, "application/json");
        using var response = await clients.CreateClient().SendAsync(request, ct);
        if (!response.IsSuccessStatusCode) throw new IOException("Cloudflare did not accept the email (HTTP " + (int)response.StatusCode + ").");
        var result = JObject.Parse(await response.Content.ReadAsStringAsync(ct));
        if (result.Value<bool?>("success") != true) throw new IOException("Cloudflare did not accept the email.");
    }
}

/// <summary>Uses Cloudflare for the configured branded addresses while preserving the existing Outlook sender for other mail.</summary>
public sealed class EmailDeliveryService(MicrosoftMailbox mailbox, CloudflareEmailSender cloudflare)
{
    public Task Send(MimeMessage message, CancellationToken ct) =>
        cloudflare.CanSend(message) ? cloudflare.Send(message, ct) : mailbox.Send(message, ct);
}
