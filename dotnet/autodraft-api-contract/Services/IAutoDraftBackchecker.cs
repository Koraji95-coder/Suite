using AutoDraft.ApiContract.Contracts;

namespace AutoDraft.ApiContract.Services;

public interface IAutoDraftBackchecker
{
    AutoDraftBackcheckResponse Backcheck(
        AutoDraftBackcheckRequest request,
        CancellationToken cancellationToken = default
    );
}
