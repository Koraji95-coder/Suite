using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace Suite.RuntimeControl;

internal static class RuntimeShellWindowActivator
{
    private const int SwRestore = 9;
    private const uint GaRoot = 2;

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static bool TryActivateExistingWindow(string processName, string? primaryStatePath = null)
    {
        if (TryActivateWindowFromPrimaryState(primaryStatePath))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(processName))
        {
            return false;
        }

        for (var attempt = 0; attempt < 10; attempt += 1)
        {
            foreach (var process in Process.GetProcessesByName(processName))
            {
                try
                {
                    if (TryActivateProcess(process))
                    {
                        return true;
                    }
                }
                catch
                {
                }
            }

            Thread.Sleep(250);
        }

        return false;
    }

    private static bool TryActivateWindowFromPrimaryState(string? primaryStatePath)
    {
        if (string.IsNullOrWhiteSpace(primaryStatePath) || !File.Exists(primaryStatePath))
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(primaryStatePath));
            if (!document.RootElement.TryGetProperty("processId", out var processIdElement) ||
                !processIdElement.TryGetInt32(out var processId) ||
                processId <= 0 ||
                processId == Environment.ProcessId)
            {
                return false;
            }

            using var process = Process.GetProcessById(processId);
            return TryActivateProcess(process);
        }
        catch
        {
            return false;
        }
    }

    private static bool TryActivateProcess(Process process)
    {
        try
        {
            process.Refresh();
            if (process.HasExited || process.Id == Environment.ProcessId)
            {
                return false;
            }

            var handle = TryResolveWindowHandle(process);
            if (handle == IntPtr.Zero)
            {
                return false;
            }

            ShowWindowAsync(handle, SwRestore);
            SetForegroundWindow(handle);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static IntPtr TryResolveWindowHandle(Process process)
    {
        process.Refresh();
        if (process.MainWindowHandle != IntPtr.Zero)
        {
            return process.MainWindowHandle;
        }

        IntPtr resolvedHandle = IntPtr.Zero;
        EnumWindows((windowHandle, _) =>
        {
            if (!IsWindowVisible(windowHandle))
            {
                return true;
            }

            GetWindowThreadProcessId(windowHandle, out var processId);
            if (processId != process.Id)
            {
                return true;
            }

            var rootHandle = GetAncestor(windowHandle, GaRoot);
            if (rootHandle == IntPtr.Zero)
            {
                rootHandle = windowHandle;
            }

            var titleBuffer = new StringBuilder(256);
            _ = GetWindowText(rootHandle, titleBuffer, titleBuffer.Capacity);
            if (titleBuffer.Length == 0)
            {
                return true;
            }

            resolvedHandle = rootHandle;
            return false;
        }, IntPtr.Zero);

        return resolvedHandle;
    }
}
