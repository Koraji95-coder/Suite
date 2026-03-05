using System.Diagnostics;
using System.Globalization;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

const string DefaultPipeName = "SUITE_AUTOCAD_PIPE";
var pipeName = args.Length > 0 ? args[0] : DefaultPipeName;
var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);

if (!OperatingSystem.IsWindows())
{
    Console.WriteLine($"[{DateTime.UtcNow:O}] [ERROR] NamedPipeServer supports Windows only.");
    return;
}

BridgeLog.Info($"Starting on \\\\.\\pipe\\{pipeName}");

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
                BridgeLog.Warn($"Action {normalizedAction} returned success=false.");
            }

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
            BridgeLog.Error($"Action handler failed for {normalizedAction}.", ex);
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
    private static readonly HashSet<string> ValidObstacleTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "foundation",
        "building",
        "equipment_pad",
        "trench",
        "fence",
        "road",
    };

    public static JsonObject HandleTerminalScan(JsonObject payload)
    {
        var stopwatch = Stopwatch.StartNew();

        var selectionOnly = ReadBool(payload, "selectionOnly", fallback: false);
        var includeModelspace = ReadBool(payload, "includeModelspace", fallback: true);
        var maxEntities = ClampInt(ReadInt(payload, "maxEntities", 50000), 500, 200000);

        using var session = ConnectAutoCad();
        var drawingName = StringOrDefault(ReadProperty(session.Document, "Name"), "Unknown.dwg");
        var units = ResolveUnits(session.Document);

        var panels = new JsonObject();
        var warnings = new List<string>();
        var seenEntityHandles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenStripIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var scannedEntities = 0;
        var scannedBlockReferences = 0;
        var skippedNonTerminalBlocks = 0;
        var totalStrips = 0;
        var totalTerminals = 0;

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
            if (!LooksLikeTerminalBlock(blockName, attrs))
            {
                skippedNonTerminalBlocks += 1;
                return;
            }

            if (!TryReadPoint(ReadProperty(entity, "InsertionPoint"), out var pointX, out var pointY))
            {
                return;
            }

            var stripId = FirstAttr(attrs, StripIdKeys).ToUpperInvariant();
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

            var panelId = FirstAttr(attrs, PanelIdKeys).ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(panelId))
            {
                panelId = "PANEL";
            }
            var panelName = FirstAttr(attrs, PanelNameKeys);
            if (string.IsNullOrWhiteSpace(panelName))
            {
                panelName = panelId;
            }
            var side = NormalizeSide(FirstAttr(attrs, SideKeys));

            var terminalCount = ParseTerminalCount(attrs);
            var stripNumber = ParseStripNumber(stripId, attrs);

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
        try
        {
            return target.GetType().InvokeMember(
                property,
                System.Reflection.BindingFlags.GetProperty,
                null,
                target,
                null,
                CultureInfo.InvariantCulture
            );
        }
        catch
        {
            return null;
        }
    }

    private static int ReadCount(object collection)
    {
        return SafeInt(ReadProperty(collection, "Count")) ?? 0;
    }

    private static object? ReadItem(object collection, int index)
    {
        try
        {
            return ((dynamic)collection).Item(index);
        }
        catch
        {
            return null;
        }
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
            var raw = ((dynamic)entity).GetAttributes();
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

    private static bool LooksLikeTerminalBlock(string blockName, Dictionary<string, string> attrs)
    {
        var name = blockName.ToUpperInvariant();
        if (name.Contains("TERMINAL", StringComparison.Ordinal)
            || name.Contains("MARSHALL", StringComparison.Ordinal)
            || name.Contains("TB", StringComparison.Ordinal)
            || name.Contains("TS", StringComparison.Ordinal))
        {
            return true;
        }
        return attrs.Keys.Any(key => StripIdKeys.Contains(key, StringComparer.OrdinalIgnoreCase))
            || attrs.Keys.Any(key => TerminalCountKeys.Contains(key, StringComparer.OrdinalIgnoreCase));
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

    private static int ParseTerminalCount(Dictionary<string, string> attrs)
    {
        foreach (var key in TerminalCountKeys)
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
        return 12;
    }

    private static int ParseStripNumber(string stripId, Dictionary<string, string> attrs)
    {
        foreach (var key in StripNumberKeys)
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
        var fallback = ExtractFirstInt(stripId);
        return fallback ?? 1;
    }

    private static int? ExtractFirstInt(string input)
    {
        var digits = new string(input.Where(char.IsDigit).ToArray());
        return int.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
            ? value
            : null;
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
            var raw = ((dynamic)document).GetVariable("INSUNITS");
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
            ((dynamic)entity).GetBoundingBox(out object minPoint, out object maxPoint);
            if (!TryReadPoint(minPoint, out minX, out minY))
            {
                return false;
            }
            if (!TryReadPoint(maxPoint, out maxX, out maxY))
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
}
