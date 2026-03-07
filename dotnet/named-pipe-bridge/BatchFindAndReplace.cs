using System.Diagnostics;
using System.Globalization;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading;

const string DefaultPipeName = "SUITE_AUTOCAD_PIPE";
var pipeName = args.Length > 0 ? args[0] : DefaultPipeName;
var expectedToken = (Environment.GetEnvironmentVariable("AUTOCAD_DOTNET_TOKEN") ?? "").Trim();
var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);

if (!OperatingSystem.IsWindows())
{
    Console.WriteLine($"[{DateTime.UtcNow:O}] [ERROR] NamedPipeServer supports Windows only.");
    return;
}

PipeRouter.Configure(expectedToken);
BridgeLog.Info($"Starting on \\\\.\\pipe\\{pipeName}");
BridgeLog.Info(
    string.IsNullOrWhiteSpace(expectedToken)
        ? "Pipe token validation disabled (AUTOCAD_DOTNET_TOKEN is empty)."
        : "Pipe token validation enabled."
);

while (true)
{
    using var server = new NamedPipeServerStream(
        pipeName,
        PipeDirection.InOut,
        1,
        PipeTransmissionMode.Message,
        PipeOptions.Asynchronous
    );

    await server.WaitForConnectionAsync();

    try
    {
        var requestJson = await ReadLineAsync(server);
        var response = PipeRouter.Handle(requestJson);
        await WriteJsonAsync(server, response, options);
    }
    catch (Exception ex)
    {
        BridgeLog.Error("Unhandled exception while processing pipe request.", ex);
        await WriteJsonAsync(
            server,
            PipeRouter.BuildErrorResponse(
                id: null,
                code: "INTERNAL_ERROR",
                message: "Unhandled server exception.",
                details: ex.Message
            ),
            options
        );
    }
}

static async Task<string> ReadLineAsync(NamedPipeServerStream server)
{
    var buffer = new byte[4096];
    var builder = new StringBuilder();

    while (true)
    {
        var bytesRead = await server.ReadAsync(buffer, 0, buffer.Length);
        if (bytesRead <= 0)
        {
            break;
        }

        builder.Append(Encoding.UTF8.GetString(buffer, 0, bytesRead));
        if (builder.ToString().Contains('\n'))
        {
            break;
        }
    }

    var line = builder.ToString();
    var newlineIndex = line.IndexOf('\n');
    return newlineIndex >= 0 ? line[..newlineIndex] : line;
}

static async Task WriteJsonAsync(
    NamedPipeServerStream server,
    JsonObject payload,
    JsonSerializerOptions serializerOptions
)
{
    var json = payload.ToJsonString(serializerOptions) + "\n";
    var bytes = Encoding.UTF8.GetBytes(json);
    await server.WriteAsync(bytes, 0, bytes.Length);
    await server.FlushAsync();
}

static class PipeRouter
{
    private static string _expectedToken = "";

    public static void Configure(string? expectedToken)
    {
        _expectedToken = (expectedToken ?? "").Trim();
    }

    public static JsonObject Handle(string requestJson)
    {
        if (string.IsNullOrWhiteSpace(requestJson))
        {
            return BuildErrorResponse(
                id: null,
                code: "EMPTY_REQUEST",
                message: "Empty request payload."
            );
        }

        JsonNode? parsed;
        try
        {
            parsed = JsonNode.Parse(requestJson);
        }
        catch (Exception ex)
        {
            return BuildErrorResponse(
                id: null,
                code: "INVALID_JSON",
                message: "Request is not valid JSON.",
                details: ex.Message
            );
        }

        if (parsed is not JsonObject root)
        {
            return BuildErrorResponse(
                id: null,
                code: "INVALID_REQUEST",
                message: "Request must be a JSON object."
            );
        }

        var requestId = ReadString(root, "id");
        var action = ReadString(root, "action");
        var payload = ReadObject(root, "payload");
        var requestToken = ReadString(root, "token");
        var correlationId = ResolveCorrelationId(requestId, payload);

        if (!IsTokenValid(requestToken))
        {
            BridgeLog.Warn($"Rejected request (request_id={correlationId}) due to invalid token.");
            return BuildErrorResponse(
                id: requestId,
                code: "AUTH_INVALID_TOKEN",
                message: "Invalid or missing pipe token."
            );
        }

        if (string.IsNullOrWhiteSpace(action))
        {
            return BuildErrorResponse(
                id: requestId,
                code: "INVALID_REQUEST",
                message: "Missing required 'action' field."
            );
        }

        var normalizedAction = action.Trim().ToLowerInvariant();
        try
        {
            JsonObject result = normalizedAction switch
            {
                "conduit_route_terminal_scan" => ConduitRouteStubHandlers.HandleTerminalScan(payload),
                "conduit_route_obstacle_scan" => ConduitRouteStubHandlers.HandleObstacleScan(payload),
                "conduit_route_terminal_routes_draw" => ConduitRouteStubHandlers.HandleTerminalRoutesDraw(payload),
                "etap_dxf_cleanup_run" => ConduitRouteStubHandlers.HandleEtapCleanupRun(payload),
                _ => BuildActionNotImplementedResult(normalizedAction),
            };

            if (result.TryGetPropertyValue("success", out var successNode)
                && successNode is JsonValue successValue
                && successValue.TryGetValue<bool>(out var isSuccess)
                && !isSuccess)
            {
                BridgeLog.Warn($"Action {normalizedAction} returned success=false (request_id={correlationId}).");
            }
            AttachCorrelationIdToMeta(result, correlationId);

            return new JsonObject
            {
                ["id"] = requestId,
                ["ok"] = true,
                ["result"] = result,
                ["error"] = null,
            };
        }
        catch (Exception ex)
        {
            BridgeLog.Error($"Action handler failed for {normalizedAction} (request_id={correlationId}).", ex);
            return BuildErrorResponse(
                id: requestId,
                code: "ACTION_EXECUTION_FAILED",
                message: $"Action '{normalizedAction}' failed.",
                details: ex.Message
            );
        }
    }

    public static JsonObject BuildErrorResponse(
        string? id,
        string code,
        string message,
        string? details = null
    )
    {
        return new JsonObject
        {
            ["id"] = id,
            ["ok"] = false,
            ["result"] = null,
            ["error"] = details is null ? $"{code}: {message}" : $"{code}: {message} ({details})",
        };
    }

    private static JsonObject BuildActionNotImplementedResult(string action)
    {
        return new JsonObject
        {
            ["success"] = false,
            ["code"] = "ACTION_NOT_IMPLEMENTED",
            ["message"] = $"Action '{action}' is not implemented by this .NET bridge.",
            ["warnings"] = new JsonArray("Unsupported action request was rejected by the .NET bridge."),
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
            },
        };
    }

    private static string? ReadString(JsonObject obj, string key)
    {
        if (!obj.TryGetPropertyValue(key, out var node) || node is null)
        {
            return null;
        }
        return node.GetValue<string?>();
    }

    private static bool IsTokenValid(string? requestToken)
    {
        if (string.IsNullOrWhiteSpace(_expectedToken))
        {
            return true;
        }

        var provided = (requestToken ?? "").Trim();
        return string.Equals(provided, _expectedToken, StringComparison.Ordinal);
    }

    private static string ResolveCorrelationId(string? requestId, JsonObject payload)
    {
        var payloadRequestId = ReadString(payload, "requestId");
        if (!string.IsNullOrWhiteSpace(payloadRequestId))
        {
            return payloadRequestId.Trim();
        }
        return string.IsNullOrWhiteSpace(requestId) ? "unknown" : requestId.Trim();
    }

    private static void AttachCorrelationIdToMeta(JsonObject result, string correlationId)
    {
        if (string.IsNullOrWhiteSpace(correlationId))
        {
            return;
        }

        var metaNode = result["meta"] as JsonObject;
        if (metaNode is null)
        {
            metaNode = new JsonObject();
            result["meta"] = metaNode;
        }
        metaNode["requestId"] = correlationId;
    }

    private static JsonObject ReadObject(JsonObject obj, string key)
    {
        if (!obj.TryGetPropertyValue(key, out var node) || node is null)
        {
            return new JsonObject();
        }
        return node as JsonObject ?? new JsonObject();
    }
}

static class BridgeLog
{
    public static void Info(string message)
    {
        Console.WriteLine($"[{DateTime.UtcNow:O}] [INFO] {message}");
    }

    public static void Warn(string message)
    {
        Console.WriteLine($"[{DateTime.UtcNow:O}] [WARN] {message}");
    }

    public static void Error(string message, Exception ex)
    {
        Console.WriteLine(
            $"[{DateTime.UtcNow:O}] [ERROR] {message} Exception={ex.GetType().Name} Message={ex.Message}"
        );
    }
}

static class ConduitRouteStubHandlers
{
    private const double DefaultCanvasWidth = 980.0;
    private const double DefaultCanvasHeight = 560.0;
    private const double MinCanvasSize = 120.0;
    private const double ViewportPadding = 20.0;
    private const double ArcQuarterTurnTolerance = 1e-6;
    private const int DefaultComReadRetryAttempts = 3;
    private const int DefaultComReadRetryDelayMs = 35;
    private const int DefaultEtapCleanupTimeoutMs = 90_000;
    private static readonly HashSet<string> EtapCleanupCommandAllowList = new(StringComparer.OrdinalIgnoreCase)
    {
        "ETAPFIX",
        "ETAPTEXT",
        "ETAPBLOCKS",
        "ETAPLAYERFIX",
        "ETAPOVERLAP",
        "ETAPIMPORT",
    };
    private static readonly string[] EtapPluginRelativePathCandidates =
    {
        Path.Combine("src", "components", "apps", "dxfer", "bin", "Debug", "net8.0-windows", "EtapDxfCleanup.dll"),
        Path.Combine("src", "components", "apps", "dxfer", "bin", "Release", "net8.0-windows", "EtapDxfCleanup.dll"),
        Path.Combine("src", "components", "apps", "dxfer", "bin", "Debug", "net48", "EtapDxfCleanup.dll"),
        Path.Combine("src", "components", "apps", "dxfer", "bin", "Release", "net48", "EtapDxfCleanup.dll"),
    };
    private const string RouteGeometryVersion = "v1.2";

    static ConduitRouteStubHandlers()
    {
        ValidateArcAngleNormalization();
    }

    private static readonly string[] AutoCadProgIds =
    {
        "AutoCAD.Application",
        "AutoCAD.Application.25",
        "AutoCAD.Application.24",
        "AutoCAD.Application.23",
        "AutoCAD.Application.22",
    };

