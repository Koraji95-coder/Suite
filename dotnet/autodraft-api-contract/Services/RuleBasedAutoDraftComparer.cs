using AutoDraft.ApiContract.Contracts;

namespace AutoDraft.ApiContract.Services;

public sealed class RuleBasedAutoDraftComparer : IAutoDraftComparer
{
    private readonly IAutoDraftPlanner _planner;
    private readonly IAutoDraftBackchecker _backchecker;

    public RuleBasedAutoDraftComparer(
        IAutoDraftPlanner planner,
        IAutoDraftBackchecker backchecker
    )
    {
        _planner = planner;
        _backchecker = backchecker;
    }

    public AutoDraftCompareResponse Compare(
        AutoDraftCompareRequest request,
        CancellationToken cancellationToken = default
    )
    {
        cancellationToken.ThrowIfCancellationRequested();

        var toleranceProfile = NormalizeToleranceProfile(request.ToleranceProfile);
        var plan = _planner.Plan(
            new AutoDraftPlanRequest
            {
                Markups = request.Markups ?? [],
            }
        );

        var backcheck = _backchecker.Backcheck(
            new AutoDraftBackcheckRequest
            {
                Actions = [.. plan.Actions],
                CadContext = request.CadContext,
                RequireCadContext = false,
                ToleranceProfile = toleranceProfile,
                RequestId = request.RequestId,
            },
            cancellationToken
        );

        var summary = BuildSummary(
            markups: request.Markups ?? [],
            actions: plan.Actions,
            backcheckSummary: backcheck.Summary,
            cadAvailable: backcheck.Cad.Available
        );

        return new AutoDraftCompareResponse
        {
            Ok = true,
            Success = true,
            RequestId = backcheck.RequestId,
            Source = "dotnet-compare",
            Mode = "cad-aware",
            ToleranceProfile = toleranceProfile,
            Plan = new AutoDraftComparePlan
            {
                Source = plan.Source,
                Summary = plan.Summary,
                Actions = plan.Actions,
            },
            Backcheck = backcheck,
            Summary = summary,
        };
    }

    private static AutoDraftCompareSummary BuildSummary(
        IReadOnlyList<MarkupInput> markups,
        IReadOnlyList<AutoDraftActionItem> actions,
        AutoDraftBackcheckSummary backcheckSummary,
        bool cadAvailable
    )
    {
        var status = "pass";
        if (backcheckSummary.FailCount > 0)
        {
            status = "fail";
        }
        else if (backcheckSummary.WarnCount > 0)
        {
            status = "warn";
        }

        return new AutoDraftCompareSummary
        {
            Status = status,
            TotalMarkups = markups.Count,
            TotalActions = actions.Count,
            PassCount = backcheckSummary.PassCount,
            WarnCount = backcheckSummary.WarnCount,
            FailCount = backcheckSummary.FailCount,
            CadContextAvailable = cadAvailable,
        };
    }

    private static string NormalizeToleranceProfile(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "strict" => "strict",
            "loose" => "loose",
            _ => "medium",
        };
    }
}
