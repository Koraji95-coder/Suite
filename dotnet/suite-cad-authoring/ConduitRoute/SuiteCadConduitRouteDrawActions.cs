using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;

namespace SuiteCadAuthoring
{
    public sealed partial class SuiteCadAuthoringCommands
    {
        internal static JsonObject ExecuteConduitRouteTerminalRoutesDraw(JsonObject payload)
        {
            var requestId = ReadConduitString(payload, "requestId");
            var operation = ReadConduitString(payload, "operation").ToLowerInvariant();
            if (operation is not ("upsert" or "delete" or "reset"))
            {
                return BuildConduitRouteFailure(
                    action: "conduit_route_terminal_routes_draw",
                    code: "INVALID_REQUEST",
                    message: "operation must be one of: upsert, delete, reset.",
                    requestId: requestId,
                    configureMeta: meta => meta["operation"] = operation
                );
            }

            var sessionId = ReadConduitString(payload, "sessionId");
            sessionId = sessionId.Length <= 128 ? sessionId : sessionId[..128];
            if (string.IsNullOrWhiteSpace(sessionId))
            {
                return BuildConduitRouteFailure(
                    action: "conduit_route_terminal_routes_draw",
                    code: "INVALID_REQUEST",
                    message: "sessionId is required for terminal route sync operations.",
                    requestId: requestId,
                    configureMeta: meta => meta["operation"] = operation
                );
            }

            var clientRouteId = ReadConduitString(payload, "clientRouteId");
            clientRouteId = clientRouteId.Length <= 128 ? clientRouteId : clientRouteId[..128];
            var defaultLayerName = NormalizeConduitLayerName(
                ReadConduitString(payload, "defaultLayerName"),
                "SUITE_WIRE_AUTO"
            );
            var annotateRefs = ReadConduitBool(payload, "annotateRefs", fallback: true);
            var textHeight = Math.Max(0.01, ReadConduitDouble(payload, "textHeight", 0.125));

            if ((operation == "upsert" || operation == "delete") && string.IsNullOrWhiteSpace(clientRouteId))
            {
                return BuildConduitRouteFailure(
                    action: "conduit_route_terminal_routes_draw",
                    code: "INVALID_REQUEST",
                    message: "clientRouteId is required for upsert/delete operations.",
                    requestId: requestId,
                    configureMeta: meta =>
                    {
                        meta["operation"] = operation;
                        meta["sessionId"] = sessionId;
                    }
                );
            }

            var document = Application.DocumentManager?.MdiActiveDocument;
            if (document is null)
            {
                return BuildConduitRouteFailure(
                    action: "conduit_route_terminal_routes_draw",
                    code: "AUTOCAD_NOT_READY",
                    message: "An active AutoCAD drawing is required for conduit route sync.",
                    requestId: requestId,
                    configureMeta: meta =>
                    {
                        meta["operation"] = operation;
                        meta["sessionId"] = sessionId;
                        meta["clientRouteId"] = clientRouteId;
                    }
                );
            }

            var warnings = new List<string>();
            var bindingsNode = new JsonObject();
            var layersUsed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var routesDrawn = 0;
            var segmentsDrawn = 0;
            var drawnLines = 0;
            var drawnArcs = 0;
            var labelsDrawn = 0;
            var filletAppliedCorners = 0;
            var filletSkippedCorners = 0;
            var geometryVersion = ConduitRouteGeometryVersion;
            var deletedEntities = 0;
            var resetRoutes = 0;
            var routeCandidates = operation == "reset" ? 0 : 1;
            var syncStatus = "failed";
            var success = false;
            var code = string.Empty;
            var message = string.Empty;

            try
            {
                using (document.LockDocument())
                using (var transaction = document.Database.TransactionManager.StartTransaction())
                {
                    var modelSpace = GetModelSpace(transaction, document.Database);

                    if (operation == "reset")
                    {
                        var resetResult = DeleteConduitSessionBindings(
                            sessionId,
                            document.Database,
                            transaction,
                            warnings
                        );
                        deletedEntities = resetResult.DeletedEntities;
                        resetRoutes = resetResult.ResetRoutes;
                        success = true;
                        syncStatus = "reset";
                        message =
                            $"Reset CAD sync session '{sessionId}' ({resetRoutes} route binding(s) cleared).";
                    }
                    else if (operation == "delete")
                    {
                        var deleteResult = DeleteConduitRouteBindings(
                            sessionId,
                            clientRouteId,
                            document.Database,
                            transaction,
                            warnings
                        );
                        deletedEntities = deleteResult.DeletedCount;
                        success = true;
                        syncStatus = "deleted";
                        message =
                            $"Deleted CAD bindings for route '{clientRouteId}' ({deletedEntities} entity(ies)).";
                        bindingsNode[clientRouteId] = new JsonObject
                        {
                            ["entityHandles"] = ToConduitJsonArray(deleteResult.DeletedHandles),
                        };
                    }
                    else
                    {
                        var routeNode = ReadConduitRouteNode(payload);
                        if (routeNode is null)
                        {
                            return BuildConduitRouteFailure(
                                action: "conduit_route_terminal_routes_draw",
                                code: "INVALID_REQUEST",
                                message: "route object is required for upsert operation.",
                                requestId: requestId,
                                configureMeta: meta =>
                                {
                                    meta["operation"] = operation;
                                    meta["sessionId"] = sessionId;
                                    meta["clientRouteId"] = clientRouteId;
                                }
                            );
                        }

                        if (routeNode["path"] is not JsonArray pathArray)
                        {
                            return BuildConduitRouteFailure(
                                action: "conduit_route_terminal_routes_draw",
                                code: "INVALID_REQUEST",
                                message: "route.path must be an array.",
                                requestId: requestId,
                                configureMeta: meta =>
                                {
                                    meta["operation"] = operation;
                                    meta["sessionId"] = sessionId;
                                    meta["clientRouteId"] = clientRouteId;
                                }
                            );
                        }

                        var points = ReadConduitPathPoints(pathArray);
                        if (points.Count < 2)
                        {
                            return BuildConduitRouteFailure(
                                action: "conduit_route_terminal_routes_draw",
                                code: "INVALID_REQUEST",
                                message: "route.path requires at least two valid points.",
                                requestId: requestId,
                                configureMeta: meta =>
                                {
                                    meta["operation"] = operation;
                                    meta["sessionId"] = sessionId;
                                    meta["clientRouteId"] = clientRouteId;
                                }
                            );
                        }

                        var routeType = ReadConduitString(routeNode, "routeType").ToLowerInvariant();
                        routeType = routeType == "jumper" ? "jumper" : "conductor";
                        var routeLayer = NormalizeConduitLayerName(
                            ReadConduitString(routeNode, "layerName"),
                            routeType == "jumper" ? "SUITE_WIRE_JUMPER" : defaultLayerName
                        );
                        var colorAci = ReadConduitOptionalColorAci(routeNode);
                        var routeRef = ReadConduitString(routeNode, "ref");
                        if (string.IsNullOrWhiteSpace(routeRef))
                        {
                            routeRef = "AUTO-001";
                        }

                        var routeGeometryVersion = ReadConduitString(routeNode, "geometryVersion");
                        if (!string.IsNullOrWhiteSpace(routeGeometryVersion))
                        {
                            geometryVersion = routeGeometryVersion;
                        }

                        var staleDeleteResult = DeleteConduitRouteBindings(
                            sessionId,
                            clientRouteId,
                            document.Database,
                            transaction,
                            warnings
                        );
                        deletedEntities += staleDeleteResult.DeletedCount;

                        EnsureConduitLayer(document.Database, transaction, routeLayer, colorAci);
                        layersUsed.Add(routeLayer);

                        var createdHandles = new List<string>();
                        var routePrimitives = ParseConduitCadRoutePrimitives(routeNode, warnings);
                        if (routePrimitives.Count == 0)
                        {
                            for (var index = 1; index < points.Count; index++)
                            {
                                var start = points[index - 1];
                                var end = points[index];
                                if (
                                    Math.Abs(end.X - start.X) <= 1e-6
                                    && Math.Abs(end.Y - start.Y) <= 1e-6
                                )
                                {
                                    continue;
                                }

                                routePrimitives.Add(
                                    new ConduitCadRoutePrimitive
                                    {
                                        Kind = "line",
                                        Start = start,
                                        End = end,
                                        Center = default,
                                        Radius = 0.0,
                                        Turn = 1.0,
                                    }
                                );
                            }
                        }

                        filletAppliedCorners = ClampConduitInt(
                            ReadConduitInt(
                                routeNode,
                                "filletAppliedCorners",
                                routePrimitives.Count(
                                    primitive =>
                                        string.Equals(
                                            primitive.Kind,
                                            "arc",
                                            StringComparison.OrdinalIgnoreCase
                                        )
                                )
                            ),
                            0,
                            100000
                        );
                        filletSkippedCorners = ClampConduitInt(
                            ReadConduitInt(routeNode, "filletSkippedCorners", 0),
                            0,
                            100000
                        );

                        for (var primitiveIndex = 0; primitiveIndex < routePrimitives.Count; primitiveIndex++)
                        {
                            var primitive = routePrimitives[primitiveIndex];
                            if (
                                string.Equals(
                                    primitive.Kind,
                                    "line",
                                    StringComparison.OrdinalIgnoreCase
                                )
                            )
                            {
                                if (
                                    Math.Abs(primitive.End.X - primitive.Start.X) <= 1e-6
                                    && Math.Abs(primitive.End.Y - primitive.Start.Y) <= 1e-6
                                )
                                {
                                    continue;
                                }

                                var line = new Line(
                                    new Point3d(primitive.Start.X, primitive.Start.Y, 0.0),
                                    new Point3d(primitive.End.X, primitive.End.Y, 0.0)
                                );
                                SetConduitEntityLayerAndColor(line, routeLayer, colorAci);
                                modelSpace.AppendEntity(line);
                                transaction.AddNewlyCreatedDBObject(line, true);
                                AddConduitCreatedHandle(createdHandles, line);
                                drawnLines += 1;
                                segmentsDrawn += 1;
                                continue;
                            }

                            if (
                                string.Equals(
                                    primitive.Kind,
                                    "arc",
                                    StringComparison.OrdinalIgnoreCase
                                )
                            )
                            {
                                var startAngle = Math.Atan2(
                                    primitive.Start.Y - primitive.Center.Y,
                                    primitive.Start.X - primitive.Center.X
                                );
                                var endAngle = Math.Atan2(
                                    primitive.End.Y - primitive.Center.Y,
                                    primitive.End.X - primitive.Center.X
                                );
                                (startAngle, endAngle) = NormalizeConduitArcAngles(
                                    startAngle,
                                    endAngle,
                                    primitive.Turn
                                );

                                try
                                {
                                    var arc = new Arc(
                                        new Point3d(primitive.Center.X, primitive.Center.Y, 0.0),
                                        primitive.Radius,
                                        startAngle,
                                        endAngle
                                    );
                                    SetConduitEntityLayerAndColor(arc, routeLayer, colorAci);
                                    modelSpace.AppendEntity(arc);
                                    transaction.AddNewlyCreatedDBObject(arc, true);
                                    AddConduitCreatedHandle(createdHandles, arc);
                                    drawnArcs += 1;
                                    segmentsDrawn += 1;
                                }
                                catch (Exception ex)
                                {
                                    warnings.Add(
                                        $"Route '{routeRef}': failed to draw arc primitive {primitiveIndex} ({ex.Message}). Falling back to line."
                                    );
                                    var fallbackLine = new Line(
                                        new Point3d(primitive.Start.X, primitive.Start.Y, 0.0),
                                        new Point3d(primitive.End.X, primitive.End.Y, 0.0)
                                    );
                                    SetConduitEntityLayerAndColor(
                                        fallbackLine,
                                        routeLayer,
                                        colorAci
                                    );
                                    modelSpace.AppendEntity(fallbackLine);
                                    transaction.AddNewlyCreatedDBObject(fallbackLine, true);
                                    AddConduitCreatedHandle(createdHandles, fallbackLine);
                                    drawnLines += 1;
                                    segmentsDrawn += 1;
                                }

                                continue;
                            }

                            warnings.Add(
                                $"Route '{routeRef}': unsupported primitive kind '{primitive.Kind}'."
                            );
                        }

                        if (annotateRefs && !string.IsNullOrWhiteSpace(routeRef))
                        {
                            var labelAnchor = ComputeConduitRouteLabelAnchor(points);
                            var label = new DBText
                            {
                                Position = new Point3d(labelAnchor.X, labelAnchor.Y, 0.0),
                                Height = textHeight,
                                TextString = routeRef,
                                Rotation = labelAnchor.Rotation,
                                Layer = routeLayer,
                            };
                            SetConduitEntityLayerAndColor(label, routeLayer, colorAci);
                            modelSpace.AppendEntity(label);
                            transaction.AddNewlyCreatedDBObject(label, true);
                            AddConduitCreatedHandle(createdHandles, label);
                            labelsDrawn += 1;
                        }

                        routesDrawn = segmentsDrawn > 0 ? 1 : 0;
                        if (routesDrawn > 0)
                        {
                            StoreConduitRouteBindings(sessionId, clientRouteId, createdHandles);
                            success = true;
                            syncStatus = "synced";
                            message =
                                $"Synced route '{clientRouteId}' to CAD ({segmentsDrawn} segment(s)).";
                            bindingsNode[clientRouteId] = new JsonObject
                            {
                                ["entityHandles"] = ToConduitJsonArray(createdHandles),
                            };
                        }
                        else
                        {
                            RemoveConduitRouteBinding(sessionId, clientRouteId);
                            success = false;
                            code = "NO_VALID_ROUTES";
                            syncStatus = "failed";
                            message = $"Failed to sync route '{clientRouteId}' to CAD.";
                        }
                    }

                    transaction.Commit();
                }
            }
            catch (Exception ex)
            {
                return BuildConduitRouteFailure(
                    action: "conduit_route_terminal_routes_draw",
                    code: "TERMINAL_ROUTE_DRAW_FAILED",
                    message: $"Conduit route draw failed: {ex.Message}",
                    requestId: requestId,
                    configureMeta: meta =>
                    {
                        meta["operation"] = operation;
                        meta["sessionId"] = sessionId;
                        meta["clientRouteId"] = clientRouteId;
                    }
                );
            }

            return BuildConduitRouteResult(
                action: "conduit_route_terminal_routes_draw",
                success: success,
                code: code,
                message: message,
                data: new JsonObject
                {
                    ["drawing"] = new JsonObject
                    {
                        ["name"] = ResolveConduitDrawingName(document),
                        ["units"] = ResolveConduitUnits(document.Database),
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
                    ["layersUsed"] = ToConduitJsonArray(layersUsed),
                    ["bindings"] = bindingsNode,
                },
                warnings: warnings,
                requestId: requestId,
                configureMeta: meta =>
                {
                    meta["drawMs"] = 0;
                    meta["operation"] = operation;
                    meta["sessionId"] = sessionId;
                    meta["clientRouteId"] = clientRouteId;
                    meta["routeCandidates"] = routeCandidates;
                    meta["routesDrawn"] = routesDrawn;
                    meta["segmentsDrawn"] = segmentsDrawn;
                    meta["linesDrawn"] = drawnLines;
                    meta["arcsDrawn"] = drawnArcs;
                    meta["labelsDrawn"] = labelsDrawn;
                }
            );
        }

        private static JsonObject? ReadConduitRouteNode(JsonObject payload)
        {
            if (payload["route"] is JsonObject routeObject)
            {
                return routeObject;
            }

            if (
                payload["routes"] is JsonArray routes
                && routes.Count > 0
                && routes[0] is JsonObject firstRoute
            )
            {
                return firstRoute;
            }

            return null;
        }

        private static List<ConduitGeometryPoint> ReadConduitPathPoints(JsonArray pathArray)
        {
            var points = new List<ConduitGeometryPoint>();
            for (var index = 0; index < pathArray.Count; index++)
            {
                if (pathArray[index] is not JsonObject pointObject)
                {
                    continue;
                }

                var x = ReadConduitDouble(pointObject, "x", double.NaN);
                var y = ReadConduitDouble(pointObject, "y", double.NaN);
                if (double.IsNaN(x) || double.IsInfinity(x) || double.IsNaN(y) || double.IsInfinity(y))
                {
                    continue;
                }

                var nextPoint = new ConduitGeometryPoint(
                    SnapConduitCoord(x),
                    SnapConduitCoord(y)
                );
                if (
                    points.Count > 0
                    && Math.Abs(points[points.Count - 1].X - nextPoint.X) <= 1e-6
                    && Math.Abs(points[points.Count - 1].Y - nextPoint.Y) <= 1e-6
                )
                {
                    continue;
                }

                points.Add(nextPoint);
            }

            return points;
        }

        private static bool TryReadConduitPointNode(
            JsonObject payload,
            string key,
            out ConduitGeometryPoint point
        )
        {
            point = default;
            if (payload[key] is not JsonObject pointNode)
            {
                return false;
            }

            var x = ReadConduitDouble(pointNode, "x", double.NaN);
            var y = ReadConduitDouble(pointNode, "y", double.NaN);
            if (double.IsNaN(x) || double.IsInfinity(x) || double.IsNaN(y) || double.IsInfinity(y))
            {
                return false;
            }

            point = new ConduitGeometryPoint(SnapConduitCoord(x), SnapConduitCoord(y));
            return true;
        }

        private static double SnapConduitCoord(double value)
        {
            return Math.Round(value, 3, MidpointRounding.AwayFromZero);
        }

        private static List<ConduitCadRoutePrimitive> ParseConduitCadRoutePrimitives(
            JsonObject routeNode,
            List<string> warnings
        )
        {
            var output = new List<ConduitCadRoutePrimitive>();
            if (routeNode["primitives"] is not JsonArray primitiveArray)
            {
                return output;
            }

            for (var primitiveIndex = 0; primitiveIndex < primitiveArray.Count; primitiveIndex++)
            {
                if (primitiveArray[primitiveIndex] is not JsonObject primitiveObject)
                {
                    warnings.Add(
                        $"Ignoring invalid primitive at index {primitiveIndex} (not an object)."
                    );
                    continue;
                }

                var kind = ReadConduitString(primitiveObject, "kind").ToLowerInvariant();
                if (kind == "line")
                {
                    if (
                        !TryReadConduitPointNode(primitiveObject, "start", out var startPoint)
                        || !TryReadConduitPointNode(primitiveObject, "end", out var endPoint)
                    )
                    {
                        warnings.Add(
                            $"Ignoring line primitive {primitiveIndex}: missing/invalid start or end point."
                        );
                        continue;
                    }

                    if (
                        Math.Abs(startPoint.X - endPoint.X) <= 1e-6
                        && Math.Abs(startPoint.Y - endPoint.Y) <= 1e-6
                    )
                    {
                        continue;
                    }

                    output.Add(
                        new ConduitCadRoutePrimitive
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
                    if (
                        !TryReadConduitPointNode(primitiveObject, "start", out var startPoint)
                        || !TryReadConduitPointNode(primitiveObject, "end", out var endPoint)
                        || !TryReadConduitPointNode(primitiveObject, "center", out var centerPoint)
                    )
                    {
                        warnings.Add(
                            $"Ignoring arc primitive {primitiveIndex}: missing/invalid start/end/center point."
                        );
                        continue;
                    }

                    var radius = ReadConduitDouble(primitiveObject, "radius", double.NaN);
                    var turn = ReadConduitDouble(primitiveObject, "turn", 1.0);
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
                        new ConduitCadRoutePrimitive
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

                warnings.Add(
                    $"Ignoring unsupported primitive kind at index {primitiveIndex}: '{kind}'."
                );
            }

            return output;
        }

        private static void AddConduitCreatedHandle(List<string> handles, Entity entity)
        {
            var handle = ResolveConduitEntityHandle(entity);
            if (!string.IsNullOrWhiteSpace(handle))
            {
                handles.Add(handle);
            }
        }

        private static (double StartAngle, double EndAngle) NormalizeConduitArcAngles(
            double startAngle,
            double endAngle,
            double turn
        )
        {
            var normalizedStart = startAngle;
            var normalizedEnd = endAngle;
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

        private static double ComputeConduitArcSweep(double startAngle, double endAngle)
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

        private static double NormalizeConduitReadableTextAngle(double angleRadians)
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

        private static (double X, double Y, double Rotation) ComputeConduitRouteLabelAnchor(
            IReadOnlyList<ConduitGeometryPoint> points
        )
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
            var segmentStarts = new List<ConduitGeometryPoint>();
            var segmentEnds = new List<ConduitGeometryPoint>();
            var totalLength = 0.0;
            for (var index = 1; index < points.Count; index++)
            {
                var start = points[index - 1];
                var end = points[index];
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
                return (points[0].X, points[0].Y, 0.0);
            }

            var targetDistance = totalLength * 0.5;
            var walked = 0.0;
            for (var index = 0; index < segmentLengths.Count; index++)
            {
                var segmentLength = segmentLengths[index];
                var start = segmentStarts[index];
                var end = segmentEnds[index];
                if (walked + segmentLength < targetDistance)
                {
                    walked += segmentLength;
                    continue;
                }

                var ratio = (targetDistance - walked) / segmentLength;
                ratio = Math.Max(0.0, Math.Min(1.0, ratio));
                var dx = end.X - start.X;
                var dy = end.Y - start.Y;
                var angle = NormalizeConduitReadableTextAngle(Math.Atan2(dy, dx));
                return (start.X + (dx * ratio), start.Y + (dy * ratio), angle);
            }

            var tailStart = segmentStarts[segmentStarts.Count - 1];
            var tailEnd = segmentEnds[segmentEnds.Count - 1];
            var tailAngle = NormalizeConduitReadableTextAngle(
                Math.Atan2(tailEnd.Y - tailStart.Y, tailEnd.X - tailStart.X)
            );
            return (
                (tailStart.X + tailEnd.X) * 0.5,
                (tailStart.Y + tailEnd.Y) * 0.5,
                tailAngle
            );
        }

        private static void ValidateConduitArcAngleNormalization()
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
                var (normalizedStart, normalizedEnd) = NormalizeConduitArcAngles(
                    testCase.Start,
                    testCase.End,
                    testCase.Turn
                );
                var sweep = ComputeConduitArcSweep(normalizedStart, normalizedEnd);
                if (Math.Abs(sweep - quarterTurn) > ConduitArcQuarterTurnTolerance)
                {
                    throw new InvalidOperationException(
                        $"Conduit arc angle normalization failed for turn={testCase.Turn}. Expected ~{quarterTurn}, got {sweep}."
                    );
                }
            }
        }

        private static (int DeletedCount, List<string> DeletedHandles) DeleteConduitRouteBindings(
            string sessionId,
            string clientRouteId,
            Database database,
            Transaction transaction,
            List<string> warnings
        )
        {
            List<string> handles;
            lock (ConduitRouteBindingLock)
            {
                handles = new List<string>();
                if (!ConduitRouteBindings.TryGetValue(sessionId, out var sessionMap))
                {
                    return (0, new List<string>());
                }

                if (!sessionMap.TryGetValue(clientRouteId, out var storedHandles) || storedHandles is null)
                {
                    return (0, new List<string>());
                }

                handles.AddRange(storedHandles);
                sessionMap.Remove(clientRouteId);
                if (sessionMap.Count == 0)
                {
                    ConduitRouteBindings.Remove(sessionId);
                }
            }

            var deleted = 0;
            var deletedHandles = new List<string>();
            foreach (var handle in handles)
            {
                if (
                    TryResolveEntityByHandle(
                        database,
                        transaction,
                        handle,
                        OpenMode.ForWrite,
                        out var entity
                    )
                )
                {
                    entity.UpgradeOpen();
                    entity.Erase();
                    deleted += 1;
                    deletedHandles.Add(handle.Trim().ToUpperInvariant());
                }
                else
                {
                    warnings.Add(
                        $"Route {clientRouteId}: could not delete CAD entity handle '{handle}'."
                    );
                }
            }

            return (deleted, deletedHandles);
        }

        private static (int DeletedEntities, int ResetRoutes) DeleteConduitSessionBindings(
            string sessionId,
            Database database,
            Transaction transaction,
            List<string> warnings
        )
        {
            Dictionary<string, List<string>> snapshot;
            lock (ConduitRouteBindingLock)
            {
                if (!ConduitRouteBindings.TryGetValue(sessionId, out var sessionMap))
                {
                    return (0, 0);
                }

                snapshot = sessionMap.ToDictionary(
                    kvp => kvp.Key,
                    kvp => new List<string>(kvp.Value),
                    StringComparer.OrdinalIgnoreCase
                );
                ConduitRouteBindings.Remove(sessionId);
            }

            var deletedEntities = 0;
            foreach (var entry in snapshot)
            {
                foreach (var handle in entry.Value)
                {
                    if (
                        TryResolveEntityByHandle(
                            database,
                            transaction,
                            handle,
                            OpenMode.ForWrite,
                            out var entity
                        )
                    )
                    {
                        entity.UpgradeOpen();
                        entity.Erase();
                        deletedEntities += 1;
                    }
                    else
                    {
                        warnings.Add(
                            $"Route {entry.Key}: could not delete CAD entity handle '{handle}'."
                        );
                    }
                }
            }

            return (deletedEntities, snapshot.Count);
        }

        private static void StoreConduitRouteBindings(
            string sessionId,
            string clientRouteId,
            IReadOnlyList<string> handles
        )
        {
            if (string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(clientRouteId))
            {
                return;
            }

            var normalizedHandles = handles
                .Select(handle => (handle ?? string.Empty).Trim().ToUpperInvariant())
                .Where(handle => !string.IsNullOrWhiteSpace(handle))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            lock (ConduitRouteBindingLock)
            {
                if (!ConduitRouteBindings.TryGetValue(sessionId, out var sessionMap))
                {
                    sessionMap = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
                    ConduitRouteBindings[sessionId] = sessionMap;
                }

                sessionMap[clientRouteId] = normalizedHandles;
                if (ConduitRouteBindings.Count > MaxConduitRouteSessions)
                {
                    var staleSessionId = ConduitRouteBindings.Keys.FirstOrDefault(
                        key => !string.Equals(key, sessionId, StringComparison.OrdinalIgnoreCase)
                    );
                    if (!string.IsNullOrWhiteSpace(staleSessionId))
                    {
                        ConduitRouteBindings.Remove(staleSessionId);
                    }
                }
            }
        }

        private static void RemoveConduitRouteBinding(string sessionId, string clientRouteId)
        {
            if (string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(clientRouteId))
            {
                return;
            }

            lock (ConduitRouteBindingLock)
            {
                if (!ConduitRouteBindings.TryGetValue(sessionId, out var sessionMap))
                {
                    return;
                }

                sessionMap.Remove(clientRouteId);
                if (sessionMap.Count == 0)
                {
                    ConduitRouteBindings.Remove(sessionId);
                }
            }
        }
    }
}
