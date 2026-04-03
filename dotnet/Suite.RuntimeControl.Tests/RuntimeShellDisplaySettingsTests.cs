using System.Text.Json;
using Xunit;

namespace Suite.RuntimeControl.Tests;

public sealed class RuntimeShellDisplaySettingsTests
{
    [Theory]
    [InlineData(null, 125)]
    [InlineData(80, 100)]
    [InlineData(100, 100)]
    [InlineData(125, 125)]
    [InlineData(180, 140)]
    public void NormalizeContentScalePercent_ClampsExpectedRange(int? input, int expected)
    {
        var actual = RuntimeShellDisplaySettings.NormalizeContentScalePercent(input);

        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData(null, 440)]
    [InlineData(320, 360)]
    [InlineData(360, 360)]
    [InlineData(440, 440)]
    [InlineData(960, 820)]
    public void NormalizeUtilityPaneWidth_ClampsExpectedRange(int? input, int expected)
    {
        var actual = RuntimeShellDisplaySettings.NormalizeUtilityPaneWidth(input);

        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData(96, 125, 1.25)]
    [InlineData(120, 125, 1.0)]
    [InlineData(240, 125, 0.5)]
    [InlineData(0, 140, 1.4)]
    public void ComputeWebViewZoomFactor_AppliesDpiNormalizationAndContentScale(
        int dpi,
        int contentScalePercent,
        double expected)
    {
        var actual = RuntimeShellDisplaySettings.ComputeWebViewZoomFactor(
            dpi,
            contentScalePercent);

        Assert.Equal(expected, actual, 3);
    }

    [Fact]
    public void RuntimeShellWindowState_RoundTripsContentScalePercent()
    {
        var original = new RuntimeShellWindowState
        {
            Left = 40,
            Top = 60,
            Width = 1440,
            Height = 920,
            WindowState = "Maximized",
            UtilityPaneWidth = 420,
            UtilityPaneCollapsed = false,
            UtilityPaneTab = "logs",
            ActiveLogSourceId = "runtime-shell",
            ContentScalePercent = 125,
        };

        var payload = JsonSerializer.Serialize(original);
        var restored = JsonSerializer.Deserialize<RuntimeShellWindowState>(payload);

        Assert.NotNull(restored);
        Assert.Equal(125, restored!.ContentScalePercent);
        Assert.False(restored.UtilityPaneCollapsed);
        Assert.Equal("logs", restored.UtilityPaneTab);
        Assert.Equal("runtime-shell", restored.ActiveLogSourceId);
    }
}
