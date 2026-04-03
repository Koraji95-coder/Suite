using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Suite.RuntimeControl;

internal sealed class ProjectStandardsActionHandler
{
    internal const string BasePath = "/api/workstation/project-standards";
    internal const string RunReviewPath = BasePath + "/run-review";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
    };

    private static readonly HashSet<string> DirectorySkipNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ".git",
        ".playwright-cli",
        ".runlogs",
        ".codex-runtime",
        "node_modules",
        "dist",
        "dist-ssr",
        "bin",
        "obj",
        "artifacts",
    };

    private readonly string _repoRoot;
    private readonly Action<string> _logInfo;
    private readonly Action<string, Exception> _logException;
    private readonly Dictionary<string, string> _repoSettings;

    public ProjectStandardsActionHandler(
        string repoRoot,
        Action<string> logInfo,
        Action<string, Exception> logException)
    {
        _repoRoot = repoRoot;
        _logInfo = logInfo;
        _logException = logException;
        _repoSettings = LoadRepoSettings(repoRoot);
    }

    public async Task<bool> TryHandleAsync(
        HttpListenerContext context,
        string? origin,
        CancellationToken cancellationToken)
    {
        var request = context.Request;
        var response = context.Response;
        var requestPath = WorkstationFolderPickerBridge.NormalizePath(request.Url?.AbsolutePath);
        if (!requestPath.StartsWith(BasePath, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        try
        {
            if (!string.Equals(request.HttpMethod, "POST", StringComparison.OrdinalIgnoreCase))
            {
                await WorkstationFolderPickerBridge.WriteJsonAsync(
                    response,
                    origin,
                    request,
                    HttpStatusCode.NotFound,
                    new ErrorEnvelope
                    {
                        Success = false,
                        Code = "ROUTE_NOT_FOUND",
                        Message = "Project standards route was not found.",
                        RequestId = string.Empty,
                    },
                    cancellationToken).ConfigureAwait(false);
                return true;
            }

            var payload = request.HasEntityBody
                ? await JsonSerializer.DeserializeAsync<JsonObject>(
                    request.InputStream,
                    JsonOptions,
                    cancellationToken).ConfigureAwait(false)
                : new JsonObject();
            payload ??= new JsonObject();

            var ticketValue = ReadString(payload, "ticket");
            var expectedAction = ResolveExpectedAction(requestPath);
            if (!TryValidateTicket(ticketValue, expectedAction, origin, out var ticket, out var validationError))
            {
                await WorkstationFolderPickerBridge.WriteJsonAsync(
                    response,
                    origin,
                    request,
                    HttpStatusCode.Forbidden,
                    new ErrorEnvelope
                    {
                        Success = false,
                        Code = "AUTH_INVALID_TICKET",
                        Message = validationError,
                        RequestId = ticket?.RequestId ?? ReadString(payload, "requestId"),
                        Meta = BuildMeta(expectedAction),
                    },
                    cancellationToken).ConfigureAwait(false);
                return true;
            }

            payload.Remove("ticket");
            payload["requestId"] = ticket!.RequestId;

            if (string.Equals(requestPath, RunReviewPath, StringComparison.OrdinalIgnoreCase))
            {
                await HandleRunReviewAsync(context, origin, payload, ticket, cancellationToken).ConfigureAwait(false);
                return true;
            }

            await WorkstationFolderPickerBridge.WriteJsonAsync(
                response,
                origin,
                request,
                HttpStatusCode.NotFound,
                new ErrorEnvelope
                {
                    Success = false,
                    Code = "ROUTE_NOT_FOUND",
                    Message = "Project standards route was not found.",
                    RequestId = ticket.RequestId,
                },
                cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (JsonException exception)
        {
            await WorkstationFolderPickerBridge.WriteJsonAsync(
                response,
                origin,
                request,
                HttpStatusCode.BadRequest,
                new ErrorEnvelope
                {
                    Success = false,
                    Code = "INVALID_REQUEST",
                    Message = $"Project standards request payload was invalid. {exception.Message}",
                    RequestId = string.Empty,
                },
                cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (Exception exception)
        {
            _logException("runtime-control-project-standards", exception);
            await WorkstationFolderPickerBridge.WriteJsonAsync(
                response,
                origin,
                request,
                HttpStatusCode.InternalServerError,
                new ErrorEnvelope
                {
                    Success = false,
                    Code = "PROJECT_STANDARDS_ACTION_FAILED",
                    Message = exception.Message,
                    RequestId = string.Empty,
                },
                cancellationToken).ConfigureAwait(false);
            return true;
        }
    }

    private async Task HandleRunReviewAsync(
        HttpListenerContext context,
        string? origin,
        JsonObject payload,
        TicketClaims ticket,
        CancellationToken cancellationToken)
    {
        var projectRootPath = ReadString(payload, "projectRootPath");
        if (!Path.IsPathRooted(projectRootPath) || !Directory.Exists(projectRootPath))
        {
            await WriteErrorAsync(
                context,
                origin,
                HttpStatusCode.BadRequest,
                "INVALID_REQUEST",
                "projectRootPath must be an existing absolute directory.",
                ticket.RequestId,
                ticket.Action,
                cancellationToken).ConfigureAwait(false);
            return;
        }

        var selectedStandardIds = ReadStringList(payload["selectedStandardIds"]);
        if (selectedStandardIds.Count == 0)
        {
            await WriteErrorAsync(
                context,
                origin,
                HttpStatusCode.BadRequest,
                "INVALID_REQUEST",
                "selectedStandardIds must include at least one standard.",
                ticket.RequestId,
                ticket.Action,
                cancellationToken).ConfigureAwait(false);
            return;
        }

        var projectRoot = new DirectoryInfo(Path.GetFullPath(projectRootPath));
        var drawingPaths = ScanProjectFiles(projectRoot, ".dwg");
        var dwsPaths = ScanProjectFiles(projectRoot, ".dws");

        var requestPayload = (JsonObject)payload.DeepClone();
        requestPayload["requestId"] = ticket.RequestId;
        requestPayload["drawingPaths"] = ToJsonArray(drawingPaths.Select(file => file.FullName));
        requestPayload["dwsPaths"] = ToJsonArray(dwsPaths.Select(file => file.FullName));
        requestPayload["drawingCount"] = drawingPaths.Count;
        requestPayload["dwsFileCount"] = dwsPaths.Count;

        var pipeResponse = await TryDispatchPipeActionAsync(
            "suite_project_standards_review",
            requestPayload,
            ResolveSetting("AUTOCAD_DOTNET_ACADE_PIPE_NAME", "SUITE_ACADE_PIPE"),
            timeoutMs: 120_000,
            cancellationToken).ConfigureAwait(false);

        if (!pipeResponse.Success)
        {
            await WriteErrorAsync(
                context,
                origin,
                HttpStatusCode.BadGateway,
                pipeResponse.Code,
                pipeResponse.Message,
                ticket.RequestId,
                ticket.Action,
                cancellationToken,
                warnings: pipeResponse.Warnings).ConfigureAwait(false);
            return;
        }

        await WorkstationFolderPickerBridge.WriteJsonAsync(
            context.Response,
            origin,
            context.Request,
            HttpStatusCode.OK,
            new SuccessEnvelope
            {
                Success = true,
                Code = string.Empty,
                Message = pipeResponse.Message,
                RequestId = ticket.RequestId,
                Data = pipeResponse.Data,
                Warnings = pipeResponse.Warnings,
                Meta = BuildMeta(ticket.Action, pipeResponse.ProviderPath),
            },
            cancellationToken).ConfigureAwait(false);
    }

    private async Task<PipeDispatchResult> TryDispatchPipeActionAsync(
        string action,
        JsonObject payload,
        string primaryPipe,
        int timeoutMs,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(primaryPipe))
        {
            return new PipeDispatchResult(
                false,
                "PIPE_NOT_CONFIGURED",
                "Pipe name is not configured.",
                new JsonArray());
        }

        var token = ResolveSetting("AUTOCAD_DOTNET_TOKEN", string.Empty);
        try
        {
            var client = new ProjectSetupPipeClient(primaryPipe, token);
            var envelope = await client.SendAsync(action, payload, timeoutMs, cancellationToken).ConfigureAwait(false);
            var parsed = ParsePipeEnvelope(envelope);
            if (parsed.Success)
            {
                parsed.ProviderPath = "dotnet+inproc";
            }
            return parsed;
        }
        catch (Exception exception)
        {
            return new PipeDispatchResult(
                false,
                "PIPE_DISPATCH_FAILED",
                $"Unable to dispatch {action} over {primaryPipe}: {exception.Message}",
                new JsonArray());
        }
    }

    private static PipeDispatchResult ParsePipeEnvelope(JsonObject envelope)
    {
        var ok = ReadBool(envelope, "ok");
        if (!ok)
        {
            return new PipeDispatchResult(
                false,
                "PIPE_ENVELOPE_FAILED",
                ReadString(envelope, "error") ?? "Pipe action failed.",
                new JsonArray());
        }

        var result = ReadObject(envelope, "result");
        if (!ReadBool(result, "success"))
        {
            return new PipeDispatchResult(
                false,
                ReadString(result, "code") ?? "ACTION_FAILED",
                ReadString(result, "message") ?? "Pipe action failed.",
                ToJsonArray(ReadStringList(result["warnings"])));
        }

        return new PipeDispatchResult(
            true,
            string.Empty,
            ReadString(result, "message") ?? "Local action completed.",
            ToJsonArray(ReadStringList(result["warnings"])),
            ReadObject(result, "data"));
    }

    private List<FileInfo> ScanProjectFiles(DirectoryInfo projectRoot, string extension)
    {
        var output = new List<FileInfo>();
        var pending = new Queue<DirectoryInfo>();
        pending.Enqueue(projectRoot);

        while (pending.Count > 0)
        {
            var current = pending.Dequeue();
            foreach (var directory in current.EnumerateDirectories())
            {
                if (directory.Name.StartsWith(".", StringComparison.OrdinalIgnoreCase) ||
                    DirectorySkipNames.Contains(directory.Name))
                {
                    continue;
                }

                pending.Enqueue(directory);
            }

            foreach (var file in current.EnumerateFiles())
            {
                if (!string.Equals(file.Extension, extension, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                output.Add(file);
            }
        }

        output.Sort((left, right) => string.Compare(left.FullName, right.FullName, StringComparison.OrdinalIgnoreCase));
        return output;
    }

    private string ResolveSetting(string key, string fallback)
    {
        var envValue = Environment.GetEnvironmentVariable(key);
        if (!string.IsNullOrWhiteSpace(envValue))
        {
            return envValue.Trim();
        }

        if (_repoSettings.TryGetValue(key, out var repoValue) && !string.IsNullOrWhiteSpace(repoValue))
        {
            return repoValue.Trim();
        }

        return fallback;
    }

    private static Dictionary<string, string> LoadRepoSettings(string repoRoot)
    {
        var output = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var envPath = Path.Combine(repoRoot, ".env");
        if (!File.Exists(envPath))
        {
            return output;
        }

        foreach (var rawLine in File.ReadAllLines(envPath))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal))
            {
                continue;
            }

            var separatorIndex = line.IndexOf('=');
            if (separatorIndex <= 0)
            {
                continue;
            }

            var key = line[..separatorIndex].Trim();
            var value = line[(separatorIndex + 1)..].Trim().Trim('"');
            output[key] = value;
        }

        return output;
    }

    private bool TryValidateTicket(
        string ticketValue,
        string expectedAction,
        string? origin,
        out TicketClaims? ticket,
        out string error)
    {
        ticket = null;
        error = "Missing local action ticket.";
        if (string.IsNullOrWhiteSpace(ticketValue))
        {
            return false;
        }

        var ticketParts = ticketValue.Split('.', 2);
        if (ticketParts.Length != 2)
        {
            error = "Local action ticket format is invalid.";
            return false;
        }

        var secret = ResolveSetting("API_KEY", string.Empty);
        if (string.IsNullOrWhiteSpace(secret))
        {
            error = "Runtime Control could not resolve the ticket validation secret.";
            return false;
        }

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var expectedSignatureBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(ticketParts[0]));
        var expectedSignature = Convert.ToHexString(expectedSignatureBytes).ToLowerInvariant();
        if (!string.Equals(expectedSignature, ticketParts[1], StringComparison.OrdinalIgnoreCase))
        {
            error = "Local action ticket signature is invalid.";
            return false;
        }

        string payloadJson;
        try
        {
            payloadJson = Encoding.UTF8.GetString(Base64UrlDecode(ticketParts[0]));
        }
        catch
        {
            error = "Local action ticket payload could not be decoded.";
            return false;
        }

        var payload = JsonSerializer.Deserialize<TicketClaims>(payloadJson, JsonOptions);
        if (payload is null)
        {
            error = "Local action ticket payload is invalid.";
            return false;
        }

        if (!string.Equals(payload.Action, expectedAction, StringComparison.OrdinalIgnoreCase))
        {
            error = $"Local action ticket does not allow '{expectedAction}'.";
            return false;
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (payload.ExpiresAt <= now)
        {
            error = "Local action ticket has expired.";
            return false;
        }

        if (!string.IsNullOrWhiteSpace(payload.Origin) &&
            !string.IsNullOrWhiteSpace(origin) &&
            !string.Equals(payload.Origin, origin, StringComparison.OrdinalIgnoreCase))
        {
            error = "Local action ticket origin does not match this request.";
            return false;
        }

        ticket = payload;
        error = string.Empty;
        return true;
    }

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight(padded.Length + ((4 - padded.Length % 4) % 4), '=');
        return Convert.FromBase64String(padded);
    }

    private static string ResolveExpectedAction(string requestPath) => requestPath switch
    {
        RunReviewPath => "run-review",
        _ => string.Empty,
    };

    private static JsonObject BuildMeta(string action, string providerPath = "runtime-control")
    {
        return new JsonObject
        {
            ["action"] = action,
            ["providerPath"] = providerPath,
        };
    }

    private async Task WriteErrorAsync(
        HttpListenerContext context,
        string? origin,
        HttpStatusCode statusCode,
        string code,
        string message,
        string requestId,
        string action,
        CancellationToken cancellationToken,
        JsonArray? warnings = null)
    {
        await WorkstationFolderPickerBridge.WriteJsonAsync(
            context.Response,
            origin,
            context.Request,
            statusCode,
            new ErrorEnvelope
            {
                Success = false,
                Code = code,
                Message = message,
                RequestId = requestId,
                Warnings = warnings,
                Meta = BuildMeta(action),
            },
            cancellationToken).ConfigureAwait(false);
    }

    private static JsonObject ReadObject(JsonObject payload, string propertyName)
    {
        return payload[propertyName] as JsonObject ?? new JsonObject();
    }

    private static string ReadString(JsonObject payload, string propertyName)
    {
        if (payload.TryGetPropertyValue(propertyName, out var valueNode) &&
            valueNode is JsonValue jsonValue &&
            jsonValue.TryGetValue<string>(out var stringValue))
        {
            return stringValue?.Trim() ?? string.Empty;
        }

        return string.Empty;
    }

    private static bool ReadBool(JsonObject payload, string propertyName)
    {
        if (payload.TryGetPropertyValue(propertyName, out var valueNode) &&
            valueNode is JsonValue jsonValue &&
            jsonValue.TryGetValue<bool>(out var boolValue))
        {
            return boolValue;
        }

        return false;
    }

    private static List<string> ReadStringList(JsonNode? node)
    {
        var output = new List<string>();
        if (node is not JsonArray array)
        {
            return output;
        }

        foreach (var entry in array)
        {
            if (entry is JsonValue jsonValue &&
                jsonValue.TryGetValue<string>(out var stringValue) &&
                !string.IsNullOrWhiteSpace(stringValue))
            {
                output.Add(stringValue.Trim());
            }
        }

        return output;
    }

    private static JsonArray ToJsonArray(IEnumerable<string> values)
    {
        var array = new JsonArray();
        foreach (var value in values)
        {
            array.Add(value);
        }
        return array;
    }

    internal bool ValidateTicketForTests(
        string ticketValue,
        string expectedAction,
        string? origin,
        out string error)
    {
        return TryValidateTicket(ticketValue, expectedAction, origin, out _, out error);
    }

    internal IReadOnlyList<string> ScanProjectFilesForTests(string projectRootPath, string extension)
    {
        var projectRoot = new DirectoryInfo(Path.GetFullPath(projectRootPath));
        return ScanProjectFiles(projectRoot, extension)
            .Select(file => file.FullName)
            .ToArray();
    }

    private sealed record TicketClaims(
        string UserId,
        string Action,
        string RequestId,
        string Origin,
        string ProjectId,
        long IssuedAt,
        long ExpiresAt);

    private sealed record PipeDispatchResult(
        bool Success,
        string Code,
        string Message,
        JsonArray Warnings,
        JsonObject? Data = null)
    {
        public string ProviderPath { get; set; } = "runtime-control";
    }

    private sealed class SuccessEnvelope
    {
        public bool Success { get; init; }
        public string? Code { get; init; }
        public string? Message { get; init; }
        public string? RequestId { get; init; }
        public JsonObject? Data { get; init; }
        public JsonArray? Warnings { get; init; }
        public JsonObject? Meta { get; init; }
    }

    private sealed class ErrorEnvelope
    {
        public bool Success { get; init; }
        public string? Code { get; init; }
        public string? Message { get; init; }
        public string? RequestId { get; init; }
        public JsonArray? Warnings { get; init; }
        public JsonObject? Meta { get; init; }
    }
}
