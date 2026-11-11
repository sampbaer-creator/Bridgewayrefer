using BridgeWay.Api;
using Microsoft.Extensions.Configuration;
using Xunit;

public class ConfigurationCompatibilityTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void BundledConfigurationPreservesLegacyDeploymentValuesAndExplicitNewOverrides(bool useNewPrefix)
    {
        var values = new Dictionary<string, string?>
        {
            ["BridgeWay:PublicOrigin"] = "https://legacy.example",
            ["BridgeWay:AcceptReferrals"] = "true",
            ["BridgeWay:AlertsEnabled"] = "true"
        };
        if (useNewPrefix)
        {
            values["Bridgewayrefer:PublicOrigin"] = "https://bridgewayrefer.com";
            values["Bridgewayrefer:AcceptReferrals"] = "false";
        }
        var configuration = new ConfigurationBuilder()
            .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "api-appsettings.json"))
            .AddInMemoryCollection(values).Build();
        var settings = new Settings();
        configuration.GetSection("BridgeWay").Bind(settings);
        configuration.GetSection("Bridgewayrefer").Bind(settings);
        Assert.Equal(useNewPrefix ? "https://bridgewayrefer.com" : "https://legacy.example", settings.PublicOrigin);
        Assert.Equal(!useNewPrefix, settings.AcceptReferrals);
        Assert.True(settings.AlertsEnabled);
    }
}
