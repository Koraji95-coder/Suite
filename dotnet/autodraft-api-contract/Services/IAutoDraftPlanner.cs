using AutoDraft.ApiContract.Contracts;

namespace AutoDraft.ApiContract.Services;

public interface IAutoDraftPlanner
{
    IReadOnlyList<AutoDraftRule> GetRules();

    AutoDraftPlanResponse Plan(AutoDraftPlanRequest request);
}
