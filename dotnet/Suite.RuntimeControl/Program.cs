using System.Windows.Forms;

namespace Suite.RuntimeControl;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            return MainAsync(args).GetAwaiter().GetResult();
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-main", exception);
            return RuntimeShellExitCodes.InitializationFailed;
        }
    }

    private static async Task<int> MainAsync(string[] args)
    {
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, eventArgs) =>
        {
            RuntimeShellLogger.LogException("ui-thread-exception", eventArgs.Exception);
        };
        AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
        {
            if (eventArgs.ExceptionObject is Exception exception)
            {
                RuntimeShellLogger.LogException("app-domain-exception", exception);
            }
            else
            {
                RuntimeShellLogger.Log($"app-domain-exception: {eventArgs.ExceptionObject}");
            }
        };

        var options = AppOptions.Parse(args);
        var instanceKey = RuntimeShellInstanceCoordinator.BuildInstanceKey(options.RepoRoot);
        RuntimeShellLogger.Log($"runtime-shell-started: pid={Environment.ProcessId}; repo={options.RepoRoot}; key={instanceKey}; autoBootstrap={options.AutoBootstrap}; activateExistingOnly={options.ActivateExistingOnly}");
        using var instanceCoordinator = new RuntimeShellInstanceCoordinator(options.RepoRoot);
        var acquiredPrimaryInstance = instanceCoordinator.TryAcquirePrimaryInstance();

        if (options.ActivateExistingOnly)
        {
            if (acquiredPrimaryInstance)
            {
                RuntimeShellLogger.Log("runtime-shell-activate-existing-only: no-primary-instance");
                return RuntimeShellExitCodes.ActivateExistingOnlyNoPrimary;
            }

            var forwarded = await instanceCoordinator.SignalPrimaryInstanceAsync(new RuntimeShellActivationRequest
            {
                AutoBootstrap = options.AutoBootstrap,
            });
            RuntimeShellLogger.Log($"runtime-shell-activate-existing-only: forwarded={forwarded}; autoBootstrap={options.AutoBootstrap}");
            return forwarded
                ? RuntimeShellExitCodes.ExistingShellActivated
                : RuntimeShellExitCodes.ExistingShellActivationFailed;
        }

        if (!acquiredPrimaryInstance)
        {
            var forwarded = await instanceCoordinator.SignalPrimaryInstanceAsync(new RuntimeShellActivationRequest
            {
                AutoBootstrap = options.AutoBootstrap,
            });
            RuntimeShellLogger.Log($"runtime-shell-secondary-instance-exit: forwarded={forwarded}; autoBootstrap={options.AutoBootstrap}");
            return forwarded
                ? RuntimeShellExitCodes.ExistingShellActivated
                : RuntimeShellExitCodes.ExistingShellActivationFailed;
        }

        ApplicationConfiguration.Initialize();
        instanceCoordinator.StartListening();
        instanceCoordinator.ReportPhase(RuntimeShellPhases.FormConstructing, statusMessage: "Constructing RuntimeShellForm.");
        RuntimeShellLogger.Log("runtime-shell-form-construct-start");
        using var form = new RuntimeShellForm(options, instanceCoordinator);
        instanceCoordinator.ActivationRequested += form.HandleExternalActivationRequest;
        instanceCoordinator.ReportPhase(RuntimeShellPhases.FormCreated, statusMessage: "RuntimeShellForm constructed.");
        RuntimeShellLogger.Log("runtime-shell-form-created");
        Application.Run(form);
        return form.ExitCode;
    }
}
