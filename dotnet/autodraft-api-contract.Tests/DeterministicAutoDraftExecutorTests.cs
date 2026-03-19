using AutoDraft.ApiContract.Contracts;
using AutoDraft.ApiContract.Options;
using AutoDraft.ApiContract.Services;
using Microsoft.Extensions.Options;
using Xunit;

namespace AutoDraft.ApiContract.Tests;

public sealed class DeterministicAutoDraftExecutorTests
{
    private static DeterministicAutoDraftExecutor CreateExecutor(bool enabled = true)
    {
        return new DeterministicAutoDraftExecutor(
            Microsoft.Extensions.Options.Options.Create(
                new AutoDraftOptions
                {
                    EnableMockExecution = enabled,
                    SourceLabel = "dotnet-contract",
                }
            )
        );
    }

    [Fact]
    public async Task ExecuteAsync_DryRun_ReportsAcceptedAndSkippedActions()
    {
        var executor = CreateExecutor();

        var result = await executor.ExecuteAsync(
            new AutoDraftExecuteRequest
            {
                DryRun = true,
                Actions =
                [
                    new AutoDraftActionItem
                    {
                        Id = "action-1",
                        RuleId = "add-red-cloud",
                        Category = "ADD",
                        Action = "Add geometry drawn inside red cloud to model",
                        Confidence = 0.88,
                        Status = "proposed",
                        Markup = new MarkupInput { Type = "cloud", Color = "red", Text = "Install feeder" },
                    },
                    new AutoDraftActionItem
                    {
                        Id = "action-2",
                        RuleId = null,
                        Category = "UNCLASSIFIED",
                        Action = "Manual review required.",
                        Confidence = 0.0,
                        Status = "review",
                        Markup = new MarkupInput { Type = "text", Color = "blue", Text = "Review" },
                    },
                ],
            }
        );

        Assert.True(result.Ok);
        Assert.True(result.DryRun);
        Assert.Equal("dry-run", result.Status);
        Assert.Equal(1, result.Accepted);
        Assert.Equal(1, result.Skipped);
        Assert.Contains("execution-ready", result.Message);
        Assert.Contains("manual review", result.Message);
    }

    [Fact]
    public async Task ExecuteAsync_NonDryRun_WithNoReadyActions_ReturnsNeedsReviewStatus()
    {
        var executor = CreateExecutor();

        var result = await executor.ExecuteAsync(
            new AutoDraftExecuteRequest
            {
                DryRun = false,
                Actions =
                [
                    new AutoDraftActionItem
                    {
                        Id = "action-1",
                        RuleId = "delete-green-cloud",
                        Category = "DELETE",
                        Action = "Remove all geometry inside the cloud boundary",
                        Confidence = 0.42,
                        Status = "proposed",
                        Markup = new MarkupInput { Type = "cloud", Color = "green", Text = "Delete run" },
                    },
                ],
            }
        );

        Assert.True(result.Ok);
        Assert.False(result.DryRun);
        Assert.Equal("needs_review", result.Status);
        Assert.Equal(0, result.Accepted);
        Assert.Equal(1, result.Skipped);
        Assert.Contains("blocked by deterministic preflight", result.Message);
    }

    [Fact]
    public async Task ExecuteAsync_WhenDisabled_ReturnsDisabledResponse()
    {
        var executor = CreateExecutor(enabled: false);

        var result = await executor.ExecuteAsync(
            new AutoDraftExecuteRequest
            {
                DryRun = true,
                Actions =
                [
                    new AutoDraftActionItem
                    {
                        Id = "action-1",
                        RuleId = "note-blue-text",
                        Category = "NOTE",
                        Action = "Log as note only; do not modify geometry",
                        Confidence = 0.95,
                        Status = "proposed",
                        Markup = new MarkupInput { Type = "text", Color = "blue", Text = "Field note" },
                    },
                ],
            }
        );

        Assert.False(result.Ok);
        Assert.Equal("disabled", result.Status);
        Assert.Equal(0, result.Accepted);
        Assert.Equal(1, result.Skipped);
    }
}
