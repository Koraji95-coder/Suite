using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;

namespace SuiteCadAuthoring
{
    public sealed partial class SuiteCadAuthoringCommands
    {
        internal static JsonObject ExecuteConduitRouteObstacleScan(JsonObject payload)
        {
            var requestId = ReadConduitString(payload, "requestId");
            var document = Application.DocumentManager?.MdiActiveDocument;
            if (document is null)
            {
                return BuildConduitRouteFailure(
                    action: "conduit_route_obstacle_scan",
                    code: "AUTOCAD_NOT_READY",
                    message: "An active AutoCAD drawing is required for conduit route obstacle scan.",
                    requestId: requestId
                );
            }

            var selectionOnly = ReadConduitBool(payload, "selectionOnly", fallback: false);
            var includeModelspace = ReadConduitBool(payload, "includeModelspace", fallback: true);
            var maxEntities = ClampConduitInt(
                ReadConduitInt(payload, "maxEntities", 50000),
                500,
                200000
            );
            var canvasWidth = Math.Max(
                ConduitMinCanvasSize,
                ReadConduitDouble(payload, "canvasWidth", ConduitDefaultCanvasWidth)
            );
            var canvasHeight = Math.Max(
                ConduitMinCanvasSize,
                ReadConduitDouble(payload, "canvasHeight", ConduitDefaultCanvasHeight)
            );
            var allowedLayers = ReadConduitStringArray(payload, "layerNames")
                .Select(item => item.Trim().ToUpperInvariant())
                .Where(item => item.Length > 0)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var layerTypeOverrides = ReadConduitStringMap(payload, "layerTypeOverrides")
                .Where(kvp => ConduitValidObstacleTypes.Contains(kvp.Value))
                .ToDictionary(
                    kvp => kvp.Key.Trim().ToUpperInvariant(),
                    kvp => kvp.Value.Trim().ToLowerInvariant(),
                    StringComparer.OrdinalIgnoreCase
                );

            var warnings = new List<string>();
            var rawObstacles = new List<ConduitRawObstacle>();
            var seenHandles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var seenBbox = new HashSet<string>(StringComparer.Ordinal);
            var forceUnknownToFoundation = allowedLayers.Count > 0;

            var scannedEntities = 0;
            var scannedGeometryEntities = 0;
            var matchedLayerEntities = 0;
            var dedupedEntities = 0;
            var overrideLayerEntities = 0;

            try
            {
                using (document.LockDocument())
                using (var transaction = document.Database.TransactionManager.StartTransaction())
                {
                    void ConsumeEntity(Entity entity)
                    {
                        scannedEntities += 1;
                        var handle = ResolveConduitEntityHandle(entity);
                        if (!string.IsNullOrWhiteSpace(handle) && !seenHandles.Add(handle))
                        {
                            return;
                        }

                        if (IsConduitNonGeometryEntity(entity))
                        {
                            return;
                        }

                        var layerName = NormalizeText(entity.Layer).ToUpperInvariant();
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
                            obstacleType = InferConduitObstacleType(
                                layerName,
                                forceUnknownToFoundation
                            );
                        }

                        if (string.IsNullOrWhiteSpace(obstacleType))
                        {
                            return;
                        }

                        matchedLayerEntities += 1;
                        if (!TryGetConduitEntityBounds(entity, out var extents))
                        {
                            return;
                        }

                        scannedGeometryEntities += 1;
                        var width = extents.MaxPoint.X - extents.MinPoint.X;
                        var height = extents.MaxPoint.Y - extents.MinPoint.Y;
                        if (width <= 0.0001 && height <= 0.0001)
                        {
                            return;
                        }

                        var key =
                            $"{layerName}|{obstacleType}|{Math.Round(extents.MinPoint.X, 4)}|{Math.Round(extents.MinPoint.Y, 4)}|{Math.Round(extents.MaxPoint.X, 4)}|{Math.Round(extents.MaxPoint.Y, 4)}";
                        if (!seenBbox.Add(key))
                        {
                            dedupedEntities += 1;
                            return;
                        }

                        rawObstacles.Add(
                            new ConduitRawObstacle
                            {
                                Type = obstacleType,
                                Label = layerName,
                                MinX = extents.MinPoint.X,
                                MinY = extents.MinPoint.Y,
                                MaxX = extents.MaxPoint.X,
                                MaxY = extents.MaxPoint.Y,
                            }
                        );
                    }

                    if (selectionOnly)
                    {
                        foreach (var entity in EnumerateConduitSelectionEntities(document, transaction))
                        {
                            ConsumeEntity(entity);
                        }
                    }

                    if (includeModelspace)
                    {
                        var modelSpace = GetConduitModelSpace(transaction, document.Database);
                        var scannedCount = 0;
                        var totalModelspaceCount = 0;
                        foreach (ObjectId entityId in modelSpace)
                        {
                            totalModelspaceCount += 1;
                            if (scannedCount >= maxEntities)
                            {
                                continue;
                            }

                            if (
                                transaction.GetObject(entityId, OpenMode.ForRead, false) is Entity entity
                            )
                            {
                                ConsumeEntity(entity);
                                scannedCount += 1;
                            }
                        }

                        if (totalModelspaceCount > maxEntities)
                        {
                            warnings.Add(
                                $"ModelSpace scan capped at {maxEntities} entities (of {totalModelspaceCount})."
                            );
                        }
                    }

                    transaction.Commit();
                }
            }
            catch (Exception ex)
            {
                return BuildConduitRouteFailure(
                    action: "conduit_route_obstacle_scan",
                    code: "OBSTACLE_SCAN_FAILED",
                    message: $"Conduit route obstacle scan failed: {ex.Message}",
                    requestId: requestId
                );
            }

