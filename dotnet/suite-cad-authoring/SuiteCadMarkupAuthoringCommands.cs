using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
using Application = Autodesk.AutoCAD.ApplicationServices.Application;

namespace SuiteCadAuthoring
{
    internal sealed class MarkupAuthoringApplyPayload
    {
        public string RequestId { get; set; }
        public string ProjectId { get; set; }
        public string IssueSetId { get; set; }
        public string ProjectRootPath { get; set; }
        public List<MarkupAuthoringApplyOperation> Operations { get; set; } = new List<MarkupAuthoringApplyOperation>();
    }

    internal sealed class MarkupAuthoringManagedKeyPayload
    {
        public string Source { get; set; }
        public string EntityKind { get; set; }
        public string Value { get; set; }
        public string DrawingPath { get; set; }
    }

    internal sealed class MarkupAuthoringApplyOperation
    {
        public string ActionId { get; set; }
        public string OperationId { get; set; }
        public string MarkupId { get; set; }
        public string MarkupSnapshotId { get; set; }
        public string Category { get; set; }
        public string ContractVersion { get; set; }
        public string OperationType { get; set; }
        public string DrawingPath { get; set; }
        public string DrawingName { get; set; }
        public string RelativePath { get; set; }
        public string Before { get; set; }
        public string After { get; set; }
        public string Detail { get; set; }
        public string Text { get; set; }
        public string FieldKey { get; set; }
        public bool PreviewOnly { get; set; }
        public List<string> TargetHandleRefs { get; set; } = new List<string>();
        public List<string> Warnings { get; set; } = new List<string>();
        public MarkupAuthoringManagedKeyPayload ManagedKey { get; set; } = new MarkupAuthoringManagedKeyPayload();
        public JsonElement ExecuteTarget { get; set; }
        public JsonElement Geometry { get; set; }
        public JsonElement AnchorPoint { get; set; }
        public JsonElement Bounds { get; set; }
        public JsonElement DeleteTargets { get; set; }
        public JsonElement Markup { get; set; }
    }

    internal sealed class MarkupAuthoringResultEnvelope
    {
        public bool Success { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
        public MarkupAuthoringResultData Data { get; set; } = new MarkupAuthoringResultData();
        public List<string> Warnings { get; set; } = new List<string>();
        public Dictionary<string, object> Meta { get; set; } = new Dictionary<string, object>();
    }

    internal sealed class MarkupAuthoringResultData
    {
        public int ChangedDrawingCount { get; set; }
        public int ChangedItemCount { get; set; }
        public int TitleBlockUpdateCount { get; set; }
        public int TextReplacementCount { get; set; }
        public int TextDeleteCount { get; set; }
        public int TextSwapCount { get; set; }
        public int DimensionOverrideCount { get; set; }
        public int RevisionCloudUpsertCount { get; set; }
        public int DeltaNoteUpsertCount { get; set; }
        public int IssueTagUpsertCount { get; set; }
        public int GeometryAddCount { get; set; }
        public int GeometryDeleteCount { get; set; }
        public List<MarkupAuthoringDrawingResult> Drawings { get; set; } = new List<MarkupAuthoringDrawingResult>();
        public List<MarkupAuthoringChangeRow> Changes { get; set; } = new List<MarkupAuthoringChangeRow>();
    }

    internal sealed class MarkupAuthoringDrawingResult
    {
        public string DrawingPath { get; set; }
        public string DrawingName { get; set; }
        public string RelativePath { get; set; }
        public int TitleBlockUpdates { get; set; }
        public int TextReplacements { get; set; }
        public int TextDeletes { get; set; }
        public int TextSwaps { get; set; }
        public int DimensionOverrides { get; set; }
        public int RevisionCloudUpserts { get; set; }
        public int DeltaNoteUpserts { get; set; }
        public int IssueTagUpserts { get; set; }
        public int GeometryAdds { get; set; }
        public int GeometryDeletes { get; set; }
        public int Updated { get; set; }
        public List<string> Warnings { get; set; } = new List<string>();
    }

    internal sealed class MarkupAuthoringChangeRow
    {
        public string DrawingPath { get; set; }
        public string DrawingName { get; set; }
        public string RelativePath { get; set; }
        public string MarkupSnapshotId { get; set; }
        public string OperationId { get; set; }
        public string OperationType { get; set; }
        public string ManagedKey { get; set; }
        public string Before { get; set; }
        public string After { get; set; }
        public string Detail { get; set; }
        public string Status { get; set; }
    }

    public sealed partial class SuiteCadAuthoringCommands
    {
        private const string MarkupCloudLayerName = "SUITE_AUTODRAFT_CLOUDS";
        private const string MarkupNoteLayerName = "SUITE_AUTODRAFT_NOTES";
        private const string MarkupIssueTagLayerName = "SUITE_AUTODRAFT_TAGS";
        private const string MarkupGeometryLayerName = "SUITE_AUTODRAFT_GEOMETRY";

        [CommandMethod("SUITEMARKUPAUTHORAPPLY", CommandFlags.Session)]
        public void ApplyMarkupAuthoring()
        {
            var document = Application.DocumentManager.MdiActiveDocument;
            var editor = document?.Editor;
            if (editor == null)
            {
                return;
            }

            var payloadPrompt = editor.GetString("\nSuite markup authoring payload JSON path: ");
            if (payloadPrompt.Status != PromptStatus.OK || string.IsNullOrWhiteSpace(payloadPrompt.StringResult))
            {
                return;
            }

            var resultPrompt = editor.GetString("\nSuite markup authoring result JSON path: ");
            if (resultPrompt.Status != PromptStatus.OK || string.IsNullOrWhiteSpace(resultPrompt.StringResult))
            {
                return;
            }

            var envelope = ExecuteMarkupAuthoring(payloadPrompt.StringResult.Trim(), resultPrompt.StringResult.Trim());
            try
            {
                File.WriteAllText(resultPrompt.StringResult.Trim(), JsonSerializer.Serialize(envelope, JsonOptions));
            }
            catch (System.Exception ex)
            {
                editor.WriteMessage($"\n[Suite] Failed to write markup authoring result file: {ex.Message}");
            }

            editor.WriteMessage($"\n[Suite] {envelope.Message}");
        }

