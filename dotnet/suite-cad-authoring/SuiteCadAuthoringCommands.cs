using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using Application = Autodesk.AutoCAD.ApplicationServices.Application;

[assembly: CommandClass(typeof(SuiteCadAuthoring.SuiteCadAuthoringCommands))]
[assembly: ExtensionApplication(typeof(SuiteCadAuthoring.SuiteCadAuthoringExtension))]

namespace SuiteCadAuthoring
{
    public sealed class SuiteCadAuthoringExtension : IExtensionApplication
    {
        public void Initialize()
        {
            SuiteCadPipeHost.StartIfEligible();
        }

        public void Terminate()
        {
            SuiteCadPipeHost.Stop();
        }
    }

    internal sealed class SuiteCadPipeStatusResult
    {
        public bool HostEligible { get; set; }

        public bool HostStarted { get; set; }

        public string PipeName { get; set; } = string.Empty;

        public string ActiveProfile { get; set; } = string.Empty;

        public string Message { get; set; } = string.Empty;
    }

    internal sealed class TerminalAuthoringApplyPayload
    {
        public string RequestId { get; set; }

        public string ProjectId { get; set; }

        public string IssueSetId { get; set; }

        public string ScheduleSnapshotId { get; set; }

        public List<TerminalAuthoringApplyOperation> Operations { get; set; } = new List<TerminalAuthoringApplyOperation>();
    }

    internal sealed class TerminalAuthoringApplyOperation
    {
        public string OperationId { get; set; }

        public string RowId { get; set; }

        public string Source { get; set; }

        public string OperationType { get; set; }

        public string DrawingPath { get; set; }

        public string DrawingName { get; set; }

        public string RelativePath { get; set; }

        public string PanelId { get; set; }

        public string Side { get; set; }

        public string StripId { get; set; }

        public int? TerminalCount { get; set; }

        public List<string> Labels { get; set; } = new List<string>();

        public string RouteRef { get; set; }

        public string RouteType { get; set; }

        public string CableType { get; set; }

        public string WireFunction { get; set; }

        public bool? AnnotateRef { get; set; }

        public string FromStripId { get; set; }

        public int? FromTerminal { get; set; }

        public string ToStripId { get; set; }

        public int? ToTerminal { get; set; }

        public string StripKey { get; set; }

        public string RouteKey { get; set; }

        public string Before { get; set; }

        public string After { get; set; }

        public string Detail { get; set; }

        public List<TerminalAuthoringPathPoint> Path { get; set; } = new List<TerminalAuthoringPathPoint>();
    }

    internal sealed class TerminalAuthoringPathPoint
    {
        public double X { get; set; }

        public double Y { get; set; }
    }

    internal sealed class TerminalAuthoringResultEnvelope
    {
        public bool Success { get; set; }

        public string Code { get; set; }

        public string Message { get; set; }

        public TerminalAuthoringResultData Data { get; set; } = new TerminalAuthoringResultData();

        public List<string> Warnings { get; set; } = new List<string>();

        public Dictionary<string, object> Meta { get; set; } = new Dictionary<string, object>();
    }

    internal sealed class TerminalAuthoringResultData
    {
        public int ChangedDrawingCount { get; set; }

        public int TerminalStripUpdateCount { get; set; }

        public int ManagedRouteUpsertCount { get; set; }

        public List<TerminalAuthoringDrawingResult> Drawings { get; set; } = new List<TerminalAuthoringDrawingResult>();

        public List<TerminalAuthoringChangeRow> Changes { get; set; } = new List<TerminalAuthoringChangeRow>();
    }

    internal sealed class TerminalAuthoringDrawingResult
    {
        public string DrawingPath { get; set; }

        public string DrawingName { get; set; }

        public string RelativePath { get; set; }

        public int StripUpdates { get; set; }

        public int RouteUpserts { get; set; }

        public int Updated { get; set; }

        public List<string> Warnings { get; set; } = new List<string>();
    }

