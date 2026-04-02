using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace Suite.RuntimeControl;

internal sealed class OfficeBrokerClient
{
    private static readonly HttpClient HttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(4),
    };

    private static readonly IReadOnlyDictionary<string, BrokerRoutePlan> RoutePlans =
        new Dictionary<string, BrokerRoutePlan>(StringComparer.OrdinalIgnoreCase)
        {
            ["office.chat.send"] = new(HttpMethod.Post, ["chat/send", "chat"]),
            ["office.chat.set_route"] = new(HttpMethod.Post, ["chat/set-route", "chat/route"]),
            ["office.chat.list_threads"] = new(HttpMethod.Get, ["chat/threads", "chat/list-threads"]),
            ["office.study.start"] = new(HttpMethod.Post, ["study/start"]),
            ["office.study.generate_practice"] = new(HttpMethod.Post, ["study/generate-practice", "study/practice/generate"]),
            ["office.study.score_practice"] = new(HttpMethod.Post, ["study/score-practice", "study/practice/score"]),
            ["office.study.generate_defense"] = new(HttpMethod.Post, ["study/generate-defense", "study/defense/generate"]),
            ["office.study.score_defense"] = new(HttpMethod.Post, ["study/score-defense", "study/defense/score"]),
            ["office.study.save_reflection"] = new(HttpMethod.Post, ["study/save-reflection", "study/reflection/save"]),
            ["office.research.run"] = new(HttpMethod.Post, ["research/run"]),
            ["office.research.save"] = new(HttpMethod.Post, ["research/save"]),
            ["office.watchlist.run"] = new(HttpMethod.Post, ["watchlists/run", "growth/watchlists/run"]),
            ["office.inbox.list"] = new(HttpMethod.Get, ["inbox/list", "inbox"]),
            ["office.inbox.resolve"] = new(HttpMethod.Post, ["inbox/resolve"]),
            ["office.inbox.queue"] = new(HttpMethod.Post, ["inbox/queue"]),
            ["office.library.import"] = new(HttpMethod.Post, ["library/import", "library/import-document"]),
            ["office.history.reset"] = new(HttpMethod.Post, ["history/reset"]),
            ["office.workspace.reset"] = new(HttpMethod.Post, ["workspace/reset"]),
        };

    public async Task<OfficeBrokerRequestResult> GetHealthAsync(OfficeBrokerConfiguration configuration, CancellationToken cancellationToken = default)
    {
        return await SendAsync(
            configuration,
            HttpMethod.Get,
            [
                configuration.HealthPath,
                "/health",
            ],
            payload: null,
            cancellationToken);
    }

    public async Task<OfficeBrokerRequestResult> GetStateAsync(OfficeBrokerConfiguration configuration, CancellationToken cancellationToken = default)
    {
        return await SendAsync(
            configuration,
            HttpMethod.Get,
            [
                configuration.StatePath,
                "/state",
            ],
            payload: null,
            cancellationToken);
    }

    public async Task<OfficeBrokerRequestResult> SendMessageAsync(
        OfficeBrokerConfiguration configuration,
        string messageType,
        JsonElement? payload,
        CancellationToken cancellationToken = default)
    {
        if (!RoutePlans.TryGetValue(messageType, out var plan))
        {
            return OfficeBrokerRequestResult.FromUnsupported(messageType);
        }

        return await SendAsync(configuration, plan.Method, plan.Paths, payload, cancellationToken);
    }

    private static async Task<OfficeBrokerRequestResult> SendAsync(
        OfficeBrokerConfiguration configuration,
        HttpMethod method,
        IReadOnlyList<string> pathCandidates,
        JsonElement? payload,
        CancellationToken cancellationToken)
    {
        if (!configuration.Enabled)
        {
            return OfficeBrokerRequestResult.Disabled();
        }

        if (!Uri.TryCreate(configuration.BaseUrl, UriKind.Absolute, out var baseUri))
        {
            return OfficeBrokerRequestResult.Unavailable("Office broker base URL is invalid.");
        }

        Exception? terminalException = null;
        HttpStatusCode? lastStatusCode = null;
        string? lastErrorBody = null;
        string? lastRequestUri = null;

        foreach (var requestPath in BuildRequestPaths(configuration, pathCandidates))
        {
            var requestUri = new Uri(baseUri, requestPath);
            lastRequestUri = requestUri.ToString();

            using var request = new HttpRequestMessage(
                method,
                method == HttpMethod.Get
                    ? AppendQueryString(requestUri, payload)
                    : requestUri);
            if (method != HttpMethod.Get)
            {
                request.Content = new StringContent(GetPayloadText(payload), Encoding.UTF8, "application/json");
            }

            try
            {
                using var response = await HttpClient.SendAsync(request, cancellationToken);
                var responseText = await response.Content.ReadAsStringAsync(cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    return OfficeBrokerRequestResult.FromSuccess(
                        requestUri: lastRequestUri,
                        responseJson: CoerceResponseJson(responseText));
                }

                lastStatusCode = response.StatusCode;
                lastErrorBody = Truncate(responseText, 240);
                if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed)
                {
                    continue;
                }

                return OfficeBrokerRequestResult.HttpFailure(
                    statusCode: (int)response.StatusCode,
                    requestUri: lastRequestUri,
                    error: lastErrorBody);
            }
            catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
            {
                terminalException = exception;
            }
        }

        if (terminalException is not null)
        {
            return OfficeBrokerRequestResult.Unavailable(
                $"{terminalException.GetType().Name}: {terminalException.Message}",
                lastRequestUri);
        }

        return OfficeBrokerRequestResult.HttpFailure(
            statusCode: lastStatusCode is null ? null : (int)lastStatusCode.Value,
            requestUri: lastRequestUri,
            error: lastErrorBody ?? "Office broker did not expose the requested endpoint.");
    }

    private static IReadOnlyList<string> BuildRequestPaths(OfficeBrokerConfiguration configuration, IReadOnlyList<string> pathCandidates)
    {
        var results = new List<string>();
        foreach (var prefix in configuration.Prefixes ?? [])
        {
            foreach (var candidate in pathCandidates)
            {
                var merged = MergePath(prefix, candidate);
                if (!results.Contains(merged, StringComparer.OrdinalIgnoreCase))
                {
                    results.Add(merged);
                }
            }
        }

        if (results.Count == 0)
        {
            foreach (var candidate in pathCandidates)
            {
                var normalized = MergePath(string.Empty, candidate);
                if (!results.Contains(normalized, StringComparer.OrdinalIgnoreCase))
                {
                    results.Add(normalized);
                }
            }
        }

        return results;
    }

    private static string MergePath(string prefix, string path)
    {
        var normalizedPrefix = NormalizeSegment(prefix);
        var normalizedPath = NormalizeSegment(path);
        if (string.IsNullOrWhiteSpace(normalizedPrefix))
        {
            return "/" + normalizedPath;
        }

        if (string.IsNullOrWhiteSpace(normalizedPath))
        {
            return "/" + normalizedPrefix;
        }

        return $"/{normalizedPrefix}/{normalizedPath}";
    }

    private static string NormalizeSegment(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return value.Trim().Trim('/').Trim();
    }

    private static Uri AppendQueryString(Uri uri, JsonElement? payload)
    {
        if (!payload.HasValue || payload.Value.ValueKind != JsonValueKind.Object)
        {
            return uri;
        }

        var parts = new List<string>();
        foreach (var property in payload.Value.EnumerateObject())
        {
            var valueText = property.Value.ValueKind switch
            {
                JsonValueKind.String => property.Value.GetString(),
                JsonValueKind.Number => property.Value.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                _ => null,
            };

            if (string.IsNullOrWhiteSpace(valueText))
            {
                continue;
            }

            parts.Add($"{Uri.EscapeDataString(property.Name)}={Uri.EscapeDataString(valueText)}");
        }

        if (parts.Count == 0)
        {
            return uri;
        }

        var separator = string.IsNullOrWhiteSpace(uri.Query) ? "?" : "&";
        return new Uri(uri + separator + string.Join("&", parts));
    }

    private static string GetPayloadText(JsonElement? payload)
    {
        return payload.HasValue && payload.Value.ValueKind != JsonValueKind.Undefined
            ? payload.Value.GetRawText()
            : "{}";
    }

    private static string CoerceResponseJson(string responseText)
    {
        if (string.IsNullOrWhiteSpace(responseText))
        {
            return "{}";
        }

        try
        {
            using var _ = JsonDocument.Parse(responseText);
            return responseText;
        }
        catch
        {
            return JsonSerializer.Serialize(new { text = responseText });
        }
    }

    private static string Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return value.Length <= maxLength ? value : $"{value[..Math.Max(0, maxLength - 3)]}...";
    }

    private sealed record BrokerRoutePlan(HttpMethod Method, string[] Paths);
}

