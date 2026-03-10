using AutoDraft.ApiContract.Contracts;
using AutoDraft.ApiContract.Options;
using Microsoft.Extensions.Options;

namespace AutoDraft.ApiContract.Services;

public sealed class MockAutoDraftBackchecker : IAutoDraftBackchecker
{
    private readonly AutoDraftOptions _options;

    public MockAutoDraftBackchecker(IOptions<AutoDraftOptions> options)
    {
        _options = options.Value;
    }

    public AutoDraftBackcheckResponse Backcheck(
        AutoDraftBackcheckRequest request,
        CancellationToken cancellationToken = default
    )
    {
        cancellationToken.ThrowIfCancellationRequested();

        var findings = new List<AutoDraftBackcheckFinding>(request.Actions.Count);
        foreach (var (action, index) in request.Actions.Select((action, index) => (action, index)))
        {
            var status = "pass";
            var severity = "low";
            var notes = new List<string>();
            var suggestions = new HashSet<string>(StringComparer.Ordinal);

            if (string.IsNullOrWhiteSpace(action.RuleId))
            {
                status = "fail";
                severity = "high";
                notes.Add("Action is unclassified and requires operator review.");
                suggestions.Add("Classify this action before execution.");
            }

            if (action.Confidence < 0.5)
            {
                if (status == "pass")
                {
                    status = "warn";
                    severity = "medium";
                }

                notes.Add($"Confidence is low ({action.Confidence:0.00}).");
                suggestions.Add("Review geometry intent before execute.");
            }

            findings.Add(
                new AutoDraftBackcheckFinding
                {
                    Id = $"finding-{index + 1}",
                    ActionId = string.IsNullOrWhiteSpace(action.Id) ? $"action-{index + 1}" : action.Id,
                    Status = status,
                    Severity = severity,
                    Category = string.IsNullOrWhiteSpace(action.Category)
                        ? "unclassified"
                        : action.Category.ToLowerInvariant(),
                    Notes = notes,
                    Suggestions = [.. suggestions],
                }
            );
        }

        var passCount = findings.Count(item => item.Status == "pass");
        var warnCount = findings.Count(item => item.Status == "warn");
        var failCount = findings.Count(item => item.Status == "fail");
        var requestId = string.IsNullOrWhiteSpace(request.RequestId)
            ? $"req-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}"
            : request.RequestId.Trim();

        return new AutoDraftBackcheckResponse
        {
            Ok = true,
            Success = true,
            RequestId = requestId,
            Source = _options.SourceLabel,
            Mode = "cad-aware",
            Cad = new AutoDraftBackcheckCadStatus
            {
                Available = request.CadContext is not null,
                Degraded = request.CadContext is null,
                EntityCount = 0,
                LockedLayerCount = 0,
            },
            Summary = new AutoDraftBackcheckSummary
            {
                TotalActions = findings.Count,
                PassCount = passCount,
                WarnCount = warnCount,
                FailCount = failCount,
            },
            Warnings = request.CadContext is null
                ? ["CAD context unavailable in contract stub; using action-level checks only."]
                : [],
            Findings = findings,
        };
    }
}
