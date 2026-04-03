using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Application = Autodesk.AutoCAD.ApplicationServices.Application;

namespace SuiteCadAuthoring
{
    public sealed partial class SuiteCadAuthoringCommands
    {
        private static readonly string[] TerminalPreviewPanelIdKeys =
        {
            "PANEL_ID",
            "PANEL",
            "PANEL_NAME",
            "CABINET",
            "BOARD",
        };

        private static readonly string[] TerminalPreviewSideKeys =
        {
            "SIDE",
            "PANEL_SIDE",
            "SECTION",
            "LR",
        };

        private static readonly string[] TerminalPreviewTerminalCountKeys =
        {
            "TERMINAL_COUNT",
            "TERMINALS",
            "TERM_COUNT",
            "WAYS",
            "POINT_COUNT",
        };

        private static readonly string[] TerminalPreviewNameTokens =
        {
            "TERMINAL",
            "TERMS",
            "TB",
            "TS",
            "MARSHALLING",
        };

        private readonly record struct TerminalPreviewStripScheduleRow(
            string RowId,
            string DrawingPath,
            string DrawingNumber,
            string PanelId,
            string Side,
            string StripId,
            int TerminalCount,
            List<string> Labels
        );

        private readonly record struct TerminalPreviewConnectionScheduleRow(
            string RowId,
            string DrawingPath,
            string DrawingNumber,
            string RouteRef,
            string RouteType,
            string CableType,
            string WireFunction,
            string FromStripId,
            int FromTerminal,
            string ToStripId,
            int ToTerminal,
            bool AnnotateRef
        );

        private readonly record struct TerminalPreviewStripScan(
            string PanelId,
            string Side,
            string StripId,
            int TerminalCount,
            List<string> Labels,
            double X,
            double Y
        );

