using Xunit;

namespace Suite.RuntimeControl.Tests;

public sealed class BootstrapProgressReducerTests
{
    [Fact]
    public void Reduce_UsesWeightedMilestonesWhileRunning()
    {
        var state = CreateState(
            running: true,
            completedStepIds: new[] { "docker-ready", "supabase-start", "supabase-env" },
            percent: 0);

        var result = BootstrapProgressReducer.Reduce(state);

        Assert.True(result.Available);
        Assert.True(result.ShowCard);
        Assert.Equal(45, result.Percent);
        Assert.Equal("starting", result.StatusState);
        Assert.Equal("BOOTING", result.StatusText);
    }

    [Fact]
    public void Reduce_CapsAtNinetyNineUntilRunIsDone()
    {
        var state = CreateState(
            running: true,
            completedStepIds: BootstrapProgressReducer.KnownStepIds,
            percent: 100);

        var result = BootstrapProgressReducer.Reduce(state);

        Assert.Equal(99, result.Percent);
        Assert.True(result.ShowCard);
    }

    [Fact]
    public void Reduce_PreservesHighWaterPercentAcrossRetries()
    {
        var state = CreateState(
            running: true,
            attempt: 2,
            maxAttempts: 3,
            completedStepIds: new[] { "docker-ready" },
            percent: 55,
            currentStepId: "supabase-start",
            currentStepLabel: "Retrying bootstrap (attempt 2/3).");

        var result = BootstrapProgressReducer.Reduce(state);

        Assert.Equal(55, result.Percent);
        Assert.Equal(2, result.Attempt);
        Assert.Equal(3, result.MaxAttempts);
        Assert.True(result.ShowCard);
    }

    [Fact]
    public void Reduce_ReachesOneHundredOnlyWhenDoneAndHealthy()
    {
        var state = CreateState(
            running: false,
            done: true,
            ok: true,
            completedStepIds: BootstrapProgressReducer.KnownStepIds,
            failedStepIds: Array.Empty<string>(),
            percent: 92);

        var result = BootstrapProgressReducer.Reduce(state);

        Assert.Equal(100, result.Percent);
        Assert.False(result.ShowCard);
        Assert.Equal("running", result.StatusState);
        Assert.Equal("READY", result.StatusText);
    }

    [Fact]
    public void Reduce_MapsFailedStepLabels()
    {
        var state = CreateState(
            running: false,
            done: true,
            ok: false,
            completedStepIds: new[] { "docker-ready", "supabase-start" },
            failedStepIds: new[] { "frontend", "gateway" },
            percent: 40);

        var result = BootstrapProgressReducer.Reduce(state);

        Assert.Equal(new[] { "API Gateway", "Suite Frontend" }, result.FailedStepLabels);
        Assert.True(result.ShowCard);
        Assert.Equal("error", result.StatusState);
    }

    private static BootstrapProgressState CreateState(
        bool running,
        bool done = false,
        bool ok = false,
        int attempt = 1,
        int maxAttempts = 1,
        IEnumerable<string>? completedStepIds = null,
        IEnumerable<string>? failedStepIds = null,
        int percent = 0,
        string? currentStepId = null,
        string? currentStepLabel = null,
        string? summary = "Bootstrapping local runtime.")
    {
        return new BootstrapProgressState(
            Running: running,
            Done: done,
            Ok: ok,
            Attempt: attempt,
            MaxAttempts: maxAttempts,
            CurrentStepId: currentStepId,
            CurrentStepLabel: currentStepLabel,
            CompletedStepIds: completedStepIds?.ToArray() ?? Array.Empty<string>(),
            FailedStepIds: failedStepIds?.ToArray() ?? Array.Empty<string>(),
            Percent: percent,
            Summary: summary,
            StartedAt: "2026-03-20T21:45:36-05:00",
            UpdatedAt: "2026-03-20T21:46:23-05:00");
    }
}