    internal sealed class TerminalAuthoringChangeRow
    {
        public string DrawingName { get; set; }

        public string RelativePath { get; set; }

        public string OperationType { get; set; }

        public string Source { get; set; }

        public string StripId { get; set; }

        public string RouteRef { get; set; }

        public string Before { get; set; }

        public string After { get; set; }

        public string Detail { get; set; }

        public string Status { get; set; }
    }

    internal sealed class StripBlockMatch
    {
        public BlockReference BlockReference { get; set; }

        public Dictionary<int, AttributeReference> LabelAttributes { get; set; } = new Dictionary<int, AttributeReference>();

        public List<string> CurrentLabels { get; set; } = new List<string>();
    }

    public sealed partial class SuiteCadAuthoringCommands
    {
        private const string RegAppName = "SUITE_CAD_AUTHORING";
        private const string ConductorLayerName = "SUITE_TERM_ROUTE";
        private const string JumperLayerName = "SUITE_TERM_JUMPER";
        private static readonly Regex TerminalLabelTagRegex = new Regex("^T(?:ERMINAL)?_?(\\d+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
        private static readonly string[] StripIdKeys = { "STRIP_ID", "STRIP", "TERMINAL_STRIP", "TB_ID", "TS_ID" };
        private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true,
        };

        [CommandMethod("SUITETERMINALAUTHORAPPLY", CommandFlags.Session)]
        public void ApplyTerminalAuthoring()
        {
            var document = Application.DocumentManager.MdiActiveDocument;
            var editor = document?.Editor;
            if (editor == null)
            {
                return;
            }

            var payloadPrompt = editor.GetString("\nSuite terminal authoring payload JSON path: ");
            if (payloadPrompt.Status != PromptStatus.OK || string.IsNullOrWhiteSpace(payloadPrompt.StringResult))
            {
                return;
            }

            var resultPrompt = editor.GetString("\nSuite terminal authoring result JSON path: ");
            if (resultPrompt.Status != PromptStatus.OK || string.IsNullOrWhiteSpace(resultPrompt.StringResult))
            {
                return;
            }

            var envelope = Execute(payloadPrompt.StringResult.Trim(), resultPrompt.StringResult.Trim());
            try
            {
                File.WriteAllText(resultPrompt.StringResult.Trim(), JsonSerializer.Serialize(envelope, JsonOptions));
            }
            catch (System.Exception ex)
            {
                editor.WriteMessage($"\n[Suite] Failed to write terminal authoring result file: {ex.Message}");
            }

            editor.WriteMessage($"\n[Suite] {envelope.Message}");
        }

        private static TerminalAuthoringResultEnvelope Execute(string payloadPath, string resultPath)
        {
            if (!Path.IsPathRooted(payloadPath))
            {
                return BuildFailure("INVALID_REQUEST", "Payload path must be absolute.");
            }
            if (!File.Exists(payloadPath))
            {
                return BuildFailure("INVALID_REQUEST", $"Payload file was not found: {payloadPath}");
            }
            if (!Path.IsPathRooted(resultPath))
            {
                return BuildFailure("INVALID_REQUEST", "Result path must be absolute.");
            }

            TerminalAuthoringApplyPayload payload;
            try
            {
                payload = JsonSerializer.Deserialize<TerminalAuthoringApplyPayload>(File.ReadAllText(payloadPath), JsonOptions);
            }
            catch (System.Exception ex)
            {
                return BuildFailure("INVALID_REQUEST", $"Unable to parse payload JSON: {ex.Message}");
            }

            if (payload == null || payload.Operations == null || payload.Operations.Count == 0)
            {
                return BuildFailure("INVALID_REQUEST", "Payload did not contain any operations.");
            }

            var envelope = new TerminalAuthoringResultEnvelope
            {
                Success = true,
                Code = string.Empty,
                Message = "Project terminal authoring apply completed.",
                Meta = new Dictionary<string, object>
                {
                    ["providerPath"] = "plugin",
                    ["payloadPath"] = payloadPath,
                    ["resultPath"] = resultPath,
                },
            };

            var startingDocument = Application.DocumentManager.MdiActiveDocument;
            var groupedOperations = payload.Operations
                .Where(operation => !string.IsNullOrWhiteSpace(operation.DrawingPath))
                .GroupBy(operation => Path.GetFullPath(operation.DrawingPath), StringComparer.OrdinalIgnoreCase)
                .ToList();

            foreach (var drawingGroup in groupedOperations)
            {
                ProcessDrawingGroup(drawingGroup.Key, drawingGroup.ToList(), envelope);
            }

            if (startingDocument != null)
            {
                try
                {
                    Application.DocumentManager.MdiActiveDocument = startingDocument;
                }
                catch
                {
                    // Best effort restore.
                }
            }

            envelope.Data.ChangedDrawingCount = envelope.Data.Drawings.Count(entry => entry.Updated > 0);
            envelope.Message =
                $"Applied terminal authoring across {envelope.Data.ChangedDrawingCount} drawing(s): " +
                $"{envelope.Data.TerminalStripUpdateCount} strip write(s), {envelope.Data.ManagedRouteUpsertCount} managed route upsert(s).";

            return envelope;
        }