        internal static JsonObject ExecuteTerminalAuthoringPipePreview(JsonObject payload)
        {
            var requestId = ReadPipeString(payload, "requestId");
            var projectId = ReadPipeString(payload, "projectId");
            var issueSetId = ReadPipeString(payload, "issueSetId");
            var scheduleSnapshotId = ReadPipeString(payload, "scheduleSnapshotId");

            if (string.IsNullOrWhiteSpace(projectId))
            {
                return BuildTerminalPipeFailure("INVALID_REQUEST", "projectId is required.", requestId);
            }

            if (string.IsNullOrWhiteSpace(issueSetId))
            {
                return BuildTerminalPipeFailure("INVALID_REQUEST", "issueSetId is required.", requestId);
            }

            if (string.IsNullOrWhiteSpace(scheduleSnapshotId))
            {
                return BuildTerminalPipeFailure(
                    "INVALID_REQUEST",
                    "scheduleSnapshotId is required.",
                    requestId
                );
            }

            var drawings = ReadBatchFindReplaceProjectDrawings(payload, out var validationError);
            if (!string.IsNullOrWhiteSpace(validationError))
            {
                return BuildTerminalPipeFailure("INVALID_REQUEST", validationError, requestId);
            }

            var stripRows = ReadTerminalPreviewStripRows(payload, out validationError);
            if (!string.IsNullOrWhiteSpace(validationError))
            {
                return BuildTerminalPipeFailure("INVALID_REQUEST", validationError, requestId);
            }

            var connectionRows = ReadTerminalPreviewConnectionRows(payload, out validationError);
            if (!string.IsNullOrWhiteSpace(validationError))
            {
                return BuildTerminalPipeFailure("INVALID_REQUEST", validationError, requestId);
            }

            var startingDocument = Application.DocumentManager.MdiActiveDocument;
            var warnings = new List<string>();
            var operations = new JsonArray();
            var stripsByDrawingPath = new Dictionary<
                string,
                Dictionary<string, TerminalPreviewStripScan>
            >(StringComparer.OrdinalIgnoreCase);
            var drawingWarnings = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

            foreach (var drawing in drawings)
            {
                var perDrawingWarnings = new List<string>();
                drawingWarnings[drawing.DrawingPath] = perDrawingWarnings;
                Document document = null;
                var openedByPlugin = false;

                try
                {
                    document = OpenOrReuseDocument(drawing.DrawingPath, out openedByPlugin);
                    Application.DocumentManager.MdiActiveDocument = document;

                    using (document.LockDocument())
                    using (var transaction = document.Database.TransactionManager.StartTransaction())
                    {
                        stripsByDrawingPath[drawing.DrawingPath] = ScanTerminalPreviewStrips(
                            document.Database,
                            transaction,
                            perDrawingWarnings
                        );
                        transaction.Commit();
                    }
                }
                catch (Exception ex)
                {
                    perDrawingWarnings.Add(
                        $"Preview failed for '{drawing.DrawingPath}': {ex.Message}"
                    );
                    stripsByDrawingPath[drawing.DrawingPath] =
                        new Dictionary<string, TerminalPreviewStripScan>(StringComparer.OrdinalIgnoreCase);
                }
                finally
                {
                    warnings.AddRange(perDrawingWarnings);
                    if (document != null && openedByPlugin)
                    {
                        try
                        {
                            document.CloseAndDiscard();
                        }
                        catch
                        {
                            // Best effort cleanup only.
                        }
                    }
                }
            }

            if (startingDocument != null)
            {
                try
                {
                    Application.DocumentManager.MdiActiveDocument = startingDocument;
                }
                catch
                {
                    // Best effort restore only.
                }
            }

            foreach (var row in stripRows)
            {
                var resolvedDrawing = ResolveTerminalPreviewDrawing(
                    row.DrawingPath,
                    row.DrawingNumber,
                    drawings
                );
                if (!resolvedDrawing.Resolved)
                {
                    operations.Add(
                        BuildTerminalPreviewUnresolvedOperation(
                            row.RowId,
                            "strip",
                            resolvedDrawing.Drawing?.DrawingPath,
                            resolvedDrawing.Drawing?.DrawingName,
                            resolvedDrawing.Drawing?.RelativePath,
                            row.StripId,
                            string.Empty,
                            $"Terminal strip row '{row.RowId}' could not be resolved to exactly one selected drawing.",
                            resolvedDrawing.Warning
                        )
                    );
                    continue;
                }

                var drawing = resolvedDrawing.Drawing!.Value;
                var drawingStrips = stripsByDrawingPath.TryGetValue(
                    drawing.DrawingPath,
                    out var scannedStrips
                )
                    ? scannedStrips
                    : new Dictionary<string, TerminalPreviewStripScan>(
                        StringComparer.OrdinalIgnoreCase
                    );

                if (!drawingStrips.TryGetValue(row.StripId, out var scannedStrip))
                {
                    operations.Add(
                        BuildTerminalPreviewUnresolvedOperation(
                            row.RowId,
                            "strip",
                            drawing.DrawingPath,
                            drawing.DrawingName,
                            drawing.RelativePath,
                            row.StripId,
                            string.Empty,
                            $"Terminal strip '{row.StripId}' was not found in {drawing.DrawingName}.",
                            $"Preview could not match strip '{row.StripId}' in '{drawing.DrawingName}'."
                        )
                    );
                    continue;
                }

                var desiredLabels = NormalizeTerminalPreviewLabels(row.Labels, row.TerminalCount);
                var currentLabels = NormalizeTerminalPreviewLabels(
                    scannedStrip.Labels,
                    row.TerminalCount
                );
                if (desiredLabels.SequenceEqual(currentLabels))
                {
                    continue;
                }

                operations.Add(
                    BuildTerminalPreviewLabelUpsertOperation(
                        projectId,
                        drawing,
                        row,
                        currentLabels,
                        desiredLabels
                    )
                );
            }

            foreach (var row in connectionRows)
            {
                var resolvedDrawing = ResolveTerminalPreviewDrawing(
                    row.DrawingPath,
                    row.DrawingNumber,
                    drawings
                );
                if (!resolvedDrawing.Resolved)
                {
                    operations.Add(
                        BuildTerminalPreviewUnresolvedOperation(
                            row.RowId,
                            "connection",
                            resolvedDrawing.Drawing?.DrawingPath,
                            resolvedDrawing.Drawing?.DrawingName,
                            resolvedDrawing.Drawing?.RelativePath,
                            string.Empty,
                            row.RouteRef,
                            $"Terminal connection row '{row.RowId}' could not be resolved to exactly one selected drawing.",
                            resolvedDrawing.Warning
                        )
                    );
                    continue;
                }

                var drawing = resolvedDrawing.Drawing!.Value;
                var drawingStrips = stripsByDrawingPath.TryGetValue(
                    drawing.DrawingPath,
                    out var scannedStrips
                )
                    ? scannedStrips
                    : new Dictionary<string, TerminalPreviewStripScan>(
                        StringComparer.OrdinalIgnoreCase
                    );

                if (!drawingStrips.TryGetValue(row.FromStripId, out var fromStrip))
                {
                    operations.Add(
                        BuildTerminalPreviewUnresolvedOperation(
                            row.RowId,
                            "connection",
                            drawing.DrawingPath,
                            drawing.DrawingName,
                            drawing.RelativePath,
                            row.FromStripId,
                            row.RouteRef,
                            $"Route '{row.RouteRef}' could not find source strip '{row.FromStripId}' in {drawing.DrawingName}.",
                            $"Preview could not match source strip '{row.FromStripId}' for route '{row.RouteRef}'."
                        )
                    );
                    continue;
                }

                if (!drawingStrips.TryGetValue(row.ToStripId, out var toStrip))
                {
                    operations.Add(
                        BuildTerminalPreviewUnresolvedOperation(
                            row.RowId,
                            "connection",
                            drawing.DrawingPath,
                            drawing.DrawingName,
                            drawing.RelativePath,
                            row.ToStripId,
                            row.RouteRef,
                            $"Route '{row.RouteRef}' could not find destination strip '{row.ToStripId}' in {drawing.DrawingName}.",
                            $"Preview could not match destination strip '{row.ToStripId}' for route '{row.RouteRef}'."
                        )
                    );
                    continue;
                }

                operations.Add(
                    BuildTerminalPreviewRouteOperation(
                        projectId,
                        drawing,
                        row,
                        fromStrip,
                        toStrip
                    )
                );
            }

            var stripUpdateCount = CountTerminalPreviewOperations(operations, "label-upsert");
            var routeUpsertCount = CountTerminalPreviewOperations(operations, "route-insert")
                + CountTerminalPreviewOperations(operations, "route-update");
            var unresolvedCount = CountTerminalPreviewOperations(operations, "unresolved");

            return BuildTerminalPreviewPipeResult(
                true,
                string.Empty,
                "Project terminal authoring preview completed.",
                new JsonObject
                {
                    ["operationCount"] = operations.Count,
                    ["stripUpdateCount"] = stripUpdateCount,
                    ["routeUpsertCount"] = routeUpsertCount,
                    ["unresolvedCount"] = unresolvedCount,
                    ["drawings"] = BuildTerminalPreviewDrawingSummaries(
                        drawings,
                        operations,
                        drawingWarnings
                    ),
                    ["operations"] = operations,
                },
                warnings,
                requestId
            );
        }

