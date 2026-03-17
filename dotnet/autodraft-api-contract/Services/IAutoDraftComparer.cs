using AutoDraft.ApiContract.Contracts;

namespace AutoDraft.ApiContract.Services;

public interface IAutoDraftComparer
{
    AutoDraftCompareResponse Compare(
        AutoDraftCompareRequest request,
        CancellationToken cancellationToken = default
    );
}
