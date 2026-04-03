using Xunit;

namespace Suite.RuntimeControl.Tests;

public sealed class WorkstationFolderPickerBridgeTests
{
    [Theory]
    [InlineData(null, true)]
    [InlineData("", true)]
    [InlineData("http://127.0.0.1:5173", true)]
    [InlineData("http://localhost:5173", true)]
    [InlineData("https://localhost:4173", true)]
    [InlineData("http://example.com", false)]
    [InlineData("file:///tmp/test", false)]
    [InlineData("null", false)]
    public void IsAllowedOrigin_OnlyAllowsLoopbackOrigins(
        string? origin,
        bool expected)
    {
        var actual = WorkstationFolderPickerBridge.IsAllowedOrigin(origin);

        Assert.Equal(expected, actual);
    }
}
