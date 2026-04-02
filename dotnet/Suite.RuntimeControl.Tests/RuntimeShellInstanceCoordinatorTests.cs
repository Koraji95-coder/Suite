using Xunit;

namespace Suite.RuntimeControl.Tests;

public sealed class RuntimeShellInstanceCoordinatorTests
{
    [Fact]
    public void BuildInstanceKey_IsStable_ForEquivalentRepoPaths()
    {
        var first = RuntimeShellInstanceCoordinator.BuildInstanceKey(@"C:\Users\DustinWard\Documents\GitHub\Suite");
        var second = RuntimeShellInstanceCoordinator.BuildInstanceKey(@"c:\users\dustinward\documents\github\suite\");

        Assert.Equal(first, second);
    }

    [Fact]
    public void BuildInstanceKey_Differs_ForDifferentRepoPaths()
    {
        var first = RuntimeShellInstanceCoordinator.BuildInstanceKey(@"C:\Users\DustinWard\Documents\GitHub\Suite");
        var second = RuntimeShellInstanceCoordinator.BuildInstanceKey(@"C:\Users\DustinWard\Documents\GitHub\Office");

        Assert.NotEqual(first, second);
    }
}
