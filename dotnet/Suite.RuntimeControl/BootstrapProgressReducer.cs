using System.Text.Json;

namespace Suite.RuntimeControl;

internal sealed record BootstrapProgressState(
    bool Running,
    bool Done,
    bool Ok,
    int Attempt,
    int MaxAttempts,
    string? CurrentStepId,
    string? CurrentStepLabel,
    IReadOnlyList<string> CompletedStepIds,
    IReadOnlyList<string> FailedStepIds,
    int Percent,
    string? Summary,
    string? StartedAt,
    string? UpdatedAt);

internal sealed record BootstrapProgressViewModel(
    bool Available,
    bool ShowCard,
    bool Running,
    bool Done,
    bool Ok,
    int Attempt,
    int MaxAttempts,
    string? CurrentStepId,
    string? CurrentStepLabel,
    IReadOnlyList<string> CompletedStepIds,
    IReadOnlyList<string> FailedStepIds,
    IReadOnlyList<string> FailedStepLabels,
    int Percent,
    string? Summary,
    string? StartedAt,
    string? UpdatedAt,
    string StatusState,
    string StatusText);

internal static class BootstrapProgressReducer
{
    private static readonly (string Id, string Label, int Weight)[] Milestones =
    {
        ("docker-ready", "Docker Engine", 15),
        ("supabase-start", "Supabase", 25),
        ("supabase-env", "Supabase Env", 5),
        ("watchdog-filesystem", "Filesystem Collector", 10),
        ("watchdog-autocad-startup", "AutoCAD Collector", 10),
        ("watchdog-autocad-plugin", "AutoCAD Plugins", 5),
        ("backend", "Watchdog Backend", 10),
        ("gateway", "API Gateway", 10),
        ("frontend", "Suite Frontend", 10),
    };

    private static readonly IReadOnlyDictionary<string, (string Label, int Weight)> MilestoneMap =
        Milestones.ToDictionary(static item => item.Id, static item => (item.Label, item.Weight), StringComparer.OrdinalIgnoreCase);

    internal static IReadOnlyList<string> KnownStepIds => Milestones.Select(static item => item.Id).ToArray();

    internal static BootstrapProgressViewModel Reduce(BootstrapProgressState? state)
    {
        if (state is null)
        {
            return new BootstrapProgressViewModel(
                Available: false,
                ShowCard: false,
                Running: false,
                Done: false,
                Ok: false,
                Attempt: 0,
                MaxAttempts: 0,
                CurrentStepId: null,
                CurrentStepLabel: null,
                CompletedStepIds: Array.Empty<string>(),
                FailedStepIds: Array.Empty<string>(),
                FailedStepLabels: Array.Empty<string>(),
                Percent: 0,
                Summary: null,
                StartedAt: null,
                UpdatedAt: null,
                StatusState: "pending",
                StatusText: "IDLE");
        }

        var completed = NormalizeKnownStepIds(state.CompletedStepIds);
        var failed = NormalizeKnownStepIds(state.FailedStepIds);
        var allStepsComplete = AreAllStepsComplete(completed);
        var weightedPercent = completed.Sum(static stepId => MilestoneMap[stepId].Weight);
        var percent = state.Done && state.Ok && allStepsComplete
            ? 100
            : Math.Min(Math.Max(weightedPercent, Math.Max(state.Percent, 0)), 99);

        var statusState = state.Running
            ? "starting"
            : state.Done
                ? state.Ok ? "running" : "error"
                : percent > 0 ? "starting" : "pending";
        var statusText = state.Running
            ? "BOOTING"
            : state.Done
                ? state.Ok ? "READY" : "ATTENTION"
                : percent > 0 ? "BOOTING" : "IDLE";
        var failedStepLabels = failed
            .Select(static stepId => MilestoneMap.TryGetValue(stepId, out var meta) ? meta.Label : stepId)
            .ToArray();

        return new BootstrapProgressViewModel(
            Available: true,
            ShowCard: state.Running || (state.Done && !state.Ok),
            Running: state.Running,
            Done: state.Done,
            Ok: state.Ok,
            Attempt: Math.Max(state.Attempt, 0),
            MaxAttempts: Math.Max(state.MaxAttempts, 0),
            CurrentStepId: state.CurrentStepId,
            CurrentStepLabel: state.CurrentStepLabel,
            CompletedStepIds: completed,
            FailedStepIds: failed,
            FailedStepLabels: failedStepLabels,
            Percent: percent,
            Summary: state.Summary,
            StartedAt: state.StartedAt,
            UpdatedAt: state.UpdatedAt,
            StatusState: statusState,
            StatusText: statusText);
    }

