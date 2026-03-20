using System.Windows.Forms;

namespace Suite.RuntimeControl;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
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
        RuntimeShellLogger.Log($"runtime-shell-started: repo={options.RepoRoot}; autoBootstrap={options.AutoBootstrap}");

        ApplicationConfiguration.Initialize();
        Application.Run(new RuntimeShellForm(options));
    }
}
