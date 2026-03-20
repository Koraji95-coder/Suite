using System.Text;

namespace Suite.RuntimeControl;

internal static class RuntimeShellLogger
{
    private static readonly object Sync = new();

    public static string LogPath { get; } = BuildLogPath();

    public static void Log(string message)
    {
        try
        {
            var directory = Path.GetDirectoryName(LogPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var line = $"[{DateTimeOffset.Now:O}] {message}";
            lock (Sync)
            {
                File.AppendAllText(LogPath, line + Environment.NewLine, Encoding.UTF8);
            }
        }
        catch
        {
        }
    }

    public static void LogException(string context, Exception exception)
    {
        Log($"{context}: {exception}");
    }

    private static string BuildLogPath()
    {
        var basePath = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(basePath))
        {
            basePath = Path.GetTempPath();
        }

        return Path.Combine(basePath, "Suite", "runtime-bootstrap", "runtime-shell.log");
    }
}
