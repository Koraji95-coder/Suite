using AutoDraft.ApiContract.Contracts;

namespace AutoDraft.ApiContract.Services;

public interface IAutoDraftExecutor
{
    Task<AutoDraftExecuteResponse> ExecuteAsync(
        AutoDraftExecuteRequest request,
        CancellationToken cancellationToken = default
    );
}
