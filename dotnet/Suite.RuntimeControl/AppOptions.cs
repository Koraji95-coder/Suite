namespace Suite.RuntimeControl;

internal sealed class AppOptions
{
    public required string RepoRoot { get; init; }

    public bool AutoBootstrap { get; init; }

    public static AppOptions Parse(string[] args)
    {
        var repoRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", ".."));
        var autoBootstrap = false;

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
            }
        }

        if (string.IsNullOrWhiteSpace(repoRoot))
        {
            repoRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", ".."));
        }

        return new AppOptions
        {
            RepoRoot = Path.GetFullPath(repoRoot),
            AutoBootstrap = autoBootstrap,
        };
    }
}
