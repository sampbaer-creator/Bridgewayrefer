using BridgeWay.Api;
using Xunit;

public class AlertWorkerSettingTests
{
    [Fact]
    public void AlertWorkerIsEnabledByDefaultSoExistingDeploymentsAreUnchanged()
    {
        Assert.True(new Settings().AlertWorkerEnabled);
    }

    [Fact]
    public void DisablingTheAlertWorkerDoesNotChangeSmtpConfigurationCheck()
    {
        var settings = new Settings { AlertsEnabled = true, SmtpUsername = "sender@example.invalid", SmtpPassword = "x", AlertWorkerEnabled = false };
        Assert.True(settings.SmtpConfigured);
    }
}
