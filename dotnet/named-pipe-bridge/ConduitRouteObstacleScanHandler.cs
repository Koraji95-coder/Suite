using System.Diagnostics;
using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
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
}

