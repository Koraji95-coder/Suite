using AutoDraft.ApiContract.Contracts;
using AutoDraft.ApiContract.Options;
using Microsoft.Extensions.Options;

namespace AutoDraft.ApiContract.Services;

public sealed class DeterministicAutoDraftExecutor : IAutoDraftExecutor
{
    private const double MinimumExecutionConfidence = 0.50;

    private static readonly HashSet<string> SupportedCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "add",
        "delete",
        "swap",
        "note",
        "title_block",
    };

    private readonly AutoDraftOptions _options;

    public DeterministicAutoDraftExecutor(IOptions<AutoDraftOptions> options)
    {
        _options = options.Value;
    }

    public Task<AutoDraftExecuteResponse> ExecuteAsync(
        AutoDraftExecuteRequest request,
        CancellationToken cancellationToken = default
    )
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!_options.EnableMockExecution)
        {
            return Task.FromResult(
                new AutoDraftExecuteResponse
                {
                    Ok = false,
                    Source = _options.SourceLabel,
                    JobId = string.Empty,
                    Status = "disabled",
                    Accepted = 0,
                    Skipped = request.Actions.Count,
                    DryRun = request.DryRun,
                    Message = "Deterministic preflight executor is disabled. Wire this endpoint to the CAD executor.",
                }
            );
        }

        var evaluations = new List<ActionEvaluation>(request.Actions.Count);
        for (var index = 0; index < request.Actions.Count; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            evaluations.Add(EvaluateAction(request.Actions[index], index + 1));
        }

        var accepted = evaluations.Count(item => item.ReadyForExecution);
        var skipped = evaluations.Count - accepted;
        var jobId = $"deterministic-{Guid.NewGuid():N}";
        var status = request.DryRun
            ? "dry-run"
            : accepted > 0
                ? "accepted"
                : "needs_review";

        return Task.FromResult(
            new AutoDraftExecuteResponse
            {
                Ok = true,
                Source = _options.SourceLabel,
                JobId = jobId,
                Status = status,
                Accepted = accepted,
                Skipped = skipped,
                DryRun = request.DryRun,
                Message = BuildMessage(request.DryRun, accepted, skipped, evaluations),
            }
        );
    }

    private static ActionEvaluation EvaluateAction(AutoDraftActionItem action, int index)
    {
        var actionId = string.IsNullOrWhiteSpace(action.Id) ? $"action-{index}" : action.Id.Trim();
        var status = Normalize(action.Status);
        if (status is "review" or "needs_review")
        {
            return new ActionEvaluation(actionId, false, "manual review");
        }

        if (string.IsNullOrWhiteSpace(action.RuleId))
        {
            return new ActionEvaluation(actionId, false, "missing classification");
        }

        var category = Normalize(action.Category);
        if (!SupportedCategories.Contains(category))
        {
            return new ActionEvaluation(actionId, false, "unsupported category");
        }

        if (action.Confidence < MinimumExecutionConfidence)
        {
            return new ActionEvaluation(actionId, false, "low confidence");
        }

        if (string.IsNullOrWhiteSpace(action.Action))
        {
            return new ActionEvaluation(actionId, false, "missing action text");
        }

        return new ActionEvaluation(actionId, true, null);
    }

    private static string BuildMessage(
        bool dryRun,
        int accepted,
        int skipped,
        IReadOnlyList<ActionEvaluation> evaluations
    )
    {
        var reasonSummary = "none";
        if (skipped > 0)
        {
            reasonSummary = string.Join(
                ", ",
                evaluations
                    .Where(item => !item.ReadyForExecution && !string.IsNullOrWhiteSpace(item.Reason))
                    .GroupBy(item => item.Reason!, StringComparer.OrdinalIgnoreCase)
                    .Select(group => $"{group.Key} x{group.Count()}")
                    .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
            );
        }

        if (dryRun)
        {
            return $"Dry run preflight complete. {accepted} action(s) are execution-ready; {skipped} skipped ({reasonSummary}).";
        }

        if (accepted == 0)
        {
            return $"Execution blocked by deterministic preflight. 0 action(s) are execution-ready; {skipped} skipped ({reasonSummary}).";
        }

        return $"Accepted {accepted} action(s) through deterministic preflight; {skipped} skipped ({reasonSummary}). CAD writes are not enabled yet.";
    }

    private static string Normalize(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim().ToLowerInvariant();
    }

    private readonly record struct ActionEvaluation(
        string ActionId,
        bool ReadyForExecution,
        string? Reason
    );
}
