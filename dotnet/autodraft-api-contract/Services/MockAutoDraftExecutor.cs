using AutoDraft.ApiContract.Contracts;
using AutoDraft.ApiContract.Options;
using Microsoft.Extensions.Options;

namespace AutoDraft.ApiContract.Services;

public sealed class MockAutoDraftExecutor : IAutoDraftExecutor
{
    private readonly AutoDraftOptions _options;

    public MockAutoDraftExecutor(IOptions<AutoDraftOptions> options)
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
                    Message = "Mock execution is disabled. Wire this endpoint to CAD executor.",
                }
            );
        }

        var accepted = request.Actions.Count;
        return Task.FromResult(
            new AutoDraftExecuteResponse
            {
                Ok = true,
                Source = _options.SourceLabel,
                JobId = $"contract-{Guid.NewGuid():N}",
                Status = request.DryRun ? "dry-run" : "accepted",
                Accepted = accepted,
                Skipped = 0,
                DryRun = request.DryRun,
                Message = request.DryRun
                    ? "Dry run complete. No CAD writes performed."
                    : "Accepted by contract executor. Replace with .NET CAD implementation.",
            }
        );
    }
}