        private static JsonObject BuildTerminalPreviewPipeResult(
            bool success,
            string code,
            string message,
            JsonObject data,
            IEnumerable<string> warnings,
            string requestId
        )
        {
            return new JsonObject
            {
                ["success"] = success,
                ["code"] = code,
                ["message"] = message,
                ["data"] = data,
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                    ["providerPath"] = "dotnet+inproc",
                    ["action"] = "suite_terminal_authoring_project_preview",
                    ["requestId"] = string.IsNullOrWhiteSpace(requestId) ? null : requestId,
                },
                ["warnings"] = ToBatchJsonArray(warnings),
            };
        }

        private static List<TerminalPreviewStripScheduleRow> ReadTerminalPreviewStripRows(
            JsonObject payload,
            out string validationError
        )
        {
            validationError = string.Empty;
            if (payload["stripRows"] is not JsonArray rowsArray || rowsArray.Count <= 0)
            {
                validationError = "stripRows must contain at least one TerminalStrips row.";
                return new List<TerminalPreviewStripScheduleRow>();
            }

            var rows = new List<TerminalPreviewStripScheduleRow>();
            foreach (var node in rowsArray)
            {
                if (node is not JsonObject rowObject)
                {
                    continue;
                }

                var rowId = ReadPipeString(rowObject, "id");
                var stripId = ReadPipeString(rowObject, "stripId").ToUpperInvariant();
                if (string.IsNullOrWhiteSpace(rowId) || string.IsNullOrWhiteSpace(stripId))
                {
                    continue;
                }

                var labels = ReadTerminalPreviewLabels(rowObject);
                var terminalCount = ClampTerminalPreviewInt(
                    ReadTerminalPreviewInt(
                        rowObject,
                        "terminalCount",
                        labels.Count > 0 ? labels.Count : 1
                    ),
                    1,
                    2000
                );

                rows.Add(
                    new TerminalPreviewStripScheduleRow(
                        RowId: rowId,
                        DrawingPath: ReadPipeString(rowObject, "drawingPath"),
                        DrawingNumber: ReadPipeString(rowObject, "drawingNumber"),
                        PanelId: ReadPipeString(rowObject, "panelId").ToUpperInvariant(),
                        Side: NormalizeTerminalPreviewSide(ReadPipeString(rowObject, "side")),
                        StripId: stripId,
                        TerminalCount: terminalCount,
                        Labels: NormalizeTerminalPreviewLabels(labels, terminalCount)
                    )
                );
            }

            if (rows.Count <= 0)
            {
                validationError = "No valid TerminalStrips rows were provided.";
            }

            return rows;
        }

