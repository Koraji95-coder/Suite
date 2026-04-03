using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Suite.RuntimeControl;

internal sealed class ProjectSetupActionHandler
{
    internal const string BasePath = "/api/workstation/project-setup";
    internal const string PickRootPath = BasePath + "/pick-root";
    internal const string ScanRootPath = BasePath + "/scan-root";
    internal const string EnsureArtifactsPath = BasePath + "/ensure-artifacts";
    internal const string OpenAcadePath = BasePath + "/open-acade";
    internal const string CreateAcadePath = BasePath + "/create-acade";
    internal const string ApplyTitleBlockPath = BasePath + "/apply-title-block";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
    };

    private static readonly HashSet<string> SupportedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".dwg",
        ".pdf",
        ".wdp",
        ".wdt",
        ".wdl",
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
    private readonly Func<string?, string?, CancellationToken, Task<string?>> _pickFolderAsync;
    private readonly Action<string> _logInfo;
    private readonly Action<string, Exception> _logException;
    private readonly Dictionary<string, string> _repoSettings;
    private readonly Func<string, string, string, JsonObject, int, CancellationToken, Task<PipeDispatchResult>>? _dispatchPipeOverrideAsync;

    public ProjectSetupActionHandler(
        string repoRoot,
        Func<string?, string?, CancellationToken, Task<string?>> pickFolderAsync,
        Action<string> logInfo,
        Action<string, Exception> logException)
        : this(repoRoot, pickFolderAsync, logInfo, logException, null)
    {
    }

    internal ProjectSetupActionHandler(
        string repoRoot,
        Func<string?, string?, CancellationToken, Task<string?>> pickFolderAsync,
        Action<string> logInfo,
        Action<string, Exception> logException,
        Func<string, string, string, JsonObject, int, CancellationToken, Task<PipeDispatchResult>>? dispatchPipeOverrideAsync)
    {
        _repoRoot = repoRoot;
        _pickFolderAsync = pickFolderAsync;
        _logInfo = logInfo;
        _logException = logException;
        _repoSettings = LoadRepoSettings(repoRoot);
        _dispatchPipeOverrideAsync = dispatchPipeOverrideAsync;
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
                        Message = "Project setup route was not found.",
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
                        Meta = new JsonObject
                        {
                            ["action"] = expectedAction,
                            ["providerPath"] = "runtime-control",
                        },
                    },
                    cancellationToken).ConfigureAwait(false);
                return true;
            }

            payload.Remove("ticket");
            payload["requestId"] = ticket!.RequestId;

            if (string.Equals(requestPath, PickRootPath, StringComparison.OrdinalIgnoreCase))
            {
                await HandlePickRootAsync(context, origin, payload, ticket, cancellationToken).ConfigureAwait(false);
                return true;
            }

            if (string.Equals(requestPath, ScanRootPath, StringComparison.OrdinalIgnoreCase))
            {
                await HandleScanRootAsync(context, origin, payload, ticket, cancellationToken).ConfigureAwait(false);
                return true;
            }

            if (string.Equals(requestPath, EnsureArtifactsPath, StringComparison.OrdinalIgnoreCase))
            {
                await HandleEnsureArtifactsAsync(context, origin, payload, ticket, cancellationToken).ConfigureAwait(false);
                return true;
            }

            if (string.Equals(requestPath, OpenAcadePath, StringComparison.OrdinalIgnoreCase))
            {
                await HandlePipeActionAsync(
                    context,
                    origin,
                    payload,
                    ticket,
                    pipeAction: "suite_acade_project_open",
                    primaryPipe: ResolveSetting("AUTOCAD_DOTNET_ACADE_PIPE_NAME", "SUITE_ACADE_PIPE"),
                    timeoutMs: 120_000,
                    cancellationToken: cancellationToken).ConfigureAwait(false);
                return true;
            }

            if (string.Equals(requestPath, CreateAcadePath, StringComparison.OrdinalIgnoreCase))
            {
                await HandlePipeActionAsync(
                    context,
                    origin,
                    payload,
                    ticket,
                    pipeAction: "suite_acade_project_create",
                    primaryPipe: ResolveSetting("AUTOCAD_DOTNET_ACADE_PIPE_NAME", "SUITE_ACADE_PIPE"),
                    timeoutMs: 120_000,
                    cancellationToken: cancellationToken).ConfigureAwait(false);
                return true;
            }

            if (string.Equals(requestPath, ApplyTitleBlockPath, StringComparison.OrdinalIgnoreCase))
            {
                await HandlePipeActionAsync(
                    context,
                    origin,
                    payload,
                    ticket,
                    pipeAction: "suite_title_block_apply",
                    primaryPipe: ResolveSetting("AUTOCAD_DOTNET_ACADE_PIPE_NAME", "SUITE_ACADE_PIPE"),
                    timeoutMs: 120_000,
                    cancellationToken: cancellationToken).ConfigureAwait(false);
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
                    Message = "Project setup route was not found.",
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
                    Message = $"Project setup request payload was invalid. {exception.Message}",
                    RequestId = string.Empty,
                },
                cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (Exception exception)
        {
            _logException("runtime-control-project-setup", exception);
            await WorkstationFolderPickerBridge.WriteJsonAsync(
                response,
                origin,
                request,
                HttpStatusCode.InternalServerError,
                new ErrorEnvelope
                {
                    Success = false,
                    Code = "PROJECT_SETUP_ACTION_FAILED",
                    Message = exception.Message,
                    RequestId = string.Empty,
                },
                cancellationToken).ConfigureAwait(false);
            return true;
        }
    }

    private async Task HandlePickRootAsync(
        HttpListenerContext context,
        string? origin,
        JsonObject payload,
        TicketClaims ticket,
        CancellationToken cancellationToken)
    {
        var selectedPath = await _pickFolderAsync(
            ReadString(payload, "initialPath"),
            ReadString(payload, "title"),
            cancellationToken).ConfigureAwait(false);
        var normalizedSelectedPath = string.IsNullOrWhiteSpace(selectedPath)
            ? null
            : Path.GetFullPath(selectedPath.Trim());

        await WorkstationFolderPickerBridge.WriteJsonAsync(
            context.Response,
            origin,
            context.Request,
            HttpStatusCode.OK,
            new SuccessEnvelope
            {
                Success = true,
                Code = string.Empty,
                Message = string.IsNullOrWhiteSpace(normalizedSelectedPath)
                    ? "Project root selection was cancelled."
                    : "Project root selected.",
                RequestId = ticket.RequestId,
                Data = new JsonObject
                {
                    ["cancelled"] = string.IsNullOrWhiteSpace(normalizedSelectedPath),
                    ["path"] = normalizedSelectedPath,
                },
                Meta = BuildMeta(ticket.Action),
            },
            cancellationToken).ConfigureAwait(false);
    }

    private async Task HandleScanRootAsync(
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

        var projectRoot = new DirectoryInfo(Path.GetFullPath(projectRootPath));
        var files = ScanProjectFiles(projectRoot);
        var profile = ReadObject(payload, "profile");
        var artifacts = BuildArtifactSnapshot(projectRoot, files, profile);
        var cadDrawingResult = await TryScanProjectSetupCadDrawingsAsync(
            files,
            profile,
            ticket.RequestId,
            cancellationToken).ConfigureAwait(false);

        var filePayload = new JsonArray();
        foreach (var file in files)
        {
            var relativePath = Path.GetRelativePath(projectRoot.FullName, file.FullName)
                .Replace("\\", "/");
            filePayload.Add(new JsonObject
            {
                ["absolutePath"] = file.FullName,
                ["relativePath"] = relativePath,
                ["fileType"] = file.Extension.TrimStart('.').ToLowerInvariant(),
            });
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
                Message = "Project root scan completed.",
                RequestId = ticket.RequestId,
                Data = new JsonObject
                {
                    ["projectRootPath"] = projectRoot.FullName,
                    ["files"] = filePayload,
                    ["bridgeDrawings"] = cadDrawingResult.Drawings,
                    ["artifacts"] = artifacts,
                },
                Warnings = cadDrawingResult.Warnings,
                Meta = BuildMeta(ticket.Action),
            },
            cancellationToken).ConfigureAwait(false);
    }

    private async Task HandleEnsureArtifactsAsync(
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

        var artifacts = ReadObject(payload, "artifacts");
        var projectRoot = Path.GetFullPath(projectRootPath);
        var wdpPath = ResolveArtifactPath(projectRoot, ReadString(artifacts, "wdpPath"));
        var wdtPath = ResolveArtifactPath(projectRoot, ReadString(artifacts, "wdtPath"));
        var wdlPath = ResolveArtifactPath(projectRoot, ReadString(artifacts, "wdlPath"));
        if (string.IsNullOrWhiteSpace(wdpPath) ||
            string.IsNullOrWhiteSpace(wdtPath) ||
            string.IsNullOrWhiteSpace(wdlPath))
        {
            await WriteErrorAsync(
                context,
                origin,
                HttpStatusCode.BadRequest,
                "INVALID_REQUEST",
                "Artifacts payload must include absolute WDP, WDT, and WDL paths.",
                ticket.RequestId,
                ticket.Action,
                cancellationToken).ConfigureAwait(false);
            return;
        }

        EnsureTextFile(wdpPath, ReadString(artifacts, "wdpText"));
        EnsureTextFile(wdtPath, ReadString(artifacts, "wdtText"));
        EnsureTextFile(wdlPath, ReadString(artifacts, "wdlText"));
        var updatedPickerPaths = UpdateAcadePickerFolder(wdpPath);

        await WorkstationFolderPickerBridge.WriteJsonAsync(
            context.Response,
            origin,
            context.Request,
            HttpStatusCode.OK,
            new SuccessEnvelope
            {
                Success = true,
                Code = string.Empty,
                Message = "ACADE support artifacts are ready.",
                RequestId = ticket.RequestId,
                Data = new JsonObject
                {
                    ["wdpPath"] = wdpPath,
                    ["wdtPath"] = wdtPath,
                    ["wdlPath"] = wdlPath,
                    ["wdpText"] = ReadString(artifacts, "wdpText"),
                    ["wdtText"] = ReadString(artifacts, "wdtText"),
                    ["wdlText"] = ReadString(artifacts, "wdlText"),
                    ["wdpState"] = ReadString(artifacts, "wdpState"),
                    ["wdpExists"] = File.Exists(wdpPath),
                    ["wdtExists"] = File.Exists(wdtPath),
                    ["wdlExists"] = File.Exists(wdlPath),
                    ["wdPickPrjDlgFolder"] = Path.GetDirectoryName(wdpPath) ?? string.Empty,
                    ["wdPickPrjDlgUpdatedPaths"] = ToJsonArray(updatedPickerPaths),
                },
                Meta = BuildMeta(ticket.Action),
            },
            cancellationToken).ConfigureAwait(false);
    }

    private async Task HandlePipeActionAsync(
        HttpListenerContext context,
        string? origin,
        JsonObject payload,
        TicketClaims ticket,
        string pipeAction,
        string primaryPipe,
        int timeoutMs,
        CancellationToken cancellationToken)
    {
        var requestPayload = (JsonObject)payload.DeepClone();
        requestPayload["requestId"] = ticket.RequestId;

        var response = await TryDispatchPipeActionAsync(
            pipeAction,
            requestPayload,
            primaryPipe,
            timeoutMs,
            cancellationToken).ConfigureAwait(false);

        if (!response.Success)
        {
            await WriteErrorAsync(
                context,
                origin,
                HttpStatusCode.BadGateway,
                response.Code,
                response.Message,
                ticket.RequestId,
                ticket.Action,
                cancellationToken,
                warnings: response.Warnings).ConfigureAwait(false);
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
                Message = response.Message,
                RequestId = ticket.RequestId,
                Data = response.Data,
                Warnings = response.Warnings,
                Meta = BuildMeta(ticket.Action, response.ProviderPath),
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
        var token = ResolveSetting("AUTOCAD_DOTNET_TOKEN", string.Empty);
        var primaryResult = _dispatchPipeOverrideAsync is null
            ? await TryDispatchSinglePipeAsync(
                primaryPipe,
                token,
                action,
                payload,
                timeoutMs,
                cancellationToken).ConfigureAwait(false)
            : await _dispatchPipeOverrideAsync(
                primaryPipe,
                token,
                action,
                payload,
                timeoutMs,
                cancellationToken).ConfigureAwait(false);
        if (primaryResult.Success)
        {
            primaryResult.ProviderPath = "dotnet+inproc";
            return primaryResult;
        }

        return WithCadHostOnlyFailure(primaryResult, primaryPipe);
    }

    private async Task<PipeDispatchResult> TryDispatchSinglePipeAsync(
        string pipeName,
        string token,
        string action,
        JsonObject payload,
        int timeoutMs,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(pipeName))
        {
            return new PipeDispatchResult(false, "PIPE_NOT_CONFIGURED", "Pipe name is not configured.", new JsonArray());
        }

        try
        {
            var client = new ProjectSetupPipeClient(pipeName, token);
            var envelope = await client.SendAsync(action, payload, timeoutMs, cancellationToken).ConfigureAwait(false);
            return ParsePipeEnvelope(envelope);
        }
        catch (Exception exception)
        {
            return new PipeDispatchResult(
                false,
                "PIPE_DISPATCH_FAILED",
                $"Unable to dispatch {action} over {pipeName}: {exception.Message}",
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

    private PipeDispatchResult WithCadHostOnlyFailure(PipeDispatchResult result, string primaryPipe)
    {
        var message = BuildCadHostOnlyFailureMessage(result.Message, primaryPipe);
        return new PipeDispatchResult(
            result.Success,
            result.Code,
            message,
            result.Warnings,
            result.Data)
        {
            ProviderPath = result.ProviderPath,
        };
    }

    private string BuildCadHostOnlyFailureMessage(string message, string primaryPipe)
    {
        var suffix =
            $"Project setup and title-block CAD actions are only supported by the in-process ACADE host on '{primaryPipe}'. Runtime Control does not fall back to the legacy named-pipe bridge for this slice.";
        var normalizedMessage = string.IsNullOrWhiteSpace(message) ? string.Empty : message.Trim();
        if (normalizedMessage.Contains("only supported by the in-process ACADE host", StringComparison.OrdinalIgnoreCase))
        {
            return normalizedMessage;
        }

        return string.IsNullOrWhiteSpace(normalizedMessage)
            ? suffix
            : $"{normalizedMessage} {suffix}";
    }

    private async Task<ProjectSetupDrawingScanResult> TryScanProjectSetupCadDrawingsAsync(
        IReadOnlyList<FileInfo> files,
        JsonObject profile,
        string requestId,
        CancellationToken cancellationToken)
    {
        var dwgFiles = files
            .Where(file => string.Equals(file.Extension, ".dwg", StringComparison.OrdinalIgnoreCase))
            .Select(file => file.FullName)
            .ToArray();
        if (dwgFiles.Length == 0)
        {
            return new ProjectSetupDrawingScanResult(new JsonArray(), new JsonArray());
        }

        var payload = new JsonObject
        {
            ["requestId"] = requestId,
            ["blockNameHint"] = ReadString(profile, "blockName") ?? "R3P-24x36BORDER&TITLE",
            ["attributeTags"] = new JsonArray("DWGNO", "TITLE1", "TITLE2", "TITLE3", "PROJ", "WD_TB"),
            ["drawingPaths"] = ToJsonArray(dwgFiles),
        };

        var result = await TryDispatchPipeActionAsync(
            "suite_drawing_list_scan",
            payload,
            ResolveSetting("AUTOCAD_DOTNET_ACADE_PIPE_NAME", "SUITE_ACADE_PIPE"),
            120_000,
            cancellationToken: cancellationToken).ConfigureAwait(false);

        if (!result.Success || result.Data is null)
        {
            var warnings = new JsonArray();
            warnings.Add(BuildCadHostOnlyFailureMessage(result.Message, ResolveSetting("AUTOCAD_DOTNET_ACADE_PIPE_NAME", "SUITE_ACADE_PIPE")));
            return new ProjectSetupDrawingScanResult(new JsonArray(), warnings);
        }

        return new ProjectSetupDrawingScanResult(
            result.Data["drawings"] as JsonArray ?? new JsonArray(),
            result.Warnings);
    }

    private List<FileInfo> ScanProjectFiles(DirectoryInfo projectRoot)
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
                if (!SupportedExtensions.Contains(file.Extension))
                {
                    continue;
                }

                output.Add(file);
            }
        }

        output.Sort((left, right) => string.Compare(left.FullName, right.FullName, StringComparison.OrdinalIgnoreCase));
        return output;
    }

    private JsonObject BuildArtifactSnapshot(
        DirectoryInfo projectRoot,
        IReadOnlyList<FileInfo> files,
        JsonObject profile)
    {
        var configuredProjectPath = ReadString(profile, "acadeProjectFilePath");
        var wdpFile = ResolveWdpFile(projectRoot, files, configuredProjectPath, ReadString(profile, "projectName"));
        var wdtPath = Path.ChangeExtension(wdpFile.FullName, ".wdt");
        var wdlPath = ResolveWdlPath(files, wdpFile.FullName);

        return new JsonObject
        {
            ["wdpPath"] = wdpFile.FullName,
            ["wdtPath"] = wdtPath,
            ["wdlPath"] = wdlPath,
            ["wdpText"] = File.Exists(wdpFile.FullName) ? File.ReadAllText(wdpFile.FullName) : string.Empty,
            ["wdtText"] = File.Exists(wdtPath) ? File.ReadAllText(wdtPath) : string.Empty,
            ["wdlText"] = File.Exists(wdlPath) ? File.ReadAllText(wdlPath) : string.Empty,
            ["wdpExists"] = File.Exists(wdpFile.FullName),
            ["wdtExists"] = File.Exists(wdtPath),
            ["wdlExists"] = File.Exists(wdlPath),
        };
    }

    private static FileInfo ResolveWdpFile(
        DirectoryInfo projectRoot,
        IReadOnlyList<FileInfo> files,
        string? configuredProjectPath,
        string? projectName)
    {
        if (!string.IsNullOrWhiteSpace(configuredProjectPath))
        {
            var configuredFullPath = Path.GetFullPath(configuredProjectPath);
            if (Directory.Exists(configuredFullPath))
            {
                configuredFullPath = Path.Combine(configuredFullPath, $"{projectRoot.Name}.wdp");
            }

            if (!string.Equals(Path.GetExtension(configuredFullPath), ".wdp", StringComparison.OrdinalIgnoreCase))
            {
                configuredFullPath = Path.ChangeExtension(configuredFullPath, ".wdp");
            }

            return new FileInfo(configuredFullPath);
        }

        var existing = files.FirstOrDefault(file =>
            string.Equals(file.Extension, ".wdp", StringComparison.OrdinalIgnoreCase));
        if (existing is not null)
        {
            return existing;
        }

        var stem = string.IsNullOrWhiteSpace(projectName) ? projectRoot.Name : projectName.Trim();
        foreach (var invalidChar in Path.GetInvalidFileNameChars())
        {
            stem = stem.Replace(invalidChar, '-');
        }

        return new FileInfo(Path.Combine(projectRoot.FullName, $"{stem}.wdp"));
    }

    private static string ResolveWdlPath(IReadOnlyList<FileInfo> files, string wdpPath)
    {
        var projectStem = Path.GetFileNameWithoutExtension(wdpPath);
        var projectRoot = Path.GetDirectoryName(wdpPath) ?? Path.GetPathRoot(wdpPath) ?? wdpPath;
        var preferred = Path.Combine(projectRoot, $"{projectStem}_wdtitle.wdl");
        var alternate = Path.ChangeExtension(wdpPath, ".wdl");
        var existing = files.FirstOrDefault(file =>
            string.Equals(file.FullName, preferred, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(file.FullName, alternate, StringComparison.OrdinalIgnoreCase));
        return existing?.FullName ?? preferred;
    }

    private static void EnsureTextFile(string path, string content)
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        File.WriteAllText(path, content ?? string.Empty, Encoding.UTF8);
    }

    private string ResolveSetting(string key, string fallback)
    {
        var envValue = Environment.GetEnvironmentVariable(key);
        if (!string.IsNullOrWhiteSpace(envValue))
        {
            return envValue.Trim();
        }

        return _repoSettings.TryGetValue(key, out var repoValue) && !string.IsNullOrWhiteSpace(repoValue)
            ? repoValue
            : fallback;
    }

    private static Dictionary<string, string> LoadRepoSettings(string repoRoot)
    {
        var output = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var fileName in new[] { ".env.local", ".env" })
        {
            var path = Path.Combine(repoRoot, fileName);
            if (!File.Exists(path))
            {
                continue;
            }

            foreach (var rawLine in File.ReadAllLines(path))
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
        PickRootPath => "pick-root",
        ScanRootPath => "scan-root",
        EnsureArtifactsPath => "ensure-artifacts",
        OpenAcadePath => "open-acade",
        CreateAcadePath => "create-acade",
        ApplyTitleBlockPath => "apply-title-block",
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

    private sealed record TicketClaims(
        string UserId,
        string Action,
        string RequestId,
        string Origin,
        string ProjectId,
        long IssuedAt,
        long ExpiresAt);

    internal sealed record PipeDispatchResult(
        bool Success,
        string Code,
        string Message,
        JsonArray Warnings,
        JsonObject? Data = null)
    {
        public string ProviderPath { get; set; } = "runtime-control";
    }

    internal sealed record ProjectSetupDrawingScanResult(JsonArray Drawings, JsonArray Warnings);

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

    private static string ResolveArtifactPath(string projectRootPath, string artifactPath)
    {
        if (string.IsNullOrWhiteSpace(artifactPath))
        {
            return string.Empty;
        }

        var fullPath = Path.GetFullPath(artifactPath);
        var fullRoot = Path.GetFullPath(projectRootPath);
        if (!fullPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Artifact paths must stay under the project root.");
        }

        return fullPath;
    }

    private List<string> UpdateAcadePickerFolder(string wdpPath)
    {
        var projectDirectory = Path.GetDirectoryName(wdpPath);
        if (string.IsNullOrWhiteSpace(projectDirectory))
        {
            return new List<string>();
        }

        var updatedPaths = new List<string>();
        foreach (var wdEnvPath in EnumerateWdEnvCandidates())
        {
            try
            {
                if (UpdateWdPickPrjDlgLine(wdEnvPath, projectDirectory))
                {
                    updatedPaths.Add(wdEnvPath);
                }
            }
            catch
            {
            }
        }

        return updatedPaths;
    }

    private IEnumerable<string> EnumerateWdEnvCandidates()
    {
        var roots = new List<string>();
        foreach (var candidate in new[]
        {
            Environment.GetEnvironmentVariable("USERPROFILE"),
            Environment.GetEnvironmentVariable("HOME"),
        })
        {
            if (!string.IsNullOrWhiteSpace(candidate))
            {
                roots.Add(Path.GetFullPath(candidate));
            }
        }

        foreach (var root in roots.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            foreach (var docsRoot in new[]
            {
                root,
                Path.Combine(root, "Documents"),
                Path.Combine(root, "My Documents"),
            })
            {
                if (!Directory.Exists(docsRoot))
                {
                    continue;
                }

                foreach (var pattern in new[] { "Acade*", "AcadE*" })
                {
                    foreach (var candidate in Directory.EnumerateFiles(docsRoot, "wd.env", SearchOption.AllDirectories))
                    {
                        if (candidate.Contains(Path.DirectorySeparatorChar + "AeData" + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) &&
                            candidate.Contains("Acade", StringComparison.OrdinalIgnoreCase))
                        {
                            yield return candidate;
                        }
                    }
                }
            }
        }
    }

    private static bool UpdateWdPickPrjDlgLine(string wdEnvPath, string projectDirectory)
    {
        var existingText = File.ReadAllText(wdEnvPath);
        var targetLine = $"WD_PICKPRJDLG,{projectDirectory.Replace("\\", "/").TrimEnd('/')}/";
        var updatedLines = new List<string>();
        var inserted = false;

        foreach (var line in existingText.Replace("\r\n", "\n").Split('\n'))
        {
            var normalized = line.TrimStart();
            if (normalized.StartsWith("WD_PICKPRJDLG,", StringComparison.OrdinalIgnoreCase))
            {
                if (!inserted)
                {
                    updatedLines.Add(targetLine);
                    inserted = true;
                }

                continue;
            }

            updatedLines.Add(line);
            if (!inserted && normalized.StartsWith("*WD_PICKPRJDLG,", StringComparison.OrdinalIgnoreCase))
            {
                updatedLines.Add(targetLine);
                inserted = true;
            }
        }

        if (!inserted)
        {
            if (updatedLines.Count > 0 && updatedLines[^1] != string.Empty)
            {
                updatedLines.Add(string.Empty);
            }

            updatedLines.Add(targetLine);
        }

        var newText = string.Join("\n", updatedLines).TrimEnd('\n') + "\n";
        if (string.Equals(existingText.Replace("\r\n", "\n"), newText, StringComparison.Ordinal))
        {
            return false;
        }

        File.WriteAllText(wdEnvPath, newText, Encoding.UTF8);
        return true;
    }

    internal bool ValidateTicketForTests(
        string ticketValue,
        string expectedAction,
        string? origin,
        out string error)
    {
        var isValid = TryValidateTicket(
            ticketValue,
            expectedAction,
            origin,
            out _,
            out error);
        return isValid;
    }

    internal IReadOnlyList<string> ScanProjectFilesForTests(string projectRootPath)
    {
        var projectRoot = new DirectoryInfo(Path.GetFullPath(projectRootPath));
        return ScanProjectFiles(projectRoot)
            .Select(file => file.FullName)
            .ToArray();
    }

    internal JsonObject BuildArtifactSnapshotForTests(
        string projectRootPath,
        JsonObject profile)
    {
        var projectRoot = new DirectoryInfo(Path.GetFullPath(projectRootPath));
        var files = ScanProjectFiles(projectRoot);
        return BuildArtifactSnapshot(projectRoot, files, profile);
    }

    internal Task<PipeDispatchResult> DispatchPipeActionForTestsAsync(
        string action,
        JsonObject payload,
        string primaryPipe,
        CancellationToken cancellationToken)
    {
        return TryDispatchPipeActionAsync(
            action,
            payload,
            primaryPipe,
            timeoutMs: 120_000,
            cancellationToken);
    }

    internal Task<ProjectSetupDrawingScanResult> ScanProjectCadDrawingsForTestsAsync(
        IReadOnlyList<string> drawingPaths,
        JsonObject profile,
        string requestId,
        CancellationToken cancellationToken)
    {
        var files = drawingPaths
            .Select(path => new FileInfo(Path.GetFullPath(path)))
            .ToArray();
        return TryScanProjectSetupCadDrawingsAsync(
            files,
            profile,
            requestId,
            cancellationToken);
    }
}
