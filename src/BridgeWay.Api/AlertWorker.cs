using System.Net;
using System.Security.Cryptography;
using System.Text;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Azure.Cosmos;
using MimeKit;
using Newtonsoft.Json.Linq;
namespace BridgeWay.Api;

public sealed class AlertWorker(IServiceScopeFactory scopes, Settings settings, ILogger<AlertWorker> logger) : BackgroundService
{
    public static JObject NewAlert(CosmosStore store, string id)
    {
        var doc = store.Document("alert", id); doc["state"] = "Pending"; doc["readyAt"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(); doc["attempts"] = 0; return doc;
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var businesses = settings.AlertRecipients.Keys.Append(settings.BusinessId).Distinct()
            .Where(settings.AlertsConfiguredFor).ToArray();
        while (!stoppingToken.IsCancellationRequested)
        {
            foreach (var businessId in businesses)
            {
                if (stoppingToken.IsCancellationRequested) break;
                try { await SendPending(businessId, stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                catch { logger.LogWarning("Email worker paused for a workspace; sensitive details suppressed."); }
            }
            try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }
    async Task SendPending(string businessId, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var store = scope.ServiceProvider.GetRequiredService<CosmosStore>();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var partitionKey = new PartitionKey(businessId);
        var recipient = settings.AlertRecipientFor(businessId);
        var candidates = await store.DueAlerts(businessId, now, ct);
        foreach (var doc in candidates)
        {
            var id = doc.Value<string>("id")!;
            doc["state"] = "Sending"; doc["readyAt"] = now + 300; doc["attempts"] = doc.Value<int>("attempts") + 1;
            ItemResponse<JObject> claim;
            try { claim = await store.Operations.ReplaceItemAsync(doc, id, partitionKey, new ItemRequestOptions { IfMatchEtag = doc.Value<string>("_etag") }, ct); }
            catch (CosmosException e) when (e.StatusCode is HttpStatusCode.PreconditionFailed or HttpStatusCode.NotFound) { continue; }
            try
            {
                var message = new MimeMessage(); message.From.Add(MailboxAddress.Parse(settings.SmtpUsername)); message.To.Add(MailboxAddress.Parse(recipient));
                message.Subject = "New referral received - BridgeWay";
                message.MessageId = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(businessId + ":" + id))) + "@" + new Uri(settings.PublicOrigin).Host;
                message.Body = new TextPart("plain") { Text = "A new referral is waiting in your secure office dashboard.\n\nSign in to review it:\n" + settings.PublicOrigin + "/staff/login\n\nPatient details are available only in the dashboard." };
                using var smtp = new SmtpClient { Timeout = 20000 };
                await smtp.ConnectAsync(settings.SmtpHost, settings.SmtpPort, settings.SmtpPort == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls, ct);
                await smtp.AuthenticateAsync(settings.SmtpUsername, settings.SmtpPassword, ct);
                await smtp.SendAsync(message, ct); await smtp.DisconnectAsync(true, ct);
                doc["state"] = "Accepted"; doc["acceptedAt"] = DateTimeOffset.UtcNow.ToString("O"); doc["readyAt"] = 0;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch
            {
                logger.LogWarning("Email retry scheduled; sensitive details suppressed.");
                doc["state"] = "Retry"; doc["readyAt"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + Math.Min(3600, 60 * (1 << Math.Min(doc.Value<int>("attempts") - 1, 6)));
            }
            try { await store.Operations.ReplaceItemAsync(doc, id, partitionKey, new ItemRequestOptions { IfMatchEtag = claim.ETag }, ct); }
            catch (CosmosException e) when (e.StatusCode is HttpStatusCode.PreconditionFailed or HttpStatusCode.NotFound) { }
        }
    }
}