        private static List<TerminalPreviewConnectionScheduleRow> ReadTerminalPreviewConnectionRows(
            JsonObject payload,
            out string validationError
        )
        {
            validationError = string.Empty;
            if (payload["connectionRows"] is not JsonArray rowsArray || rowsArray.Count <= 0)
            {
                return new List<TerminalPreviewConnectionScheduleRow>();
            }

            var rows = new List<TerminalPreviewConnectionScheduleRow>();
            foreach (var node in rowsArray)
            {
                if (node is not JsonObject rowObject)
                {
                    continue;
                }

                var rowId = ReadPipeString(rowObject, "id");
                var routeRef = ReadPipeString(rowObject, "routeRef");
                if (string.IsNullOrWhiteSpace(rowId) || string.IsNullOrWhiteSpace(routeRef))
                {
                    continue;
                }

                var routeType = ReadPipeString(rowObject, "routeType").ToLowerInvariant();
                routeType = routeType == "jumper" ? "jumper" : "conductor";

                rows.Add(
                    new TerminalPreviewConnectionScheduleRow(
                        RowId: rowId,
                        DrawingPath: ReadPipeString(rowObject, "drawingPath"),
                        DrawingNumber: ReadPipeString(rowObject, "drawingNumber"),
                        RouteRef: routeRef,
                        RouteType: routeType,
                        CableType: ReadPipeString(rowObject, "cableType"),
                        WireFunction: ReadPipeString(rowObject, "wireFunction"),
                        FromStripId: ReadPipeString(rowObject, "fromStripId").ToUpperInvariant(),
                        FromTerminal: ClampTerminalPreviewInt(
                            ReadTerminalPreviewInt(rowObject, "fromTerminal", 1),
                            1,
                            2000
                        ),
                        ToStripId: ReadPipeString(rowObject, "toStripId").ToUpperInvariant(),
                        ToTerminal: ClampTerminalPreviewInt(
                            ReadTerminalPreviewInt(rowObject, "toTerminal", 1),
                            1,
                            2000
                        ),
                        AnnotateRef: ReadTerminalPreviewBool(rowObject, "annotateRef", true)
                    )
                );
            }

            return rows;
        }

        private static Dictionary<string, TerminalPreviewStripScan> ScanTerminalPreviewStrips(
            Database database,
            Transaction transaction,
            List<string> warnings
        )
        {
            var strips = new Dictionary<string, TerminalPreviewStripScan>(
                StringComparer.OrdinalIgnoreCase
            );
            var modelSpace = GetModelSpace(transaction, database);

            foreach (ObjectId entityId in modelSpace)
            {
                if (transaction.GetObject(entityId, OpenMode.ForRead) is not BlockReference block)
                {
                    continue;
                }

                var attrs = ReadTerminalPreviewAttributeMap(block, transaction);
                var blockName = NormalizeText(block.Name).ToUpperInvariant();
                if (!LooksLikeTerminalPreviewBlock(blockName, attrs))
                {
                    continue;
                }

                var stripId = FirstTerminalPreviewAttribute(attrs, StripIdKeys).ToUpperInvariant();
                if (string.IsNullOrWhiteSpace(stripId))
                {
                    continue;
                }

                if (strips.ContainsKey(stripId))
                {
                    warnings.Add(
                        $"Drawing contains duplicate terminal strip id '{stripId}'. Preview will use the first block reference."
                    );
                    continue;
                }

                var position = block.Position;
                var panelId = FirstTerminalPreviewAttribute(attrs, TerminalPreviewPanelIdKeys)
                    .ToUpperInvariant();
                if (string.IsNullOrWhiteSpace(panelId))
                {
                    panelId = DeriveTerminalPreviewPanelId(stripId);
                }

                var terminalCount = ParseTerminalPreviewCount(attrs);
                strips[stripId] = new TerminalPreviewStripScan(
                    PanelId: panelId,
                    Side: NormalizeTerminalPreviewSide(
                        FirstTerminalPreviewAttribute(attrs, TerminalPreviewSideKeys)
                    ),
                    StripId: stripId,
                    TerminalCount: terminalCount,
                    Labels: ParseTerminalPreviewLabels(attrs, terminalCount),
                    X: position.X,
                    Y: position.Y
                );
            }

            return strips;
        }

