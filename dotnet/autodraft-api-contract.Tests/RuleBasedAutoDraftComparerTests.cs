using AutoDraft.ApiContract.Contracts;
using AutoDraft.ApiContract.Options;
using AutoDraft.ApiContract.Services;
using Xunit;

namespace AutoDraft.ApiContract.Tests;

public sealed class RuleBasedAutoDraftComparerTests
{
    private static RuleBasedAutoDraftComparer CreateComparer()
    {
        var options = Microsoft.Extensions.Options.Options.Create(new AutoDraftOptions());
        var planner = new RuleBasedAutoDraftPlanner(options);
        var backchecker = new MockAutoDraftBackchecker(options);
        return new RuleBasedAutoDraftComparer(planner, backchecker);
    }

    [Fact]
    public void Compare_ReturnsPlanBackcheckAndSummary()
    {
        var comparer = CreateComparer();
        var result = comparer.Compare(
            new AutoDraftCompareRequest
            {
                Markups =
                [
                    new MarkupInput
                    {
                        Type = "cloud",
                        Color = "green",
                        Text = "delete conduit",
                        Bounds = new MarkupBounds { X = 10, Y = 10, Width = 20, Height = 10 },
                    },
                ],
                CadContext = new Dictionary<string, System.Text.Json.JsonElement>(),
                ToleranceProfile = "medium",
                RequestId = "req-compare-1",
            }
        );

        Assert.True(result.Ok);
        Assert.True(result.Success);
        Assert.Equal("req-compare-1", result.RequestId);
        Assert.Equal("dotnet-compare", result.Source);
        Assert.Equal("medium", result.ToleranceProfile);
        Assert.Single(result.Plan.Actions);
        Assert.Equal(1, result.Summary.TotalMarkups);
        Assert.Equal(1, result.Summary.TotalActions);
    }

    [Fact]
    public void Compare_UnknownToleranceProfile_FallsBackToMedium()
    {
        var comparer = CreateComparer();
        var result = comparer.Compare(
            new AutoDraftCompareRequest
            {
                Markups =
                [
                    new MarkupInput
                    {
                        Type = "text",
                        Color = "blue",
                        Text = "Field note",
                    },
                ],
                ToleranceProfile = "not-a-profile",
            }
        );

        Assert.Equal("medium", result.ToleranceProfile);
    }
}
