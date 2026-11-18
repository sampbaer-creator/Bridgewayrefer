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
        var query = ReferralSearch.Build("business-a", null, null, null, null, null, false, owner: "' OR true --");
        Assert.Contains("c.ownerId = @owner", query.QueryText);
        Assert.DoesNotContain("' OR true --", query.QueryText);
        Assert.Equal("' OR true --", query.GetQueryParameters().Single(p => p.Name == "@owner").Value);
        var unassigned = ReferralSearch.Build("business-a", null, null, null, null, null, false, owner: "unassigned");
        Assert.Contains("NOT IS_DEFINED(c.ownerId)", unassigned.QueryText);
        Assert.Contains("IS_NULL(c.ownerId)", unassigned.QueryText);
        Assert.Contains("c.ownerId = ''", unassigned.QueryText);
        Assert.Throws<ApiError>(() => ReferralSearch.Build("business-a", null, null, null, null, null, false, owner: new string('x', 81)));
    }

    [Fact]
    public void ReferralCountsIgnoreStatusAndShareTheListFilters()
    {
        var now = new DateTimeOffset(2026, 11, 18, 12, 0, 0, TimeSpan.Zero);
        var counts = ReferralSearch.BuildStatusCounts("business-a", "' OR true --", "partner-a", null, null, true, true, now, owner: "staff-a");
        Assert.Contains("c.ownerId = @owner", counts.QueryText);
        Assert.Contains("GROUP BY c.status", counts.QueryText);
        Assert.Equal("staff-a", counts.GetQueryParameters().Single(p => p.Name == "@owner").Value);
        Assert.DoesNotContain("@status", counts.QueryText);
        Assert.DoesNotContain("' OR true --", counts.QueryText);
        Assert.Contains("c.nextActionAt < @now", counts.QueryText);
        Assert.Equal("2026-11-18T12:00:00.0000000+00:00", counts.GetQueryParameters().Single(p => p.Name == "@now").Value);
        var attention = ReferralSearch.BuildAttentionCount("business-a", now);
        Assert.StartsWith("SELECT VALUE COUNT(1)", attention.QueryText);
        Assert.Contains("c.status = 'New'", attention.QueryText);
        Assert.Contains("IS_NULL(c.ownerId)", attention.QueryText);
        Assert.DoesNotContain("@now", ReferralSearch.Build("business-a", null, null, null, null, null, false).QueryText);
    }

    [Fact]
    public void DueQueuesSortOldestDeadlineFirstAndUseMountainMidnightAcrossDst()
    {
        var now = new DateTimeOffset(2026, 3, 8, 8, 0, 0, TimeSpan.Zero);
        var today = ReferralSearch.Build("business-a", null, null, null, null, null, false, now: now, due: "today");
        Assert.Contains("c.status NOT IN ('Completed', 'Won', 'Closed')", today.QueryText);
        Assert.Contains("c.nextActionAt >= @now AND c.nextActionAt < @tomorrow", today.QueryText);
        Assert.EndsWith("ORDER BY c.nextActionAt ASC", today.QueryText);
        Assert.Equal("2026-03-09T06:00:00.0000000+00:00", today.GetQueryParameters().Single(p => p.Name == "@tomorrow").Value);
        var upcoming = ReferralSearch.BuildStatusCounts("business-a", null, null, null, null, false, now: now, due: "upcoming");
        Assert.Contains("c.nextActionAt >= @tomorrow", upcoming.QueryText);
        var overdue = ReferralSearch.Build("business-a", null, null, null, null, null, false, now: now, due: "overdue");
        Assert.Contains("c.nextActionAt < @now", overdue.QueryText);
        Assert.Throws<ApiError>(() => ReferralSearch.Build("business-a", null, null, null, null, null, false, due: "invalid"));
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