        private static MarkupAuthoringResultEnvelope ExecuteMarkupAuthoring(string payloadPath, string resultPath)
        {
            if (!Path.IsPathRooted(payloadPath))
            {
                return BuildMarkupFailure("INVALID_REQUEST", "Payload path must be absolute.");
            }
            if (!File.Exists(payloadPath))
            {
                return BuildMarkupFailure("INVALID_REQUEST", $"Payload file was not found: {payloadPath}");
            }
            if (!Path.IsPathRooted(resultPath))
            {
                return BuildMarkupFailure("INVALID_REQUEST", "Result path must be absolute.");
            }

            MarkupAuthoringApplyPayload payload;
            try
            {
                payload = JsonSerializer.Deserialize<MarkupAuthoringApplyPayload>(File.ReadAllText(payloadPath), JsonOptions);
            }
            catch (System.Exception ex)
            {
                return BuildMarkupFailure("INVALID_REQUEST", $"Unable to parse payload JSON: {ex.Message}");
            }

            if (payload == null || payload.Operations == null || payload.Operations.Count == 0)
            {
                return BuildMarkupFailure("INVALID_REQUEST", "Payload did not contain any operations.");
            }

            var envelope = new MarkupAuthoringResultEnvelope
            {
                Success = true,
                Code = string.Empty,
                Message = "Bluebeam markup authoring apply completed.",
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
                ProcessMarkupDrawingGroup(drawingGroup.Key, drawingGroup.ToList(), envelope);
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
                $"Applied Bluebeam markup authoring across {envelope.Data.ChangedDrawingCount} drawing(s): " +
                $"{envelope.Data.ChangedItemCount} write(s), {envelope.Data.RevisionCloudUpsertCount} cloud upsert(s), " +
                $"{envelope.Data.DeltaNoteUpsertCount + envelope.Data.IssueTagUpsertCount} note/tag upsert(s).";
            return envelope;
        }

        private static void ProcessMarkupDrawingGroup(
            string drawingPath,
            List<MarkupAuthoringApplyOperation> operations,
            MarkupAuthoringResultEnvelope envelope
        )
        {
            var drawingWarnings = new List<string>();
            var drawingResult = new MarkupAuthoringDrawingResult
            {
                DrawingPath = drawingPath,
                DrawingName = NormalizeText(operations[0].DrawingName) == string.Empty
                    ? Path.GetFileName(drawingPath)
                    : operations[0].DrawingName,
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
                    EnsureLayer(document.Database, transaction, MarkupCloudLayerName);
                    EnsureLayer(document.Database, transaction, MarkupNoteLayerName);
                    EnsureLayer(document.Database, transaction, MarkupIssueTagLayerName);
                    EnsureLayer(document.Database, transaction, MarkupGeometryLayerName);

                    foreach (var operation in operations)
                    {
                        try
                        {
                            if (operation.PreviewOnly)
                            {
                                AddMarkupWarning(drawingWarnings, operation, "Operation is preview-only and cannot be applied.");
                                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-preview-only");
                                continue;
                            }

                            if (operation.Warnings != null && operation.Warnings.Count > 0)
                            {
                                foreach (var warning in operation.Warnings)
                                {
                                    AddMarkupWarning(drawingWarnings, operation, warning);
                                }
                            }

                            if (ApplyMarkupOperation(document, transaction, operation, drawingWarnings, drawingResult, envelope))
                            {
                                drawingChanged = true;
                            }
                        }
                        catch (System.Exception ex)
                        {
                            AddMarkupWarning(drawingWarnings, operation, $"Apply failed: {ex.Message}");
                            AddMarkupChangeRow(envelope, drawingResult, operation, "failed");
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
                drawingResult.Updated =
                    drawingResult.TitleBlockUpdates
                    + drawingResult.TextReplacements
                    + drawingResult.TextDeletes
                    + drawingResult.TextSwaps
                    + drawingResult.DimensionOverrides
                    + drawingResult.RevisionCloudUpserts
                    + drawingResult.DeltaNoteUpserts
                    + drawingResult.IssueTagUpserts
                    + drawingResult.GeometryAdds
                    + drawingResult.GeometryDeletes;
                drawingResult.Warnings = drawingWarnings;
                envelope.Data.Drawings.Add(drawingResult);
                envelope.Warnings.AddRange(drawingWarnings);

                if (document != null && openedByPlugin)
                {
                    try
                    {
                        document.CloseAndDiscard();
                    }
                    catch
                    {
                        // Best effort cleanup.
                    }
                }
            }
        }

        private static bool ApplyMarkupOperation(
            Document document,
            Transaction transaction,
            MarkupAuthoringApplyOperation operation,
            List<string> warnings,
            MarkupAuthoringDrawingResult drawingResult,
            MarkupAuthoringResultEnvelope envelope
        )
        {
            var operationType = NormalizeText(operation.OperationType).ToLowerInvariant();
            switch (operationType)
            {
                case "title-block-update":
                    return ApplyTitleBlockUpdate(document.Database, transaction, operation, warnings, drawingResult, envelope);
                case "text-replace":
                    return ApplyTextReplace(document.Database, transaction, operation, warnings, drawingResult, envelope);
                case "text-delete":
                    return ApplyTextDelete(document.Database, transaction, operation, warnings, drawingResult, envelope);
                case "text-swap":
                    return ApplyTextSwap(document.Database, transaction, operation, warnings, drawingResult, envelope);
                case "dimension-override":
                    return ApplyDimensionOverride(document.Database, transaction, operation, warnings, drawingResult, envelope);
                case "delta-note-upsert":
                    return ApplyManagedNoteUpsert(document.Database, transaction, operation, warnings, drawingResult, envelope, issueTag: false);
                case "issue-tag-upsert":
                    return ApplyManagedNoteUpsert(document.Database, transaction, operation, warnings, drawingResult, envelope, issueTag: true);
                case "revision-cloud-upsert":
                    return ApplyManagedRevisionCloudUpsert(document.Database, transaction, operation, warnings, drawingResult, envelope);
                case "geometry-add":
                    return ApplyManagedGeometryAdd(document.Database, transaction, operation, warnings, drawingResult, envelope);
                case "geometry-delete":
                    return ApplyGeometryDelete(document.Database, transaction, operation, warnings, drawingResult, envelope);
                default:
                    AddMarkupWarning(warnings, operation, $"Unsupported markup operation '{operation.OperationType}'.");
                    AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-unsupported");
                    return false;
            }
        }

        private static bool ApplyTitleBlockUpdate(
            Database database,
            Transaction transaction,
            MarkupAuthoringApplyOperation operation,
            List<string> warnings,
            MarkupAuthoringDrawingResult drawingResult,
            MarkupAuthoringResultEnvelope envelope
        )
        {
            var targetValue = ReadOperationTargetValue(operation);
            if (string.IsNullOrWhiteSpace(targetValue))
            {
                AddMarkupWarning(warnings, operation, "Title block update is missing a target value.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            var attributeTags = ReadJsonStringArray(operation.ExecuteTarget, "attribute_tags", "attributeTags")
                .Select(tag => NormalizeText(tag).ToUpperInvariant())
                .Where(tag => !string.IsNullOrWhiteSpace(tag))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (attributeTags.Count <= 0)
            {
                var fieldKey = NormalizeText(operation.FieldKey);
                if (!string.IsNullOrWhiteSpace(fieldKey))
                {
                    attributeTags.Add(fieldKey.ToUpperInvariant());
                }
            }
            if (attributeTags.Count <= 0)
            {
                AddMarkupWarning(warnings, operation, "Title block update is missing attribute tag metadata.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            var blockNameHint = ReadJsonString(operation.ExecuteTarget, "block_name_hint", "blockNameHint");
            var candidates = FindTitleBlockCandidates(database, transaction, attributeTags, blockNameHint);
            var selection = SelectTitleBlockCandidate(candidates);
            if (!selection.Found)
            {
                AddMarkupWarning(warnings, operation, "Title block candidate could not be resolved from the drawing.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-missing");
                return false;
            }

            if (selection.HasAmbiguousBestMatch)
            {
                AddMarkupWarning(warnings, operation, "Title block update resolved to multiple candidate blocks and was skipped.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-ambiguous");
                return false;
            }

            var selected = selection.Selected!;
            var expectedCurrentValue = ReadExpectedCurrentValue(operation, "current_value");
            var currentValues = selected.Attributes
                .Select(attribute => NormalizeText(attribute.TextString))
                .Distinct(StringComparer.Ordinal)
                .ToList();
            var currentValue = currentValues.FirstOrDefault() ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(expectedCurrentValue)
                && !string.Equals(currentValue, expectedCurrentValue, StringComparison.Ordinal))
            {
                AddMarkupWarning(
                    warnings,
                    operation,
                    $"Title block target changed after preview. Expected '{expectedCurrentValue}' but found '{currentValue}'."
                );
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-stale");
                return false;
            }

            var changed = false;
            foreach (var attribute in selected.Attributes)
            {
                changed |= ApplySharedTitleBlockAttributeValue(attribute, targetValue, warnings);
            }

            if (!changed)
            {
                AddMarkupChangeRow(envelope, drawingResult, operation, "unchanged");
                return false;
            }

            selected.BlockReference.UpgradeOpen();
            RecordMarkupApply("title-block-update", drawingResult, envelope);
            AddMarkupChangeRow(envelope, drawingResult, operation, "applied");
            return true;
        }

        private static bool ApplyTextReplace(
            Database database,
            Transaction transaction,
            MarkupAuthoringApplyOperation operation,
            List<string> warnings,
            MarkupAuthoringDrawingResult drawingResult,
            MarkupAuthoringResultEnvelope envelope
        )
        {
            if (!TryResolveTargetTextEntity(database, transaction, operation, warnings, drawingResult, envelope, out var entity, out var currentValue))
            {
                return false;
            }

            var desiredValue = ReadOperationTargetValue(operation);
            if (string.IsNullOrWhiteSpace(desiredValue))
            {
                AddMarkupWarning(warnings, operation, "Text replace is missing a target value.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            var expectedCurrentValue = ReadExpectedCurrentValue(operation, "current_value");
            if (!string.IsNullOrWhiteSpace(expectedCurrentValue)
                && !string.Equals(currentValue, expectedCurrentValue, StringComparison.Ordinal))
            {
                AddMarkupWarning(
                    warnings,
                    operation,
                    $"Text target changed after preview. Expected '{expectedCurrentValue}' but found '{currentValue}'."
                );
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-stale");
                return false;
            }

            if (string.Equals(currentValue, desiredValue, StringComparison.Ordinal))
            {
                AddMarkupChangeRow(envelope, drawingResult, operation, "unchanged");
                return false;
            }

            if (!WriteEntityTextValue(entity, desiredValue))
            {
                AddMarkupChangeRow(envelope, drawingResult, operation, "unchanged");
                return false;
            }

            RecordMarkupApply("text-replace", drawingResult, envelope);
            AddMarkupChangeRow(envelope, drawingResult, operation, "applied");
            return true;
        }

        private static bool ApplyTextDelete(
            Database database,
            Transaction transaction,
            MarkupAuthoringApplyOperation operation,
            List<string> warnings,
            MarkupAuthoringDrawingResult drawingResult,
            MarkupAuthoringResultEnvelope envelope
        )
        {
            if (!TryResolveTargetTextEntity(database, transaction, operation, warnings, drawingResult, envelope, out var entity, out var currentValue))
            {
                return false;
            }

            var expectedCurrentValue = ReadExpectedCurrentValue(operation, "current_value");
            if (!string.IsNullOrWhiteSpace(expectedCurrentValue)
                && !string.Equals(currentValue, expectedCurrentValue, StringComparison.Ordinal))
            {
                AddMarkupWarning(
                    warnings,
                    operation,
                    $"Text target changed after preview. Expected '{expectedCurrentValue}' but found '{currentValue}'."
                );
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-stale");
                return false;
            }

            entity.UpgradeOpen();
            entity.Erase();
            RecordMarkupApply("text-delete", drawingResult, envelope);
            AddMarkupChangeRow(envelope, drawingResult, operation, "applied");
            return true;
        }

        private static bool ApplyTextSwap(
            Database database,
            Transaction transaction,
            MarkupAuthoringApplyOperation operation,
            List<string> warnings,
            MarkupAuthoringDrawingResult drawingResult,
            MarkupAuthoringResultEnvelope envelope
        )
        {
            var handles = (operation.TargetHandleRefs ?? new List<string>())
                .Where(handle => !string.IsNullOrWhiteSpace(handle))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (handles.Count < 2)
            {
                AddMarkupWarning(warnings, operation, "Text swap requires two explicit target handles.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            if (!TryResolveEntityByHandle(database, transaction, handles[0], OpenMode.ForWrite, out var firstEntity)
                || !TryResolveEntityByHandle(database, transaction, handles[1], OpenMode.ForWrite, out var secondEntity))
            {
                AddMarkupWarning(warnings, operation, "Text swap target handle could not be resolved.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-missing");
                return false;
            }
            if (!TryReadEntityTextValue(firstEntity, out var firstValue)
                || !TryReadEntityTextValue(secondEntity, out var secondValue))
            {
                AddMarkupWarning(warnings, operation, "Text swap target is not a supported text entity.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            var expectedFirst = ReadExpectedCurrentValue(operation, "first_current_value");
            var expectedSecond = ReadExpectedCurrentValue(operation, "second_current_value");
            if (!string.IsNullOrWhiteSpace(expectedFirst)
                && !string.Equals(firstValue, expectedFirst, StringComparison.Ordinal))
            {
                AddMarkupWarning(
                    warnings,
                    operation,
                    $"First swap target changed after preview. Expected '{expectedFirst}' but found '{firstValue}'."
                );
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-stale");
                return false;
            }
            if (!string.IsNullOrWhiteSpace(expectedSecond)
                && !string.Equals(secondValue, expectedSecond, StringComparison.Ordinal))
            {
                AddMarkupWarning(
                    warnings,
                    operation,
                    $"Second swap target changed after preview. Expected '{expectedSecond}' but found '{secondValue}'."
                );
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-stale");
                return false;
            }

            if (string.Equals(firstValue, secondValue, StringComparison.Ordinal))
            {
                AddMarkupChangeRow(envelope, drawingResult, operation, "unchanged");
                return false;
            }

            WriteEntityTextValue(firstEntity, secondValue);
            WriteEntityTextValue(secondEntity, firstValue);
            RecordMarkupApply("text-swap", drawingResult, envelope);
            AddMarkupChangeRow(envelope, drawingResult, operation, "applied");
            return true;
        }

        private static bool ApplyDimensionOverride(
            Database database,
            Transaction transaction,
            MarkupAuthoringApplyOperation operation,
            List<string> warnings,
            MarkupAuthoringDrawingResult drawingResult,
            MarkupAuthoringResultEnvelope envelope
        )
        {
            var handle = (operation.TargetHandleRefs ?? new List<string>())
                .FirstOrDefault(entry => !string.IsNullOrWhiteSpace(entry));
            if (string.IsNullOrWhiteSpace(handle))
            {
                AddMarkupWarning(warnings, operation, "Dimension override requires an explicit target handle.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            if (!TryResolveEntityByHandle(database, transaction, handle, OpenMode.ForWrite, out var entity)
                || entity is not Dimension dimension)
            {
                AddMarkupWarning(warnings, operation, $"Dimension target '{handle}' could not be resolved.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-missing");
                return false;
            }

            var currentValue = NormalizeText(dimension.DimensionText);
            var expectedCurrentValue = ReadExpectedCurrentValue(operation, "current_value");
            if (!string.IsNullOrWhiteSpace(expectedCurrentValue)
                && !string.Equals(currentValue, expectedCurrentValue, StringComparison.Ordinal))
            {
                AddMarkupWarning(
                    warnings,
                    operation,
                    $"Dimension target changed after preview. Expected '{expectedCurrentValue}' but found '{currentValue}'."
                );
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-stale");
                return false;
            }

            var desiredValue = ReadOperationTargetValue(operation);
            if (string.IsNullOrWhiteSpace(desiredValue))
            {
                AddMarkupWarning(warnings, operation, "Dimension override is missing a target value.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            if (string.Equals(currentValue, desiredValue, StringComparison.Ordinal))
            {
                AddMarkupChangeRow(envelope, drawingResult, operation, "unchanged");
                return false;
            }

            dimension.UpgradeOpen();
            dimension.DimensionText = desiredValue;
            RecordMarkupApply("dimension-override", drawingResult, envelope);
            AddMarkupChangeRow(envelope, drawingResult, operation, "applied");
            return true;
        }

        private static bool ApplyManagedNoteUpsert(
            Database database,
            Transaction transaction,
            MarkupAuthoringApplyOperation operation,
            List<string> warnings,
            MarkupAuthoringDrawingResult drawingResult,
            MarkupAuthoringResultEnvelope envelope,
            bool issueTag
        )
        {
            var managedKey = ResolveManagedKeyValue(operation);
            if (string.IsNullOrWhiteSpace(managedKey))
            {
                AddMarkupWarning(warnings, operation, "Managed note upsert is missing a managed key.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }
            if (!TryReadPoint(operation.AnchorPoint, out var anchorPoint))
            {
                AddMarkupWarning(warnings, operation, "Managed note upsert is missing an anchor point.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            var noteText = NormalizeText(operation.Text);
            if (string.IsNullOrWhiteSpace(noteText))
            {
                noteText = ReadJsonString(operation.Markup, "text");
            }
            if (string.IsNullOrWhiteSpace(noteText))
            {
                AddMarkupWarning(warnings, operation, "Managed note upsert is missing note text.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            RemoveManagedEntitiesByKey(database, transaction, managedKey);
            var modelSpace = GetModelSpace(transaction, database);
            var note = new MText
            {
                Location = anchorPoint,
                Layer = issueTag ? MarkupIssueTagLayerName : MarkupNoteLayerName,
                Contents = ToMTextContent(noteText),
                TextHeight = issueTag ? 0.18 : 0.125,
                Attachment = AttachmentPoint.MiddleLeft,
            };
            modelSpace.AppendEntity(note);
            transaction.AddNewlyCreatedDBObject(note, true);
            AttachManagedMetadata(note, issueTag ? "issue-tag" : "note", managedKey);

            RecordMarkupApply(issueTag ? "issue-tag-upsert" : "delta-note-upsert", drawingResult, envelope);
            AddMarkupChangeRow(envelope, drawingResult, operation, "applied");
            return true;
        }

        private static bool ApplyManagedRevisionCloudUpsert(
            Database database,
            Transaction transaction,
            MarkupAuthoringApplyOperation operation,
            List<string> warnings,
            MarkupAuthoringDrawingResult drawingResult,
            MarkupAuthoringResultEnvelope envelope
        )
        {
            var managedKey = ResolveManagedKeyValue(operation);
            if (string.IsNullOrWhiteSpace(managedKey))
            {
                AddMarkupWarning(warnings, operation, "Revision cloud upsert is missing a managed key.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            RemoveManagedEntitiesByKey(database, transaction, managedKey);
            var created = CreateManagedGeometryEntities(
                database,
                transaction,
                operation,
                managedKey,
                MarkupCloudLayerName,
                "revision-cloud",
                fallbackToBounds: true,
                warnings: warnings
            );
            if (!created)
            {
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            RecordMarkupApply("revision-cloud-upsert", drawingResult, envelope);
            AddMarkupChangeRow(envelope, drawingResult, operation, "applied");
            return true;
        }

        private static bool ApplyManagedGeometryAdd(
            Database database,
            Transaction transaction,
            MarkupAuthoringApplyOperation operation,
            List<string> warnings,
            MarkupAuthoringDrawingResult drawingResult,
            MarkupAuthoringResultEnvelope envelope
        )
        {
            var managedKey = ResolveManagedKeyValue(operation);
            if (string.IsNullOrWhiteSpace(managedKey))
            {
                AddMarkupWarning(warnings, operation, "Geometry add is missing a managed key.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            RemoveManagedEntitiesByKey(database, transaction, managedKey);
            var created = CreateManagedGeometryEntities(
                database,
                transaction,
                operation,
                managedKey,
                MarkupGeometryLayerName,
                "geometry",
                fallbackToBounds: false,
                warnings: warnings
            );
            if (!created)
            {
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            RecordMarkupApply("geometry-add", drawingResult, envelope);
            AddMarkupChangeRow(envelope, drawingResult, operation, "applied");
            return true;
        }

        private static bool ApplyGeometryDelete(
            Database database,
            Transaction transaction,
            MarkupAuthoringApplyOperation operation,
            List<string> warnings,
            MarkupAuthoringDrawingResult drawingResult,
            MarkupAuthoringResultEnvelope envelope
        )
        {
            var handles = (operation.TargetHandleRefs ?? new List<string>())
                .Where(handle => !string.IsNullOrWhiteSpace(handle))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (handles.Count <= 0)
            {
                AddMarkupWarning(warnings, operation, "Geometry delete requires explicit resolved CAD targets.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            var expectedTypes = ReadDeleteTargetTypeMap(operation.DeleteTargets);
            var deleted = 0;
            foreach (var handle in handles)
            {
                if (!TryResolveEntityByHandle(database, transaction, handle, OpenMode.ForWrite, out var entity))
                {
                    AddMarkupWarning(warnings, operation, $"Delete target '{handle}' could not be resolved.");
                    continue;
                }

                if (expectedTypes.TryGetValue(handle, out var expectedType))
                {
                    var actualType = NormalizeText(entity.GetType().Name);
                    if (!string.IsNullOrWhiteSpace(expectedType)
                        && !actualType.Contains(expectedType, StringComparison.OrdinalIgnoreCase))
                    {
                        AddMarkupWarning(
                            warnings,
                            operation,
                            $"Delete target '{handle}' changed type after preview. Expected '{expectedType}' but found '{actualType}'."
                        );
                        continue;
                    }
                }

                entity.UpgradeOpen();
                entity.Erase();
                deleted += 1;
            }

            if (deleted <= 0)
            {
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-missing");
                return false;
            }

            RecordMarkupApply("geometry-delete", drawingResult, envelope);
            AddMarkupChangeRow(envelope, drawingResult, operation, "applied");
            return true;
        }

        private static bool TryResolveTargetTextEntity(
            Database database,
            Transaction transaction,
            MarkupAuthoringApplyOperation operation,
            List<string> warnings,
            MarkupAuthoringDrawingResult drawingResult,
            MarkupAuthoringResultEnvelope envelope,
            out Entity entity,
            out string currentValue
        )
        {
            entity = null;
            currentValue = string.Empty;

            var handle = (operation.TargetHandleRefs ?? new List<string>())
                .FirstOrDefault(entry => !string.IsNullOrWhiteSpace(entry));
            if (string.IsNullOrWhiteSpace(handle))
            {
                AddMarkupWarning(warnings, operation, "Text operation requires an explicit target handle.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            if (!TryResolveEntityByHandle(database, transaction, handle, OpenMode.ForWrite, out entity))
            {
                AddMarkupWarning(warnings, operation, $"Text target '{handle}' could not be resolved.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-missing");
                return false;
            }

            if (!TryReadEntityTextValue(entity, out currentValue))
            {
                AddMarkupWarning(warnings, operation, $"Target '{handle}' is not a supported text entity.");
                AddMarkupChangeRow(envelope, drawingResult, operation, "skipped-invalid");
                return false;
            }

            return true;
        }

        private static bool TryResolveEntityByHandle(
            Database database,
            Transaction transaction,
            string handleText,
            OpenMode openMode,
            out Entity entity
        )
        {
            entity = null;
            if (!TryResolveObjectIdByHandle(database, handleText, out var objectId))
            {
                return false;
            }

            try
            {
                entity = transaction.GetObject(objectId, openMode, false) as Entity;
            }
            catch
            {
                entity = null;
            }
            return entity != null;
        }

        private static bool TryResolveObjectIdByHandle(Database database, string handleText, out ObjectId objectId)
        {
            objectId = ObjectId.Null;
            var normalizedHandle = NormalizeText(handleText);
            if (string.IsNullOrWhiteSpace(normalizedHandle))
            {
                return false;
            }

            if (!long.TryParse(normalizedHandle, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var handleValue))
            {
                return false;
            }

            try
            {
                objectId = database.GetObjectId(false, new Handle(handleValue), 0);
                return !objectId.IsNull;
            }
            catch
            {
                objectId = ObjectId.Null;
                return false;
            }
        }

        private static bool TryReadEntityTextValue(Entity entity, out string value)
        {
            switch (entity)
            {
                case AttributeReference attributeReference:
                    value = NormalizeText(attributeReference.TextString);
                    return true;
                case DBText dbText:
                    value = NormalizeText(dbText.TextString);
                    return true;
                case MText mText:
                    value = NormalizeText(mText.Contents);
                    return true;
                default:
                    value = string.Empty;
                    return false;
            }
        }

        private static bool WriteEntityTextValue(Entity entity, string value)
        {
            var nextValue = value ?? string.Empty;
            switch (entity)
            {
                case AttributeReference attributeReference:
                    if (string.Equals(NormalizeText(attributeReference.TextString), NormalizeText(nextValue), StringComparison.Ordinal))
                    {
                        return false;
                    }
                    attributeReference.UpgradeOpen();
                    attributeReference.TextString = nextValue;
                    return true;
                case DBText dbText:
                    if (string.Equals(NormalizeText(dbText.TextString), NormalizeText(nextValue), StringComparison.Ordinal))
                    {
                        return false;
                    }
                    dbText.UpgradeOpen();
                    dbText.TextString = nextValue;
                    return true;
                case MText mText:
                    if (string.Equals(NormalizeText(mText.Contents), NormalizeText(nextValue), StringComparison.Ordinal))
                    {
                        return false;
                    }
                    mText.UpgradeOpen();
                    mText.Contents = ToMTextContent(nextValue);
                    return true;
                default:
                    return false;
            }
        }

        private static string ToMTextContent(string value)
        {
            return (value ?? string.Empty)
                .Replace("\r\n", "\\P")
                .Replace("\n", "\\P")
                .Replace("\r", "\\P");
        }

        private static string ReadExpectedCurrentValue(MarkupAuthoringApplyOperation operation, string executeTargetKey)
        {
            var expected = ReadJsonString(operation.ExecuteTarget, executeTargetKey);
            if (!string.IsNullOrWhiteSpace(expected))
            {
                return expected;
            }
            return NormalizeText(operation.Before);
        }

        private static string ReadOperationTargetValue(MarkupAuthoringApplyOperation operation)
        {
            var targetValue = ReadJsonString(operation.ExecuteTarget, "target_value", "targetValue");
            if (!string.IsNullOrWhiteSpace(targetValue))
            {
                return targetValue;
            }
            if (!string.IsNullOrWhiteSpace(operation.After))
            {
                return NormalizeText(operation.After);
            }
            return NormalizeText(operation.Text);
        }

        private static List<TitleBlockCandidate> FindTitleBlockCandidates(
            Database database,
            Transaction transaction,
            IReadOnlyCollection<string> attributeTags,
            string blockNameHint
        )
        {
            var normalizedHint = NormalizeText(blockNameHint).ToUpperInvariant();
            var candidates = new List<TitleBlockCandidate>();
            foreach (var blockReference in EnumerateLayoutBlockReferences(database, transaction))
            {
                var matchingAttributes = new List<AttributeReference>();
                var attributesByTag = new Dictionary<string, AttributeReference>(StringComparer.OrdinalIgnoreCase);
                foreach (ObjectId attributeId in blockReference.AttributeCollection)
                {
                    if (!(transaction.GetObject(attributeId, OpenMode.ForWrite) is AttributeReference attribute))
                    {
                        continue;
                    }
                    var tag = NormalizeText(attribute.Tag).ToUpperInvariant();
                    if (attributeTags.Contains(tag, StringComparer.OrdinalIgnoreCase))
                    {
                        matchingAttributes.Add(attribute);
                        attributesByTag[tag] = attribute;
                    }
                }

                if (matchingAttributes.Count <= 0)
                {
                    continue;
                }

                var blockName = NormalizeText(blockReference.Name);
                var hintMatch = !string.IsNullOrWhiteSpace(normalizedHint)
                    && blockName.ToUpperInvariant().Contains(normalizedHint, StringComparison.OrdinalIgnoreCase);
                var owner = (BlockTableRecord)transaction.GetObject(blockReference.OwnerId, OpenMode.ForRead);
                var paperSpaceScore = owner.IsLayout && !string.Equals(owner.Name, BlockTableRecord.ModelSpace, StringComparison.OrdinalIgnoreCase)
                    ? 1
                    : 0;
                var score = (hintMatch ? 100 : 0) + (paperSpaceScore * 10) + matchingAttributes.Count;
                candidates.Add(
                    new TitleBlockCandidate
                    {
                        BlockReference = blockReference,
                        Attributes = matchingAttributes,
                        AttributesByTag = attributesByTag,
                        BlockName = blockName,
                        LayoutName = NormalizeText(owner.Name),
                        Handle = ResolveTitleBlockHandle(blockReference),
                        IsPaperSpace = paperSpaceScore > 0,
                        Score = score,
                    }
                );
            }

            return candidates;
        }

        internal static TitleBlockCandidateSelectionResult SelectTitleBlockCandidate(
            IReadOnlyList<TitleBlockCandidate> candidates
        )
        {
            if (candidates == null || candidates.Count <= 0)
            {
                return new TitleBlockCandidateSelectionResult(null, false, false);
            }

            var descriptorSelection = SelectTitleBlockCandidateDescriptor(
                candidates.Select(candidate =>
                    new TitleBlockCandidateDescriptor(
                        candidate.Score,
                        candidate.LayoutName,
                        candidate.BlockName,
                        candidate.Handle,
                        candidate.IsPaperSpace))
                    .ToArray()
            );

            return new TitleBlockCandidateSelectionResult(
                descriptorSelection.Found ? candidates[descriptorSelection.SelectedIndex] : null,
                descriptorSelection.Found,
                descriptorSelection.HasAmbiguousBestMatch
            );
        }

        internal static TitleBlockCandidateDescriptorSelectionResult SelectTitleBlockCandidateDescriptor(
            IReadOnlyList<TitleBlockCandidateDescriptor> candidates
        )
        {
            if (candidates == null || candidates.Count <= 0)
            {
                return new TitleBlockCandidateDescriptorSelectionResult(-1, false, false);
            }

            var bestScore = candidates.Max(candidate => candidate.Score);
            var bestCandidates = candidates
                .Select((candidate, index) => new { Candidate = candidate, Index = index })
                .Where(entry => entry.Candidate.Score == bestScore)
                .OrderByDescending(entry => entry.Candidate.IsPaperSpace)
                .ThenBy(entry => entry.Candidate.LayoutName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(entry => entry.Candidate.BlockName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(entry => entry.Candidate.Handle, StringComparer.OrdinalIgnoreCase)
                .ToList();

            return new TitleBlockCandidateDescriptorSelectionResult(
                bestCandidates[0].Index,
                found: true,
                hasAmbiguousBestMatch: bestCandidates.Count > 1
            );
        }

        private static bool ApplySharedTitleBlockAttributeValue(
            AttributeReference attribute,
            string targetValue,
            List<string> warnings
        )
        {
            if (string.Equals(NormalizeText(attribute.TextString), targetValue, StringComparison.Ordinal))
            {
                return false;
            }

            attribute.UpgradeOpen();
            attribute.TextString = targetValue;
            return true;
        }

        private static string ResolveTitleBlockHandle(BlockReference blockReference)
        {
            try
            {
                return NormalizeText(blockReference.Handle.ToString());
            }
            catch
            {
                return string.Empty;
            }
        }

        private static IEnumerable<BlockReference> EnumerateLayoutBlockReferences(Database database, Transaction transaction)
        {
            var blockTable = (BlockTable)transaction.GetObject(database.BlockTableId, OpenMode.ForRead);
            foreach (ObjectId blockTableRecordId in blockTable)
            {
                if (!(transaction.GetObject(blockTableRecordId, OpenMode.ForRead) is BlockTableRecord blockTableRecord))
                {
                    continue;
                }
                if (!blockTableRecord.IsLayout)
                {
                    continue;
                }

                foreach (ObjectId entityId in blockTableRecord)
                {
                    if (transaction.GetObject(entityId, OpenMode.ForRead) is BlockReference blockReference)
                    {
                        yield return blockReference;
                    }
                }
            }
        }

        private static void RemoveManagedEntitiesByKey(Database database, Transaction transaction, string managedKey)
        {
            foreach (var entity in EnumerateLayoutEntities(database, transaction))
            {
                if (!TryGetManagedMetadata(entity, out _, out var existingManagedKey)
                    || !string.Equals(existingManagedKey, managedKey, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                entity.UpgradeOpen();
                entity.Erase();
            }
        }

        private static IEnumerable<Entity> EnumerateLayoutEntities(Database database, Transaction transaction)
        {
            var blockTable = (BlockTable)transaction.GetObject(database.BlockTableId, OpenMode.ForRead);
            foreach (ObjectId blockTableRecordId in blockTable)
            {
                if (!(transaction.GetObject(blockTableRecordId, OpenMode.ForRead) is BlockTableRecord blockTableRecord))
                {
                    continue;
                }
                if (!blockTableRecord.IsLayout)
                {
                    continue;
                }

                foreach (ObjectId entityId in blockTableRecord)
                {
                    if (transaction.GetObject(entityId, OpenMode.ForRead) is Entity entity)
                    {
                        yield return entity;
                    }
                }
            }
        }

        private static bool TryGetManagedMetadata(Entity entity, out string kind, out string managedKey)
        {
            kind = string.Empty;
            managedKey = string.Empty;
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

            kind = NormalizeText(Convert.ToString(values[1].Value));
            managedKey = NormalizeText(Convert.ToString(values[2].Value));
            return !string.IsNullOrWhiteSpace(managedKey);
        }

        private static bool CreateManagedGeometryEntities(
            Database database,
            Transaction transaction,
            MarkupAuthoringApplyOperation operation,
            string managedKey,
            string layerName,
            string metadataKind,
            bool fallbackToBounds,
            List<string> warnings
        )
        {
            var modelSpace = GetModelSpace(transaction, database);
            var created = false;

            var geometryKind = ReadJsonString(operation.Geometry, "kind");
            if (string.Equals(geometryKind, "line", StringComparison.OrdinalIgnoreCase))
            {
                var points = ReadJsonPointList(operation.Geometry, "points");
                if (points.Count >= 2)
                {
                    var line = new Line(points[0], points[points.Count - 1]) { Layer = layerName };
                    modelSpace.AppendEntity(line);
                    transaction.AddNewlyCreatedDBObject(line, true);
                    AttachManagedMetadata(line, metadataKind, managedKey);
                    created = true;
                }
            }
            else if (string.Equals(geometryKind, "polyline", StringComparison.OrdinalIgnoreCase))
            {
                var points = ReadJsonPointList(operation.Geometry, "points");
                if (points.Count >= 2)
                {
                    var polyline = BuildPolyline(points, ReadJsonBool(operation.Geometry, "closed"));
                    polyline.Layer = layerName;
                    modelSpace.AppendEntity(polyline);
                    transaction.AddNewlyCreatedDBObject(polyline, true);
                    AttachManagedMetadata(polyline, metadataKind, managedKey);
                    created = true;
                }
            }
            else if (string.Equals(geometryKind, "circle", StringComparison.OrdinalIgnoreCase))
            {
                if (TryReadPoint(operation.Geometry, "center", out var center))
                {
                    var radius = ReadJsonDouble(operation.Geometry, "radius");
                    if (radius > 0)
                    {
                        var circle = new Circle(center, Vector3d.ZAxis, radius) { Layer = layerName };
                        modelSpace.AppendEntity(circle);
                        transaction.AddNewlyCreatedDBObject(circle, true);
                        AttachManagedMetadata(circle, metadataKind, managedKey);
                        created = true;
                    }
                }
            }
            else if (string.Equals(geometryKind, "ink", StringComparison.OrdinalIgnoreCase))
            {
                foreach (var stroke in ReadJsonStrokePointLists(operation.Geometry, "strokes"))
                {
                    if (stroke.Count < 2)
                    {
                        continue;
                    }
                    var polyline = BuildPolyline(stroke, closed: false);
                    polyline.Layer = layerName;
                    modelSpace.AppendEntity(polyline);
                    transaction.AddNewlyCreatedDBObject(polyline, true);
                    AttachManagedMetadata(polyline, metadataKind, managedKey);
                    created = true;
                }
            }
            else if (string.Equals(geometryKind, "arc", StringComparison.OrdinalIgnoreCase))
            {
                if (TryReadPoint(operation.Geometry, "center", out var center))
                {
                    var radius = ReadJsonDouble(operation.Geometry, "radius");
                    var startAngle = ReadJsonDouble(operation.Geometry, "startAngle");
                    var endAngle = ReadJsonDouble(operation.Geometry, "endAngle");
                    if (radius > 0)
                    {
                        var arc = new Arc(center, radius, startAngle, endAngle) { Layer = layerName };
                        modelSpace.AppendEntity(arc);
                        transaction.AddNewlyCreatedDBObject(arc, true);
                        AttachManagedMetadata(arc, metadataKind, managedKey);
                        created = true;
                    }
                }
            }

            if (!created && fallbackToBounds && TryReadBounds(operation.Bounds, out var bounds))
            {
                var points = new List<Point3d>
                {
                    new Point3d(bounds.MinX, bounds.MinY, 0.0),
                    new Point3d(bounds.MaxX, bounds.MinY, 0.0),
                    new Point3d(bounds.MaxX, bounds.MaxY, 0.0),
                    new Point3d(bounds.MinX, bounds.MaxY, 0.0),
                    new Point3d(bounds.MinX, bounds.MinY, 0.0),
                };
                var polyline = BuildPolyline(points, closed: true);
                polyline.Layer = layerName;
                modelSpace.AppendEntity(polyline);
                transaction.AddNewlyCreatedDBObject(polyline, true);
                AttachManagedMetadata(polyline, metadataKind, managedKey);
                created = true;
            }

            if (!created)
            {
                AddMarkupWarning(warnings, operation, "Operation did not include supported explicit geometry.");
            }

            return created;
        }

        private static Polyline BuildPolyline(IReadOnlyList<Point3d> points, bool closed)
        {
            var polyline = new Polyline();
            for (var index = 0; index < points.Count; index++)
            {
                polyline.AddVertexAt(index, new Point2d(points[index].X, points[index].Y), 0.0, 0.0, 0.0);
            }
            polyline.Closed = closed;
            return polyline;
        }

        private static string ResolveManagedKeyValue(MarkupAuthoringApplyOperation operation)
        {
            var managedKey = NormalizeText(operation.ManagedKey?.Value);
            if (!string.IsNullOrWhiteSpace(managedKey))
            {
                return managedKey;
            }

            var markupSnapshotId = NormalizeText(operation.MarkupSnapshotId);
            var operationId = NormalizeText(operation.OperationId);
            if (!string.IsNullOrWhiteSpace(markupSnapshotId) && !string.IsNullOrWhiteSpace(operationId))
            {
                return $"{markupSnapshotId}:{operationId}";
            }
            if (!string.IsNullOrWhiteSpace(operationId))
            {
                return operationId;
            }
            return NormalizeText(operation.MarkupId);
        }

        private static void RecordMarkupApply(
            string operationType,
            MarkupAuthoringDrawingResult drawingResult,
            MarkupAuthoringResultEnvelope envelope
        )
        {
            envelope.Data.ChangedItemCount += 1;
            switch (operationType)
            {
                case "title-block-update":
                    drawingResult.TitleBlockUpdates += 1;
                    envelope.Data.TitleBlockUpdateCount += 1;
                    break;
                case "text-replace":
                    drawingResult.TextReplacements += 1;
                    envelope.Data.TextReplacementCount += 1;
                    break;
                case "text-delete":
                    drawingResult.TextDeletes += 1;
                    envelope.Data.TextDeleteCount += 1;
                    break;
                case "text-swap":
                    drawingResult.TextSwaps += 1;
                    envelope.Data.TextSwapCount += 1;
                    break;
                case "dimension-override":
                    drawingResult.DimensionOverrides += 1;
                    envelope.Data.DimensionOverrideCount += 1;
                    break;
                case "revision-cloud-upsert":
                    drawingResult.RevisionCloudUpserts += 1;
                    envelope.Data.RevisionCloudUpsertCount += 1;
                    break;
                case "delta-note-upsert":
                    drawingResult.DeltaNoteUpserts += 1;
                    envelope.Data.DeltaNoteUpsertCount += 1;
                    break;
                case "issue-tag-upsert":
                    drawingResult.IssueTagUpserts += 1;
                    envelope.Data.IssueTagUpsertCount += 1;
                    break;
                case "geometry-add":
                    drawingResult.GeometryAdds += 1;
                    envelope.Data.GeometryAddCount += 1;
                    break;
                case "geometry-delete":
                    drawingResult.GeometryDeletes += 1;
                    envelope.Data.GeometryDeleteCount += 1;
                    break;
            }
        }

        private static void AddMarkupWarning(List<string> warnings, MarkupAuthoringApplyOperation operation, string message)
        {
            var normalizedMessage = NormalizeText(message);
            if (string.IsNullOrWhiteSpace(normalizedMessage))
            {
                return;
            }

            var operationId = NormalizeText(operation.OperationId);
            warnings.Add(string.IsNullOrWhiteSpace(operationId) ? normalizedMessage : $"[{operationId}] {normalizedMessage}");
        }

        private static void AddMarkupChangeRow(
            MarkupAuthoringResultEnvelope envelope,
            MarkupAuthoringDrawingResult drawingResult,
            MarkupAuthoringApplyOperation operation,
            string status
        )
        {
            envelope.Data.Changes.Add(
                new MarkupAuthoringChangeRow
                {
                    DrawingPath = drawingResult.DrawingPath,
                    DrawingName = drawingResult.DrawingName,
                    RelativePath = drawingResult.RelativePath,
                    MarkupSnapshotId = NormalizeText(operation.MarkupSnapshotId),
                    OperationId = NormalizeText(operation.OperationId),
                    OperationType = NormalizeText(operation.OperationType),
                    ManagedKey = ResolveManagedKeyValue(operation),
                    Before = NormalizeText(operation.Before),
                    After = NormalizeText(operation.After),
                    Detail = NormalizeText(operation.Detail),
                    Status = status,
                }
            );
        }

        private static MarkupAuthoringResultEnvelope BuildMarkupFailure(string code, string message)
        {
            return new MarkupAuthoringResultEnvelope
            {
                Success = false,
                Code = code,
                Message = message,
            };
        }

        private static string ReadJsonString(JsonElement element, params string[] propertyNames)
        {
            if (element.ValueKind != JsonValueKind.Object)
            {
                return string.Empty;
            }

            foreach (var propertyName in propertyNames)
            {
                if (string.IsNullOrWhiteSpace(propertyName))
                {
                    continue;
                }
                if (element.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String)
                {
                    return NormalizeText(property.GetString());
                }
            }

            return string.Empty;
        }

        private static bool ReadJsonBool(JsonElement element, string propertyName)
        {
            if (element.ValueKind == JsonValueKind.Object
                && element.TryGetProperty(propertyName, out var property)
                && (property.ValueKind == JsonValueKind.True || property.ValueKind == JsonValueKind.False))
            {
                return property.GetBoolean();
            }

            return false;
        }

        private static double ReadJsonDouble(JsonElement element, string propertyName)
        {
            if (element.ValueKind == JsonValueKind.Object
                && element.TryGetProperty(propertyName, out var property)
                && property.ValueKind == JsonValueKind.Number
                && property.TryGetDouble(out var value))
            {
                return value;
            }

            return 0.0;
        }

        private static List<string> ReadJsonStringArray(JsonElement element, params string[] propertyNames)
        {
            foreach (var propertyName in propertyNames)
            {
                if (element.ValueKind == JsonValueKind.Object
                    && element.TryGetProperty(propertyName, out var property)
                    && property.ValueKind == JsonValueKind.Array)
                {
                    return property
                        .EnumerateArray()
                        .Where(entry => entry.ValueKind == JsonValueKind.String)
                        .Select(entry => NormalizeText(entry.GetString()))
                        .Where(entry => !string.IsNullOrWhiteSpace(entry))
                        .ToList();
                }
            }

            return new List<string>();
        }

        private static bool TryReadPoint(JsonElement element, out Point3d point)
        {
            point = Point3d.Origin;
            if (element.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            if (!element.TryGetProperty("x", out var xValue)
                || !element.TryGetProperty("y", out var yValue)
                || !xValue.TryGetDouble(out var x)
                || !yValue.TryGetDouble(out var y))
            {
                return false;
            }

            point = new Point3d(x, y, 0.0);
            return true;
        }

        private static bool TryReadPoint(JsonElement element, string propertyName, out Point3d point)
        {
            point = Point3d.Origin;
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property))
            {
                return false;
            }

            return TryReadPoint(property, out point);
        }

        private static List<Point3d> ReadJsonPointList(JsonElement element, string propertyName)
        {
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property))
            {
                return new List<Point3d>();
            }

            return ReadJsonPointList(property);
        }

        private static List<Point3d> ReadJsonPointList(JsonElement element)
        {
            var points = new List<Point3d>();
            if (element.ValueKind != JsonValueKind.Array)
            {
                return points;
            }

            foreach (var entry in element.EnumerateArray())
            {
                if (TryReadPoint(entry, out var point))
                {
                    points.Add(point);
                }
            }
            return points;
        }

        private static List<List<Point3d>> ReadJsonStrokePointLists(JsonElement element, string propertyName)
        {
            var strokes = new List<List<Point3d>>();
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property))
            {
                return strokes;
            }
            if (property.ValueKind != JsonValueKind.Array)
            {
                return strokes;
            }

            foreach (var stroke in property.EnumerateArray())
            {
                var points = ReadJsonPointList(stroke);
                if (points.Count > 0)
                {
                    strokes.Add(points);
                }
            }
            return strokes;
        }

        private static bool TryReadBounds(JsonElement element, out Bounds2d bounds)
        {
            bounds = default;
            if (element.ValueKind != JsonValueKind.Object)
            {
                return false;
            }
            if (!element.TryGetProperty("x", out var xValue)
                || !element.TryGetProperty("y", out var yValue)
                || !element.TryGetProperty("width", out var widthValue)
                || !element.TryGetProperty("height", out var heightValue)
                || !xValue.TryGetDouble(out var x)
                || !yValue.TryGetDouble(out var y)
                || !widthValue.TryGetDouble(out var width)
                || !heightValue.TryGetDouble(out var height))
            {
                return false;
            }

            bounds = new Bounds2d(new Point2d(x, y), new Point2d(x + width, y + height));
            return true;
        }

        private static Dictionary<string, string> ReadDeleteTargetTypeMap(JsonElement deleteTargets)
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (deleteTargets.ValueKind != JsonValueKind.Array)
            {
                return map;
            }

            foreach (var entry in deleteTargets.EnumerateArray())
            {
                if (entry.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var id = ReadJsonString(entry, "id");
                if (string.IsNullOrWhiteSpace(id))
                {
                    continue;
                }

                map[id] = ReadJsonString(entry, "entity_type", "entityType", "type");
            }

            return map;
        }

        internal readonly struct TitleBlockCandidateSelectionResult
        {
            internal TitleBlockCandidateSelectionResult(
                TitleBlockCandidate? selected,
                bool found,
                bool hasAmbiguousBestMatch
            )
            {
                Selected = selected;
                Found = found;
                HasAmbiguousBestMatch = hasAmbiguousBestMatch;
            }

            internal TitleBlockCandidate? Selected { get; }

            internal bool Found { get; }

            internal bool HasAmbiguousBestMatch { get; }
        }

        internal readonly struct TitleBlockCandidateDescriptor
        {
            internal TitleBlockCandidateDescriptor(
                int score,
                string layoutName,
                string blockName,
                string handle,
                bool isPaperSpace
            )
            {
                Score = score;
                LayoutName = layoutName ?? string.Empty;
                BlockName = blockName ?? string.Empty;
                Handle = handle ?? string.Empty;
                IsPaperSpace = isPaperSpace;
            }

            internal int Score { get; }

            internal string LayoutName { get; }

            internal string BlockName { get; }

            internal string Handle { get; }

            internal bool IsPaperSpace { get; }
        }

        internal readonly struct TitleBlockCandidateDescriptorSelectionResult
        {
            internal TitleBlockCandidateDescriptorSelectionResult(
                int selectedIndex,
                bool found,
                bool hasAmbiguousBestMatch
            )
            {
                SelectedIndex = selectedIndex;
                Found = found;
                HasAmbiguousBestMatch = hasAmbiguousBestMatch;
            }

            internal int SelectedIndex { get; }

            internal bool Found { get; }

            internal bool HasAmbiguousBestMatch { get; }
        }

        internal sealed class TitleBlockCandidate
        {
            public BlockReference BlockReference { get; set; }
            public List<AttributeReference> Attributes { get; set; } = new List<AttributeReference>();
            public Dictionary<string, AttributeReference> AttributesByTag { get; set; } = new Dictionary<string, AttributeReference>(StringComparer.OrdinalIgnoreCase);
            public string BlockName { get; set; } = string.Empty;
            public string LayoutName { get; set; } = string.Empty;
            public string Handle { get; set; } = string.Empty;
            public bool IsPaperSpace { get; set; }
            public int Score { get; set; }
        }

        private readonly struct Bounds2d
        {
            public Bounds2d(Point2d min, Point2d max)
            {
                Min = min;
                Max = max;
            }

            public Point2d Min { get; }
            public Point2d Max { get; }
            public double MinX => Min.X;
            public double MinY => Min.Y;
            public double MaxX => Max.X;
            public double MaxY => Max.Y;
        }
    }
}