        private static void ProcessDrawingGroup(
            string drawingPath,
            List<TerminalAuthoringApplyOperation> operations,
            TerminalAuthoringResultEnvelope envelope
        )
        {
            var drawingWarnings = new List<string>();
            var drawingResult = new TerminalAuthoringDrawingResult
            {
                DrawingPath = drawingPath,
                DrawingName = operations[0].DrawingName ?? Path.GetFileName(drawingPath),
                RelativePath = operations[0].RelativePath ?? string.Empty,
            };

            Document document = null;
            bool openedByPlugin = false;
            bool drawingChanged = false;
            try
            {
                document = OpenOrReuseDocument(drawingPath, out openedByPlugin);
                Application.DocumentManager.MdiActiveDocument = document;

                using (document.LockDocument())
                using (var transaction = document.Database.TransactionManager.StartTransaction())
                {
                    EnsureRegApp(document.Database, transaction);
                    EnsureLayer(document.Database, transaction, ConductorLayerName);
                    EnsureLayer(document.Database, transaction, JumperLayerName);

                    foreach (var operation in operations)
                    {
                        var operationType = NormalizeText(operation.OperationType).ToLowerInvariant();
                        if (operationType == "label-upsert")
                        {
                            if (ApplyStripLabelOperation(document, transaction, operation, drawingWarnings, drawingResult, envelope))
                            {
                                drawingChanged = true;
                            }
                            continue;
                        }

                        if (operationType == "route-insert" || operationType == "route-update")
                        {
                            if (ApplyManagedRouteOperation(document, transaction, operation, drawingWarnings, drawingResult, envelope))
                            {
                                drawingChanged = true;
                            }
                        }
                    }

                    transaction.Commit();
                }

                if (drawingChanged)
                {
                    try
                    {
                        document.Database.SaveAs(drawingPath, DwgVersion.Current);
                    }
                    catch (System.Exception ex)
                    {
                        drawingWarnings.Add($"Save failed for '{drawingPath}': {ex.Message}");
                    }
                }
            }
            catch (System.Exception ex)
            {
                drawingWarnings.Add($"Apply failed for '{drawingPath}': {ex.Message}");
            }
            finally
            {
                drawingResult.Warnings = drawingWarnings;
                drawingResult.Updated = drawingResult.StripUpdates + drawingResult.RouteUpserts;
                envelope.Data.Drawings.Add(drawingResult);
                envelope.Warnings.AddRange(drawingWarnings);

                if (document != null && openedByPlugin)
                {
                    try
                    {
                        if (drawingChanged)
                        {
                            document.CloseAndDiscard();
                        }
                        else
                        {
                            document.CloseAndDiscard();
                        }
                    }
                    catch
                    {
                        // Best effort cleanup.
                    }
                }
            }
        }

