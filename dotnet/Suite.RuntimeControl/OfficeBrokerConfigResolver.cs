using System.Text.Json;

namespace Suite.RuntimeControl;

internal sealed class OfficeBrokerConfiguration
{
    public required string BaseUrl { get; init; }
    public required string HealthPath { get; init; }
    public required string StatePath { get; init; }
    public string[] Prefixes { get; init; } = [];
    public string? PublishPath { get; init; }
    public string? ConfigPath { get; init; }
    public bool ConfigExists { get; init; }
    public bool Enabled { get; init; } = true;
}

internal static class OfficeBrokerConfigResolver
{
    private const string DefaultBaseUrl = "http://127.0.0.1:57420";
    private const string DefaultHealthPath = "/health";
    private const string DefaultStatePath = "/state";

    public static OfficeBrokerConfiguration Resolve(string suiteRepoRoot)
    {
        var companionConfigPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Suite",
            "runtime-bootstrap",
            "companion-config",
            "office.json");
        var companionConfig = ReadJsonObject(companionConfigPath);
        var broker = TryGetObject(companionConfig, "broker");
        var prefixes = ReadPrefixList(broker, companionConfig);
        var rootDirectory = TryGetTrimmedString(companionConfig, "rootDirectory")
            ?? TryGetTrimmedString(companionConfig, "dailyRoot");

        var baseUrl = NormalizeBaseUrl(
            Environment.GetEnvironmentVariable("SUITE_OFFICE_BROKER_BASE_URL")
            ?? TryGetTrimmedString(broker, "baseUrl")
            ?? TryGetTrimmedString(companionConfig, "brokerBaseUrl")
            ?? DefaultBaseUrl);
        var healthPath = NormalizePath(
            TryGetTrimmedString(broker, "healthPath")
            ?? TryGetTrimmedString(companionConfig, "brokerHealthPath")
            ?? DefaultHealthPath);
        var statePath = NormalizePath(
            TryGetTrimmedString(broker, "statePath")
            ?? TryGetTrimmedString(companionConfig, "brokerStatePath")
            ?? DefaultStatePath);
        var publishPath = Environment.GetEnvironmentVariable("SUITE_OFFICE_BROKER_PUBLISH_PATH")
            ?? TryGetTrimmedString(broker, "publishPath")
            ?? TryGetTrimmedString(companionConfig, "brokerPublishPath")
            ?? DeriveBrokerPublishPath(rootDirectory);
        var enabled = TryGetBoolean(broker, "enabled")
            ?? TryGetBoolean(companionConfig, "brokerEnabled")
            ?? true;

        if (prefixes.Length == 0)
        {
            prefixes =
            [
                string.Empty,
                "/api",
                "/api/office",
                "/office",
            ];
        }

        return new OfficeBrokerConfiguration
        {
            BaseUrl = baseUrl,
            HealthPath = healthPath,
            StatePath = statePath,
            Prefixes = prefixes,
            PublishPath = string.IsNullOrWhiteSpace(publishPath)
                ? null
                : ResolvePathIfPossible(publishPath, suiteRepoRoot),
            ConfigPath = companionConfigPath,
            ConfigExists = File.Exists(companionConfigPath),
            Enabled = enabled,
        };
    }

    private static string[] ReadPrefixList(JsonElement? broker, JsonElement? root)
    {
        var prefixes = GetStringArray(broker, "prefixes");
        if (prefixes.Count == 0)
        {
            prefixes = GetStringArray(root, "brokerPrefixes");
        }

        return prefixes
            .Select(NormalizePrefix)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string NormalizeBaseUrl(string baseUrl)
    {
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var parsed))
        {
            parsed = new Uri(DefaultBaseUrl, UriKind.Absolute);
        }

        return parsed.GetLeftPart(UriPartial.Authority);
    }

    private static string NormalizePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return "/";
        }

        var normalized = path.Trim();
        if (!normalized.StartsWith('/'))
        {
            normalized = "/" + normalized;
        }

        return normalized;
    }

    private static string NormalizePrefix(string prefix)
    {
        if (string.IsNullOrWhiteSpace(prefix))
        {
            return string.Empty;
        }

        var normalized = prefix.Trim();
        if (!normalized.StartsWith('/'))
        {
            normalized = "/" + normalized;
        }

        return normalized.TrimEnd('/');
    }

    private static string ResolvePathIfPossible(string path, string suiteRepoRoot)
    {
        if (Path.IsPathRooted(path))
        {
            return path;
        }

        try
        {
            return Path.GetFullPath(Path.Combine(suiteRepoRoot, path));
        }
        catch
        {
            return path;
        }
    }

    private static string? DeriveBrokerPublishPath(string? rootDirectory)
    {
        if (string.IsNullOrWhiteSpace(rootDirectory))
        {
            return null;
        }

        try
        {
            return Path.GetFullPath(Path.Combine(rootDirectory, "artifacts", "DailyDesk.Broker", "publish"));
        }
        catch
        {
            return null;
        }
    }

    private static JsonElement? ReadJsonObject(string path)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            return document.RootElement.Clone();
        }
        catch
        {
            return null;
        }
    }

    private static JsonElement? TryGetObject(JsonElement? parent, string propertyName)
    {
        if (
            !parent.HasValue ||
            !parent.Value.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return property.Clone();
    }

    private static string? TryGetTrimmedString(JsonElement? element, string propertyName)
    {
        if (
            !element.HasValue ||
            !element.Value.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var value = property.GetString();
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static bool? TryGetBoolean(JsonElement? element, string propertyName)
    {
        if (!element.HasValue || !element.Value.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String when bool.TryParse(property.GetString(), out var parsed) => parsed,
            _ => null,
        };
    }

    private static List<string> GetStringArray(JsonElement? element, string propertyName)
    {
        if (
            !element.HasValue ||
            !element.Value.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return property
            .EnumerateArray()
            .Where(static item => item.ValueKind == JsonValueKind.String)
            .Select(static item => item.GetString())
            .Where(static item => !string.IsNullOrWhiteSpace(item))
            .Cast<string>()
            .ToList();
    }
}
