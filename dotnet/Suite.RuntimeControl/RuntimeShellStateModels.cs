namespace Suite.RuntimeControl;

internal sealed class RuntimeShellWindowState
{
    public int Left { get; set; }
    public int Top { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public string WindowState { get; set; } = "Normal";
    public int UtilityPaneWidth { get; set; } = 400;
    public string UtilityPaneTab { get; set; } = "context";
    public string ActiveLogSourceId { get; set; } = "transcript";
}

internal static class RuntimeShellPhases
{
    public const string Starting = "starting";
    public const string FormConstructing = "form_constructing";
    public const string FormCreated = "form_created";
    public const string Shown = "shown";
    public const string UiReady = "ui_ready";
    public const string Closing = "closing";
}

internal sealed class RuntimeShellPrimaryState
{
    public int ProcessId { get; init; }

    public string? ProcessPath { get; init; }

    public string? RepoRoot { get; init; }

    public string Phase { get; init; } = RuntimeShellPhases.Starting;

    public bool Activatable { get; init; }

    public string? StatusMessage { get; init; }

    public DateTimeOffset StartedAt { get; init; }

    public DateTimeOffset LastHeartbeat { get; init; }

    public DateTimeOffset UpdatedAt { get; init; }
}

internal sealed class RuntimeLogSourceDescriptor
{
    public required string Id { get; init; }
    public required string Label { get; init; }
    public required string Kind { get; init; }
    public string? Path { get; init; }
    public string? Description { get; init; }
    public bool Exists { get; init; }
}

internal sealed class DockerContainerSummary
{
    public required string Name { get; init; }
    public required string Image { get; init; }
    public required string State { get; init; }
    public required string Status { get; init; }
    public required string Ports { get; init; }
    public required string Health { get; init; }
}

internal sealed class DockerObservabilitySummary
{
    public bool Available { get; init; }
    public required string DockerDesktopHint { get; init; }
    public required string DockerDesktopPath { get; init; }
    public required string SupabaseStudioUrl { get; init; }
    public IReadOnlyList<DockerContainerSummary> Containers { get; init; } = Array.Empty<DockerContainerSummary>();
    public IReadOnlyList<string> ImportantVolumes { get; init; } = Array.Empty<string>();
}

internal sealed class ToolingSummary
{
    public IReadOnlyList<string> ActiveMcpServers { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> RecommendedSkills { get; init; } = Array.Empty<string>();
}
