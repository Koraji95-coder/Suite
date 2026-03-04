using AutoDraft.ApiContract.Contracts;
using AutoDraft.ApiContract.Options;
using Microsoft.Extensions.Options;

namespace AutoDraft.ApiContract.Services;

public sealed class RuleBasedAutoDraftPlanner : IAutoDraftPlanner
{
    private readonly AutoDraftOptions _options;

    private static readonly List<AutoDraftRule> SeedRules =
    [
        new()
        {
            Id = "delete-red-cloud",
            Category = "DELETE",
            Trigger = new Dictionary<string, object?>
            {
                ["type"] = "cloud",
                ["color"] = "red",
                ["text_contains"] = "delete",
            },
            Action = "Remove all geometry inside the cloud boundary",
            Icon = "🔴",
            Examples = ["Red cloud around area", "Red X through element"],
            Confidence = 0.92,
        },
        new()
        {
            Id = "add-green-cloud",
            Category = "ADD",
            Trigger = new Dictionary<string, object?>
            {
                ["type"] = "cloud",
                ["color"] = "green",
                ["text_contains"] = string.Empty,
            },
            Action = "Add geometry drawn inside green cloud to model",
            Icon = "🟢",
            Examples = ["Green cloud with new linework", "Green arrow to insertion"],
            Confidence = 0.88,
        },
        new()
        {
            Id = "note-blue-text",
            Category = "NOTE",
            Trigger = new Dictionary<string, object?>
            {
                ["type"] = "text",
                ["color"] = "blue",
                ["text_contains"] = string.Empty,
            },
            Action = "Log as note only; do not modify geometry",
            Icon = "🔵",
            Examples = ["Blue text annotation", "Blue callout box"],
            Confidence = 0.95,
        },
        new()
        {
            Id = "swap-blue-arrows",
            Category = "SWAP",
            Trigger = new Dictionary<string, object?>
            {
                ["type"] = "arrow",
                ["color"] = "blue",
                ["count"] = 2,
            },
            Action = "Swap the two elements connected by arrows",
            Icon = "🔀",
            Examples = ["Two blue arrows between components"],
            Confidence = 0.75,
        },
        new()
        {
            Id = "title-block-rect",
            Category = "TITLE_BLOCK",
            Trigger = new Dictionary<string, object?>
            {
                ["type"] = "rectangle",
                ["position"] = "bottom-right",
                ["aspect"] = "wide",
            },
            Action = "Identify title block and extract metadata only",
            Icon = "📋",
            Examples = ["Standard ANSI title block", "Company header and rev table"],
            Confidence = 0.97,
        },
    ];

    public RuleBasedAutoDraftPlanner(IOptions<AutoDraftOptions> options)
    {
        _options = options.Value;
    }

    public IReadOnlyList<AutoDraftRule> GetRules() => SeedRules;

    public AutoDraftPlanResponse Plan(AutoDraftPlanRequest request)
    {
        var markups = request.Markups ?? [];
        var actions = new List<AutoDraftActionItem>(markups.Count);

        for (var i = 0; i < markups.Count; i++)
        {
            var markup = markups[i];
            var selectedRule = SeedRules.FirstOrDefault(rule => RuleMatches(rule, markup));
            var action = selectedRule is null
                ? new AutoDraftActionItem
                {
                    Id = $"action-{i + 1}",
                    RuleId = null,
                    Category = "UNCLASSIFIED",
                    Action = "Manual review required.",
                    Confidence = 0.0,
                    Status = "review",
                    Markup = markup,
                }
                : new AutoDraftActionItem
                {
                    Id = $"action-{i + 1}",
                    RuleId = selectedRule.Id,
                    Category = selectedRule.Category,
                    Action = selectedRule.Action,
                    Confidence = selectedRule.Confidence,
                    Status = "proposed",
                    Markup = markup,
                };

            actions.Add(action);
        }

        var classified = actions.Count(item => !string.IsNullOrWhiteSpace(item.RuleId));
        var needsReview = actions.Count - classified;

        return new AutoDraftPlanResponse
        {
            Ok = true,
            Source = _options.SourceLabel,
            Actions = actions,
            Summary = new AutoDraftPlanSummary
            {
                TotalMarkups = markups.Count,
                ActionsProposed = actions.Count,
                Classified = classified,
                NeedsReview = needsReview,
            },
            Message = "Contract planner output. Replace with CAD-resolved planning later.",
        };
    }

    private static bool RuleMatches(AutoDraftRule rule, MarkupInput markup)
    {
        var trigger = rule.Trigger;
        var triggerType = Normalize(ReadTriggerValue(trigger, "type"));
        var triggerColor = Normalize(ReadTriggerValue(trigger, "color"));
        var triggerContains = Normalize(ReadTriggerValue(trigger, "text_contains"));

        var markupType = Normalize(markup.Type);
        var markupColor = Normalize(markup.Color);
        var markupText = Normalize(markup.Text);

        if (!string.IsNullOrEmpty(triggerType) && triggerType != markupType)
        {
            return false;
        }

        if (
            !string.IsNullOrEmpty(triggerColor)
            && triggerColor != "any"
            && triggerColor != markupColor
        )
        {
            return false;
        }

        if (!string.IsNullOrEmpty(triggerContains) && !markupText.Contains(triggerContains))
        {
            return false;
        }

        return true;
    }

    private static object? ReadTriggerValue(
        IReadOnlyDictionary<string, object?> trigger,
        string key
    )
    {
        return trigger.TryGetValue(key, out var value) ? value : null;
    }

    private static string Normalize(object? value)
    {
        return (value?.ToString() ?? string.Empty).Trim().ToLowerInvariant();
    }
}
