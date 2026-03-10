using AutoDraft.ApiContract.Contracts;
using AutoDraft.ApiContract.Options;
using AutoDraft.ApiContract.Services;
using Xunit;

namespace AutoDraft.ApiContract.Tests;

public sealed class MockAutoDraftBackcheckerTests
{
    private static MockAutoDraftBackchecker CreateBackchecker()
    {
        return new MockAutoDraftBackchecker(
            Microsoft.Extensions.Options.Options.Create(new AutoDraftOptions())
        );
    }

    [Fact]
    public void Backcheck_ProducesSummaryAndFindings()
    {
        var backchecker = CreateBackchecker();

        var response = backchecker.Backcheck(
            new AutoDraftBackcheckRequest
            {
                Actions =
                [
                    new AutoDraftActionItem
                    {
                        Id = "action-1",
                        RuleId = "delete-green-cloud",
                        Category = "DELETE",
                        Action = "Delete selected geometry",
                        Confidence = 0.91,
                        Status = "proposed",
                        Markup = new MarkupInput { Type = "cloud", Color = "green", Text = "delete" },
                    },
                    new AutoDraftActionItem
                    {
                        Id = "action-2",
                        RuleId = null,
                        Category = "UNCLASSIFIED",
                        Action = "Manual review required",
                        Confidence = 0.3,
                        Status = "review",
                        Markup = new MarkupInput { Type = "text", Color = "blue", Text = "review" },
                    },
                ],
            }
        );

        Assert.True(response.Ok);
        Assert.True(response.Success);
        Assert.Equal(2, response.Summary.TotalActions);
        Assert.Equal(2, response.Findings.Count);
        Assert.Equal(1, response.Summary.FailCount);
        Assert.Equal(1, response.Summary.PassCount + response.Summary.WarnCount);
        Assert.False(string.IsNullOrWhiteSpace(response.RequestId));
    }
}