        private static Document OpenOrReuseDocument(string drawingPath, out bool openedByPlugin)
        {
            var normalizedTarget = Path.GetFullPath(drawingPath);
            foreach (Document openDocument in Application.DocumentManager)
            {
                var openPath = GetDocumentPath(openDocument);
                if (string.Equals(openPath, normalizedTarget, StringComparison.OrdinalIgnoreCase))
                {
                    openedByPlugin = false;
                    return openDocument;
                }
            }

            openedByPlugin = true;
            return Application.DocumentManager.Open(normalizedTarget, false);
        }

        private static string GetDocumentPath(Document document)
        {
            try
            {
                return Path.GetFullPath(document?.Database?.Filename ?? document?.Name ?? string.Empty);
            }
            catch
            {
                return document?.Name ?? string.Empty;
            }
        }

        private static TerminalAuthoringResultEnvelope BuildFailure(string code, string message)
        {
            return new TerminalAuthoringResultEnvelope
            {
                Success = false,
                Code = code,
                Message = message,
            };
        }

        private static bool ApplyStripLabelOperation(
            Document document,
            Transaction transaction,
            TerminalAuthoringApplyOperation operation,
            List<string> warnings,
            TerminalAuthoringDrawingResult drawingResult,
            TerminalAuthoringResultEnvelope envelope
        )
        {
            var match = FindStripBlock(document.Database, transaction, operation.StripId);
            if (match == null)
            {
                warnings.Add($"Strip '{operation.StripId}' was not found in {drawingResult.DrawingName}.");
                AddChangeRow(envelope, drawingResult, operation, "skipped-missing");
                return false;
            }

            var terminalCount = Math.Max(1, operation.TerminalCount ?? match.CurrentLabels.Count);
            var currentLabels = NormalizeLabels(match.CurrentLabels, terminalCount);
            var desiredLabels = NormalizeLabels(operation.Labels ?? new List<string>(), terminalCount);
            var before = FormatLabels(currentLabels);
            if (!string.IsNullOrWhiteSpace(operation.Before) &&
                !string.Equals(before, operation.Before, StringComparison.Ordinal))
            {
                warnings.Add(
                    $"Strip '{operation.StripId}' changed after preview. Expected '{operation.Before}' but found '{before}'."
                );
                AddChangeRow(envelope, drawingResult, operation, "skipped-stale");
                return false;
            }

            var changed = false;
            for (var index = 1; index <= terminalCount; index++)
            {
                if (!match.LabelAttributes.TryGetValue(index, out var attribute))
                {
                    warnings.Add($"Strip '{operation.StripId}' is missing terminal label attribute T{index}.");
                    continue;
                }

                var nextValue = desiredLabels[index - 1] ?? string.Empty;
                if (string.Equals(attribute.TextString ?? string.Empty, nextValue, StringComparison.Ordinal))
                {
                    continue;
                }

                attribute.UpgradeOpen();
                attribute.TextString = nextValue;
                changed = true;
            }

            if (changed)
            {
                match.BlockReference.UpgradeOpen();
                drawingResult.StripUpdates += 1;
                envelope.Data.TerminalStripUpdateCount += 1;
                AddChangeRow(envelope, drawingResult, operation, "applied");
            }
            else
            {
                AddChangeRow(envelope, drawingResult, operation, "unchanged");
            }

            return changed;
        }

