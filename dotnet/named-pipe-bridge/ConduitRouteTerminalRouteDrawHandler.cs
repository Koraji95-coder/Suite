using System.Diagnostics;
using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
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
}

