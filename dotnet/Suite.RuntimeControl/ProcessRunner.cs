using System.Diagnostics;
using System.Text;

namespace Suite.RuntimeControl;

internal sealed record ProcessRunResult(int ExitCode, string StandardOutput, string StandardError)
{
    public bool Succeeded => ExitCode == 0;

    public string CombinedOutput =>
        string.Join(
                Environment.NewLine,
                new[] { StandardOutput, StandardError }.Where(static text => !string.IsNullOrWhiteSpace(text))
            )
            .Trim();
}

internal static class ProcessRunner
{
    public static async Task<ProcessRunResult> RunAsync(
        string fileName,
        string workingDirectory,
        IEnumerable<string> arguments,
        CancellationToken cancellationToken = default)
    {
        using var process = new Process();
        process.StartInfo = new ProcessStartInfo
        {
            FileName = fileName,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };

        foreach (var argument in arguments)
        {
            process.StartInfo.ArgumentList.Add(argument);
        }

        process.Start();

        var stdOutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var stdErrTask = process.StandardError.ReadToEndAsync(cancellationToken);

        try
        {
            await process.WaitForExitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            TryKill(process);
            throw;
        }

        var standardOutput = await stdOutTask;
        var standardError = await stdErrTask;

        return new ProcessRunResult(process.ExitCode, standardOutput.Trim(), standardError.Trim());
    }

    public static Task<ProcessRunResult> RunPowerShellFileAsync(
        string scriptPath,
        string workingDirectory,
        IEnumerable<string> arguments,
        CancellationToken cancellationToken = default)
    {
        var commandArguments = new List<string>
        {
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            scriptPath,
        };
        commandArguments.AddRange(arguments);

        return RunAsync(
            fileName: "PowerShell.exe",
            workingDirectory: workingDirectory,
            arguments: commandArguments,
            cancellationToken: cancellationToken);
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: false);
            }
        }
        catch
        {
        }
    }
}