internal sealed class OfficeBrokerRequestResult
{
    public bool Success { get; init; }
    public bool BrokerReachable { get; init; }
    public int? StatusCode { get; init; }
    public string? RequestUri { get; init; }
    public string? ResponseJson { get; init; }
    public string? Error { get; init; }
    public bool Unsupported { get; init; }

    public static OfficeBrokerRequestResult FromSuccess(string requestUri, string responseJson)
    {
        return new OfficeBrokerRequestResult
        {
            Success = true,
            BrokerReachable = true,
            RequestUri = requestUri,
            ResponseJson = responseJson,
        };
    }

    public static OfficeBrokerRequestResult HttpFailure(int? statusCode, string? requestUri, string? error)
    {
        return new OfficeBrokerRequestResult
        {
            Success = false,
            BrokerReachable = true,
            StatusCode = statusCode,
            RequestUri = requestUri,
            Error = error,
        };
    }

    public static OfficeBrokerRequestResult Unavailable(string error, string? requestUri = null)
    {
        return new OfficeBrokerRequestResult
        {
            Success = false,
            BrokerReachable = false,
            RequestUri = requestUri,
            Error = error,
        };
    }

    public static OfficeBrokerRequestResult Disabled()
    {
        return new OfficeBrokerRequestResult
        {
            Success = false,
            BrokerReachable = false,
            Error = "Office broker is disabled in local companion config.",
        };
    }

    public static OfficeBrokerRequestResult FromUnsupported(string messageType)
    {
        return new OfficeBrokerRequestResult
        {
            Success = false,
            BrokerReachable = false,
            Unsupported = true,
            Error = $"Office broker message '{messageType}' is not mapped.",
        };
    }
}
