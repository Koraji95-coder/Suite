namespace Suite.RuntimeControl;

internal static class RuntimeServiceState
{
    internal static bool IsActive(string? state)
    {
        return string.Equals(state, "running", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(state, "starting", StringComparison.OrdinalIgnoreCase);
    }

    internal static bool IsReady(string? state)
    {
        return string.Equals(state, "running", StringComparison.OrdinalIgnoreCase);
    }

    internal static bool IsStopped(string? state)
    {
        return !IsActive(state);
    }
}
