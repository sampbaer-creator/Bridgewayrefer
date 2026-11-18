using BridgeWay.Api;
using Xunit;

public class AuditReadinessTests
{
    [Fact]
    public void ReferralSearchAlwaysScopesTheSelectedBusinessAndBindsUserInput()
    {
        var query = ReferralSearch.Build("business-a", "' OR true --", "Scheduled", "partner-a", "2026-01-01", "2026-01-31", true);
        Assert.Contains("c.businessId = @business", query.QueryText);
        Assert.Contains("NOT IS_DEFINED(c.isTest)", query.QueryText);
        Assert.Contains("c.status NOT IN", query.QueryText);
        Assert.DoesNotContain("' OR true --", query.QueryText);
        Assert.DoesNotContain("TOP 501", query.QueryText);
        Assert.Equal("business-a", query.GetQueryParameters().Single(p => p.Name == "@business").Value);
        Assert.Equal("2026-02-01T00:00:00", query.GetQueryParameters().Single(p => p.Name == "@to").Value);
    }

    [Fact]
    public void ReferralAssigneeSearchBindsInputAndIncludesLegacyUnassignedRows()
    {
        var query = ReferralSearch.Build("business-a", null, null, null, null, null, false, "' OR true --");
        Assert.Contains("c.ownerId = @owner", query.QueryText);
        Assert.DoesNotContain("' OR true --", query.QueryText);
        Assert.Equal("' OR true --", query.GetQueryParameters().Single(p => p.Name == "@owner").Value);
        var unassigned = ReferralSearch.Build("business-a", null, null, null, null, null, false, "unassigned");
        Assert.Contains("NOT IS_DEFINED(c.ownerId)", unassigned.QueryText);
        Assert.Contains("IS_NULL(c.ownerId)", unassigned.QueryText);
        Assert.Contains("c.ownerId = ''", unassigned.QueryText);
        Assert.Throws<ApiError>(() => ReferralSearch.Build("business-a", null, null, null, null, null, false, new string('x', 81)));
    }

    [Theory]
    [InlineData("2026-13-01", "2026-12-01")]
    [InlineData("2026-12-01", "2026-11-01")]
    [InlineData("bad", null)]
    public void ReferralSearchRejectsInvalidOrReversedDateRanges(string from, string? to)
    {
        Assert.Throws<ApiError>(() => ReferralSearch.Build("business-a", null, null, null, from, to, false));
    }

    [Fact]
    public void FollowUpDatesRequireAnOffsetAndNormalizeToUtc()
    {
        Assert.Equal("2026-11-10T20:30:00.0000000+00:00", FollowUpRules.ValidateDueAt("2026-11-10T13:30:00-07:00"));
        Assert.Null(FollowUpRules.ValidateDueAt(""));
        Assert.Throws<ApiError>(() => FollowUpRules.ValidateDueAt("2026-11-10T13:30"));
        Assert.True(FollowUpRules.Terminal("Completed"));
        Assert.False(FollowUpRules.Terminal("Scheduled"));
    }
}