    private static readonly string[] StripIdKeys = { "STRIP_ID", "STRIP", "TERMINAL_STRIP", "TB_ID", "TS_ID" };
    private static readonly string[] PanelIdKeys = { "PANEL_ID", "PANEL", "PANEL_NAME", "CABINET", "BOARD" };
    private static readonly string[] PanelNameKeys = { "PANEL_NAME", "PANEL_DESC", "DESCRIPTION", "CABINET_NAME", "BOARD_NAME" };
    private static readonly string[] SideKeys = { "SIDE", "PANEL_SIDE", "SECTION", "LR" };
    private static readonly string[] TerminalCountKeys = { "TERMINAL_COUNT", "TERMINALS", "TERM_COUNT", "WAYS", "POINT_COUNT" };
    private static readonly string[] StripNumberKeys = { "STRIP_NO", "STRIP_NUM", "STRIP_NUMBER", "NUMBER", "NO" };
    private static readonly string[] TerminalNameTokens = { "TERMINAL", "TERMS", "TB", "TS", "MARSHALLING" };
    private static readonly string[] JumperNameTokens = { "JUMPER", "JMP" };
    private static readonly string[] JumperIdKeys = { "JUMPER_ID", "JUMPER", "JMP_ID", "JMP_REF", "JMP" };
    private static readonly string[] JumperPanelIdKeys = { "PANEL_ID", "PANEL" };
    private static readonly string[] JumperFromStripKeys = { "FROM_STRIP_ID", "FROM_STRIP", "FROM_TB", "FROM_TB_ID", "STRIP_ID_FROM" };
    private static readonly string[] JumperToStripKeys = { "TO_STRIP_ID", "TO_STRIP", "TO_TB", "TO_TB_ID", "STRIP_ID_TO" };
    private static readonly string[] JumperFromTermKeys = { "FROM_TERM", "FROM_TERMINAL", "FROM_POS", "FROM_POSITION", "TERM_FROM", "FROM" };
    private static readonly string[] JumperToTermKeys = { "TO_TERM", "TO_TERMINAL", "TO_POS", "TO_POSITION", "TERM_TO", "TO" };
    private static readonly Regex TerminalLabelTagRegex = new(
        "^TERM[_-]?0*(\\d+)[_-]?LABEL$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled
    );
    private static readonly HashSet<string> ValidObstacleTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "foundation",
        "building",
        "equipment_pad",
        "trench",
        "fence",
        "road",
    };
    private static readonly HashSet<int> TransientComReadHresults = new()
    {
        unchecked((int)0x80010001), // RPC_E_CALL_REJECTED
        unchecked((int)0x8001010A), // RPC_E_SERVERCALL_RETRYLATER
        unchecked((int)0x80010108), // RPC_E_DISCONNECTED
        unchecked((int)0x80010007), // RPC_E_SERVER_DIED
        unchecked((int)0x800706BE), // RPC_S_CALL_FAILED
    };
    private static readonly int ComReadRetryAttempts = ParsePositiveIntEnv(
        "AUTOCAD_DOTNET_COM_READ_RETRY_ATTEMPTS",
        DefaultComReadRetryAttempts
    );
    private static readonly int ComReadRetryDelayMs = ParsePositiveIntEnv(
        "AUTOCAD_DOTNET_COM_READ_RETRY_DELAY_MS",
        DefaultComReadRetryDelayMs
    );
    private static readonly object TerminalRouteBindingLock = new();
    private static readonly Dictionary<string, Dictionary<string, List<string>>> TerminalRouteBindings =
        new(StringComparer.OrdinalIgnoreCase);
    private const int MaxTerminalRouteSessions = 96;

    private sealed class TerminalScanProfile
    {
        public TerminalScanProfile(
            string[] panelIdKeys,
            string[] panelNameKeys,
            string[] sideKeys,
            string[] stripIdKeys,
            string[] stripNumberKeys,
            string[] terminalCountKeys,
            string[] terminalTagKeys,
            string[] terminalNameTokens,
            string[] blockNameAllowList,
            bool requireStripId,
            bool requireTerminalCount,
            bool requireSide,
            string defaultPanelPrefix,
            int defaultTerminalCount
        )
        {
            PanelIdKeys = panelIdKeys;
            PanelNameKeys = panelNameKeys;
            SideKeys = sideKeys;
            StripIdKeys = stripIdKeys;
            StripNumberKeys = stripNumberKeys;
            TerminalCountKeys = terminalCountKeys;
            TerminalTagKeys = terminalTagKeys;
            TerminalNameTokens = terminalNameTokens;
            BlockNameAllowList = blockNameAllowList;
            RequireStripId = requireStripId;
            RequireTerminalCount = requireTerminalCount;
            RequireSide = requireSide;
            DefaultPanelPrefix = string.IsNullOrWhiteSpace(defaultPanelPrefix)
                ? "PANEL"
                : defaultPanelPrefix.Trim().ToUpperInvariant();
            DefaultTerminalCount = ClampInt(defaultTerminalCount, 1, 2000);
        }

        public string[] PanelIdKeys { get; }
        public string[] PanelNameKeys { get; }
        public string[] SideKeys { get; }
        public string[] StripIdKeys { get; }
        public string[] StripNumberKeys { get; }
        public string[] TerminalCountKeys { get; }
        public string[] TerminalTagKeys { get; }
        public string[] TerminalNameTokens { get; }
        public string[] BlockNameAllowList { get; }
        public bool RequireStripId { get; }
        public bool RequireTerminalCount { get; }
        public bool RequireSide { get; }
        public string DefaultPanelPrefix { get; }
        public int DefaultTerminalCount { get; }
    }

    private sealed class JumperRecord
    {
        public string JumperId { get; init; } = "";
        public string PanelId { get; init; } = "";
        public string FromStripId { get; init; } = "";
        public int FromTerminal { get; init; }
        public string ToStripId { get; init; } = "";
        public int ToTerminal { get; init; }
        public string SourceBlockName { get; init; } = "";
        public string Resolution { get; init; } = "attribute";
        public double? X { get; init; }
        public double? Y { get; init; }
    }

    private sealed class StripScanRecord
    {
        public string PanelId { get; init; } = "";
        public string Side { get; init; } = "";
        public string StripId { get; init; } = "";
        public int TerminalCount { get; init; }
        public double X { get; init; }
        public double Y { get; init; }
        public List<TerminalGeometryPrimitive> Geometry { get; init; } = new();
    }

    private sealed class PendingPositionalJumperCandidate
    {
        public string JumperId { get; init; } = "";
        public string PanelHint { get; init; } = "";
        public string Handle { get; init; } = "";
        public string BlockName { get; init; } = "";
        public double X { get; init; }
        public double Y { get; init; }
    }

    private sealed class TerminalRouteDrawRecord
    {
        public string Ref { get; init; } = "";
        public string RouteType { get; init; } = "conductor";
        public string LayerName { get; init; } = "";
        public int? ColorAci { get; init; }
        public List<GeometryPoint> Points { get; init; } = new();
    }

    public static JsonObject HandleTerminalScan(JsonObject payload)
    {
        var stopwatch = Stopwatch.StartNew();

        var selectionOnly = ReadBool(payload, "selectionOnly", fallback: false);
        var includeModelspace = ReadBool(payload, "includeModelspace", fallback: true);
        var maxEntities = ClampInt(ReadInt(payload, "maxEntities", 50000), 500, 200000);
        var terminalProfile = ReadTerminalScanProfile(payload);

        using var session = ConnectAutoCad();
        var drawingName = StringOrDefault(ReadProperty(session.Document, "Name"), "Unknown.dwg");
        var units = ResolveUnits(session.Document);

        var panels = new JsonObject();
        var warnings = new List<string>();
        var seenEntityHandles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenStripIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenJumperSignatures = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var blockGeometryCache = new Dictionary<string, List<TerminalGeometryPrimitive>>(StringComparer.OrdinalIgnoreCase);
        var jumpers = new List<JumperRecord>();
        var stripRecords = new List<StripScanRecord>();
        var pendingPositionalJumpers = new List<PendingPositionalJumperCandidate>();

        var scannedEntities = 0;
        var scannedBlockReferences = 0;
        var skippedNonTerminalBlocks = 0;
        var jumperCandidateBlocks = 0;
        var skippedInvalidJumperBlocks = 0;
        var positionalJumperCandidates = 0;
        var resolvedPositionalJumpers = 0;
        var totalStrips = 0;
        var totalTerminals = 0;
        var totalJumpers = 0;
        var totalLabeledTerminals = 0;
        var totalGeometryPrimitives = 0;

        void ConsumeEntity(object entity)
        {
            scannedEntities += 1;

            var handle = SafeUpper(ReadProperty(entity, "Handle"));
            if (!string.IsNullOrWhiteSpace(handle) && !seenEntityHandles.Add(handle))
            {
                return;
            }

            var objectName = SafeUpper(ReadProperty(entity, "ObjectName"));
            if (!objectName.Contains("BLOCKREFERENCE", StringComparison.Ordinal))
            {
                return;
            }
            scannedBlockReferences += 1;

            var attrs = ReadAttributeMap(entity);
            var blockName = StringOrDefault(ReadProperty(entity, "EffectiveName"), "");
            if (string.IsNullOrWhiteSpace(blockName))
            {
                blockName = StringOrDefault(ReadProperty(entity, "Name"), "");
            }

            if (LooksLikeJumperBlock(blockName, attrs))
            {
                jumperCandidateBlocks += 1;
                var jumper = TryParseJumperRecord(
                    attrs,
                    blockName,
                    handle,
                    terminalProfile.DefaultPanelPrefix
                );
                if (jumper is null)
                {
                    if (TryReadPoint(ReadProperty(entity, "InsertionPoint"), out var jumperX, out var jumperY))
                    {
                        positionalJumperCandidates += 1;
                        pendingPositionalJumpers.Add(
                            new PendingPositionalJumperCandidate
                            {
                                JumperId = FirstAttr(attrs, JumperIdKeys).Trim(),
                                PanelHint = FirstAttr(attrs, JumperPanelIdKeys).Trim().ToUpperInvariant(),
                                Handle = handle,
                                BlockName = (blockName ?? "").Trim(),
                                X = jumperX,
                                Y = jumperY,
                            }
                        );
                        return;
                    }

                    skippedInvalidJumperBlocks += 1;
                    warnings.Add(
                        $"Skipping jumper block {(string.IsNullOrWhiteSpace(blockName) ? "<unknown>" : blockName)} (missing FROM/TO attributes and insertion point)."
                    );
                    return;
                }

                var jumperSignature =
                    $"{jumper.PanelId}|{jumper.FromStripId}|{jumper.FromTerminal}|{jumper.ToStripId}|{jumper.ToTerminal}";
                if (!seenJumperSignatures.Add(jumperSignature))
                {
                    return;
                }

                jumpers.Add(jumper);
                totalJumpers += 1;
                return;
            }

            if (!LooksLikeTerminalBlock(blockName, attrs, terminalProfile))
            {
                skippedNonTerminalBlocks += 1;
                return;
            }

            if (!TryReadPoint(ReadProperty(entity, "InsertionPoint"), out var pointX, out var pointY))
            {
                return;
            }

            var stripId = FirstAttr(attrs, terminalProfile.StripIdKeys).ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(stripId))
            {
                stripId = string.IsNullOrWhiteSpace(blockName) ? $"STRIP_{scannedBlockReferences}" : blockName.ToUpperInvariant();
            }
            if (!seenStripIds.Add(stripId))
            {
                var suffix = 2;
                var candidate = $"{stripId}_{suffix}";
                while (!seenStripIds.Add(candidate))
                {
                    suffix += 1;
                    candidate = $"{stripId}_{suffix}";
                }
                stripId = candidate;
            }

            var panelId = FirstAttr(attrs, terminalProfile.PanelIdKeys).ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(panelId))
            {
                panelId = DerivePanelFromStripId(stripId);
            }
            if (string.IsNullOrWhiteSpace(panelId))
            {
                panelId = terminalProfile.DefaultPanelPrefix;
            }
            var panelName = FirstAttr(attrs, terminalProfile.PanelNameKeys);
            if (string.IsNullOrWhiteSpace(panelName))
            {
                panelName = panelId;
            }
            var side = NormalizeSide(FirstAttr(attrs, terminalProfile.SideKeys));

            var terminalCount = ParseTerminalCount(
                attrs,
                terminalProfile.TerminalCountKeys,
                terminalProfile.DefaultTerminalCount
            );
            var stripNumber = ParseStripNumber(stripId, attrs, terminalProfile.StripNumberKeys);
            var terminalLabels = ParseTerminalLabels(attrs, terminalCount);
            totalLabeledTerminals += terminalLabels.Count(label => !string.IsNullOrWhiteSpace(label));
            var geometry = ReadTerminalGeometryForInsert(
                session.Document,
                entity,
                blockName,
                pointX,
                pointY,
                blockGeometryCache
            );
            totalGeometryPrimitives += geometry.Count;

            var panelNode = panels[panelId] as JsonObject;
            if (panelNode is null)
            {
                panelNode = new JsonObject
                {
                    ["fullName"] = panelName,
                    ["color"] = PanelColor(panelId),
                    ["sides"] = new JsonObject(),
                };
                panels[panelId] = panelNode;
            }
            var sideMap = panelNode["sides"] as JsonObject ?? new JsonObject();
            panelNode["sides"] = sideMap;

            var sideNode = sideMap[side] as JsonObject;
            if (sideNode is null)
            {
                sideNode = new JsonObject
                {
                    ["strips"] = new JsonArray(),
                };
                sideMap[side] = sideNode;
            }
            var strips = sideNode["strips"] as JsonArray ?? new JsonArray();
            sideNode["strips"] = strips;
            strips.Add(
                new JsonObject
                {
                    ["stripId"] = stripId,
                    ["stripNumber"] = stripNumber,
                    ["terminalCount"] = terminalCount,
                    ["terminalLabels"] = ToJsonArray(terminalLabels),
                    ["geometry"] = GeometryToJsonArray(geometry),
                    ["x"] = pointX,
                    ["y"] = pointY,
                }
            );

            stripRecords.Add(
                new StripScanRecord
                {
                    PanelId = panelId,
                    Side = side,
                    StripId = stripId,
                    TerminalCount = terminalCount,
                    X = pointX,
                    Y = pointY,
                    Geometry = CloneGeometry(geometry),
                }
            );

            totalStrips += 1;
            totalTerminals += terminalCount;
        }

        if (selectionOnly)
        {
            foreach (var entity in EnumerateSelectionEntities(session.Document))
            {
                ConsumeEntity(entity);
            }
        }

        foreach (var pending in pendingPositionalJumpers)
        {
            var resolved = ResolvePositionalJumperRecord(
                pending,
                stripRecords,
                terminalProfile.DefaultPanelPrefix
            );
            if (resolved is null)
            {
                skippedInvalidJumperBlocks += 1;
                warnings.Add(
                    $"Skipping jumper block {(string.IsNullOrWhiteSpace(pending.BlockName) ? "<unknown>" : pending.BlockName)} (could not resolve nearest strip pair from insertion point)."
                );
                continue;
            }

            var jumperSignature =
                $"{resolved.PanelId}|{resolved.FromStripId}|{resolved.FromTerminal}|{resolved.ToStripId}|{resolved.ToTerminal}";
            if (!seenJumperSignatures.Add(jumperSignature))
            {
                continue;
            }

            jumpers.Add(resolved);
            totalJumpers += 1;
            resolvedPositionalJumpers += 1;
        }

        if (includeModelspace)
        {
            var modelspaceCount = ReadCount(session.Modelspace);
            var cappedCount = Math.Min(modelspaceCount, maxEntities);
            if (modelspaceCount > maxEntities)
            {
                warnings.Add($"ModelSpace scan capped at {maxEntities} entities (of {modelspaceCount}).");
            }

            for (var index = 0; index < cappedCount; index++)
            {
                var entity = ReadItem(session.Modelspace, index);
                if (entity is null)
                {
                    continue;
                }
                ConsumeEntity(entity);
            }
        }

        stopwatch.Stop();

        var success = totalStrips > 0;
        BridgeLog.Info(
            $"Terminal scan completed success={success} scanned_entities={scannedEntities} strips={totalStrips} terminals={totalTerminals} elapsed_ms={stopwatch.ElapsedMilliseconds}"
        );
        return new JsonObject
        {
            ["success"] = success,
            ["code"] = success ? "" : "NO_TERMINAL_STRIPS_FOUND",
            ["message"] = success
                ? $"Scanned {scannedEntities} entities and found {totalStrips} terminal strips."
                : "No terminal-strip block references were detected.",
            ["data"] = new JsonObject
            {
                ["drawing"] = new JsonObject
                {
                    ["name"] = drawingName,
                    ["units"] = units,
                },
                ["panels"] = panels,
                ["jumpers"] = JumpersToJsonArray(jumpers),
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["scanMs"] = stopwatch.ElapsedMilliseconds,
                ["scannedEntities"] = scannedEntities,
                ["scannedBlockReferences"] = scannedBlockReferences,
                ["skippedNonTerminalBlocks"] = skippedNonTerminalBlocks,
                ["jumperCandidateBlocks"] = jumperCandidateBlocks,
                ["skippedInvalidJumperBlocks"] = skippedInvalidJumperBlocks,
                ["positionalJumperCandidates"] = positionalJumperCandidates,
                ["resolvedPositionalJumpers"] = resolvedPositionalJumpers,
                ["selectionOnly"] = selectionOnly,
                ["includeModelspace"] = includeModelspace,
                ["totalPanels"] = panels.Count,
                ["totalStrips"] = totalStrips,
                ["totalTerminals"] = totalTerminals,
                ["totalJumpers"] = totalJumpers,
                ["totalLabeledTerminals"] = totalLabeledTerminals,
                ["totalGeometryPrimitives"] = totalGeometryPrimitives,
                ["terminalProfile"] = TerminalScanProfileToJson(terminalProfile),
            },
            ["warnings"] = ToJsonArray(warnings),
        };
    }

    public static JsonObject HandleObstacleScan(JsonObject payload)
    {
        var stopwatch = Stopwatch.StartNew();

        var selectionOnly = ReadBool(payload, "selectionOnly", fallback: false);
        var includeModelspace = ReadBool(payload, "includeModelspace", fallback: true);
        var maxEntities = ClampInt(ReadInt(payload, "maxEntities", 50000), 500, 200000);
        var canvasWidth = Math.Max(MinCanvasSize, ReadDouble(payload, "canvasWidth", DefaultCanvasWidth));
        var canvasHeight = Math.Max(MinCanvasSize, ReadDouble(payload, "canvasHeight", DefaultCanvasHeight));
        var allowedLayers = ReadStringArray(payload, "layerNames")
            .Select(entry => entry.Trim().ToUpperInvariant())
            .Where(entry => entry.Length > 0)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var layerTypeOverrides = ReadStringMap(payload, "layerTypeOverrides")
            .Where(kvp => ValidObstacleTypes.Contains(kvp.Value))
            .ToDictionary(
                kvp => kvp.Key.Trim().ToUpperInvariant(),
                kvp => kvp.Value.Trim().ToLowerInvariant(),
                StringComparer.OrdinalIgnoreCase
            );

        using var session = ConnectAutoCad();
        var drawingName = StringOrDefault(ReadProperty(session.Document, "Name"), "Unknown.dwg");
        var units = ResolveUnits(session.Document);
        var forceUnknownToFoundation = allowedLayers.Count > 0;

        var warnings = new List<string>();
        var rawObstacles = new List<RawObstacle>();
        var seenHandles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenBbox = new HashSet<string>(StringComparer.Ordinal);

        var scannedEntities = 0;
        var scannedGeometryEntities = 0;
        var matchedLayerEntities = 0;
        var dedupedEntities = 0;
        var overrideLayerEntities = 0;

        void ConsumeEntity(object entity)
        {
            scannedEntities += 1;

            var handle = SafeUpper(ReadProperty(entity, "Handle"));
            if (!string.IsNullOrWhiteSpace(handle) && !seenHandles.Add(handle))
            {
                return;
            }

            var objectName = SafeUpper(ReadProperty(entity, "ObjectName"));
            if (IsNonGeometryObject(objectName))
            {
                return;
            }

            var layerName = SafeUpper(ReadProperty(entity, "Layer"));
            if (string.IsNullOrWhiteSpace(layerName))
            {
                return;
            }
            if (allowedLayers.Count > 0 && !allowedLayers.Contains(layerName))
            {
                return;
            }

            string? obstacleType;
            if (layerTypeOverrides.TryGetValue(layerName, out var overrideType))
            {
                obstacleType = overrideType;
                overrideLayerEntities += 1;
            }
            else
            {
                obstacleType = InferObstacleType(layerName, forceUnknownToFoundation);
            }
            if (string.IsNullOrWhiteSpace(obstacleType))
            {
                return;
            }
            matchedLayerEntities += 1;

            if (!TryGetBoundingBox(entity, out var minX, out var minY, out var maxX, out var maxY))
            {
                return;
            }
            scannedGeometryEntities += 1;
            if ((maxX - minX) <= 0.0001 && (maxY - minY) <= 0.0001)
            {
                return;
            }

            var key = $"{layerName}|{obstacleType}|{Math.Round(minX, 4)}|{Math.Round(minY, 4)}|{Math.Round(maxX, 4)}|{Math.Round(maxY, 4)}";
            if (!seenBbox.Add(key))
            {
                dedupedEntities += 1;
                return;
            }

            rawObstacles.Add(
                new RawObstacle
                {
                    Layer = layerName,
                    Type = obstacleType,
                    Label = layerName,
                    MinX = minX,
                    MinY = minY,
                    MaxX = maxX,
                    MaxY = maxY,
                }
            );
        }

        if (selectionOnly)
        {
            foreach (var entity in EnumerateSelectionEntities(session.Document))
            {
                ConsumeEntity(entity);
            }
        }

        if (includeModelspace)
        {
            var modelspaceCount = ReadCount(session.Modelspace);
            var cappedCount = Math.Min(modelspaceCount, maxEntities);
            if (modelspaceCount > maxEntities)
            {
                warnings.Add($"ModelSpace scan capped at {maxEntities} entities (of {modelspaceCount}).");
            }
            for (var index = 0; index < cappedCount; index++)
            {
                var entity = ReadItem(session.Modelspace, index);
                if (entity is null)
                {
                    continue;
                }
                ConsumeEntity(entity);
            }
        }

        var normalized = NormalizeObstacles(rawObstacles, canvasWidth, canvasHeight, ViewportPadding);
        stopwatch.Stop();

        var totalObstacles = normalized.Obstacles.Count;
        var success = totalObstacles > 0;
        BridgeLog.Info(
            $"Obstacle scan completed success={success} scanned_entities={scannedEntities} obstacles={totalObstacles} elapsed_ms={stopwatch.ElapsedMilliseconds}"
        );

        return new JsonObject
        {
            ["success"] = success,
            ["code"] = success ? "" : "NO_OBSTACLES_FOUND",
            ["message"] = success
                ? $"Scanned {scannedEntities} entities and mapped {totalObstacles} obstacles."
                : "No route obstacles found from AutoCAD layers.",
            ["data"] = new JsonObject
            {
                ["drawing"] = new JsonObject
                {
                    ["name"] = drawingName,
                    ["units"] = units,
                },
                ["obstacles"] = normalized.Obstacles,
                ["viewport"] = normalized.Viewport,
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["scanMs"] = stopwatch.ElapsedMilliseconds,
                ["scannedEntities"] = scannedEntities,
                ["scannedGeometryEntities"] = scannedGeometryEntities,
                ["matchedLayerEntities"] = matchedLayerEntities,
                ["dedupedEntities"] = dedupedEntities,
                ["selectionOnly"] = selectionOnly,
                ["includeModelspace"] = includeModelspace,
                ["totalObstacles"] = totalObstacles,
                ["overrideLayerEntities"] = overrideLayerEntities,
            },
            ["warnings"] = ToJsonArray(warnings),
        };
    }

    public static JsonObject HandleTerminalRoutesDraw(JsonObject payload)
    {
        var stopwatch = Stopwatch.StartNew();
        var operation = ReadStringValue(payload, "operation", "").Trim().ToLowerInvariant();
        if (operation is not ("upsert" or "delete" or "reset"))
        {
            return new JsonObject
            {
                ["success"] = false,
                ["code"] = "INVALID_REQUEST",
                ["message"] = "operation must be one of: upsert, delete, reset.",
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                },
                ["warnings"] = new JsonArray(),
            };
        }

        var sessionId = ReadStringValue(payload, "sessionId", "").Trim();
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return new JsonObject
            {
                ["success"] = false,
                ["code"] = "INVALID_REQUEST",
                ["message"] = "sessionId is required for terminal route sync operations.",
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                    ["operation"] = operation,
                },
                ["warnings"] = new JsonArray(),
            };
        }
        sessionId = sessionId.Length <= 128 ? sessionId : sessionId[..128];

        var clientRouteId = ReadStringValue(payload, "clientRouteId", "").Trim();
        if (clientRouteId.Length > 128)
        {
            clientRouteId = clientRouteId[..128];
        }

        var defaultLayerName = NormalizeLayerName(
            ReadStringValue(payload, "defaultLayerName", "SUITE_WIRE_AUTO"),
            "SUITE_WIRE_AUTO"
        );
        var annotateRefs = ReadBool(payload, "annotateRefs", fallback: true);
        var textHeight = Math.Max(0.01, ReadDouble(payload, "textHeight", 0.125));

        var warnings = new List<string>();
        var routeCandidates = operation == "reset" ? 0 : 1;
        using var session = ConnectAutoCad();
        var drawingName = StringOrDefault(ReadProperty(session.Document, "Name"), "Unknown.dwg");
        var units = ResolveUnits(session.Document);

        var bindingsNode = new JsonObject();
        var layersUsed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var routesDrawn = 0;
        var segmentsDrawn = 0;
        var drawnLines = 0;
        var drawnArcs = 0;
        var labelsDrawn = 0;
        var filletAppliedCorners = 0;
        var filletSkippedCorners = 0;
        var geometryVersion = RouteGeometryVersion;
        var deletedEntities = 0;
        var resetRoutes = 0;
        var syncStatus = "failed";
        var success = false;
        var code = "";
        var message = "";

        if (operation == "reset")
        {
            var resetResult = DeleteSessionBindings(sessionId, session.Document, warnings);
            deletedEntities = resetResult.DeletedEntities;
            resetRoutes = resetResult.ResetRoutes;
            syncStatus = "reset";
            success = true;
            message = $"Reset CAD sync session '{sessionId}' ({resetRoutes} route binding(s) cleared).";
        }
        else
        {
            if (string.IsNullOrWhiteSpace(clientRouteId))
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "INVALID_REQUEST",
                    ["message"] = "clientRouteId is required for upsert/delete operations.",
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["operation"] = operation,
                        ["sessionId"] = sessionId,
                    },
                    ["warnings"] = new JsonArray(),
                };
            }

            if (operation == "delete")
            {
                var deleteResult = DeleteRouteBindings(sessionId, clientRouteId, session.Document, warnings);
                deletedEntities = deleteResult.DeletedCount;
                syncStatus = "deleted";
                success = true;
                message = $"Deleted CAD bindings for route '{clientRouteId}' ({deletedEntities} entity(ies)).";
                bindingsNode[clientRouteId] = new JsonObject
                {
                    ["entityHandles"] = ToJsonArray(deleteResult.DeletedHandles),
                };
            }
            else
            {
                JsonObject? routeNode = null;
                if (payload.TryGetPropertyValue("route", out var routeObjNode)
                    && routeObjNode is JsonObject directRoute)
                {
                    routeNode = directRoute;
                }
                else if (payload.TryGetPropertyValue("routes", out var routesNode)
                    && routesNode is JsonArray routesArray
                    && routesArray.Count > 0
                    && routesArray[0] is JsonObject firstRoute)
                {
                    routeNode = firstRoute;
                }

                if (routeNode is null)
                {
                    return new JsonObject
                    {
                        ["success"] = false,
                        ["code"] = "INVALID_REQUEST",
                        ["message"] = "route object is required for upsert operation.",
                        ["meta"] = new JsonObject
                        {
                            ["source"] = "dotnet",
                            ["operation"] = operation,
                            ["sessionId"] = sessionId,
                            ["clientRouteId"] = clientRouteId,
                        },
                        ["warnings"] = new JsonArray(),
                    };
                }

                if (!routeNode.TryGetPropertyValue("path", out var pathNode) || pathNode is not JsonArray pathArray)
                {
                    return new JsonObject
                    {
                        ["success"] = false,
                        ["code"] = "INVALID_REQUEST",
                        ["message"] = "route.path must be an array.",
                        ["meta"] = new JsonObject
                        {
                            ["source"] = "dotnet",
                            ["operation"] = operation,
                            ["sessionId"] = sessionId,
                            ["clientRouteId"] = clientRouteId,
                        },
                        ["warnings"] = new JsonArray(),
                    };
                }

                var points = new List<GeometryPoint>();
                for (var pointIndex = 0; pointIndex < pathArray.Count; pointIndex++)
                {
                    if (pathArray[pointIndex] is not JsonObject pointObj)
                    {
                        continue;
                    }
                    var x = ReadDouble(pointObj, "x", double.NaN);
                    var y = ReadDouble(pointObj, "y", double.NaN);
                    if (double.IsNaN(x) || double.IsInfinity(x) || double.IsNaN(y) || double.IsInfinity(y))
                    {
                        continue;
                    }
                    if (points.Count > 0)
                    {
                        var prev = points[points.Count - 1];
                        if (Math.Abs(prev.X - x) <= 1e-6 && Math.Abs(prev.Y - y) <= 1e-6)
                        {
                            continue;
                        }
                    }
                    points.Add(new GeometryPoint(x, y));
                }

                if (points.Count < 2)
                {
                    return new JsonObject
                    {
                        ["success"] = false,
                        ["code"] = "INVALID_REQUEST",
                        ["message"] = "route.path requires at least two valid points.",
                        ["meta"] = new JsonObject
                        {
                            ["source"] = "dotnet",
                            ["operation"] = operation,
                            ["sessionId"] = sessionId,
                            ["clientRouteId"] = clientRouteId,
                        },
                        ["warnings"] = new JsonArray(),
                    };
                }

                var routeType = ReadStringValue(routeNode, "routeType", "conductor").Trim().ToLowerInvariant();
                routeType = routeType == "jumper" ? "jumper" : "conductor";
                var routeLayer = NormalizeLayerName(
                    ReadStringValue(routeNode, "layerName", ""),
                    routeType == "jumper" ? "SUITE_WIRE_JUMPER" : defaultLayerName
                );
                int? colorAci = null;
                var colorCandidate = ReadInt(routeNode, "colorAci", 0);
                if (colorCandidate >= 1 && colorCandidate <= 255)
                {
                    colorAci = colorCandidate;
                }
                var routeRef = ReadStringValue(routeNode, "ref", "AUTO-001");
                var routeGeometryVersion = ReadStringValue(routeNode, "geometryVersion", RouteGeometryVersion);
                if (!string.IsNullOrWhiteSpace(routeGeometryVersion))
                {
                    geometryVersion = routeGeometryVersion;
                }

                var staleDeleteResult = DeleteRouteBindings(sessionId, clientRouteId, session.Document, warnings);
                deletedEntities += staleDeleteResult.DeletedCount;

                EnsureLayerExists(session.Document, routeLayer, colorAci);
                layersUsed.Add(routeLayer);
                var createdHandles = new List<string>();
                var routePrimitives = ParseCadRoutePrimitives(routeNode, warnings);
                if (routePrimitives.Count == 0)
                {
                    for (var pointIndex = 1; pointIndex < points.Count; pointIndex++)
                    {
                        var startPoint = points[pointIndex - 1];
                        var endPoint = points[pointIndex];
                        if (Math.Abs(endPoint.X - startPoint.X) <= 1e-6 && Math.Abs(endPoint.Y - startPoint.Y) <= 1e-6)
                        {
                            continue;
                        }
                        routePrimitives.Add(
                            new CadRoutePrimitive
                            {
                                Kind = "line",
                                Start = startPoint,
                                End = endPoint,
                                Center = default,
                                Radius = 0.0,
                                Turn = 1.0,
                            }
                        );
                    }
                }

                filletAppliedCorners = ClampInt(
                    ReadInt(
                        routeNode,
                        "filletAppliedCorners",
                        routePrimitives.Count(entry => string.Equals(entry.Kind, "arc", StringComparison.OrdinalIgnoreCase))
                    ),
                    0,
                    100000
                );
                filletSkippedCorners = ClampInt(
                    ReadInt(routeNode, "filletSkippedCorners", 0),
                    0,
                    100000
                );

                for (var primitiveIndex = 0; primitiveIndex < routePrimitives.Count; primitiveIndex++)
                {
                    var primitive = routePrimitives[primitiveIndex];
                    if (string.Equals(primitive.Kind, "line", StringComparison.OrdinalIgnoreCase))
                    {
                        if (Math.Abs(primitive.End.X - primitive.Start.X) <= 1e-6
                            && Math.Abs(primitive.End.Y - primitive.Start.Y) <= 1e-6)
                        {
                            continue;
                        }
                        try
                        {
                            var entity = ((dynamic)session.Modelspace).AddLine(
                                CadPoint(primitive.Start.X, primitive.Start.Y, 0.0),
                                CadPoint(primitive.End.X, primitive.End.Y, 0.0)
                            );
                            SetEntityLayerAndColor(entity, routeLayer, colorAci);
                            var handle = GetEntityHandle(entity);
                            if (!string.IsNullOrWhiteSpace(handle))
                            {
                                createdHandles.Add(handle);
                            }
                            drawnLines += 1;
                            segmentsDrawn += 1;
                        }
                        catch (Exception ex)
                        {
                            warnings.Add(
                                $"Route '{routeRef}': failed to draw line primitive {primitiveIndex} ({DescribeException(ex)})."
                            );
                        }
                        continue;
                    }

                    if (string.Equals(primitive.Kind, "arc", StringComparison.OrdinalIgnoreCase))
                    {
                        var startAngle = Math.Atan2(
                            primitive.Start.Y - primitive.Center.Y,
                            primitive.Start.X - primitive.Center.X
                        );
                        var endAngle = Math.Atan2(
                            primitive.End.Y - primitive.Center.Y,
                            primitive.End.X - primitive.Center.X
                        );
                        (startAngle, endAngle) = NormalizeAddArcAngles(startAngle, endAngle, primitive.Turn);

                        object? arcEntity = null;
                        try
                        {
                            arcEntity = ((dynamic)session.Modelspace).AddArc(
                                CadPoint(primitive.Center.X, primitive.Center.Y, 0.0),
                                primitive.Radius,
                                startAngle,
                                endAngle
                            );
                            SetEntityLayerAndColor(arcEntity, routeLayer, colorAci);
                            var handle = GetEntityHandle(arcEntity);
                            if (!string.IsNullOrWhiteSpace(handle))
                            {
                                createdHandles.Add(handle);
                            }
                            drawnArcs += 1;
                            segmentsDrawn += 1;
                        }
                        catch (Exception ex)
                        {
                            warnings.Add(
                                $"Route '{routeRef}': failed to draw arc primitive {primitiveIndex} ({DescribeException(ex)}). Falling back to line."
                            );
                            try
                            {
                                var fallbackEntity = ((dynamic)session.Modelspace).AddLine(
                                    CadPoint(primitive.Start.X, primitive.Start.Y, 0.0),
                                    CadPoint(primitive.End.X, primitive.End.Y, 0.0)
                                );
                                SetEntityLayerAndColor(fallbackEntity, routeLayer, colorAci);
                                var handle = GetEntityHandle(fallbackEntity);
                                if (!string.IsNullOrWhiteSpace(handle))
                                {
                                    createdHandles.Add(handle);
                                }
                                drawnLines += 1;
                                segmentsDrawn += 1;
                            }
                            catch (Exception fallbackEx)
                            {
                                warnings.Add(
                                    $"Route '{routeRef}': failed arc fallback line {primitiveIndex} ({DescribeException(fallbackEx)})."
                                );
                            }
                        }
                        continue;
                    }

                    warnings.Add($"Route '{routeRef}': unsupported primitive kind '{primitive.Kind}'.");
                }

                if (annotateRefs && !string.IsNullOrWhiteSpace(routeRef))
                {
                    var (labelX, labelY, labelRotation) = ComputeRouteLabelAnchor(points);
                    try
                    {
                        var labelWidth = Math.Max(1.0, textHeight * Math.Max(6.0, routeRef.Length * 0.9));
                        var labelEntity = ((dynamic)session.Modelspace).AddMText(
                            CadPoint(labelX, labelY, 0.0),
                            labelWidth,
                            routeRef
                        );
                        SetEntityLayerAndColor(labelEntity, routeLayer, colorAci);
                        try
                        {
                            ((dynamic)labelEntity).AttachmentPoint = 5; // Middle Center
                        }
                        catch
                        {
                            // Ignore AttachmentPoint failures.
                        }
                        try
                        {
                            ((dynamic)labelEntity).Rotation = labelRotation;
                        }
                        catch
                        {
                            // Ignore rotation assignment failures.
                        }
                        try
                        {
                            ((dynamic)labelEntity).BackgroundFill = true;
                        }
                        catch
                        {
                            // Ignore mask assignment failures.
                        }
                        try
                        {
                            ((dynamic)labelEntity).UseBackgroundColor = true;
                        }
                        catch
                        {
                            // Ignore mask color assignment failures.
                        }
                        var handle = GetEntityHandle(labelEntity);
                        if (!string.IsNullOrWhiteSpace(handle))
                        {
                            createdHandles.Add(handle);
                        }
                        labelsDrawn += 1;
                    }
                    catch (Exception ex)
                    {
                        warnings.Add(
                            $"Route '{routeRef}': MText label failed ({DescribeException(ex)}). Falling back to Text."
                        );
                        try
                        {
                            var fallbackLabel = ((dynamic)session.Modelspace).AddText(
                                routeRef,
                                CadPoint(labelX, labelY, 0.0),
                                textHeight
                            );
                            SetEntityLayerAndColor(fallbackLabel, routeLayer, colorAci);
                            try
                            {
                                ((dynamic)fallbackLabel).Alignment = 10; // Middle Center
                            }
                            catch
                            {
                                // Ignore alignment failures.
                            }
                            try
                            {
                                ((dynamic)fallbackLabel).TextAlignmentPoint = CadPoint(labelX, labelY, 0.0);
                            }
                            catch
                            {
                                // Ignore alignment point failures.
                            }
                            try
                            {
                                ((dynamic)fallbackLabel).Rotation = labelRotation;
                            }
                            catch
                            {
                                // Ignore rotation failures.
                            }
                            var handle = GetEntityHandle(fallbackLabel);
                            if (!string.IsNullOrWhiteSpace(handle))
                            {
                                createdHandles.Add(handle);
                            }
                            labelsDrawn += 1;
                        }
                        catch (Exception fallbackEx)
                        {
                            warnings.Add(
                                $"Route '{routeRef}': failed to place route label ({DescribeException(fallbackEx)})."
                            );
                        }
                    }
                }

                routesDrawn = segmentsDrawn > 0 ? 1 : 0;
                if (routesDrawn > 0)
                {
                    StoreRouteBindings(sessionId, clientRouteId, createdHandles);
                    success = true;
                    syncStatus = "synced";
                    message = $"Synced route '{clientRouteId}' to CAD ({segmentsDrawn} segment(s)).";
                    bindingsNode[clientRouteId] = new JsonObject
                    {
                        ["entityHandles"] = ToJsonArray(createdHandles),
                    };
                }
                else
                {
                    RemoveRouteBinding(sessionId, clientRouteId);
                    success = false;
                    code = "NO_VALID_ROUTES";
                    syncStatus = "failed";
                    message = $"Failed to sync route '{clientRouteId}' to CAD.";
                }
            }
        }

        try
        {
            ((dynamic)session.Document).Regen(1);
        }
        catch
        {
            // Ignore regen failures.
        }

        stopwatch.Stop();
        return new JsonObject
        {
            ["success"] = success,
            ["code"] = code,
            ["message"] = message,
            ["data"] = new JsonObject
            {
                ["drawing"] = new JsonObject
                {
                    ["name"] = drawingName,
                    ["units"] = units,
                },
                ["operation"] = operation,
                ["sessionId"] = sessionId,
                ["clientRouteId"] = clientRouteId,
                ["syncStatus"] = syncStatus,
                ["drawnRoutes"] = routesDrawn,
                ["drawnSegments"] = segmentsDrawn,
                ["drawnLines"] = drawnLines,
                ["drawnArcs"] = drawnArcs,
                ["labelsDrawn"] = labelsDrawn,
                ["filletAppliedCorners"] = filletAppliedCorners,
                ["filletSkippedCorners"] = filletSkippedCorners,
                ["geometryVersion"] = geometryVersion,
                ["deletedEntities"] = deletedEntities,
                ["resetRoutes"] = resetRoutes,
                ["layersUsed"] = ToJsonArray(layersUsed),
                ["bindings"] = bindingsNode,
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet",
                ["drawMs"] = stopwatch.ElapsedMilliseconds,
                ["operation"] = operation,
                ["sessionId"] = sessionId,
                ["clientRouteId"] = clientRouteId,
                ["routeCandidates"] = routeCandidates,
                ["routesDrawn"] = routesDrawn,
                ["segmentsDrawn"] = segmentsDrawn,
                ["linesDrawn"] = drawnLines,
                ["arcsDrawn"] = drawnArcs,
                ["labelsDrawn"] = labelsDrawn,
            },
            ["warnings"] = ToJsonArray(warnings),
        };
    }

    public static JsonObject HandleEtapCleanupRun(JsonObject payload)
    {
        var stopwatch = Stopwatch.StartNew();
        var warnings = new List<string>();

        var command = "ETAPFIX";
        if (payload.TryGetPropertyValue("command", out var commandNode)
            && commandNode is JsonValue commandValue
            && commandValue.TryGetValue<string>(out var commandText)
            && !string.IsNullOrWhiteSpace(commandText))
        {
            command = commandText.Trim().ToUpperInvariant();
        }

        if (!EtapCleanupCommandAllowList.Contains(command))
        {
            return new JsonObject
            {
                ["success"] = false,
                ["code"] = "INVALID_REQUEST",
                ["message"] =
                    $"Unsupported ETAP cleanup command '{command}'. Allowed values: {string.Join(", ", EtapCleanupCommandAllowList.OrderBy(item => item, StringComparer.OrdinalIgnoreCase))}.",
                ["data"] = new JsonObject(),
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                    ["providerPath"] = "dotnet",
                    ["action"] = "etap_dxf_cleanup_run",
                    ["command"] = command,
                },
                ["warnings"] = new JsonArray(),
            };
        }

        var waitForCompletion = ReadBool(payload, "waitForCompletion", fallback: true);
        var timeoutMs = ClampInt(
            ReadInt(payload, "timeoutMs", DefaultEtapCleanupTimeoutMs),
            1_000,
            10 * 60 * 1000
        );
        var saveDrawing = ReadBool(payload, "saveDrawing", fallback: false);

        var pluginDllPath = "";
        if (payload.TryGetPropertyValue("pluginDllPath", out var dllPathNode)
            && dllPathNode is JsonValue dllPathValue
            && dllPathValue.TryGetValue<string>(out var dllPathRaw))
        {
            pluginDllPath = (dllPathRaw ?? "").Trim().Trim('"');
        }

        if (string.IsNullOrWhiteSpace(pluginDllPath))
        {
            var discoveredPluginPath = TryResolveDefaultEtapPluginDllPath();
            if (!string.IsNullOrWhiteSpace(discoveredPluginPath))
            {
                pluginDllPath = discoveredPluginPath;
                warnings.Add(
                    $"No pluginDllPath provided; auto-discovered ETAP plugin DLL at '{pluginDllPath}'."
                );
            }
        }

        if (!string.IsNullOrWhiteSpace(pluginDllPath))
        {
            if (pluginDllPath.Contains('\r') || pluginDllPath.Contains('\n'))
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "INVALID_REQUEST",
                    ["message"] = "pluginDllPath cannot contain newline characters.",
                    ["data"] = new JsonObject(),
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "etap_dxf_cleanup_run",
                        ["command"] = command,
                    },
                    ["warnings"] = new JsonArray(),
                };
            }
            if (!Path.IsPathRooted(pluginDllPath))
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "INVALID_REQUEST",
                    ["message"] = "pluginDllPath must be an absolute path.",
                    ["data"] = new JsonObject(),
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "etap_dxf_cleanup_run",
                        ["command"] = command,
                    },
                    ["warnings"] = new JsonArray(),
                };
            }
            if (!pluginDllPath.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "INVALID_REQUEST",
                    ["message"] = "pluginDllPath must point to a .dll file.",
                    ["data"] = new JsonObject(),
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "etap_dxf_cleanup_run",
                        ["command"] = command,
                    },
                    ["warnings"] = new JsonArray(),
                };
            }
            if (!File.Exists(pluginDllPath))
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "PLUGIN_DLL_NOT_FOUND",
                    ["message"] = $"Plugin DLL not found: {pluginDllPath}",
                    ["data"] = new JsonObject(),
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "etap_dxf_cleanup_run",
                        ["command"] = command,
                    },
                    ["warnings"] = new JsonArray(),
                };
            }
        }

        using var session = ConnectAutoCad();
        var drawingName = StringOrDefault(ReadProperty(session.Document, "Name"), "Unknown.dwg");
        var commandSegments = new List<string>();

        if (!string.IsNullOrWhiteSpace(pluginDllPath))
        {
            var escapedPluginPath = pluginDllPath.Replace("\"", "\"\"");
            commandSegments.Add($"_.NETLOAD \"{escapedPluginPath}\"");
        }

        commandSegments.Add(command);

        if (saveDrawing)
        {
            commandSegments.Add("_.QSAVE");
        }

        var commandScript = string.Join(" ", commandSegments).Trim();
        if (!commandScript.EndsWith("\n", StringComparison.Ordinal))
        {
            commandScript += "\n";
        }

        ReadWithTransientComRetry(
            () =>
            {
                ((dynamic)session.Document).SendCommand(commandScript);
                return true;
            },
            $"SendCommand({command})"
        );

        var commandCompleted = true;
        var sawActiveCommand = false;
        var commandStateAvailable = true;
        var lastCommandMask = 0;
        if (waitForCompletion)
        {
            (commandCompleted, sawActiveCommand, commandStateAvailable, lastCommandMask) =
                WaitForAutoCadCommandCompletion(session, timeoutMs);

            if (!commandStateAvailable)
            {
                warnings.Add(
                    "Unable to read CMDACTIVE state from AutoCAD; command was queued but completion could not be verified."
                );
            }
            else if (!sawActiveCommand)
            {
                warnings.Add(
                    "AutoCAD did not report an active command state; completion was inferred. Verify the command output in AutoCAD."
                );
            }
        }
        else
        {
            warnings.Add("Command was queued without waiting for completion.");
        }

        if (!commandCompleted)
        {
            return new JsonObject
            {
                ["success"] = false,
                ["code"] = "AUTOCAD_COMMAND_TIMEOUT",
                ["message"] =
                    $"Timed out waiting for AutoCAD to finish '{command}' after {timeoutMs}ms.",
                ["data"] = new JsonObject
                {
                    ["drawing"] = new JsonObject
                    {
                        ["name"] = drawingName,
                    },
                    ["command"] = command,
                    ["commandScript"] = commandScript.Trim(),
                    ["waitForCompletion"] = waitForCompletion,
                    ["lastCommandMask"] = lastCommandMask,
                },
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                    ["providerPath"] = "dotnet",
                    ["action"] = "etap_dxf_cleanup_run",
                    ["elapsedMs"] = stopwatch.ElapsedMilliseconds,
                    ["command"] = command,
                    ["waitForCompletion"] = waitForCompletion,
                    ["timeoutMs"] = timeoutMs,
                    ["commandStateAvailable"] = commandStateAvailable,
                    ["sawActiveCommand"] = sawActiveCommand,
                },
                ["warnings"] = ToJsonArray(warnings),
            };
        }

        return new JsonObject
        {
            ["success"] = true,
            ["code"] = "",
            ["message"] =
                waitForCompletion
                    ? $"Queued and completed ETAP cleanup command '{command}'."
                    : $"Queued ETAP cleanup command '{command}'.",
            ["data"] = new JsonObject
            {
                ["drawing"] = new JsonObject
                {
                    ["name"] = drawingName,
                },
                ["command"] = command,
                ["commandScript"] = commandScript.Trim(),
                ["pluginDllPath"] = string.IsNullOrWhiteSpace(pluginDllPath) ? null : pluginDllPath,
                ["saveDrawing"] = saveDrawing,
                ["waitForCompletion"] = waitForCompletion,
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet",
                ["action"] = "etap_dxf_cleanup_run",
                ["elapsedMs"] = stopwatch.ElapsedMilliseconds,
                ["command"] = command,
                ["waitForCompletion"] = waitForCompletion,
                ["timeoutMs"] = timeoutMs,
                ["commandStateAvailable"] = commandStateAvailable,
                ["sawActiveCommand"] = sawActiveCommand,
            },
            ["warnings"] = ToJsonArray(warnings),
        };
    }

    private static string TryResolveDefaultEtapPluginDllPath()
    {
        var envPath = (Environment.GetEnvironmentVariable("AUTOCAD_ETAP_PLUGIN_DLL_PATH") ?? "")
            .Trim()
            .Trim('"');
        if (!string.IsNullOrWhiteSpace(envPath))
        {
            try
            {
                return Path.GetFullPath(envPath);
            }
            catch
            {
                return envPath;
            }
        }

        foreach (var root in EnumerateSearchRoots())
        {
            foreach (var relativePath in EtapPluginRelativePathCandidates)
            {
                string candidatePath;
                try
                {
                    candidatePath = Path.GetFullPath(Path.Combine(root, relativePath));
                }
                catch
                {
                    continue;
                }

                if (File.Exists(candidatePath))
                {
                    return candidatePath;
                }
            }
        }

        return "";
    }

    private static IEnumerable<string> EnumerateSearchRoots()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var startPoints = new[]
        {
            Directory.GetCurrentDirectory(),
            AppContext.BaseDirectory,
        };

        foreach (var start in startPoints)
        {
            if (string.IsNullOrWhiteSpace(start))
            {
                continue;
            }

            DirectoryInfo? current;
            try
            {
                current = new DirectoryInfo(Path.GetFullPath(start));
            }
            catch
            {
                continue;
            }

            var depth = 0;
            while (current is not null && depth < 12)
            {
                var fullPath = current.FullName;
                if (seen.Add(fullPath))
                {
                    yield return fullPath;
                }

                current = current.Parent;
                depth += 1;
            }
        }
    }

    private static (bool Completed, bool SawActiveCommand, bool CommandStateAvailable, int LastCommandMask)
        WaitForAutoCadCommandCompletion(AutoCadSession session, int timeoutMs)
    {
        var stopwatch = Stopwatch.StartNew();
        var sawActive = false;
        var idleChecks = 0;
        var lastMask = 0;

        while (stopwatch.ElapsedMilliseconds < timeoutMs)
        {
            if (!TryReadCommandActiveMask(session, out var commandMask))
            {
                return (true, sawActive, false, lastMask);
            }

            lastMask = commandMask;
            if (commandMask > 0)
            {
                sawActive = true;
                idleChecks = 0;
            }
            else
            {
                idleChecks += 1;
            }

            if (sawActive && idleChecks >= 2)
            {
                return (true, true, true, lastMask);
            }

            if (!sawActive && stopwatch.ElapsedMilliseconds >= 1200 && idleChecks >= 2)
            {
                return (true, false, true, lastMask);
            }

            Thread.Sleep(120);
        }

        return (false, sawActive, true, lastMask);
    }

    private static bool TryReadCommandActiveMask(AutoCadSession session, out int commandMask)
    {
        commandMask = 0;
        try
        {
            commandMask = ReadWithTransientComRetry(
                () =>
                {
                    var value = ((dynamic)session.Document).GetVariable("CMDACTIVE");
                    return SafeInt(value) ?? 0;
                },
                "GetVariable(CMDACTIVE)"
            );
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static AutoCadSession ConnectAutoCad()
    {
        foreach (var progId in AutoCadProgIds)
        {
            if (!TryGetActiveComObject(progId, out var app) || app is null)
            {
                continue;
            }

            var document = ReadProperty(app, "ActiveDocument");
            var modelspace = document is null ? null : ReadProperty(document, "ModelSpace");
            if (document is null || modelspace is null)
            {
                continue;
            }

            BridgeLog.Info($"Connected to AutoCAD COM via ProgID={progId}");
            return new AutoCadSession(app, document, modelspace);
        }

        throw new InvalidOperationException("Unable to connect to a running AutoCAD COM instance.");
    }

    private static bool TryGetActiveComObject(string progId, out object? comObject)
    {
        comObject = null;
        try
        {
            if (CLSIDFromProgID(progId, out var clsid) != 0)
            {
                return false;
            }
            if (GetActiveObject(ref clsid, IntPtr.Zero, out var obj) != 0 || obj is null)
            {
                return false;
            }
            comObject = obj;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static object? ReadProperty(object target, string property)
    {
        return ReadWithTransientComRetry(
            () => target.GetType().InvokeMember(
                property,
                System.Reflection.BindingFlags.GetProperty,
                null,
                target,
                null,
                CultureInfo.InvariantCulture
            ),
            $"ReadProperty({property})"
        );
    }

    private static int ReadCount(object collection)
    {
        return SafeInt(ReadProperty(collection, "Count")) ?? 0;
    }

    private static object? ReadItem(object collection, int index)
    {
        return ReadWithTransientComRetry(
            () => ((dynamic)collection).Item(index),
            $"ReadItem({index})"
        );
    }

    private static IEnumerable<object> EnumerateSelectionEntities(object document)
    {
        foreach (var key in new[] { "PickfirstSelectionSet", "ActiveSelectionSet" })
        {
            var selection = ReadProperty(document, key);
            if (selection is null)
            {
                continue;
            }

            var count = ReadCount(selection);
            for (var index = 0; index < count; index++)
            {
                var item = ReadItem(selection, index);
                if (item is null)
                {
                    continue;
                }
                yield return item;
            }
        }
    }

    private static Dictionary<string, string> ReadAttributeMap(object entity)
    {
        var attrs = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var raw = ReadWithTransientComRetry(
                () => ((dynamic)entity).GetAttributes(),
                "GetAttributes"
            );
            if (raw is null)
            {
                return attrs;
            }
            if (raw is Array array)
            {
                foreach (var entry in array)
                {
                    AddAttribute(attrs, entry);
                }
                return attrs;
            }

            var count = ReadCount(raw);
            for (var index = 0; index < count; index++)
            {
                var entry = ReadItem(raw, index);
                if (entry is null)
                {
                    continue;
                }
                AddAttribute(attrs, entry);
            }
        }
        catch
        {
            // Ignore attribute extraction failures.
        }

        return attrs;
    }

    private static void AddAttribute(Dictionary<string, string> attrs, object attribute)
    {
        var tag = SafeUpper(ReadProperty(attribute, "TagString"));
        var text = StringOrDefault(ReadProperty(attribute, "TextString"), "");
        if (!string.IsNullOrWhiteSpace(tag) && !string.IsNullOrWhiteSpace(text))
        {
            attrs[tag] = text;
        }
    }

    private static TerminalScanProfile ReadTerminalScanProfile(JsonObject payload)
    {
        JsonObject? profileNode = null;
        if (payload.TryGetPropertyValue("terminalProfile", out var terminalProfileNode)
            && terminalProfileNode is JsonObject profileObj)
        {
            profileNode = profileObj;
        }
        else if (payload.TryGetPropertyValue("terminal_profile", out var terminalProfileSnakeNode)
            && terminalProfileSnakeNode is JsonObject snakeProfileObj)
        {
            profileNode = snakeProfileObj;
        }

        var panelIdKeys = ReadNormalizedProfileArray(profileNode, "panelIdKeys", PanelIdKeys);
        var panelNameKeys = ReadNormalizedProfileArray(profileNode, "panelNameKeys", PanelNameKeys);
        var sideKeys = ReadNormalizedProfileArray(profileNode, "sideKeys", SideKeys);
        var stripIdKeys = ReadNormalizedProfileArray(profileNode, "stripIdKeys", StripIdKeys);
        var stripNumberKeys = ReadNormalizedProfileArray(profileNode, "stripNumberKeys", StripNumberKeys);
        var terminalCountKeys = ReadNormalizedProfileArray(profileNode, "terminalCountKeys", TerminalCountKeys);
        var terminalTagKeys = ReadNormalizedProfileArray(profileNode, "terminalTagKeys", StripIdKeys.Concat(TerminalCountKeys));
        var terminalNameTokens = ReadNormalizedProfileArray(profileNode, "terminalNameTokens", TerminalNameTokens);
        var blockNameAllowList = ReadNormalizedProfileArray(profileNode, "blockNameAllowList", Array.Empty<string>());
        var requireStripId = profileNode is not null && ReadBool(profileNode, "requireStripId", fallback: false);
        var requireTerminalCount = profileNode is not null && ReadBool(profileNode, "requireTerminalCount", fallback: false);
        var requireSide = profileNode is not null && ReadBool(profileNode, "requireSide", fallback: false);

        var defaultPanelPrefix = ReadProfileString(
            profileNode,
            "defaultPanelPrefix",
            "default_panel_prefix",
            "PANEL"
        );
        var defaultTerminalCount = ReadProfileInt(
            profileNode,
            "defaultTerminalCount",
            "default_terminal_count",
            12
        );

        return new TerminalScanProfile(
            panelIdKeys,
            panelNameKeys,
            sideKeys,
            stripIdKeys,
            stripNumberKeys,
            terminalCountKeys,
            terminalTagKeys,
            terminalNameTokens,
            blockNameAllowList,
            requireStripId,
            requireTerminalCount,
            requireSide,
            defaultPanelPrefix,
            defaultTerminalCount
        );
    }

    private static string[] ReadNormalizedProfileArray(
        JsonObject? profileNode,
        string key,
        IEnumerable<string> fallback
    )
    {
        if (profileNode is null)
        {
            return fallback
                .Select(item => item.Trim().ToUpperInvariant())
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        var values = ReadStringArray(profileNode, key)
            .Select(item => item.Trim().ToUpperInvariant())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (values.Length > 0)
        {
            return values;
        }

        return fallback
            .Select(item => item.Trim().ToUpperInvariant())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string ReadProfileString(
        JsonObject? profileNode,
        string key,
        string fallbackKey,
        string fallback
    )
    {
        if (profileNode is null)
        {
            return fallback;
        }

        if (profileNode.TryGetPropertyValue(key, out var node)
            && node is JsonValue valueNode
            && valueNode.TryGetValue<string>(out var valueText)
            && !string.IsNullOrWhiteSpace(valueText))
        {
            return valueText.Trim();
        }

        if (profileNode.TryGetPropertyValue(fallbackKey, out var snakeNode)
            && snakeNode is JsonValue snakeValueNode
            && snakeValueNode.TryGetValue<string>(out var snakeValueText)
            && !string.IsNullOrWhiteSpace(snakeValueText))
        {
            return snakeValueText.Trim();
        }

        return fallback;
    }

    private static int ReadProfileInt(
        JsonObject? profileNode,
        string key,
        string fallbackKey,
        int fallback
    )
    {
        if (profileNode is null)
        {
            return fallback;
        }

        var fromKey = ReadInt(profileNode, key, int.MinValue);
        if (fromKey != int.MinValue)
        {
            return fromKey;
        }

        var fromFallbackKey = ReadInt(profileNode, fallbackKey, int.MinValue);
        if (fromFallbackKey != int.MinValue)
        {
            return fromFallbackKey;
        }

        return fallback;
    }

    private static JsonObject TerminalScanProfileToJson(TerminalScanProfile profile)
    {
        return new JsonObject
        {
            ["defaultPanelPrefix"] = profile.DefaultPanelPrefix,
            ["defaultTerminalCount"] = profile.DefaultTerminalCount,
            ["panelIdKeys"] = ToJsonArray(profile.PanelIdKeys),
            ["panelNameKeys"] = ToJsonArray(profile.PanelNameKeys),
            ["sideKeys"] = ToJsonArray(profile.SideKeys),
            ["stripIdKeys"] = ToJsonArray(profile.StripIdKeys),
            ["stripNumberKeys"] = ToJsonArray(profile.StripNumberKeys),
            ["terminalCountKeys"] = ToJsonArray(profile.TerminalCountKeys),
            ["terminalTagKeys"] = ToJsonArray(profile.TerminalTagKeys),
            ["terminalNameTokens"] = ToJsonArray(profile.TerminalNameTokens),
            ["blockNameAllowList"] = ToJsonArray(profile.BlockNameAllowList),
            ["requireStripId"] = profile.RequireStripId,
            ["requireTerminalCount"] = profile.RequireTerminalCount,
            ["requireSide"] = profile.RequireSide,
        };
    }

    private static bool LooksLikeTerminalBlock(
        string blockName,
        Dictionary<string, string> attrs,
        TerminalScanProfile profile
    )
    {
        var name = blockName.ToUpperInvariant();
        if (profile.BlockNameAllowList.Length > 0
            && !profile.BlockNameAllowList.Contains(name, StringComparer.OrdinalIgnoreCase))
        {
            return false;
        }

        if (profile.RequireStripId && string.IsNullOrWhiteSpace(FirstAttr(attrs, profile.StripIdKeys)))
        {
            return false;
        }
        if (profile.RequireTerminalCount
            && string.IsNullOrWhiteSpace(FirstAttr(attrs, profile.TerminalCountKeys)))
        {
            return false;
        }
        if (profile.RequireSide && string.IsNullOrWhiteSpace(FirstAttr(attrs, profile.SideKeys)))
        {
            return false;
        }

        if (profile.TerminalNameTokens.Any(token => name.Contains(token, StringComparison.Ordinal))
            || name.Contains("TB", StringComparison.Ordinal)
            || name.Contains("TS", StringComparison.Ordinal))
        {
            return true;
        }
        return attrs.Keys.Any(key => profile.TerminalTagKeys.Contains(key, StringComparer.OrdinalIgnoreCase))
            || attrs.Keys.Any(key => profile.StripIdKeys.Contains(key, StringComparer.OrdinalIgnoreCase))
            || attrs.Keys.Any(key => profile.TerminalCountKeys.Contains(key, StringComparer.OrdinalIgnoreCase));
    }

    private static string FirstAttr(Dictionary<string, string> attrs, IEnumerable<string> keys)
    {
        foreach (var key in keys)
        {
            if (attrs.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }
        return "";
    }

    private static int ParseTerminalCount(
        Dictionary<string, string> attrs,
        IEnumerable<string> terminalCountKeys,
        int defaultTerminalCount
    )
    {
        foreach (var key in terminalCountKeys)
        {
            if (!attrs.TryGetValue(key, out var raw))
            {
                continue;
            }
            var value = ExtractFirstInt(raw);
            if (value.HasValue && value.Value > 0)
            {
                return Math.Min(value.Value, 2000);
            }
        }
        return ClampInt(defaultTerminalCount, 1, 2000);
    }

    private static int ParseStripNumber(
        string stripId,
        Dictionary<string, string> attrs,
        IEnumerable<string> stripNumberKeys
    )
    {
        foreach (var key in stripNumberKeys)
        {
            if (!attrs.TryGetValue(key, out var raw))
            {
                continue;
            }
            var value = ExtractFirstInt(raw);
            if (value.HasValue)
            {
                return value.Value;
            }
        }

        var sideSuffix = Regex.Match(stripId, "[LRC](\\d+)$", RegexOptions.IgnoreCase);
        if (sideSuffix.Success
            && int.TryParse(sideSuffix.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var sideSuffixValue))
        {
            return sideSuffixValue;
        }

        var trailingDigits = Regex.Match(stripId, "(\\d+)$");
        if (trailingDigits.Success
            && int.TryParse(trailingDigits.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var trailingValue))
        {
            return trailingValue;
        }

        var fallback = ExtractFirstInt(stripId);
        return fallback ?? 1;
    }

    private static List<string> ParseTerminalLabels(Dictionary<string, string> attrs, int terminalCount)
    {
        var labelsByIndex = new Dictionary<int, string>();
        foreach (var kvp in attrs)
        {
            var match = TerminalLabelTagRegex.Match(kvp.Key ?? "");
            if (!match.Success)
            {
                continue;
            }

            if (!int.TryParse(match.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var index))
            {
                continue;
            }
            if (index <= 0)
            {
                continue;
            }

            var label = (kvp.Value ?? "").Trim();
            if (string.IsNullOrWhiteSpace(label))
            {
                continue;
            }

            labelsByIndex[index] = label;
        }

        var count = ClampInt(terminalCount, 1, 2000);
        var labels = new List<string>(capacity: count);
        for (var index = 1; index <= count; index++)
        {
            labels.Add(labelsByIndex.TryGetValue(index, out var label) ? label : "");
        }
        return labels;
    }

    private static bool LooksLikeJumperBlock(string blockName, Dictionary<string, string> attrs)
    {
        var name = (blockName ?? "").Trim().ToUpperInvariant();
        if (JumperNameTokens.Any(token => name.Contains(token, StringComparison.Ordinal)))
        {
            return true;
        }

        var hasFromStrip = !string.IsNullOrWhiteSpace(FirstAttr(attrs, JumperFromStripKeys));
        var hasToStrip = !string.IsNullOrWhiteSpace(FirstAttr(attrs, JumperToStripKeys));
        var hasFromTerm = !string.IsNullOrWhiteSpace(FirstAttr(attrs, JumperFromTermKeys));
        var hasToTerm = !string.IsNullOrWhiteSpace(FirstAttr(attrs, JumperToTermKeys));
        return hasFromStrip && hasToStrip && hasFromTerm && hasToTerm;
    }

    private static int? ParseTerminalIndex(string rawValue)
    {
        var parsed = ExtractFirstInt(rawValue ?? "");
        if (!parsed.HasValue || parsed.Value <= 0)
        {
            return null;
        }
        return ClampInt(parsed.Value, 1, 2000);
    }

    private static JumperRecord? TryParseJumperRecord(
        Dictionary<string, string> attrs,
        string blockName,
        string handle,
        string defaultPanelPrefix
    )
    {
        var fromStripId = FirstAttr(attrs, JumperFromStripKeys).Trim().ToUpperInvariant();
        var toStripId = FirstAttr(attrs, JumperToStripKeys).Trim().ToUpperInvariant();
        var fromTerminal = ParseTerminalIndex(FirstAttr(attrs, JumperFromTermKeys));
        var toTerminal = ParseTerminalIndex(FirstAttr(attrs, JumperToTermKeys));
        if (string.IsNullOrWhiteSpace(fromStripId)
            || string.IsNullOrWhiteSpace(toStripId)
            || !fromTerminal.HasValue
            || !toTerminal.HasValue)
        {
            return null;
        }

        var panelId = FirstAttr(attrs, JumperPanelIdKeys).Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(panelId))
        {
            panelId = DerivePanelFromStripId(fromStripId);
        }
        if (string.IsNullOrWhiteSpace(panelId))
        {
            panelId = DerivePanelFromStripId(toStripId);
        }
        if (string.IsNullOrWhiteSpace(panelId))
        {
            panelId = string.IsNullOrWhiteSpace(defaultPanelPrefix)
                ? "PANEL"
                : defaultPanelPrefix.Trim().ToUpperInvariant();
        }

        var jumperId = FirstAttr(attrs, JumperIdKeys).Trim();
        if (string.IsNullOrWhiteSpace(jumperId))
        {
            jumperId = string.IsNullOrWhiteSpace(handle)
                ? $"JMP_{fromStripId}_{fromTerminal.Value}"
                : $"JMP_{handle}";
        }

        return new JumperRecord
        {
            JumperId = jumperId,
            PanelId = panelId,
            FromStripId = fromStripId,
            FromTerminal = fromTerminal.Value,
            ToStripId = toStripId,
            ToTerminal = toTerminal.Value,
            SourceBlockName = (blockName ?? "").Trim(),
            Resolution = "attribute",
        };
    }

    private static JumperRecord? ResolvePositionalJumperRecord(
        PendingPositionalJumperCandidate candidate,
        List<StripScanRecord> stripRecords,
        string defaultPanelPrefix
    )
    {
        if (stripRecords.Count < 2)
        {
            return null;
        }

        List<StripScanRecord> eligible = stripRecords;
        if (!string.IsNullOrWhiteSpace(candidate.PanelHint))
        {
            var filtered = stripRecords
                .Where(
                    item => string.Equals(
                        item.PanelId,
                        candidate.PanelHint,
                        StringComparison.OrdinalIgnoreCase
                    )
                )
                .ToList();
            if (filtered.Count >= 2)
            {
                eligible = filtered;
            }
        }
        if (eligible.Count < 2)
        {
            return null;
        }

        double DistanceToCandidate(StripScanRecord item)
        {
            var center = StripCenter(item);
            var dx = center.X - candidate.X;
            var dy = center.Y - candidate.Y;
            return Math.Sqrt((dx * dx) + (dy * dy));
        }

        var firstStrip = eligible.OrderBy(DistanceToCandidate).FirstOrDefault();
        if (firstStrip is null)
        {
            return null;
        }

        var firstSide = NormalizeSide(firstStrip.Side);
        var firstPanel = firstStrip.PanelId ?? "";
        var secondStrip = eligible
            .Where(item => !string.Equals(item.StripId, firstStrip.StripId, StringComparison.OrdinalIgnoreCase))
            .OrderBy(
                item =>
                {
                    var panelPenalty = string.Equals(item.PanelId, firstPanel, StringComparison.OrdinalIgnoreCase)
                        ? 0.0
                        : 250.0;
                    var sidePenalty = string.Equals(NormalizeSide(item.Side), firstSide, StringComparison.OrdinalIgnoreCase)
                        ? 35.0
                        : 0.0;
                    return DistanceToCandidate(item) + panelPenalty + sidePenalty;
                }
            )
            .FirstOrDefault();
        if (secondStrip is null)
        {
            return null;
        }

        var fromStripId = (firstStrip.StripId ?? "").Trim().ToUpperInvariant();
        var toStripId = (secondStrip.StripId ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(fromStripId)
            || string.IsNullOrWhiteSpace(toStripId)
            || string.Equals(fromStripId, toStripId, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var panelId = !string.IsNullOrWhiteSpace(candidate.PanelHint)
            ? candidate.PanelHint
            : !string.IsNullOrWhiteSpace(firstStrip.PanelId)
                ? firstStrip.PanelId
                : !string.IsNullOrWhiteSpace(secondStrip.PanelId)
                    ? secondStrip.PanelId
                    : defaultPanelPrefix;
        panelId = string.IsNullOrWhiteSpace(panelId)
            ? "PANEL"
            : panelId.Trim().ToUpperInvariant();

        var fromTerminal = InferTerminalIndexFromY(firstStrip, candidate.Y);
        var toTerminal = InferTerminalIndexFromY(secondStrip, candidate.Y);
        var jumperId = (candidate.JumperId ?? "").Trim();
        if (string.IsNullOrWhiteSpace(jumperId))
        {
            var fallbackHandle = (candidate.Handle ?? "").Trim();
            jumperId = string.IsNullOrWhiteSpace(fallbackHandle)
                ? $"JMP_{fromStripId}_{fromTerminal}"
                : $"JMP_{fallbackHandle}";
        }

        return new JumperRecord
        {
            JumperId = jumperId,
            PanelId = panelId,
            FromStripId = fromStripId,
            FromTerminal = fromTerminal,
            ToStripId = toStripId,
            ToTerminal = toTerminal,
            SourceBlockName = (candidate.BlockName ?? "").Trim(),
            Resolution = "position",
            X = candidate.X,
            Y = candidate.Y,
        };
    }

    private static (double X, double Y) StripCenter(StripScanRecord strip)
    {
        var bounds = GeometryVerticalBounds(strip.Geometry);
        if (!bounds.HasValue)
        {
            return (strip.X, strip.Y);
        }
        return (strip.X, (bounds.Value.MinY + bounds.Value.MaxY) / 2.0);
    }

    private static (double MinY, double MaxY)? GeometryVerticalBounds(List<TerminalGeometryPrimitive> geometry)
    {
        if (geometry is null || geometry.Count == 0)
        {
            return null;
        }

        var minY = double.PositiveInfinity;
        var maxY = double.NegativeInfinity;
        var found = false;
        foreach (var primitive in geometry)
        {
            if (primitive?.Points is null || primitive.Points.Count == 0)
            {
                continue;
            }
            foreach (var point in primitive.Points)
            {
                if (double.IsNaN(point.Y) || double.IsInfinity(point.Y))
                {
                    continue;
                }
                found = true;
                minY = Math.Min(minY, point.Y);
                maxY = Math.Max(maxY, point.Y);
            }
        }

        if (!found)
        {
            return null;
        }
        return (minY, maxY);
    }

    private static int InferTerminalIndexFromY(StripScanRecord strip, double yValue)
    {
        var terminalCount = ClampInt(strip.TerminalCount, 1, 2000);
        var bounds = GeometryVerticalBounds(strip.Geometry);
        if (bounds.HasValue)
        {
            var span = bounds.Value.MaxY - bounds.Value.MinY;
            if (span > 1e-6 && !double.IsNaN(span) && !double.IsInfinity(span))
            {
                var normalized = (yValue - bounds.Value.MinY) / span;
                normalized = Math.Max(0.0, Math.Min(1.0, normalized));
                return ClampInt((int)Math.Round(normalized * (terminalCount - 1)) + 1, 1, terminalCount);
            }
        }

        var guessed = (int)Math.Round(((yValue - strip.Y) / 12.0) + 1.0);
        return ClampInt(guessed, 1, terminalCount);
    }

    private static JsonArray JumpersToJsonArray(List<JumperRecord> jumpers)
    {
        var sorted = jumpers
            .OrderBy(item => item.PanelId, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.FromStripId, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.FromTerminal)
            .ThenBy(item => item.ToStripId, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.ToTerminal)
            .ToList();

        var outNode = new JsonArray();
        foreach (var jumper in sorted)
        {
            var payload = new JsonObject
            {
                ["jumperId"] = jumper.JumperId,
                ["panelId"] = jumper.PanelId,
                ["fromStripId"] = jumper.FromStripId,
                ["fromTerminal"] = jumper.FromTerminal,
                ["toStripId"] = jumper.ToStripId,
                ["toTerminal"] = jumper.ToTerminal,
                ["sourceBlockName"] = jumper.SourceBlockName,
                ["resolution"] = string.IsNullOrWhiteSpace(jumper.Resolution)
                    ? "attribute"
                    : jumper.Resolution,
            };
            if (jumper.X.HasValue && jumper.Y.HasValue)
            {
                payload["x"] = jumper.X.Value;
                payload["y"] = jumper.Y.Value;
            }
            outNode.Add(payload);
        }
        return outNode;
    }

    private static List<TerminalGeometryPrimitive> ReadTerminalGeometryForInsert(
        object document,
        object blockReferenceEntity,
        string blockName,
        double fallbackInsertX,
        double fallbackInsertY,
        Dictionary<string, List<TerminalGeometryPrimitive>> cache
    )
    {
        if (string.IsNullOrWhiteSpace(blockName))
        {
            return new List<TerminalGeometryPrimitive>();
        }

        var localGeometry = ReadBlockDefinitionGeometry(
            document,
            blockName,
            cache,
            new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        );
        if (localGeometry.Count == 0)
        {
            return localGeometry;
        }

        var insertTransform = ReadBlockInsertTransform(
            blockReferenceEntity,
            fallbackInsertX,
            fallbackInsertY
        );
        return TransformGeometry(localGeometry, insertTransform);
    }

    private static List<TerminalGeometryPrimitive> ReadBlockDefinitionGeometry(
        object document,
        string blockName,
        Dictionary<string, List<TerminalGeometryPrimitive>> cache,
        HashSet<string> activeStack
    )
    {
        var normalizedBlockName = blockName.Trim().ToUpperInvariant();
        if (normalizedBlockName.Length == 0)
        {
            return new List<TerminalGeometryPrimitive>();
        }

        if (cache.TryGetValue(normalizedBlockName, out var cachedGeometry))
        {
            return CloneGeometry(cachedGeometry);
        }

        if (!activeStack.Add(normalizedBlockName))
        {
            return new List<TerminalGeometryPrimitive>();
        }

        try
        {
            var blocks = ReadProperty(document, "Blocks");
            if (blocks is null)
            {
                cache[normalizedBlockName] = new List<TerminalGeometryPrimitive>();
                return new List<TerminalGeometryPrimitive>();
            }

            object? blockDefinition = null;
            foreach (var candidateName in new[] { blockName, normalizedBlockName })
            {
                if (string.IsNullOrWhiteSpace(candidateName))
                {
                    continue;
                }
                blockDefinition = ReadWithTransientComRetry(
                    () => ((dynamic)blocks).Item(candidateName),
                    $"Blocks.Item({candidateName})"
                );
                if (blockDefinition is not null)
                {
                    break;
                }
            }

            if (blockDefinition is null)
            {
                cache[normalizedBlockName] = new List<TerminalGeometryPrimitive>();
                return new List<TerminalGeometryPrimitive>();
            }

            var primitives = new List<TerminalGeometryPrimitive>();
            var entityCount = ReadCount(blockDefinition);
            for (var index = 0; index < entityCount; index++)
            {
                var childEntity = ReadItem(blockDefinition, index);
                if (childEntity is null)
                {
                    continue;
                }

                var objectName = SafeUpper(ReadProperty(childEntity, "ObjectName"));
                if (objectName.Contains("BLOCKREFERENCE", StringComparison.Ordinal))
                {
                    var nestedBlockName = StringOrDefault(ReadProperty(childEntity, "EffectiveName"), "");
                    if (string.IsNullOrWhiteSpace(nestedBlockName))
                    {
                        nestedBlockName = StringOrDefault(ReadProperty(childEntity, "Name"), "");
                    }
                    if (string.IsNullOrWhiteSpace(nestedBlockName))
                    {
                        continue;
                    }

                    var nestedLocal = ReadBlockDefinitionGeometry(
                        document,
                        nestedBlockName,
                        cache,
                        activeStack
                    );
                    if (nestedLocal.Count == 0)
                    {
                        continue;
                    }

                    var nestedTransform = ReadBlockInsertTransform(childEntity, 0.0, 0.0);
                    primitives.AddRange(TransformGeometry(nestedLocal, nestedTransform));
                    continue;
                }

                var primitive = ReadEntityGeometryPrimitive(childEntity, objectName);
                if (primitive is null || primitive.Points.Count < 2)
                {
                    continue;
                }
                primitives.Add(primitive);
            }

            cache[normalizedBlockName] = CloneGeometry(primitives);
            return CloneGeometry(primitives);
        }
        finally
        {
            activeStack.Remove(normalizedBlockName);
        }
    }

    private static TerminalGeometryPrimitive? ReadEntityGeometryPrimitive(object entity, string objectName)
    {
        if (objectName.Contains("POLYLINE", StringComparison.Ordinal))
        {
            var points = ReadPolylinePoints(entity, objectName);
            if (points.Count < 2)
            {
                return null;
            }

            var closed = TryReadBoolLike(ReadProperty(entity, "Closed"), fallback: false);
            return new TerminalGeometryPrimitive
            {
                Kind = "polyline",
                Closed = closed,
                Points = points,
            };
        }

        if (objectName.Equals("ACDBLINE", StringComparison.Ordinal))
        {
            if (!TryReadPoint(ReadProperty(entity, "StartPoint"), out var x1, out var y1))
            {
                return null;
            }
            if (!TryReadPoint(ReadProperty(entity, "EndPoint"), out var x2, out var y2))
            {
                return null;
            }

            return new TerminalGeometryPrimitive
            {
                Kind = "line",
                Closed = false,
                Points = new List<GeometryPoint>
                {
                    new GeometryPoint(x1, y1),
                    new GeometryPoint(x2, y2),
                },
            };
        }

        return null;
    }

    private static List<GeometryPoint> ReadPolylinePoints(object entity, string objectName)
    {
        var points = new List<GeometryPoint>();

        var coordinates = ReadProperty(entity, "Coordinates");
        if (coordinates is Array coordsArray && coordsArray.Length >= 4)
        {
            var stride = objectName.Contains("3DPOLYLINE", StringComparison.Ordinal) ? 3 : 2;
            if (stride == 2 && coordsArray.Length % 2 != 0 && coordsArray.Length % 3 == 0)
            {
                stride = 3;
            }

            for (var index = 0; index + 1 < coordsArray.Length; index += stride)
            {
                var x = SafeDouble(coordsArray.GetValue(index));
                var y = SafeDouble(coordsArray.GetValue(index + 1));
                if (!x.HasValue || !y.HasValue)
                {
                    continue;
                }
                points.Add(new GeometryPoint(x.Value, y.Value));
            }
        }

        if (points.Count >= 2)
        {
            return points;
        }

        var vertexCount = SafeInt(ReadProperty(entity, "NumberOfVertices")) ?? 0;
        for (var vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++)
        {
            var vertex = ReadWithTransientComRetry(
                () => ((dynamic)entity).Coordinate(vertexIndex),
                $"Coordinate({vertexIndex})"
            );
            if (!TryReadPoint(vertex, out double x, out double y))
            {
                continue;
            }
            points.Add(new GeometryPoint(x, y));
        }

        return points;
    }

    private static Affine2D ReadBlockInsertTransform(object blockReferenceEntity, double fallbackX, double fallbackY)
    {
        var insertX = fallbackX;
        var insertY = fallbackY;
        if (TryReadPoint(ReadProperty(blockReferenceEntity, "InsertionPoint"), out var x, out var y))
        {
            insertX = x;
            insertY = y;
        }

        var scaleX = SafeDouble(ReadProperty(blockReferenceEntity, "XScaleFactor")) ?? 1.0;
        var scaleY = SafeDouble(ReadProperty(blockReferenceEntity, "YScaleFactor")) ?? 1.0;
        if (Math.Abs(scaleX) <= 1e-9)
        {
            scaleX = 1.0;
        }
        if (Math.Abs(scaleY) <= 1e-9)
        {
            scaleY = 1.0;
        }

        var rotation = SafeDouble(ReadProperty(blockReferenceEntity, "Rotation")) ?? 0.0;
        var cos = Math.Cos(rotation);
        var sin = Math.Sin(rotation);
        return new Affine2D(
            m00: cos * scaleX,
            m01: -sin * scaleY,
            m02: insertX,
            m10: sin * scaleX,
            m11: cos * scaleY,
            m12: insertY
        );
    }

    private static List<TerminalGeometryPrimitive> TransformGeometry(
        List<TerminalGeometryPrimitive> primitives,
        Affine2D transform
    )
    {
        var outPrimitives = new List<TerminalGeometryPrimitive>(capacity: primitives.Count);
        foreach (var primitive in primitives)
        {
            if (primitive.Points.Count < 2)
            {
                continue;
            }

            var transformedPoints = new List<GeometryPoint>(capacity: primitive.Points.Count);
            foreach (var point in primitive.Points)
            {
                transformedPoints.Add(transform.Apply(point));
            }

            if (transformedPoints.Count < 2)
            {
                continue;
            }

            outPrimitives.Add(
                new TerminalGeometryPrimitive
                {
                    Kind = primitive.Kind,
                    Closed = primitive.Closed,
                    Points = transformedPoints,
                }
            );
        }
        return outPrimitives;
    }

    private static List<TerminalGeometryPrimitive> CloneGeometry(List<TerminalGeometryPrimitive> source)
    {
        var cloned = new List<TerminalGeometryPrimitive>(capacity: source.Count);
        foreach (var primitive in source)
        {
            if (primitive.Points.Count < 2)
            {
                continue;
            }

            cloned.Add(
                new TerminalGeometryPrimitive
                {
                    Kind = primitive.Kind,
                    Closed = primitive.Closed,
                    Points = primitive.Points
                        .Select(point => new GeometryPoint(point.X, point.Y))
                        .ToList(),
                }
            );
        }
        return cloned;
    }

    private static JsonArray GeometryToJsonArray(List<TerminalGeometryPrimitive> primitives)
    {
        var outNode = new JsonArray();
        foreach (var primitive in primitives)
        {
            if (primitive.Points.Count < 2)
            {
                continue;
            }

            var pointsNode = new JsonArray();
            foreach (var point in primitive.Points)
            {
                pointsNode.Add(
                    new JsonObject
                    {
                        ["x"] = Math.Round(point.X, 6),
                        ["y"] = Math.Round(point.Y, 6),
                    }
                );
            }

            var primitiveNode = new JsonObject
            {
                ["kind"] = primitive.Kind,
                ["points"] = pointsNode,
            };
            if (primitive.Closed)
            {
                primitiveNode["closed"] = true;
            }
            outNode.Add(primitiveNode);
        }

        return outNode;
    }

    private static bool TryReadBoolLike(object? value, bool fallback)
    {
        if (value is null)
        {
            return fallback;
        }
        if (value is bool boolValue)
        {
            return boolValue;
        }
        if (value is int intValue)
        {
            return intValue != 0;
        }
        if (value is long longValue)
        {
            return longValue != 0;
        }
        if (value is short shortValue)
        {
            return shortValue != 0;
        }
        if (value is byte byteValue)
        {
            return byteValue != 0;
        }
        if (value is double doubleValue)
        {
            return Math.Abs(doubleValue) > 1e-9;
        }
        if (value is float floatValue)
        {
            return Math.Abs(floatValue) > 1e-9f;
        }

        var text = value.ToString()?.Trim().ToUpperInvariant() ?? "";
        return text switch
        {
            "1" or "TRUE" or "YES" or "Y" or "ON" => true,
            "0" or "FALSE" or "NO" or "N" or "OFF" => false,
            _ => fallback,
        };
    }

    private static int? ExtractFirstInt(string input)
    {
        var match = Regex.Match(input, "(\\d+)");
        if (!match.Success)
        {
            return null;
        }
        return int.TryParse(match.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
            ? value
            : null;
    }

    private static string DerivePanelFromStripId(string stripId)
    {
        var match = Regex.Match(stripId ?? "", "^([A-Z]+[0-9]+)", RegexOptions.IgnoreCase);
        return match.Success ? match.Groups[1].Value.ToUpperInvariant() : "";
    }

    private static string NormalizeSide(string side)
    {
        var normalized = side.Trim().ToUpperInvariant();
        if (normalized.StartsWith("L", StringComparison.Ordinal) || normalized == "A")
        {
            return "L";
        }
        if (normalized.StartsWith("R", StringComparison.Ordinal) || normalized == "B")
        {
            return "R";
        }
        return "C";
    }

    private static string PanelColor(string panelId)
    {
        var palette = new[] { "#f59e0b", "#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#14b8a6" };
        if (string.IsNullOrWhiteSpace(panelId))
        {
            return palette[0];
        }
        var checksum = panelId.ToUpperInvariant().ToCharArray().Sum(character => character);
        return palette[checksum % palette.Length];
    }

    private static string ResolveUnits(object document)
    {
        try
        {
            var raw = ReadWithTransientComRetry(
                () => ((dynamic)document).GetVariable("INSUNITS"),
                "GetVariable(INSUNITS)"
            );
            if (raw is null)
            {
                return "Unknown";
            }
            var parsed = SafeInt(raw);
            return parsed switch
            {
                1 => "Inches",
                2 => "Feet",
                3 => "Miles",
                4 => "Millimeters",
                5 => "Centimeters",
                6 => "Meters",
                7 => "Kilometers",
                _ => "Unitless",
            };
        }
        catch
        {
            return "Unknown";
        }
    }

    private static bool IsNonGeometryObject(string objectName)
    {
        return objectName.Contains("TEXT", StringComparison.Ordinal)
            || objectName.Contains("DIMENSION", StringComparison.Ordinal)
            || objectName.Contains("ATTRIBUTE", StringComparison.Ordinal);
    }

    private static string? InferObstacleType(string layerName, bool forceUnknownToFoundation)
    {
        if (layerName.Contains("TRENCH", StringComparison.Ordinal))
        {
            return "trench";
        }
        if (layerName.Contains("FENCE", StringComparison.Ordinal))
        {
            return "fence";
        }
        if (layerName.Contains("ROAD", StringComparison.Ordinal))
        {
            return "road";
        }
        if (layerName.Contains("FOUND", StringComparison.Ordinal)
            || layerName.Contains("FNDN", StringComparison.Ordinal))
        {
            return "foundation";
        }
        if (layerName.Contains("PAD", StringComparison.Ordinal) || layerName.Contains("S-CONC", StringComparison.Ordinal))
        {
            return "equipment_pad";
        }
        if (layerName.Contains("BUILD", StringComparison.Ordinal)
            || layerName.Contains("A-WALL", StringComparison.Ordinal)
            || layerName.Contains("S-STRU", StringComparison.Ordinal))
        {
            return "building";
        }
        return forceUnknownToFoundation ? "foundation" : null;
    }

    private static bool TryGetBoundingBox(object entity, out double minX, out double minY, out double maxX, out double maxY)
    {
        minX = minY = maxX = maxY = 0.0;
        try
        {
            var points = ReadWithTransientComRetry(
                () =>
                {
                    ((dynamic)entity).GetBoundingBox(out object minPoint, out object maxPoint);
                    return new BoundingBoxPoints(minPoint, maxPoint);
                },
                "GetBoundingBox"
            );
            if (points is null)
            {
                return false;
            }

            if (!TryReadPoint(points.MinPoint, out minX, out minY))
            {
                return false;
            }
            if (!TryReadPoint(points.MaxPoint, out maxX, out maxY))
            {
                return false;
            }
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryReadPoint(object? point, out double x, out double y)
    {
        x = y = 0;
        if (point is not Array arr || arr.Length < 2)
        {
            return false;
        }
        var xValue = SafeDouble(arr.GetValue(0));
        var yValue = SafeDouble(arr.GetValue(1));
        if (!xValue.HasValue || !yValue.HasValue)
        {
            return false;
        }
        x = xValue.Value;
        y = yValue.Value;
        return true;
    }

    private static (JsonArray Obstacles, JsonObject Viewport) NormalizeObstacles(
        List<RawObstacle> rawObstacles,
        double canvasWidth,
        double canvasHeight,
        double padding
    )
    {
        if (rawObstacles.Count == 0)
        {
            return (
                new JsonArray(),
                new JsonObject
                {
                    ["canvasWidth"] = canvasWidth,
                    ["canvasHeight"] = canvasHeight,
                    ["padding"] = padding,
                    ["scale"] = 1.0,
                    ["worldMinX"] = 0.0,
                    ["worldMinY"] = 0.0,
                    ["worldMaxX"] = canvasWidth,
                    ["worldMaxY"] = canvasHeight,
                }
            );
        }

        var minX = rawObstacles.Min(item => item.MinX);
        var minY = rawObstacles.Min(item => item.MinY);
        var maxX = rawObstacles.Max(item => item.MaxX);
        var maxY = rawObstacles.Max(item => item.MaxY);
        var worldWidth = Math.Max(1.0, maxX - minX);
        var worldHeight = Math.Max(1.0, maxY - minY);

        var usableWidth = Math.Max(120.0, canvasWidth - (padding * 2.0));
        var usableHeight = Math.Max(120.0, canvasHeight - (padding * 2.0));
        var scale = Math.Min(usableWidth / worldWidth, usableHeight / worldHeight);
        if (scale <= 0)
        {
            scale = 1.0;
        }

        var obstacles = new JsonArray();
        for (var index = 0; index < rawObstacles.Count; index++)
        {
            var raw = rawObstacles[index];
            var x = ((raw.MinX - minX) * scale) + padding;
            var y = ((raw.MinY - minY) * scale) + padding;
            var width = Math.Max(2.0, (raw.MaxX - raw.MinX) * scale);
            var height = Math.Max(2.0, (raw.MaxY - raw.MinY) * scale);

            obstacles.Add(
                new JsonObject
                {
                    ["id"] = $"acad_obs_{index + 1}",
                    ["type"] = raw.Type,
                    ["x"] = Math.Round(x, 3),
                    ["y"] = Math.Round(y, 3),
                    ["w"] = Math.Round(width, 3),
                    ["h"] = Math.Round(height, 3),
                    ["label"] = raw.Label,
                }
            );
        }

        return (
            obstacles,
            new JsonObject
            {
                ["canvasWidth"] = canvasWidth,
                ["canvasHeight"] = canvasHeight,
                ["padding"] = padding,
                ["scale"] = scale,
                ["worldMinX"] = minX,
                ["worldMinY"] = minY,
                ["worldMaxX"] = maxX,
                ["worldMaxY"] = maxY,
            }
        );
    }

    private static string ReadStringValue(JsonObject payload, string key, string fallback = "")
    {
        if (!payload.TryGetPropertyValue(key, out var node) || node is not JsonValue valueNode)
        {
            return fallback;
        }
        if (!valueNode.TryGetValue<string>(out var text))
        {
            return fallback;
        }
        var trimmed = text.Trim();
        return trimmed.Length > 0 ? trimmed : fallback;
    }

    private static string NormalizeLayerName(string rawValue, string fallback)
    {
        var candidate = (rawValue ?? "").Trim();
        if (string.IsNullOrWhiteSpace(candidate))
        {
            candidate = fallback;
        }
        candidate = candidate.Replace("\t", "_").Replace("\r", "_").Replace("\n", "_");
        return candidate.Length <= 80 ? candidate : candidate.Substring(0, 80);
    }

    private static double[] CadPoint(double x, double y, double z)
    {
        return new[] { x, y, z };
    }

    private static double SnapCoord(double value)
    {
        return Math.Round(value, 3, MidpointRounding.AwayFromZero);
    }

    private static (double StartAngle, double EndAngle) NormalizeAddArcAngles(
        double startAngle,
        double endAngle,
        double turn
    )
    {
        var normalizedStart = startAngle;
        var normalizedEnd = endAngle;
        // AutoCAD AddArc always sweeps CCW from start->end. For clockwise
        // corner intent, swap first so the same physical arc stays minor.
        if (turn < 0.0)
        {
            (normalizedStart, normalizedEnd) = (normalizedEnd, normalizedStart);
        }
        while (normalizedEnd < normalizedStart)
        {
            normalizedEnd += Math.PI * 2.0;
        }
        return (normalizedStart, normalizedEnd);
    }

    private static double CcwSweep(double startAngle, double endAngle)
    {
        var sweep = endAngle - startAngle;
        while (sweep < 0.0)
        {
            sweep += Math.PI * 2.0;
        }
        while (sweep >= Math.PI * 2.0)
        {
            sweep -= Math.PI * 2.0;
        }
        return sweep;
    }

    private static double NormalizeReadableTextAngle(double angleRadians)
    {
        var angle = angleRadians;
        while (angle <= -Math.PI)
        {
            angle += Math.PI * 2.0;
        }
        while (angle > Math.PI)
        {
            angle -= Math.PI * 2.0;
        }
        if (angle > (Math.PI * 0.5))
        {
            angle -= Math.PI;
        }
        else if (angle <= -(Math.PI * 0.5))
        {
            angle += Math.PI;
        }
        return angle;
    }

    private static (double X, double Y, double Rotation) ComputeRouteLabelAnchor(IReadOnlyList<GeometryPoint> points)
    {
        if (points.Count == 0)
        {
            return (0.0, 0.0, 0.0);
        }
        if (points.Count == 1)
        {
            return (points[0].X, points[0].Y, 0.0);
        }

        var segmentLengths = new List<double>();
        var segmentStarts = new List<GeometryPoint>();
        var segmentEnds = new List<GeometryPoint>();
        var totalLength = 0.0;
        for (var i = 1; i < points.Count; i++)
        {
            var start = points[i - 1];
            var end = points[i];
            var length = Math.Sqrt(
                ((end.X - start.X) * (end.X - start.X))
                + ((end.Y - start.Y) * (end.Y - start.Y))
            );
            if (length <= 1e-9)
            {
                continue;
            }
            segmentStarts.Add(start);
            segmentEnds.Add(end);
            segmentLengths.Add(length);
            totalLength += length;
        }

        if (segmentLengths.Count == 0 || totalLength <= 1e-9)
        {
            var first = points[0];
            return (first.X, first.Y, 0.0);
        }

        var targetDistance = totalLength * 0.5;
        var walked = 0.0;
        for (var i = 0; i < segmentLengths.Count; i++)
        {
            var segLength = segmentLengths[i];
            var start = segmentStarts[i];
            var end = segmentEnds[i];
            if (walked + segLength < targetDistance)
            {
                walked += segLength;
                continue;
            }

            var ratio = (targetDistance - walked) / segLength;
            ratio = Math.Max(0.0, Math.Min(1.0, ratio));
            var dx = end.X - start.X;
            var dy = end.Y - start.Y;
            var angle = NormalizeReadableTextAngle(Math.Atan2(dy, dx));
            return (
                start.X + (dx * ratio),
                start.Y + (dy * ratio),
                angle
            );
        }

        var tailStart = segmentStarts[segmentStarts.Count - 1];
        var tailEnd = segmentEnds[segmentEnds.Count - 1];
        var tailAngle = NormalizeReadableTextAngle(
            Math.Atan2(tailEnd.Y - tailStart.Y, tailEnd.X - tailStart.X)
        );
        return (
            (tailStart.X + tailEnd.X) * 0.5,
            (tailStart.Y + tailEnd.Y) * 0.5,
            tailAngle
        );
    }

    private static void ValidateArcAngleNormalization()
    {
        var quarterTurn = Math.PI * 0.5;
        var cases = new[]
        {
            (Start: 0.0, End: quarterTurn, Turn: 1.0),
            (Start: 0.0, End: -quarterTurn, Turn: -1.0),
            (Start: quarterTurn, End: 0.0, Turn: -1.0),
            (Start: -quarterTurn, End: 0.0, Turn: 1.0),
            (Start: Math.PI, End: quarterTurn, Turn: -1.0),
            (Start: quarterTurn, End: Math.PI, Turn: 1.0),
        };

        foreach (var testCase in cases)
        {
            var (normalizedStart, normalizedEnd) = NormalizeAddArcAngles(
                testCase.Start,
                testCase.End,
                testCase.Turn
            );
            var sweep = CcwSweep(normalizedStart, normalizedEnd);
            if (Math.Abs(sweep - quarterTurn) > ArcQuarterTurnTolerance)
            {
                throw new InvalidOperationException(
                    $"Arc angle normalization failed for turn={testCase.Turn}. "
                    + $"Expected ~{quarterTurn}, got {sweep}."
                );
            }
        }
    }

    private static bool TryReadPointNode(JsonObject payload, string key, out GeometryPoint point)
    {
        point = default;
        if (!payload.TryGetPropertyValue(key, out var node) || node is not JsonObject pointNode)
        {
            return false;
        }
        var x = ReadDouble(pointNode, "x", double.NaN);
        var y = ReadDouble(pointNode, "y", double.NaN);
        if (double.IsNaN(x) || double.IsInfinity(x) || double.IsNaN(y) || double.IsInfinity(y))
        {
            return false;
        }
        point = new GeometryPoint(SnapCoord(x), SnapCoord(y));
        return true;
    }

    private static List<CadRoutePrimitive> ParseCadRoutePrimitives(JsonObject routeNode, List<string> warnings)
    {
        var output = new List<CadRoutePrimitive>();
        if (!routeNode.TryGetPropertyValue("primitives", out var primitivesNode) || primitivesNode is not JsonArray primitiveArray)
        {
            return output;
        }

        for (var primitiveIndex = 0; primitiveIndex < primitiveArray.Count; primitiveIndex++)
        {
            if (primitiveArray[primitiveIndex] is not JsonObject primitiveObj)
            {
                warnings.Add($"Ignoring invalid primitive at index {primitiveIndex} (not an object).");
                continue;
            }

            var kind = ReadStringValue(primitiveObj, "kind", "").Trim().ToLowerInvariant();
            if (kind == "line")
            {
                if (!TryReadPointNode(primitiveObj, "start", out var startPoint)
                    || !TryReadPointNode(primitiveObj, "end", out var endPoint))
                {
                    warnings.Add($"Ignoring line primitive {primitiveIndex}: missing/invalid start or end point.");
                    continue;
                }
                if (Math.Abs(startPoint.X - endPoint.X) <= 1e-6 && Math.Abs(startPoint.Y - endPoint.Y) <= 1e-6)
                {
                    continue;
                }
                output.Add(
                    new CadRoutePrimitive
                    {
                        Kind = "line",
                        Start = startPoint,
                        End = endPoint,
                        Center = default,
                        Radius = 0.0,
                        Turn = 1.0,
                    }
                );
                continue;
            }

            if (kind == "arc")
            {
                if (!TryReadPointNode(primitiveObj, "start", out var startPoint)
                    || !TryReadPointNode(primitiveObj, "end", out var endPoint)
                    || !TryReadPointNode(primitiveObj, "center", out var centerPoint))
                {
                    warnings.Add($"Ignoring arc primitive {primitiveIndex}: missing/invalid start/end/center point.");
                    continue;
                }
                var radius = ReadDouble(primitiveObj, "radius", double.NaN);
                var turn = ReadDouble(primitiveObj, "turn", 1.0);
                if (double.IsNaN(radius) || double.IsInfinity(radius) || radius <= 1e-9)
                {
                    warnings.Add($"Ignoring arc primitive {primitiveIndex}: invalid radius.");
                    continue;
                }
                if (double.IsNaN(turn) || double.IsInfinity(turn) || Math.Abs(turn) <= 1e-9)
                {
                    turn = 1.0;
                }
                output.Add(
                    new CadRoutePrimitive
                    {
                        Kind = "arc",
                        Start = startPoint,
                        End = endPoint,
                        Center = centerPoint,
                        Radius = radius,
                        Turn = turn,
                    }
                );
                continue;
            }

            warnings.Add($"Ignoring unsupported primitive kind at index {primitiveIndex}: '{kind}'.");
        }

        return output;
    }

    private static void EnsureLayerExists(object document, string layerName, int? colorAci = null)
    {
        if (string.IsNullOrWhiteSpace(layerName))
        {
            return;
        }

        var layers = ReadProperty(document, "Layers");
        if (layers is null)
        {
            return;
        }

        dynamic? layer = null;
        try
        {
            layer = ((dynamic)layers).Item(layerName);
        }
        catch
        {
            // Ignore lookup failures and try Add below.
        }

        if (layer is null)
        {
            try
            {
                layer = ((dynamic)layers).Add(layerName);
            }
            catch
            {
                // Ignore layer creation failures. Drawing can continue on current layer.
            }
        }

        if (layer is not null && colorAci.HasValue && colorAci.Value >= 1 && colorAci.Value <= 255)
        {
            try
            {
                layer.Color = colorAci.Value;
            }
            catch
            {
                // Ignore layer color assignment failures.
            }
        }
    }

    private static void SetEntityLayerAndColor(object? entity, string layerName, int? _colorAci)
    {
        if (entity is null)
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(layerName))
        {
            try
            {
                ((dynamic)entity).Layer = layerName;
            }
            catch
            {
                // Ignore layer assignment failures.
            }
        }

        try
        {
            ((dynamic)entity).Color = 256; // BYLAYER
        }
        catch
        {
            // Ignore color assignment failures.
        }
    }

    private static string GetEntityHandle(object? entity)
    {
        if (entity is null)
        {
            return "";
        }
        var fromProperty = SafeUpper(ReadProperty(entity, "Handle"));
        if (!string.IsNullOrWhiteSpace(fromProperty))
        {
            return fromProperty;
        }
        try
        {
            var raw = ((dynamic)entity).Handle;
            return SafeUpper(raw);
        }
        catch
        {
            return "";
        }
    }

    private static bool TryDeleteEntityByHandle(object document, string handle)
    {
        var normalized = (handle ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }
        try
        {
            var entity = ((dynamic)document).HandleToObject(normalized);
            if (entity is null)
            {
                return false;
            }
            ((dynamic)entity).Delete();
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static (int DeletedCount, List<string> DeletedHandles) DeleteRouteBindings(
        string sessionId,
        string clientRouteId,
        object document,
        List<string> warnings
    )
    {
        List<string> handles = new();
        lock (TerminalRouteBindingLock)
        {
            if (!TerminalRouteBindings.TryGetValue(sessionId, out var sessionMap))
            {
                return (0, new List<string>());
            }
            if (!sessionMap.TryGetValue(clientRouteId, out var storedHandles) || storedHandles is null)
            {
                return (0, new List<string>());
            }
            handles = new List<string>(storedHandles);
            sessionMap.Remove(clientRouteId);
            if (sessionMap.Count == 0)
            {
                TerminalRouteBindings.Remove(sessionId);
            }
        }

        var deleted = 0;
        var deletedHandles = new List<string>();
        foreach (var handle in handles)
        {
            if (TryDeleteEntityByHandle(document, handle))
            {
                deleted += 1;
                deletedHandles.Add((handle ?? "").Trim().ToUpperInvariant());
            }
            else
            {
                warnings.Add($"Route {clientRouteId}: could not delete CAD entity handle '{handle}'.");
            }
        }

        return (deleted, deletedHandles);
    }

    private static (int DeletedEntities, int ResetRoutes) DeleteSessionBindings(
        string sessionId,
        object document,
        List<string> warnings
    )
    {
        Dictionary<string, List<string>> snapshot;
        lock (TerminalRouteBindingLock)
        {
            if (!TerminalRouteBindings.TryGetValue(sessionId, out var sessionMap))
            {
                return (0, 0);
            }
            snapshot = sessionMap.ToDictionary(
                kvp => kvp.Key,
                kvp => new List<string>(kvp.Value),
                StringComparer.OrdinalIgnoreCase
            );
            TerminalRouteBindings.Remove(sessionId);
        }

        var deletedEntities = 0;
        foreach (var kvp in snapshot)
        {
            foreach (var handle in kvp.Value)
            {
                if (TryDeleteEntityByHandle(document, handle))
                {
                    deletedEntities += 1;
                }
                else
                {
                    warnings.Add($"Route {kvp.Key}: could not delete CAD entity handle '{handle}'.");
                }
            }
        }
        return (deletedEntities, snapshot.Count);
    }

    private static void StoreRouteBindings(string sessionId, string clientRouteId, List<string> handles)
    {
        if (string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(clientRouteId))
        {
            return;
        }

        var normalizedHandles = handles
            .Select(item => (item ?? "").Trim().ToUpperInvariant())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        lock (TerminalRouteBindingLock)
        {
            if (!TerminalRouteBindings.TryGetValue(sessionId, out var sessionMap))
            {
                sessionMap = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
                TerminalRouteBindings[sessionId] = sessionMap;
            }
            sessionMap[clientRouteId] = normalizedHandles;

            if (TerminalRouteBindings.Count > MaxTerminalRouteSessions)
            {
                var staleSessionId = TerminalRouteBindings.Keys.FirstOrDefault(key =>
                    !string.Equals(key, sessionId, StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrWhiteSpace(staleSessionId))
                {
                    TerminalRouteBindings.Remove(staleSessionId);
                }
            }
        }
    }

    private static void RemoveRouteBinding(string sessionId, string clientRouteId)
    {
        if (string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(clientRouteId))
        {
            return;
        }

        lock (TerminalRouteBindingLock)
        {
            if (!TerminalRouteBindings.TryGetValue(sessionId, out var sessionMap))
            {
                return;
            }
            sessionMap.Remove(clientRouteId);
            if (sessionMap.Count == 0)
            {
                TerminalRouteBindings.Remove(sessionId);
            }
        }
    }

    private static bool ReadBool(JsonObject payload, string key, bool fallback)
    {
        if (!payload.TryGetPropertyValue(key, out var node) || node is null)
        {
            return fallback;
        }
        if (node is JsonValue val)
        {
            if (val.TryGetValue<bool>(out var boolValue))
            {
                return boolValue;
            }
            if (val.TryGetValue<string>(out var stringValue)
                && bool.TryParse(stringValue, out var parsedBool))
            {
                return parsedBool;
            }
        }
        return fallback;
    }

    private static int ReadInt(JsonObject payload, string key, int fallback)
    {
        if (!payload.TryGetPropertyValue(key, out var node) || node is null)
        {
            return fallback;
        }
        if (node is JsonValue val)
        {
            if (val.TryGetValue<int>(out var intValue))
            {
                return intValue;
            }
            if (val.TryGetValue<long>(out var longValue))
            {
                return (int)longValue;
            }
            if (val.TryGetValue<string>(out var stringValue)
                && int.TryParse(stringValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedInt))
            {
                return parsedInt;
            }
        }
        return fallback;
    }

    private static double ReadDouble(JsonObject payload, string key, double fallback)
    {
        if (!payload.TryGetPropertyValue(key, out var node) || node is null)
        {
            return fallback;
        }
        if (node is JsonValue val)
        {
            if (val.TryGetValue<double>(out var doubleValue))
            {
                return doubleValue;
            }
            if (val.TryGetValue<float>(out var floatValue))
            {
                return floatValue;
            }
            if (val.TryGetValue<int>(out var intValue))
            {
                return intValue;
            }
            if (val.TryGetValue<string>(out var stringValue)
                && double.TryParse(stringValue, NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out var parsedDouble))
            {
                return parsedDouble;
            }
        }
        return fallback;
    }

    private static List<string> ReadStringArray(JsonObject payload, string key)
    {
        var values = new List<string>();
        if (!payload.TryGetPropertyValue(key, out var node) || node is not JsonArray arr)
        {
            return values;
        }

        foreach (var entry in arr)
        {
            if (entry is not JsonValue val || !val.TryGetValue<string>(out var text))
            {
                continue;
            }
            var trimmed = text.Trim();
            if (trimmed.Length > 0)
            {
                values.Add(trimmed);
            }
        }

        return values;
    }

    private static Dictionary<string, string> ReadStringMap(JsonObject payload, string key)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!payload.TryGetPropertyValue(key, out var node) || node is not JsonObject obj)
        {
            return map;
        }

        foreach (var kvp in obj)
        {
            if (string.IsNullOrWhiteSpace(kvp.Key) || kvp.Value is not JsonValue valueNode)
            {
                continue;
            }
            if (!valueNode.TryGetValue<string>(out var value) || string.IsNullOrWhiteSpace(value))
            {
                continue;
            }
            map[kvp.Key] = value.Trim().ToLowerInvariant();
        }

        return map;
    }

    private static int ClampInt(int value, int minValue, int maxValue)
    {
        if (value < minValue)
        {
            return minValue;
        }
        if (value > maxValue)
        {
            return maxValue;
        }
        return value;
    }

    private static string StringOrDefault(object? value, string fallback)
    {
        if (value is null)
        {
            return fallback;
        }
        var text = value.ToString()?.Trim();
        return string.IsNullOrWhiteSpace(text) ? fallback : text;
    }

    private static string SafeUpper(object? value)
    {
        return StringOrDefault(value, "").ToUpperInvariant();
    }

    private static int? SafeInt(object? value)
    {
        if (value is null)
        {
            return null;
        }
        var text = value.ToString()?.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }
        return int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static double? SafeDouble(object? value)
    {
        if (value is null)
        {
            return null;
        }
        if (value is double doubleValue)
        {
            return doubleValue;
        }
        if (value is float floatValue)
        {
            return floatValue;
        }
        var text = value.ToString()?.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }
        return double.TryParse(text, NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static JsonArray ToJsonArray(IEnumerable<string> items)
    {
        var node = new JsonArray();
        foreach (var item in items)
        {
            if (!string.IsNullOrWhiteSpace(item))
            {
                node.Add(item);
            }
        }
        return node;
    }

    private static T? ReadWithTransientComRetry<T>(Func<T> operation, string operationName)
    {
        Exception? lastError = null;
        for (var attempt = 1; attempt <= ComReadRetryAttempts; attempt++)
        {
            try
            {
                return operation();
            }
            catch (Exception ex)
            {
                lastError = ex;
                if (!IsTransientComReadError(ex) || attempt >= ComReadRetryAttempts)
                {
                    break;
                }

                var delayMs = ComReadRetryDelayMs * attempt;
                BridgeLog.Warn(
                    $"Transient COM read failure during {operationName}; " +
                    $"retrying ({attempt}/{ComReadRetryAttempts}) in {delayMs}ms. {DescribeException(ex)}"
                );
                Thread.Sleep(delayMs);
            }
        }

        if (lastError is not null && IsTransientComReadError(lastError))
        {
            BridgeLog.Warn(
                $"Transient COM read retries exhausted during {operationName} " +
                $"after {ComReadRetryAttempts} attempts. {DescribeException(lastError)}"
            );
        }

        return default;
    }

    private static bool IsTransientComReadError(Exception ex)
    {
        if (ex is COMException comException)
        {
            if (TransientComReadHresults.Contains(comException.HResult))
            {
                return true;
            }
            var message = comException.Message ?? "";
            if (message.Contains("rejected by callee", StringComparison.OrdinalIgnoreCase)
                || message.Contains("server busy", StringComparison.OrdinalIgnoreCase)
                || message.Contains("retry later", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return ex.InnerException is not null && IsTransientComReadError(ex.InnerException);
    }

    private static int ParsePositiveIntEnv(string key, int fallback)
    {
        var raw = (Environment.GetEnvironmentVariable(key) ?? "").Trim();
        if (int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            && parsed > 0)
        {
            return parsed;
        }
        return fallback;
    }

    private static string DescribeException(Exception ex)
    {
        if (ex is COMException comException)
        {
            return $"exception={comException.GetType().Name} hresult=0x{comException.HResult:X8} message={comException.Message}";
        }
        return $"exception={ex.GetType().Name} message={ex.Message}";
    }

    [DllImport("ole32.dll", CharSet = CharSet.Unicode)]
    private static extern int CLSIDFromProgID(string lpszProgID, out Guid pclsid);

    [DllImport("oleaut32.dll")]
    private static extern int GetActiveObject(ref Guid rclsid, IntPtr pvReserved, [MarshalAs(UnmanagedType.IUnknown)] out object? ppunk);

    private sealed class AutoCadSession : IDisposable
    {
        public object Application { get; }
        public object Document { get; }
        public object Modelspace { get; }

        public AutoCadSession(object application, object document, object modelspace)
        {
            Application = application;
            Document = document;
            Modelspace = modelspace;
        }

        public void Dispose()
        {
            if (!OperatingSystem.IsWindows())
            {
                return;
            }

            foreach (var comObject in new[] { Modelspace, Document, Application })
            {
                try
                {
                    if (Marshal.IsComObject(comObject))
                    {
                        Marshal.ReleaseComObject(comObject);
                    }
                }
                catch
                {
                    // Best effort cleanup.
                }
            }
        }
    }

    private sealed class CadRoutePrimitive
    {
        public string Kind { get; init; } = "line";
        public GeometryPoint Start { get; init; }
        public GeometryPoint End { get; init; }
        public GeometryPoint Center { get; init; }
        public double Radius { get; init; }
        public double Turn { get; init; }
    }

    private readonly struct GeometryPoint
    {
        public GeometryPoint(double x, double y)
        {
            X = x;
            Y = y;
        }

        public double X { get; }
        public double Y { get; }
    }

    private readonly struct Affine2D
    {
        public Affine2D(double m00, double m01, double m02, double m10, double m11, double m12)
        {
            M00 = m00;
            M01 = m01;
            M02 = m02;
            M10 = m10;
            M11 = m11;
            M12 = m12;
        }

        public double M00 { get; }
        public double M01 { get; }
        public double M02 { get; }
        public double M10 { get; }
        public double M11 { get; }
        public double M12 { get; }

        public GeometryPoint Apply(GeometryPoint point)
        {
            return new GeometryPoint(
                x: (M00 * point.X) + (M01 * point.Y) + M02,
                y: (M10 * point.X) + (M11 * point.Y) + M12
            );
        }
    }

    private sealed class TerminalGeometryPrimitive
    {
        public string Kind { get; init; } = "line";
        public bool Closed { get; init; }
        public List<GeometryPoint> Points { get; init; } = new();
    }

    private sealed class RawObstacle
    {
        public string Layer { get; init; } = "";
        public string Type { get; init; } = "";
        public string Label { get; init; } = "";
        public double MinX { get; init; }
        public double MinY { get; init; }
        public double MaxX { get; init; }
        public double MaxY { get; init; }
    }

    private sealed class BoundingBoxPoints
    {
        public object MinPoint { get; }
        public object MaxPoint { get; }

        public BoundingBoxPoints(object minPoint, object maxPoint)
        {
            MinPoint = minPoint;
            MaxPoint = maxPoint;
        }
    }
}
