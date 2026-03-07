using AutoDraft.ApiContract.Contracts;
using AutoDraft.ApiContract.Options;
using Microsoft.Extensions.Options;

namespace AutoDraft.ApiContract.Services;

public sealed class RuleBasedAutoDraftPlanner : IAutoDraftPlanner
{
    private readonly AutoDraftOptions _options;

    private const string DeleteIntentToken = "delete";
    private const string AddIntentToken = "add";

    private static readonly IReadOnlyDictionary<string, string> CloudColorToCategory =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["green"] = "DELETE",
            ["red"] = "ADD",
        };

    private static readonly List<AutoDraftRule> SeedRules =
    [
        new()
        {
            Id = "delete-green-cloud",
            Category = "DELETE",
            Trigger = new Dictionary<string, object?>
            {
                ["type"] = "cloud",
                ["color"] = "green",
                ["text_contains"] = string.Empty,
            },
            Action = "Remove all geometry inside the cloud boundary",
            Icon = "\U0001F7E2",
            Examples = ["Green cloud around area", "Green X through element"],
            Confidence = 0.92,
        },
        new()
        {
            Id = "add-red-cloud",
            Category = "ADD",
            Trigger = new Dictionary<string, object?>
            {
                ["type"] = "cloud",
                ["color"] = "red",
                ["text_contains"] = string.Empty,
            },
            Action = "Add geometry drawn inside red cloud to model",
            Icon = "\U0001F534",
            Examples = ["Red cloud with new linework", "Red arrow to insertion"],
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
            Icon = "\U0001F535",
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
            Icon = "\U0001F500",
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
            Action = "Extract metadata only; skip geometry conversion",
            Icon = "\U0001F4CB",
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
            AutoDraftActionItem action;

            if (CloudIntentConflicts(markup))
            {
                action = new AutoDraftActionItem
                {
                    Id = $"action-{i + 1}",
                    RuleId = null,
                    Category = "UNCLASSIFIED",
                    Action = "Conflicting cloud color/text intent. Manual review required.",
                    Confidence = 0.0,
                    Status = "review",
                    Markup = markup,
                };
            }
            else
            {
                var selectedRule = SeedRules.FirstOrDefault(rule => RuleMatches(rule, markup));
                action = selectedRule is null
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
            }

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

    private static bool CloudIntentConflicts(MarkupInput markup)
    {
        var markupType = Normalize(markup.Type);
        if (markupType != "cloud")
        {
            return false;
        }

        var markupColor = Normalize(markup.Color);
        if (!CloudColorToCategory.TryGetValue(markupColor, out var impliedCategory))
        {
            return false;
        }

        var markupText = Normalize(markup.Text);
        var hasDeleteIntent = markupText.Contains(DeleteIntentToken, StringComparison.Ordinal);
        var hasAddIntent = markupText.Contains(AddIntentToken, StringComparison.Ordinal);

        return impliedCategory switch
        {
            "DELETE" => hasAddIntent,
            "ADD" => hasDeleteIntent,
            _ => false,
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

        if (!string.IsNullOrEmpty(triggerContains) && !markupText.Contains(triggerContains, StringComparison.Ordinal))
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