        private static (
            bool Resolved,
            BatchFindReplaceProjectDrawing? Drawing,
            string Warning
        ) ResolveTerminalPreviewDrawing(
            string drawingPath,
            string drawingNumber,
            IReadOnlyList<BatchFindReplaceProjectDrawing> drawings
        )
        {
            if (drawings.Count <= 0)
            {
                return (false, null, "No selected issue-set drawings were available.");
            }

            var pathToken = drawingPath.Trim();
            var drawingNumberToken = drawingNumber.Trim();
            if (!string.IsNullOrWhiteSpace(pathToken))
            {
                var pathMatches = drawings
                    .Where(
                        drawing =>
                            string.Equals(
                                drawing.DrawingPath,
                                pathToken,
                                StringComparison.OrdinalIgnoreCase
                            )
                            || string.Equals(
                                drawing.RelativePath,
                                pathToken,
                                StringComparison.OrdinalIgnoreCase
                            )
                            || string.Equals(
                                drawing.DrawingName,
                                pathToken,
                                StringComparison.OrdinalIgnoreCase
                            )
                    )
                    .Distinct()
                    .ToList();

                if (pathMatches.Count == 1)
                {
                    return (true, pathMatches[0], string.Empty);
                }

                if (pathMatches.Count > 1)
                {
                    return (
                        false,
                        null,
                        $"Drawing reference '{pathToken}' matched more than one selected drawing."
                    );
                }
            }

            var drawingKey = NormalizeTerminalPreviewKey(drawingNumberToken);
            if (!string.IsNullOrWhiteSpace(drawingKey))
            {
                var numberMatches = drawings
                    .Where(drawing => NormalizeTerminalPreviewDrawingToken(drawing) == drawingKey)
                    .Distinct()
                    .ToList();

                if (numberMatches.Count == 1)
                {
                    return (true, numberMatches[0], string.Empty);
                }

                if (numberMatches.Count > 1)
                {
                    return (
                        false,
                        null,
                        $"Drawing number '{drawingNumberToken}' matched more than one selected drawing."
                    );
                }
            }

            var reference = !string.IsNullOrWhiteSpace(pathToken)
                ? pathToken
                : drawingNumberToken;
            return (
                false,
                null,
                $"Drawing reference '{reference}' did not match any selected issue-set drawing."
            );
        }

        private static JsonObject BuildTerminalPreviewLabelUpsertOperation(
            string projectId,
            BatchFindReplaceProjectDrawing drawing,
            TerminalPreviewStripScheduleRow row,
            List<string> currentLabels,
            List<string> desiredLabels
        )
        {
            return new JsonObject
            {
                ["operationId"] =
                    $"strip::{row.RowId}::{NormalizeTerminalPreviewDrawingToken(drawing)}",
                ["rowId"] = row.RowId,
                ["source"] = "strip",
                ["operationType"] = "label-upsert",
                ["drawingPath"] = drawing.DrawingPath,
                ["drawingName"] = drawing.DrawingName,
                ["relativePath"] = string.IsNullOrWhiteSpace(drawing.RelativePath)
                    ? null
                    : drawing.RelativePath,
                ["panelId"] = row.PanelId,
                ["side"] = row.Side,
                ["stripId"] = row.StripId,
                ["terminalCount"] = row.TerminalCount,
                ["labels"] = ToTerminalPreviewJsonArray(desiredLabels),
                ["routeRef"] = null,
                ["routeType"] = null,
                ["cableType"] = null,
                ["wireFunction"] = null,
                ["annotateRef"] = null,
                ["fromStripId"] = null,
                ["fromTerminal"] = null,
                ["toStripId"] = null,
                ["toTerminal"] = null,
                ["stripKey"] = BuildTerminalPreviewStripKey(drawing, row.StripId),
                ["routeKey"] = null,
                ["before"] = FormatTerminalPreviewLabels(currentLabels),
                ["after"] = FormatTerminalPreviewLabels(desiredLabels),
                ["detail"] = $"Update strip '{row.StripId}' labels in {drawing.DrawingName}.",
                ["warning"] = null,
                ["path"] = new JsonArray(),
            };
        }

        private static JsonObject BuildTerminalPreviewRouteOperation(
            string projectId,
            BatchFindReplaceProjectDrawing drawing,
            TerminalPreviewConnectionScheduleRow row,
            TerminalPreviewStripScan fromStrip,
            TerminalPreviewStripScan toStrip
        )
        {
            return new JsonObject
            {
                ["operationId"] =
                    $"route::{row.RowId}::{NormalizeTerminalPreviewDrawingToken(drawing)}::{NormalizeTerminalPreviewKey(row.RouteRef)}",
                ["rowId"] = row.RowId,
                ["source"] = "connection",
                ["operationType"] = "route-insert",
                ["drawingPath"] = drawing.DrawingPath,
                ["drawingName"] = drawing.DrawingName,
                ["relativePath"] = string.IsNullOrWhiteSpace(drawing.RelativePath)
                    ? null
                    : drawing.RelativePath,
                ["panelId"] = fromStrip.PanelId,
                ["side"] = fromStrip.Side,
                ["stripId"] = null,
                ["terminalCount"] = null,
                ["labels"] = null,
                ["routeRef"] = row.RouteRef,
                ["routeType"] = row.RouteType,
                ["cableType"] = row.CableType,
                ["wireFunction"] = row.WireFunction,
                ["annotateRef"] = row.AnnotateRef,
                ["fromStripId"] = row.FromStripId,
                ["fromTerminal"] = row.FromTerminal,
                ["toStripId"] = row.ToStripId,
                ["toTerminal"] = row.ToTerminal,
                ["stripKey"] = null,
                ["routeKey"] = BuildTerminalPreviewRouteKey(
                    projectId,
                    drawing,
                    row.RouteType,
                    row.RouteRef
                ),
                ["before"] = null,
                ["after"] =
                    $"{row.RouteType} {row.RouteRef}: {row.FromStripId}-{row.FromTerminal} to {row.ToStripId}-{row.ToTerminal}",
                ["detail"] =
                    $"Insert Suite-managed {row.RouteType} route '{row.RouteRef}' in {drawing.DrawingName}.",
                ["warning"] = null,
                ["path"] = BuildTerminalPreviewRoutePath(
                    fromStrip,
                    row.FromTerminal,
                    toStrip,
                    row.ToTerminal
                ),
            };
        }

