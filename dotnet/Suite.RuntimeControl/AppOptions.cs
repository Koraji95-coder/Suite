namespace Suite.RuntimeControl;

internal sealed class AppOptions
{
    public required string RepoRoot { get; init; }

    public bool AutoBootstrap { get; init; }

    public bool ActivateExistingOnly { get; init; }

    public static AppOptions Parse(string[] args)
    {
        var repoRoot = ResolveDefaultRepoRoot();
        var autoBootstrap = false;
        var activateExistingOnly = false;

        for (var index = 0; index < args.Length; index += 1)
        {
            var argument = args[index];
            switch (argument)
            {
                case "--repo-root":
                    if ((index + 1) < args.Length)
                    {
                        repoRoot = args[index + 1];
                        index += 1;
                    }
                    break;
                case "--auto-bootstrap":
                    autoBootstrap = true;
                    break;
                case "--activate-existing-only":
                    activateExistingOnly = true;
                    break;
            }
        }

        if (string.IsNullOrWhiteSpace(repoRoot))
        {
            repoRoot = ResolveDefaultRepoRoot();
        }

        return new AppOptions
        {
            RepoRoot = Path.GetFullPath(repoRoot),
            AutoBootstrap = autoBootstrap,
            ActivateExistingOnly = activateExistingOnly,
        };
    }

    private static string ResolveDefaultRepoRoot()
    {
        foreach (var candidate in new[] { AppContext.BaseDirectory, Environment.CurrentDirectory })
        {
            var resolved = TryResolveRepoRoot(candidate);
            if (!string.IsNullOrWhiteSpace(resolved))
            {
                return resolved;
            }
        }

        return Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", ".."));
    }

    private static string? TryResolveRepoRoot(string? startPath)
    {
        if (string.IsNullOrWhiteSpace(startPath))
        {
            return null;
        }

        DirectoryInfo? directory;
        try
        {
            directory = new DirectoryInfo(Path.GetFullPath(startPath));
        }
        catch
        {
            return null;
        }

        while (directory is not null)
        {
            var statusScriptPath = Path.Combine(directory.FullName, "scripts", "get-suite-runtime-status.ps1");
            var packageJsonPath = Path.Combine(directory.FullName, "package.json");
            if (File.Exists(statusScriptPath) && File.Exists(packageJsonPath))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        return null;
    }
}