    internal static bool TryParseFromSnapshot(JsonElement root, out BootstrapProgressState? state)
    {
        state = null;
        if (!root.TryGetProperty("runtime", out var runtime) ||
            runtime.ValueKind != JsonValueKind.Object ||
            !runtime.TryGetProperty("currentBootstrap", out var currentBootstrap) ||
            currentBootstrap.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        state = new BootstrapProgressState(
            Running: GetBoolean(currentBootstrap, "running"),
            Done: GetBoolean(currentBootstrap, "done"),
            Ok: GetBoolean(currentBootstrap, "ok"),
            Attempt: GetInt32(currentBootstrap, "attempt"),
            MaxAttempts: GetInt32(currentBootstrap, "maxAttempts"),
            CurrentStepId: GetString(currentBootstrap, "currentStepId"),
            CurrentStepLabel: GetString(currentBootstrap, "currentStepLabel"),
            CompletedStepIds: GetStringArray(currentBootstrap, "completedStepIds"),
            FailedStepIds: GetStringArray(currentBootstrap, "failedStepIds"),
            Percent: GetInt32(currentBootstrap, "percent"),
            Summary: GetString(currentBootstrap, "summary"),
            StartedAt: GetString(currentBootstrap, "startedAt"),
            UpdatedAt: GetString(currentBootstrap, "updatedAt"));
        return true;
    }

    private static string[] NormalizeKnownStepIds(IEnumerable<string>? stepIds)
    {
        if (stepIds is null)
        {
            return Array.Empty<string>();
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var normalized = new List<string>();

        foreach (var stepId in KnownStepIds)
        {
            if (stepIds.Any(candidate => string.Equals(candidate, stepId, StringComparison.OrdinalIgnoreCase)) && seen.Add(stepId))
            {
                normalized.Add(stepId);
            }
        }

        foreach (var candidate in stepIds)
        {
            if (string.IsNullOrWhiteSpace(candidate) || MilestoneMap.ContainsKey(candidate) || !seen.Add(candidate))
            {
                continue;
            }

            normalized.Add(candidate);
        }

        return normalized.ToArray();
    }

    private static bool AreAllStepsComplete(IReadOnlyCollection<string> completedStepIds)
    {
        foreach (var stepId in KnownStepIds)
        {
            if (!completedStepIds.Contains(stepId, StringComparer.OrdinalIgnoreCase))
            {
                return false;
            }
        }

        return true;
    }

    private static bool GetBoolean(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return false;
        }

        return property.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Number => property.TryGetInt32(out var numericValue) && numericValue != 0,
            JsonValueKind.String => bool.TryParse(property.GetString(), out var boolValue) && boolValue,
            _ => false,
        };
    }

    private static int GetInt32(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return 0;
        }

        if (property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var numericValue))
        {
            return numericValue;
        }

        if (property.ValueKind == JsonValueKind.String && int.TryParse(property.GetString(), out var parsedValue))
        {
            return parsedValue;
        }

        return 0;
    }

    private static string? GetString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var value = property.GetString();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static string[] GetStringArray(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return Array.Empty<string>();
        }

        if (property.ValueKind == JsonValueKind.Array)
        {
            return property
                .EnumerateArray()
                .Where(static item => item.ValueKind == JsonValueKind.String)
                .Select(static item => item.GetString())
                .Where(static item => !string.IsNullOrWhiteSpace(item))
                .Cast<string>()
                .ToArray();
        }

        if (property.ValueKind == JsonValueKind.String)
        {
            var value = property.GetString();
            return string.IsNullOrWhiteSpace(value) ? Array.Empty<string>() : new[] { value };
        }

        return Array.Empty<string>();
    }
}