        private static JsonObject BuildTerminalPreviewUnresolvedOperation(
            string rowId,
            string source,
            string drawingPath,
            string drawingName,
            string relativePath,
            string stripId,
            string routeRef,
            string detail,
            string warning
        )
        {
            return new JsonObject
            {
                ["operationId"] =
                    $"unresolved::{source}::{NormalizeTerminalPreviewKey(rowId)}::{NormalizeTerminalPreviewKey(drawingPath ?? drawingName ?? routeRef ?? stripId)}",
                ["rowId"] = rowId,
                ["source"] = source,
                ["operationType"] = "unresolved",
                ["drawingPath"] = string.IsNullOrWhiteSpace(drawingPath) ? null : drawingPath,
                ["drawingName"] = string.IsNullOrWhiteSpace(drawingName) ? null : drawingName,
                ["relativePath"] = string.IsNullOrWhiteSpace(relativePath) ? null : relativePath,
                ["panelId"] = null,
                ["side"] = null,
                ["stripId"] = string.IsNullOrWhiteSpace(stripId) ? null : stripId,
                ["terminalCount"] = null,
                ["labels"] = null,
                ["routeRef"] = string.IsNullOrWhiteSpace(routeRef) ? null : routeRef,
                ["routeType"] = null,
                ["cableType"] = null,
                ["wireFunction"] = null,
                ["annotateRef"] = null,
                ["fromStripId"] = null,
                ["fromTerminal"] = null,
                ["toStripId"] = null,
                ["toTerminal"] = null,
                ["stripKey"] = null,
                ["routeKey"] = null,
                ["before"] = null,
                ["after"] = null,
                ["detail"] = detail,
                ["warning"] = warning,
                ["path"] = new JsonArray(),
            };
        }

        private static JsonArray BuildTerminalPreviewDrawingSummaries(
            IReadOnlyList<BatchFindReplaceProjectDrawing> drawings,
            JsonArray operations,
            IReadOnlyDictionary<string, List<string>> drawingWarnings
        )
        {
            var summaries = new JsonArray();
            foreach (var drawing in drawings)
            {
                var scopedOperations = operations
                    .OfType<JsonObject>()
                    .Where(
                        operation =>
                            string.Equals(
                                ReadPipeString(operation, "drawingPath"),
                                drawing.DrawingPath,
                                StringComparison.OrdinalIgnoreCase
                            )
                    )
                    .ToList();

                var warnings = new List<string>();
                if (drawingWarnings.TryGetValue(drawing.DrawingPath, out var entries))
                {
                    warnings.AddRange(entries);
                }

                warnings.AddRange(
                    scopedOperations
                        .Select(operation => ReadPipeString(operation, "warning"))
                        .Where(warning => !string.IsNullOrWhiteSpace(warning))
                );

                summaries.Add(
                    new JsonObject
                    {
                        ["drawingPath"] = drawing.DrawingPath,
                        ["drawingName"] = drawing.DrawingName,
                        ["relativePath"] = string.IsNullOrWhiteSpace(drawing.RelativePath)
                            ? null
                            : drawing.RelativePath,
                        ["operationCount"] = scopedOperations.Count,
                        ["stripUpdateCount"] = scopedOperations.Count(
                            operation =>
                                string.Equals(
                                    ReadPipeString(operation, "operationType"),
                                    "label-upsert",
                                    StringComparison.OrdinalIgnoreCase
                                )
                        ),
                        ["routeUpsertCount"] = scopedOperations.Count(operation =>
                        {
                            var operationType = ReadPipeString(operation, "operationType");
                            return string.Equals(
                                    operationType,
                                    "route-insert",
                                    StringComparison.OrdinalIgnoreCase
                                )
                                || string.Equals(
                                    operationType,
                                    "route-update",
                                    StringComparison.OrdinalIgnoreCase
                                );
                        }),
                        ["unresolvedCount"] = scopedOperations.Count(
                            operation =>
                                string.Equals(
                                    ReadPipeString(operation, "operationType"),
                                    "unresolved",
                                    StringComparison.OrdinalIgnoreCase
                                )
                        ),
                        ["warnings"] = ToBatchJsonArray(
                            warnings.Distinct(StringComparer.OrdinalIgnoreCase)
                        ),
                    }
                );
            }

            return summaries;
        }