            var normalized = NormalizeConduitObstacles(
                rawObstacles,
                canvasWidth,
                canvasHeight,
                ConduitViewportPadding
            );
            var totalObstacles = normalized.Obstacles.Count;
            var success = totalObstacles > 0;

            return BuildConduitRouteResult(
                action: "conduit_route_obstacle_scan",
                success: success,
                code: success ? string.Empty : "NO_OBSTACLES_FOUND",
                message: success
                    ? $"Scanned {scannedEntities} entities and mapped {totalObstacles} obstacles."
                    : "No route obstacles found from AutoCAD layers.",
                data: new JsonObject
                {
                    ["drawing"] = new JsonObject
                    {
                        ["name"] = ResolveConduitDrawingName(document),
                        ["units"] = ResolveConduitUnits(document.Database),
                    },
                    ["obstacles"] = normalized.Obstacles,
                    ["viewport"] = normalized.Viewport,
                },
                warnings: warnings,
                requestId: requestId,
                configureMeta: meta =>
                {
                    meta["scanMs"] = 0;
                    meta["scannedEntities"] = scannedEntities;
                    meta["scannedGeometryEntities"] = scannedGeometryEntities;
                    meta["matchedLayerEntities"] = matchedLayerEntities;
                    meta["dedupedEntities"] = dedupedEntities;
                    meta["selectionOnly"] = selectionOnly;
                    meta["includeModelspace"] = includeModelspace;
                    meta["totalObstacles"] = totalObstacles;
                    meta["overrideLayerEntities"] = overrideLayerEntities;
                }
            );
        }

        private static bool IsConduitNonGeometryEntity(Entity entity)
        {
            return entity is DBText
                || entity is MText
                || entity is Dimension
                || entity is AttributeReference
                || entity is AttributeDefinition;
        }

        private static string? InferConduitObstacleType(
            string layerName,
            bool forceUnknownToFoundation
        )
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

            if (
                layerName.Contains("FOUND", StringComparison.Ordinal)
                || layerName.Contains("FNDN", StringComparison.Ordinal)
            )
            {
                return "foundation";
            }

            if (
                layerName.Contains("PAD", StringComparison.Ordinal)
                || layerName.Contains("S-CONC", StringComparison.Ordinal)
            )
            {
                return "equipment_pad";
            }

            if (
                layerName.Contains("BUILD", StringComparison.Ordinal)
                || layerName.Contains("A-WALL", StringComparison.Ordinal)
                || layerName.Contains("S-STRU", StringComparison.Ordinal)
            )
            {
                return "building";
            }

            return forceUnknownToFoundation ? "foundation" : null;
        }

        private static (JsonArray Obstacles, JsonObject Viewport) NormalizeConduitObstacles(
            IReadOnlyList<ConduitRawObstacle> rawObstacles,
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
            if (scale <= 0.0)
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
    }
}
