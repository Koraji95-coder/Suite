namespace Suite.RuntimeControl;

internal static class RuntimeShellExitCodes
{
    public const int Success = 0;
    public const int ExistingShellActivated = 41;
    public const int ExistingShellActivationFailed = 42;
    public const int ActivateExistingOnlyNoPrimary = 43;
    public const int InitializationFailed = 61;
}
