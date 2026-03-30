using System.Text.Json;

namespace Suite.RuntimeControl;

internal sealed class RuntimeCatalog
{
    public string[] ServiceOrder { get; init; } = [];
    public Dictionary<string, RuntimeCatalogServiceMeta> Services { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public string[] BootstrapStepOrder { get; init; } = [];
    public Dictionary<string, RuntimeCatalogBootstrapStepMeta> BootstrapSteps { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, RuntimeCatalogRouteShortcut> WorkshopRouteShortcuts { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public RuntimeCatalogSupportAction[] SupportActions { get; init; } = [];

    public static RuntimeCatalog LoadFromFile(
        string path,
        JsonSerializerOptions options,
        out string rawJson)
    {
        try
        {
            if (File.Exists(path))
            {
                rawJson = File.ReadAllText(path);
                return Normalize(JsonSerializer.Deserialize<RuntimeCatalog>(rawJson, options));
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-catalog-load", exception);
        }

        var fallback = CreateDefault();
        rawJson = JsonSerializer.Serialize(fallback, options);
        return fallback;
    }

    public bool TryResolveRoutePath(string routeId, out string path)
    {
        path = string.Empty;
        if (string.IsNullOrWhiteSpace(routeId))
        {
            return false;
        }

        if (!WorkshopRouteShortcuts.TryGetValue(routeId, out var shortcut))
        {
            return false;
        }

        path = shortcut.Path?.Trim() ?? string.Empty;
        return !string.IsNullOrWhiteSpace(path);
    }

    public string GetServiceLabel(string serviceId)
    {
        if (!string.IsNullOrWhiteSpace(serviceId) && Services.TryGetValue(serviceId, out var meta))
        {
            return meta.BootLabel?.Trim() ?? serviceId;
        }

        return serviceId;
    }

    private static RuntimeCatalog Normalize(RuntimeCatalog? catalog)
    {
        var fallback = CreateDefault();
        var normalizedServiceOrder = NormalizeOrder(catalog?.ServiceOrder, fallback.ServiceOrder);
        var normalizedServices = NormalizeServiceMeta(catalog?.Services, fallback.Services, normalizedServiceOrder);
        var normalizedBootstrapOrder = NormalizeOrder(catalog?.BootstrapStepOrder, fallback.BootstrapStepOrder);
        var normalizedBootstrapSteps = NormalizeBootstrapMeta(catalog?.BootstrapSteps, fallback.BootstrapSteps, normalizedBootstrapOrder);
        var normalizedShortcuts = NormalizeRouteShortcuts(catalog?.WorkshopRouteShortcuts, fallback.WorkshopRouteShortcuts);
        var normalizedSupportActions = NormalizeSupportActions(catalog?.SupportActions, fallback.SupportActions);

        return new RuntimeCatalog
        {
            ServiceOrder = normalizedServiceOrder,
            Services = normalizedServices,
            BootstrapStepOrder = normalizedBootstrapOrder,
            BootstrapSteps = normalizedBootstrapSteps,
            WorkshopRouteShortcuts = normalizedShortcuts,
            SupportActions = normalizedSupportActions,
        };
    }

    private static string[] NormalizeOrder(IEnumerable<string>? candidate, IReadOnlyList<string> fallback)
    {
        var normalized = (candidate ?? [])
            .Where(static item => !string.IsNullOrWhiteSpace(item))
            .Select(static item => item.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return normalized.Length > 0 ? normalized : [.. fallback];
    }

    private static Dictionary<string, RuntimeCatalogServiceMeta> NormalizeServiceMeta(
        Dictionary<string, RuntimeCatalogServiceMeta>? candidate,
        Dictionary<string, RuntimeCatalogServiceMeta> fallback,
        IEnumerable<string> serviceOrder)
    {
        var normalized = new Dictionary<string, RuntimeCatalogServiceMeta>(StringComparer.OrdinalIgnoreCase);
        foreach (var serviceId in serviceOrder)
        {
            if (candidate is not null && candidate.TryGetValue(serviceId, out var meta) && IsValidServiceMeta(meta))
            {
                normalized[serviceId] = NormalizeServiceMeta(meta, serviceId);
                continue;
            }

            if (fallback.TryGetValue(serviceId, out var fallbackMeta))
            {
                normalized[serviceId] = fallbackMeta;
                continue;
            }

            normalized[serviceId] = new RuntimeCatalogServiceMeta
            {
                ShortLabel = serviceId[..Math.Min(serviceId.Length, 2)].ToUpperInvariant(),
                BootLabel = serviceId,
                Description = string.Empty,
            };
        }

        return normalized;
    }

    private static Dictionary<string, RuntimeCatalogBootstrapStepMeta> NormalizeBootstrapMeta(
        Dictionary<string, RuntimeCatalogBootstrapStepMeta>? candidate,
        Dictionary<string, RuntimeCatalogBootstrapStepMeta> fallback,
        IEnumerable<string> stepOrder)
    {
        var normalized = new Dictionary<string, RuntimeCatalogBootstrapStepMeta>(StringComparer.OrdinalIgnoreCase);
        foreach (var stepId in stepOrder)
        {
            if (candidate is not null && candidate.TryGetValue(stepId, out var meta) && IsValidBootstrapStepMeta(meta))
            {
                normalized[stepId] = NormalizeBootstrapStepMeta(meta, stepId);
                continue;
            }

            if (fallback.TryGetValue(stepId, out var fallbackMeta))
            {
                normalized[stepId] = fallbackMeta;
                continue;
            }

            normalized[stepId] = new RuntimeCatalogBootstrapStepMeta
            {
                Label = stepId,
                ShortLabel = stepId[..Math.Min(stepId.Length, 2)].ToUpperInvariant(),
            };
        }

        return normalized;
    }

    private static Dictionary<string, RuntimeCatalogRouteShortcut> NormalizeRouteShortcuts(
        Dictionary<string, RuntimeCatalogRouteShortcut>? candidate,
        Dictionary<string, RuntimeCatalogRouteShortcut> fallback)
    {
        var source = candidate is { Count: > 0 } ? candidate : fallback;
        var normalized = new Dictionary<string, RuntimeCatalogRouteShortcut>(StringComparer.OrdinalIgnoreCase);
        foreach (var (routeId, shortcut) in source)
        {
            if (!IsValidRouteShortcut(shortcut))
            {
                continue;
            }

            normalized[routeId] = new RuntimeCatalogRouteShortcut
            {
                Title = shortcut.Title.Trim(),
                Path = shortcut.Path.Trim(),
                Description = shortcut.Description?.Trim() ?? string.Empty,
            };
        }

        return normalized.Count > 0
            ? normalized
            : new Dictionary<string, RuntimeCatalogRouteShortcut>(fallback, StringComparer.OrdinalIgnoreCase);
    }

    private static RuntimeCatalogSupportAction[] NormalizeSupportActions(
        IEnumerable<RuntimeCatalogSupportAction>? candidate,
        IReadOnlyList<RuntimeCatalogSupportAction> fallback)
    {
        var normalized = (candidate ?? [])
            .Where(IsValidSupportAction)
            .Select(static action => new RuntimeCatalogSupportAction
            {
                Id = action.Id.Trim(),
                Label = action.Label.Trim(),
                Description = action.Description?.Trim() ?? string.Empty,
            })
            .ToArray();

        return normalized.Length > 0 ? normalized : [.. fallback];
    }

    private static RuntimeCatalogServiceMeta NormalizeServiceMeta(RuntimeCatalogServiceMeta meta, string serviceId) =>
        new()
        {
            ShortLabel = string.IsNullOrWhiteSpace(meta.ShortLabel)
                ? serviceId[..Math.Min(serviceId.Length, 2)].ToUpperInvariant()
                : meta.ShortLabel.Trim(),
            BootLabel = string.IsNullOrWhiteSpace(meta.BootLabel) ? serviceId : meta.BootLabel.Trim(),
            Description = meta.Description?.Trim() ?? string.Empty,
        };

    private static RuntimeCatalogBootstrapStepMeta NormalizeBootstrapStepMeta(RuntimeCatalogBootstrapStepMeta meta, string stepId) =>
        new()
        {
            Label = string.IsNullOrWhiteSpace(meta.Label) ? stepId : meta.Label.Trim(),
            ShortLabel = string.IsNullOrWhiteSpace(meta.ShortLabel)
                ? stepId[..Math.Min(stepId.Length, 2)].ToUpperInvariant()
                : meta.ShortLabel.Trim(),
        };

    private static bool IsValidServiceMeta(RuntimeCatalogServiceMeta? meta) =>
        meta is not null && !string.IsNullOrWhiteSpace(meta.BootLabel);

    private static bool IsValidBootstrapStepMeta(RuntimeCatalogBootstrapStepMeta? meta) =>
        meta is not null && !string.IsNullOrWhiteSpace(meta.Label);

    private static bool IsValidRouteShortcut(RuntimeCatalogRouteShortcut? shortcut) =>
        shortcut is not null &&
        !string.IsNullOrWhiteSpace(shortcut.Title) &&
        !string.IsNullOrWhiteSpace(shortcut.Path);

    private static bool IsValidSupportAction(RuntimeCatalogSupportAction? action) =>
        action is not null &&
        !string.IsNullOrWhiteSpace(action.Id) &&
        !string.IsNullOrWhiteSpace(action.Label);

    private static RuntimeCatalog CreateDefault() =>
        new()
        {
            ServiceOrder =
            [
                "supabase",
                "backend",
                "gateway",
                "frontend",
                "watchdog-filesystem",
                "watchdog-autocad",
            ],
            Services = new Dictionary<string, RuntimeCatalogServiceMeta>(StringComparer.OrdinalIgnoreCase)
            {
                ["supabase"] = new() { ShortLabel = "SB", BootLabel = "Supabase", Description = "PostgreSQL, Auth, Storage, and local APIs" },
                ["backend"] = new() { ShortLabel = "BE", BootLabel = "Watchdog Backend", Description = "API server and runtime jobs" },
                ["gateway"] = new() { ShortLabel = "GW", BootLabel = "API Gateway", Description = "Local transport and auth edge" },
                ["frontend"] = new() { ShortLabel = "UI", BootLabel = "Suite Frontend", Description = "Vite shell and local app routes" },
                ["watchdog-filesystem"] = new() { ShortLabel = "FS", BootLabel = "Filesystem Collector", Description = "Filesystem watcher and activity intake" },
                ["watchdog-autocad"] = new() { ShortLabel = "AC", BootLabel = "AutoCAD Collector", Description = "Drawing tracker and AutoCAD plugin readiness" },
            },
            BootstrapStepOrder =
            [
                "docker-ready",
                "supabase-start",
                "supabase-env",
                "watchdog-filesystem",
                "watchdog-autocad-startup",
                "watchdog-autocad-plugin",
                "backend",
                "gateway",
                "frontend",
            ],
            BootstrapSteps = new Dictionary<string, RuntimeCatalogBootstrapStepMeta>(StringComparer.OrdinalIgnoreCase)
            {
                ["docker-ready"] = new() { Label = "Docker Engine", ShortLabel = "DK" },
                ["supabase-start"] = new() { Label = "Supabase", ShortLabel = "SB" },
                ["supabase-env"] = new() { Label = "Supabase Env", ShortLabel = "SE" },
                ["watchdog-filesystem"] = new() { Label = "Filesystem Collector", ShortLabel = "FS" },
                ["watchdog-autocad-startup"] = new() { Label = "AutoCAD Collector", ShortLabel = "AC" },
                ["watchdog-autocad-plugin"] = new() { Label = "AutoCAD Plugins", ShortLabel = "AP" },
                ["backend"] = new() { Label = "Watchdog Backend", ShortLabel = "BE" },
                ["gateway"] = new() { Label = "API Gateway", ShortLabel = "GW" },
                ["frontend"] = new() { Label = "Suite Frontend", ShortLabel = "UI" },
            },
            WorkshopRouteShortcuts = new Dictionary<string, RuntimeCatalogRouteShortcut>(StringComparer.OrdinalIgnoreCase)
            {
                ["developer-portal"] = new() { Title = "Developer Portal", Path = "/app/developer", Description = "Developer workshop launcher for staged tools, publishing context, and lab surfaces." },
                ["command-center"] = new() { Title = "Command Center", Path = "/app/command-center", Description = "Developer diagnostics toolshed for Suite Doctor, hosted push, and incident evidence." },
                ["watchdog"] = new() { Title = "Watchdog", Path = "/app/watchdog", Description = "Drawing activity and workstation reporting route." },
            },
            SupportActions =
            [
                new() { Id = "open-bootstrap-log", Label = "Open bootstrap log", Description = "Open the live bootstrap transcript for the current workstation runtime." },
                new() { Id = "open-status-dir", Label = "Open status folder", Description = "Open the local runtime status directory that stores bootstrap snapshots and logs." },
                new() { Id = "copy-summary", Label = "Copy support summary", Description = "Copy the current runtime, doctor, and service summary for support handoff." },
                new() { Id = "apply-workstation-profile", Label = "Apply workstation profile", Description = "Re-stamp the workstation identity and local MCP env block for this machine." },
                new() { Id = "export-bundle", Label = "Export support bundle", Description = "Package the current runtime logs, doctor snapshot, and Watchdog evidence into one support archive." },
            ],
        };
}

internal sealed class RuntimeCatalogServiceMeta
{
    public string ShortLabel { get; init; } = string.Empty;
    public string BootLabel { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
}

internal sealed class RuntimeCatalogBootstrapStepMeta
{
    public string Label { get; init; } = string.Empty;
    public string ShortLabel { get; init; } = string.Empty;
}

internal sealed class RuntimeCatalogRouteShortcut
{
    public string Title { get; init; } = string.Empty;
    public string Path { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
}

internal sealed class RuntimeCatalogSupportAction
{
    public string Id { get; init; } = string.Empty;
    public string Label { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
}
