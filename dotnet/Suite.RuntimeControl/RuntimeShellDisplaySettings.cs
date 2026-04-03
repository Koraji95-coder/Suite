namespace Suite.RuntimeControl;

internal static class RuntimeShellDisplaySettings
{
    public const int DefaultContentScalePercent = 125;
    public const int MinimumContentScalePercent = 100;
    public const int MaximumContentScalePercent = 140;
    public const int DefaultUtilityPaneWidth = 440;
    public const int MinimumUtilityPaneWidth = 360;
    public const int MaximumUtilityPaneWidth = 820;

    public static int NormalizeContentScalePercent(int? value)
    {
        return Math.Clamp(
            value ?? DefaultContentScalePercent,
            MinimumContentScalePercent,
            MaximumContentScalePercent);
    }

    public static int NormalizeUtilityPaneWidth(int? value)
    {
        return Math.Clamp(
            value ?? DefaultUtilityPaneWidth,
            MinimumUtilityPaneWidth,
            MaximumUtilityPaneWidth);
    }

    public static double ComputeWebViewZoomFactor(int deviceDpi, int? contentScalePercent)
    {
        var dpi = deviceDpi > 0 ? deviceDpi : 96;
        var dpiNormalizedZoom = Math.Clamp(96d / dpi, 0.4d, 1d);
        var scaleMultiplier = NormalizeContentScalePercent(contentScalePercent) / 100d;
        return Math.Clamp(dpiNormalizedZoom * scaleMultiplier, 0.4d, 1.4d);
    }
}
