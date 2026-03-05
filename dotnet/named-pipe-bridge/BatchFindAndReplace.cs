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
    private const int DefaultComReadRetryAttempts = 3;
    private const int DefaultComReadRetryDelayMs = 35;

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
        var blockGeometryCache = new Dictionary<string, List<TerminalGeometryPrimitive>>(StringComparer.OrdinalIgnoreCase);

        var scannedEntities = 0;
        var scannedBlockReferences = 0;
        var skippedNonTerminalBlocks = 0;
        var totalStrips = 0;
        var totalTerminals = 0;
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
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["scanMs"] = stopwatch.ElapsedMilliseconds,
                ["scannedEntities"] = scannedEntities,
                ["scannedBlockReferences"] = scannedBlockReferences,
                ["skippedNonTerminalBlocks"] = skippedNonTerminalBlocks,
                ["selectionOnly"] = selectionOnly,
                ["includeModelspace"] = includeModelspace,
                ["totalPanels"] = panels.Count,
                ["totalStrips"] = totalStrips,
                ["totalTerminals"] = totalTerminals,
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
