using Xunit;

namespace Suite.RuntimeControl.Tests;

public sealed class RuntimeServiceStateTests
{
    [Theory]
    [InlineData("running", true)]
    [InlineData("starting", true)]
    [InlineData("stopped", false)]
    [InlineData("error", false)]
    [InlineData(null, false)]
    public void IsActive_MatchesRunningStates(string? state, bool expected)
    {
        Assert.Equal(expected, RuntimeServiceState.IsActive(state));
    }

    [Theory]
    [InlineData("running", true)]
    [InlineData("starting", false)]
    [InlineData("stopped", false)]
    [InlineData("error", false)]
    [InlineData(null, false)]
    public void IsReady_RequiresRunning(string? state, bool expected)
    {
        Assert.Equal(expected, RuntimeServiceState.IsReady(state));
    }

    [Theory]
    [InlineData("running", false)]
    [InlineData("starting", false)]
    [InlineData("stopped", true)]
    [InlineData("error", true)]
    [InlineData(null, true)]
    public void IsStopped_InvertsActiveState(string? state, bool expected)
    {
        Assert.Equal(expected, RuntimeServiceState.IsStopped(state));
    }
}