        private static int CountTerminalPreviewOperations(JsonArray operations, string operationType)
        {
            return operations
                .OfType<JsonObject>()
                .Count(
                    operation =>
                        string.Equals(
                            ReadPipeString(operation, "operationType"),
                            operationType,
                            StringComparison.OrdinalIgnoreCase
                        )
                );
        }

        private static string NormalizeTerminalPreviewDrawingToken(
            BatchFindReplaceProjectDrawing drawing
        )
        {
            var relativePath = (drawing.RelativePath ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(relativePath))
            {
                return NormalizeTerminalPreviewKey(Path.GetFileNameWithoutExtension(relativePath));
            }

            return NormalizeTerminalPreviewKey(Path.GetFileNameWithoutExtension(drawing.DrawingName));
        }

        private static string NormalizeTerminalPreviewKey(string value)
        {
            return Regex.Replace(
                (value ?? string.Empty).Trim().ToUpperInvariant(),
                "[^A-Z0-9]+",
                string.Empty
            );
        }

        private static string BuildTerminalPreviewStripKey(
            BatchFindReplaceProjectDrawing drawing,
            string stripId
        )
        {
            return
                $"{NormalizeTerminalPreviewKey(drawing.RelativePath)}::{NormalizeTerminalPreviewKey(stripId)}";
        }

        private static string BuildTerminalPreviewRouteKey(
            string projectId,
            BatchFindReplaceProjectDrawing drawing,
            string routeType,
            string routeRef
        )
        {
            return string.Join(
                "::",
                new[]
                {
                    NormalizeTerminalPreviewKey(projectId),
                    NormalizeTerminalPreviewKey(drawing.RelativePath),
                    NormalizeTerminalPreviewKey(routeType),
                    NormalizeTerminalPreviewKey(routeRef),
                }
            );
        }

        private static List<string> NormalizeTerminalPreviewLabels(
            IReadOnlyList<string> rawLabels,
            int terminalCount
        )
        {
            var count = ClampTerminalPreviewInt(
                terminalCount <= 0 ? rawLabels.Count : terminalCount,
                1,
                2000
            );
            var output = new List<string>(count);
            for (var index = 0; index < count; index++)
            {
                var value = index < rawLabels.Count ? rawLabels[index] ?? string.Empty : string.Empty;
                output.Add(value.Trim());
            }

            return output;
        }

        private static string FormatTerminalPreviewLabels(IReadOnlyList<string> labels)
        {
            return string.Join(
                " | ",
                labels.Select(label => string.IsNullOrWhiteSpace(label) ? "[blank]" : label.Trim())
            );
        }

        private static JsonArray BuildTerminalPreviewRoutePath(
            TerminalPreviewStripScan fromStrip,
            int fromTerminal,
            TerminalPreviewStripScan toStrip,
            int toTerminal
        )
        {
            var fromPoint = BuildTerminalPreviewAnchorPoint(fromStrip, fromTerminal, true);
            var toPoint = BuildTerminalPreviewAnchorPoint(toStrip, toTerminal, false);
            var midX = Math.Abs(fromPoint.X - toPoint.X) < 1.0
                ? fromPoint.X + 1.0
                : (fromPoint.X + toPoint.X) / 2.0;

            return new JsonArray
            {
                new JsonObject { ["x"] = fromPoint.X, ["y"] = fromPoint.Y },
                new JsonObject { ["x"] = midX, ["y"] = fromPoint.Y },
                new JsonObject { ["x"] = midX, ["y"] = toPoint.Y },
                new JsonObject { ["x"] = toPoint.X, ["y"] = toPoint.Y },
            };
        }

        private static (double X, double Y) BuildTerminalPreviewAnchorPoint(
            TerminalPreviewStripScan strip,
            int terminalIndex,
            bool outbound
        )
        {
            const double step = 0.18;
            var clampedIndex = ClampTerminalPreviewInt(
                terminalIndex,
                1,
                Math.Max(1, strip.TerminalCount)
            );
            var yOffset =
                ((strip.TerminalCount - 1) * step * 0.5) - ((clampedIndex - 1) * step);
            var xOffset = strip.Side switch
            {
                "R" => outbound ? 0.8 : -0.8,
                "L" => outbound ? -0.8 : 0.8,
                _ => outbound ? 0.8 : -0.8,
            };

            return (strip.X + xOffset, strip.Y + yOffset);
        }

        private static Dictionary<string, string> ReadTerminalPreviewAttributeMap(
            BlockReference blockReference,
            Transaction transaction
        )
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (ObjectId attributeId in blockReference.AttributeCollection)
            {
                if (
                    transaction.GetObject(attributeId, OpenMode.ForRead)
                    is not AttributeReference attribute
                )
                {
                    continue;
                }

                var tag = NormalizeText(attribute.Tag).ToUpperInvariant();
                if (!string.IsNullOrWhiteSpace(tag))
                {
                    map[tag] = NormalizeText(attribute.TextString);
                }
            }