        private static bool ApplyManagedRouteOperation(
            Document document,
            Transaction transaction,
            TerminalAuthoringApplyOperation operation,
            List<string> warnings,
            TerminalAuthoringDrawingResult drawingResult,
            TerminalAuthoringResultEnvelope envelope
        )
        {
            if (string.IsNullOrWhiteSpace(operation.RouteKey) || operation.Path == null || operation.Path.Count < 2)
            {
                warnings.Add($"Route '{operation.RouteRef}' is missing a managed key or path definition.");
                AddChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            var layerName = string.Equals(operation.RouteType, "jumper", StringComparison.OrdinalIgnoreCase)
                ? JumperLayerName
                : ConductorLayerName;
            var modelSpace = GetModelSpace(transaction, document.Database);
            RemoveManagedRouteEntities(transaction, modelSpace, operation.RouteKey);

            var polyline = new Polyline();
            for (var index = 0; index < operation.Path.Count; index++)
            {
                var point = operation.Path[index];
                polyline.AddVertexAt(index, new Point2d(point.X, point.Y), 0.0, 0.0, 0.0);
            }
            polyline.Layer = layerName;
            modelSpace.AppendEntity(polyline);
            transaction.AddNewlyCreatedDBObject(polyline, true);
            AttachManagedMetadata(polyline, "route", operation.RouteKey);

            if (operation.AnnotateRef.GetValueOrDefault(true) && !string.IsNullOrWhiteSpace(operation.RouteRef))
            {
                var midPoint = operation.Path[operation.Path.Count / 2];
                var text = new DBText
                {
                    Position = new Point3d(midPoint.X, midPoint.Y, 0.0),
                    Height = 0.125,
                    TextString = operation.RouteRef,
                    Layer = layerName,
                };
                modelSpace.AppendEntity(text);
                transaction.AddNewlyCreatedDBObject(text, true);
                AttachManagedMetadata(text, "route-label", operation.RouteKey);
            }

            drawingResult.RouteUpserts += 1;
            envelope.Data.ManagedRouteUpsertCount += 1;
            AddChangeRow(envelope, drawingResult, operation, "applied");
            return true;
        }

        private static BlockTableRecord GetModelSpace(Transaction transaction, Database database)
        {
            var blockTable = (BlockTable)transaction.GetObject(database.BlockTableId, OpenMode.ForRead);
            return (BlockTableRecord)transaction.GetObject(blockTable[BlockTableRecord.ModelSpace], OpenMode.ForWrite);
        }

        private static StripBlockMatch FindStripBlock(Database database, Transaction transaction, string stripId)
        {
            var modelSpace = GetModelSpace(transaction, database);
            foreach (ObjectId entityId in modelSpace)
            {
                if (!(transaction.GetObject(entityId, OpenMode.ForRead) is BlockReference blockReference))
                {
                    continue;
                }

                var candidateStripId = TryReadStripId(blockReference, transaction);
                if (!string.Equals(candidateStripId, NormalizeText(stripId).ToUpperInvariant(), StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var labelAttributes = new Dictionary<int, AttributeReference>();
                foreach (ObjectId attributeId in blockReference.AttributeCollection)
                {
                    if (!(transaction.GetObject(attributeId, OpenMode.ForWrite) is AttributeReference attribute))
                    {
                        continue;
                    }

                    var match = TerminalLabelTagRegex.Match(NormalizeText(attribute.Tag));
                    if (!match.Success || !int.TryParse(match.Groups[1].Value, out var index) || index <= 0)
                    {
                        continue;
                    }
                    labelAttributes[index] = attribute;
                }

                var terminalCount = Math.Max(1, labelAttributes.Keys.DefaultIfEmpty(1).Max());
                var labels = Enumerable.Range(1, terminalCount)
                    .Select(index => labelAttributes.TryGetValue(index, out var attribute) ? NormalizeText(attribute.TextString) : string.Empty)
                    .ToList();

                return new StripBlockMatch
                {
                    BlockReference = blockReference,
                    LabelAttributes = labelAttributes,
                    CurrentLabels = labels,
                };
            }

            return null;
        }

        private static string TryReadStripId(BlockReference blockReference, Transaction transaction)
        {
            foreach (ObjectId attributeId in blockReference.AttributeCollection)
            {
                if (!(transaction.GetObject(attributeId, OpenMode.ForRead) is AttributeReference attribute))
                {
                    continue;
                }

                var tag = NormalizeText(attribute.Tag).ToUpperInvariant();
                if (StripIdKeys.Contains(tag, StringComparer.OrdinalIgnoreCase))
                {
                    return NormalizeText(attribute.TextString).ToUpperInvariant();
                }
            }
            return string.Empty;
        }

        private static void EnsureRegApp(Database database, Transaction transaction)
        {
            var regAppTable = (RegAppTable)transaction.GetObject(database.RegAppTableId, OpenMode.ForRead);
            if (regAppTable.Has(RegAppName))
            {
                return;
            }

            regAppTable.UpgradeOpen();
            var record = new RegAppTableRecord { Name = RegAppName };
            regAppTable.Add(record);
            transaction.AddNewlyCreatedDBObject(record, true);
        }

        private static void EnsureLayer(Database database, Transaction transaction, string layerName)
        {
            var layerTable = (LayerTable)transaction.GetObject(database.LayerTableId, OpenMode.ForRead);
            if (layerTable.Has(layerName))
            {
                return;
            }

            layerTable.UpgradeOpen();
            var record = new LayerTableRecord { Name = layerName };
            layerTable.Add(record);
            transaction.AddNewlyCreatedDBObject(record, true);
        }

        private static void RemoveManagedRouteEntities(
            Transaction transaction,
            BlockTableRecord modelSpace,
            string routeKey
        )
        {
            foreach (ObjectId entityId in modelSpace)
            {
                if (!(transaction.GetObject(entityId, OpenMode.ForRead) is Entity entity))
                {
                    continue;
                }

                if (!TryGetManagedRouteKey(entity, out var existingRouteKey) ||
                    !string.Equals(existingRouteKey, routeKey, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                entity.UpgradeOpen();
                entity.Erase();
            }
        }

        private static bool TryGetManagedRouteKey(Entity entity, out string routeKey)
        {
            routeKey = string.Empty;
            var xdata = entity.XData;
            if (xdata == null)
            {
                return false;
            }

            var values = xdata.AsArray();
            if (values == null || values.Length < 3)
            {
                return false;
            }

            var regName = values[0].Value as string;
            if (!string.Equals(regName, RegAppName, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            routeKey = NormalizeText(Convert.ToString(values[2].Value));
            return !string.IsNullOrWhiteSpace(routeKey);
        }

        private static void AttachManagedMetadata(Entity entity, string kind, string managedKey)
        {
            entity.XData = new ResultBuffer(
                new TypedValue((int)DxfCode.ExtendedDataRegAppName, RegAppName),
                new TypedValue((int)DxfCode.ExtendedDataAsciiString, kind ?? string.Empty),
                new TypedValue((int)DxfCode.ExtendedDataAsciiString, managedKey ?? string.Empty)
            );
        }

        private static List<string> NormalizeLabels(IReadOnlyList<string> labels, int terminalCount)
        {
            var count = Math.Max(1, terminalCount);
            return Enumerable.Range(0, count)
                .Select(index => index < labels.Count ? NormalizeText(labels[index]) : string.Empty)
                .ToList();
        }

        private static string FormatLabels(IReadOnlyList<string> labels)
        {
            return string.Join(
                " | ",
                labels.Select(label => string.IsNullOrWhiteSpace(label) ? "[blank]" : NormalizeText(label))
            );
        }

        private static string NormalizeText(string value)
        {
            return (value ?? string.Empty).Trim();
        }

        private static void AddChangeRow(
            TerminalAuthoringResultEnvelope envelope,
            TerminalAuthoringDrawingResult drawingResult,
            TerminalAuthoringApplyOperation operation,
            string status
        )
        {
            envelope.Data.Changes.Add(
                new TerminalAuthoringChangeRow
                {
                    DrawingName = drawingResult.DrawingName,
                    RelativePath = drawingResult.RelativePath,
                    OperationType = NormalizeText(operation.OperationType),
                    Source = NormalizeText(operation.Source),
                    StripId = NormalizeText(operation.StripId),
                    RouteRef = NormalizeText(operation.RouteRef),
                    Before = NormalizeText(operation.Before),
                    After = NormalizeText(operation.After),
                    Detail = NormalizeText(operation.Detail),
                    Status = status,
                }
            );
        }
    }
}
