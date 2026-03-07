using System.Text.Json;
using AutoDraft.ApiContract.Contracts;
using AutoDraft.ApiContract.Options;
using AutoDraft.ApiContract.Services;
using Microsoft.Extensions.Options;
using Xunit;

namespace AutoDraft.ApiContract.Tests;

public sealed class RuleBasedAutoDraftPlannerTests
{
    private sealed class RuleSeedSpec
    {
        public List<RuleSeedItem> Rules { get; init; } = [];
    }

    private sealed class RuleSeedItem
    {
        public string Id { get; init; } = string.Empty;
        public string Category { get; init; } = string.Empty;
        public RuleSeedTrigger Trigger { get; init; } = new();
    }

    private sealed class RuleSeedTrigger
    {
        public string Type { get; init; } = string.Empty;
        public string? Color { get; init; }
    }

    private static RuleBasedAutoDraftPlanner CreatePlanner()
    {
        return new RuleBasedAutoDraftPlanner(Microsoft.Extensions.Options.Options.Create(new AutoDraftOptions()));
    }

    private static RuleSeedSpec LoadSeedSpec()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "rule_seed_spec.json");
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<RuleSeedSpec>(
            json,
            new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
            }
        ) ?? new RuleSeedSpec();
    }

    private static string? ReadTriggerValue(IReadOnlyDictionary<string, object?> trigger, string key)
    {
        if (!trigger.TryGetValue(key, out var value))
        {
            return null;
        }

        return value?.ToString();
    }

    [Fact]
    public void GetRules_MatchesSharedSeedSpec()
    {
        var planner = CreatePlanner();
        var rules = planner.GetRules();
        var spec = LoadSeedSpec();

        Assert.Equal(spec.Rules.Count, rules.Count);

        for (var i = 0; i < spec.Rules.Count; i++)
        {
            var expected = spec.Rules[i];
            var actual = rules[i];

            Assert.Equal(expected.Id, actual.Id);
            Assert.Equal(expected.Category, actual.Category);
            Assert.Equal(expected.Trigger.Type, ReadTriggerValue(actual.Trigger, "type"));
            Assert.Equal(expected.Trigger.Color, ReadTriggerValue(actual.Trigger, "color"));
            Assert.False(string.IsNullOrWhiteSpace(actual.Action));
            Assert.InRange(actual.Confidence, 0.0, 1.0);
        }
    }

    [Fact]
    public void Plan_GreenCloudNeutralText_ClassifiesAsDelete()
    {
        var planner = CreatePlanner();
        var result = planner.Plan(
            new AutoDraftPlanRequest
            {
                Markups =
                [
                    new MarkupInput { Type = "cloud", Color = "green", Text = "Remove this" },
                ],
            }
        );

        var action = Assert.Single(result.Actions);
        Assert.Equal("delete-green-cloud", action.RuleId);
        Assert.Equal("DELETE", action.Category);
        Assert.Equal("proposed", action.Status);
    }

    [Fact]
    public void Plan_RedCloudNeutralText_ClassifiesAsAdd()
    {
        var planner = CreatePlanner();
        var result = planner.Plan(
            new AutoDraftPlanRequest
            {
                Markups =
                [
                    new MarkupInput { Type = "cloud", Color = "red", Text = "Install this" },
                ],
            }
        );

        var action = Assert.Single(result.Actions);
        Assert.Equal("add-red-cloud", action.RuleId);
        Assert.Equal("ADD", action.Category);
        Assert.Equal("proposed", action.Status);
    }

    [Fact]
    public void Plan_GreenCloudAddText_IsManualReview()
    {
        var planner = CreatePlanner();
        var result = planner.Plan(
            new AutoDraftPlanRequest
            {
                Markups =
                [
                    new MarkupInput { Type = "cloud", Color = "green", Text = "add support" },
                ],
            }
        );

        var action = Assert.Single(result.Actions);
        Assert.Null(action.RuleId);
        Assert.Equal("UNCLASSIFIED", action.Category);
        Assert.Equal("review", action.Status);
    }

    [Fact]
    public void Plan_RedCloudDeleteText_IsManualReview()
    {
        var planner = CreatePlanner();
        var result = planner.Plan(
            new AutoDraftPlanRequest
            {
                Markups =
                [
                    new MarkupInput { Type = "cloud", Color = "red", Text = "delete feeder" },
                ],
            }
        );

        var action = Assert.Single(result.Actions);
        Assert.Null(action.RuleId);
        Assert.Equal("UNCLASSIFIED", action.Category);
        Assert.Equal("review", action.Status);
    }
}