            return map;
        }

        private static bool LooksLikeTerminalPreviewBlock(
            string blockName,
            Dictionary<string, string> attrs
        )
        {
            if (
                TerminalPreviewNameTokens.Any(
                    token => blockName.Contains(token, StringComparison.Ordinal)
                )
            )
            {
                return true;
            }

            return attrs.Keys.Any(
                key =>
                    StripIdKeys.Contains(key, StringComparer.OrdinalIgnoreCase)
                    || TerminalPreviewTerminalCountKeys.Contains(
                        key,
                        StringComparer.OrdinalIgnoreCase
                    )
            );
        }

        private static string FirstTerminalPreviewAttribute(
            Dictionary<string, string> attrs,
            IEnumerable<string> keys
        )
        {
            foreach (var key in keys)
            {
                if (attrs.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
                {
                    return value;
                }
            }

            return string.Empty;
        }

        private static int ParseTerminalPreviewCount(Dictionary<string, string> attrs)
        {
            foreach (var key in TerminalPreviewTerminalCountKeys)
            {
                if (!attrs.TryGetValue(key, out var raw))
                {
                    continue;
                }

                var value = ExtractFirstTerminalPreviewInt(raw);
                if (value.HasValue && value.Value > 0)
                {
                    return ClampTerminalPreviewInt(value.Value, 1, 2000);
                }
            }

            return 12;
        }

        private static List<string> ParseTerminalPreviewLabels(
            Dictionary<string, string> attrs,
            int terminalCount
        )
        {
            var labelsByIndex = new Dictionary<int, string>();
            foreach (var entry in attrs)
            {
                var match = TerminalLabelTagRegex.Match(entry.Key ?? string.Empty);
                if (
                    !match.Success
                    || !int.TryParse(match.Groups[1].Value, out var index)
                    || index <= 0
                )
                {
                    continue;
                }

                var label = (entry.Value ?? string.Empty).Trim();
                if (!string.IsNullOrWhiteSpace(label))
                {
                    labelsByIndex[index] = label;
                }
            }

            var count = ClampTerminalPreviewInt(terminalCount, 1, 2000);
            var labels = new List<string>(count);
            for (var index = 1; index <= count; index++)
            {
                labels.Add(labelsByIndex.TryGetValue(index, out var label) ? label : string.Empty);
            }

            return labels;
        }

        private static string DeriveTerminalPreviewPanelId(string stripId)
        {
            var match = Regex.Match(stripId ?? string.Empty, "^([A-Z]+[0-9]+)", RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value.ToUpperInvariant() : string.Empty;
        }

        private static string NormalizeTerminalPreviewSide(string side)
        {
            var normalized = (side ?? string.Empty).Trim().ToUpperInvariant();
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

        private static int? ExtractFirstTerminalPreviewInt(string input)
        {
            var match = Regex.Match(input ?? string.Empty, "(\\d+)");
            if (!match.Success)
            {
                return null;
            }

            return int.TryParse(match.Groups[1].Value, out var value) ? value : null;
        }

        private static List<string> ReadTerminalPreviewLabels(JsonObject payload)
        {
            var values = new List<string>();
            if (payload["labels"] is not JsonArray labelsArray)
            {
                return values;
            }

            foreach (var node in labelsArray)
            {
                if (node is JsonValue value && value.TryGetValue<string>(out var text))
                {
                    values.Add((text ?? string.Empty).Trim());
                }
            }

            return values;
        }

        private static bool ReadTerminalPreviewBool(
            JsonObject payload,
            string key,
            bool fallback
        )
        {
            if (!payload.TryGetPropertyValue(key, out var node) || node is not JsonValue value)
            {
                return fallback;
            }

            if (value.TryGetValue<bool>(out var boolValue))
            {
                return boolValue;
            }

            if (value.TryGetValue<string>(out var text) && bool.TryParse(text, out var parsed))
            {
                return parsed;
            }

            return fallback;
        }

        private static int ReadTerminalPreviewInt(JsonObject payload, string key, int fallback)
        {
            if (!payload.TryGetPropertyValue(key, out var node) || node is not JsonValue value)
            {
                return fallback;
            }

            if (value.TryGetValue<int>(out var intValue))
            {
                return intValue;
            }

            if (value.TryGetValue<long>(out var longValue))
            {
                return (int)longValue;
            }

            if (value.TryGetValue<string>(out var text) && int.TryParse(text, out var parsed))
            {
                return parsed;
            }

            return fallback;
        }

        private static int ClampTerminalPreviewInt(int value, int minValue, int maxValue)
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

        private static JsonArray ToTerminalPreviewJsonArray(IEnumerable<string> values)
        {
            var array = new JsonArray();
            foreach (var value in values)
            {
                array.Add(value);
            }

            return array;
        }
    }
}
