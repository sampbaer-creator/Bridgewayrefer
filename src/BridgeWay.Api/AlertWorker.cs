using System.Net;
using System.Security.Cryptography;
using System.Text;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Azure.Cosmos;
using MimeKit;
using Newtonsoft.Json.Linq;
namespace BridgeWay.Api;

public sealed class AlertWorker(IServiceScopeFactory scopes, Settings settings, ILogger<AlertWorker> logger, MicrosoftMailbox mailbox) : BackgroundService
{
    public const int MaximumAttempts = 8;

    public static (string State, long ReadyAt) FailureDisposition(int attempts, long now)
    {
        if (attempts >= MaximumAttempts) return ("Failed", 0);
        return ("Retry", now + Math.Min(3600, 60 * (1L << Math.Clamp(attempts - 1, 0, 6))));
    }

    public static JObject NewAlert(CosmosStore store, string id)
    {
        var doc = store.Document("alert", id); doc["state"] = "Pending"; doc["readyAt"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(); doc["attempts"] = 0; return doc;
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            // Re-read each pass so a business configured in the admin console starts receiving alerts without a restart.
            var businesses = Array.Empty<(string Id, string Recipient)>();
            if (settings.AlertWorkerEnabled && settings.SmtpConfigured)
            {
                try
                {
                    await using var scope = scopes.CreateAsyncScope();
                    businesses = (await scope.ServiceProvider.GetRequiredService<CosmosStore>().AllBusinesses(stoppingToken))
                        .Where(b => BusinessRules.BillingModeMatches(settings, b))
                        .Select(b => (Id: b.Value<string>("businessId") ?? "", Recipient: BusinessRules.AlertEmail(settings, b)))
                        .Where(b => b.Id.Length > 0 && b.Recipient.Length > 0).ToArray();
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                catch { logger.LogWarning("Email worker could not list workspaces; will retry."); }
            }
            if (settings.AlertWorkerEnabled && settings.SmtpConfigured)
            {
                try { await SendPending(CosmosStore.PlatformPartition, "", stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                catch { logger.LogWarning("Walkthrough email queue paused; will retry."); }
            }
            foreach (var (businessId, recipient) in businesses)
            {
                if (stoppingToken.IsCancellationRequested) break;
                try { await SendPending(businessId, recipient, stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                catch { logger.LogWarning("Email worker paused for a workspace; sensitive details suppressed."); }
            }
            try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }
    async Task SendPending(string businessId, string recipient, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var store = scope.ServiceProvider.GetRequiredService<CosmosStore>();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var partitionKey = new PartitionKey(businessId);
        var candidates = await store.DueAlerts(businessId, now, ct);
        foreach (var doc in candidates)
        {
            var id = doc.Value<string>("id")!;
            doc["sendingRevision"] = Environment.GetEnvironmentVariable("CONTAINER_APP_REVISION") ?? "local"; doc["sendingAt"] = DateTimeOffset.UtcNow.ToString("O");
            doc["state"] = "Sending"; doc["readyAt"] = now + 300; doc["attempts"] = doc.Value<int>("attempts") + 1;
            ItemResponse<JObject> claim;
            try { claim = await store.Operations.ReplaceItemAsync(doc, id, partitionKey, new ItemRequestOptions { IfMatchEtag = doc.Value<string>("_etag") }, ct); }
            catch (CosmosException e) when (e.StatusCode is HttpStatusCode.PreconditionFailed or HttpStatusCode.NotFound) { continue; }
            try
            {
                var message = new MimeMessage(); message.From.Add(MailboxAddress.Parse(settings.SmtpUsername)); message.To.Add(MailboxAddress.Parse(doc.Value<string>("recipient") ?? recipient));
                message.Subject = "New referral received - Bridgewayrefer";
                message.MessageId = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(businessId + ":" + id))) + "@" + new Uri(settings.PublicOrigin).Host;
                message.Body = new TextPart("plain") { Text = "A new referral is waiting in your secure office dashboard.\n\nSign in to review it:\n" + settings.PublicOrigin + "/sign-in\n\nPatient details are available only in the dashboard." };
                if (businessId == CosmosStore.PlatformPartition)
                {
                    message.Subject = doc.Value<string>("subject")!;
                    message.Body = new TextPart("plain") { Text = doc.Value<string>("body")! };
                    if (doc.Value<string>("replyTo") is string replyTo) message.ReplyTo.Add(MailboxAddress.Parse(replyTo));
                }
                await mailbox.Send(message, ct);
                doc["state"] = "Accepted"; doc["acceptedAt"] = DateTimeOffset.UtcNow.ToString("O"); doc["readyAt"] = 0;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception error)
            {
                doc["lastFailureKind"] = error.GetType().Name; doc["lastFailureAt"] = DateTimeOffset.UtcNow.ToString("O");
                var disposition = FailureDisposition(doc.Value<int>("attempts"), DateTimeOffset.UtcNow.ToUnixTimeSeconds());
                logger.LogWarning("Email delivery failed ({State}); sensitive details suppressed.", disposition.State);
                doc["state"] = disposition.State; doc["readyAt"] = disposition.ReadyAt;
            }
            // Delivery is at-least-once: retry the final write briefly so a transient Cosmos error after SMTP acceptance does not cause a re-send.
            for (var write = 0; write < 3; write++)
            {
                try { await store.Operations.ReplaceItemAsync(doc, id, partitionKey, new ItemRequestOptions { IfMatchEtag = claim.ETag }, ct); break; }
                catch (CosmosException e) when (e.StatusCode is HttpStatusCode.PreconditionFailed or HttpStatusCode.NotFound) { break; }
                catch (CosmosException) when (write < 2) { await Task.Delay(TimeSpan.FromSeconds(1 << write), ct); }
                catch (CosmosException) { logger.LogWarning("Email state write failed after delivery; the alert may be re-sent."); }
            }
        }
    }
    internal static async Task SendSmtp(Settings settings, MimeMessage message, CancellationToken ct)
    {
        using var smtp = new SmtpClient { Timeout = 20000 };
        await smtp.ConnectAsync(settings.SmtpHost, settings.SmtpPort, settings.SmtpPort == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls, ct);
        await smtp.AuthenticateAsync(settings.SmtpUsername, settings.SmtpPassword, ct);
        await smtp.SendAsync(message, ct); await smtp.DisconnectAsync(true, ct);
    }
}
