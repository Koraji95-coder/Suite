using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Application = Autodesk.AutoCAD.ApplicationServices.Application;

namespace SuiteCadAuthoring
{
    internal static partial class SuiteCadBatchFindReplacePipeActions
    {
        internal static JsonObject? HandleAction(string action, JsonObject payload)
        {
            switch (action)
            {
                case "suite_batch_find_replace_preview":
                    return SuiteCadPipeHost.InvokeOnApplicationThread(
                        () => SuiteCadAuthoringCommands.ExecuteBatchFindReplacePipePreview(
                            payload.DeepClone() as JsonObject ?? new JsonObject()
                        )
                    );
                case "suite_batch_find_replace_project_preview":
                    return SuiteCadPipeHost.InvokeOnApplicationThread(
                        () => SuiteCadAuthoringCommands.ExecuteBatchFindReplaceProjectPipePreview(
                            payload.DeepClone() as JsonObject ?? new JsonObject()
                        )
                    );
                case "suite_batch_find_replace_apply":
                    return SuiteCadPipeHost.InvokeOnApplicationThread(
                        () => SuiteCadAuthoringCommands.ExecuteBatchFindReplacePipeApply(
                            payload.DeepClone() as JsonObject ?? new JsonObject()
                        )
                    );
                case "suite_batch_find_replace_project_apply":
                    return SuiteCadPipeHost.InvokeOnApplicationThread(
                        () => SuiteCadAuthoringCommands.ExecuteBatchFindReplaceProjectPipeApply(
                            payload.DeepClone() as JsonObject ?? new JsonObject()
                        )
                    );
                default:
                    return null;
            }
        }
    }

    public sealed partial class SuiteCadAuthoringCommands
    {
        private readonly record struct BatchFindReplaceProjectDrawing(
            string DrawingPath,
            string RelativePath,
            string DrawingName
        );

        internal static JsonObject ExecuteBatchFindReplacePipeApply(JsonObject payload)
        {
            var requestId = ReadPipeString(payload, "requestId");
            if (payload["matches"] is not JsonArray matchesArray || matchesArray.Count <= 0)
            {
                return BuildBatchFindReplacePipeFailure(
                    "suite_batch_find_replace_apply",
                    "INVALID_REQUEST",
                    "matches must contain at least one preview row.",
                    requestId
                );
            }

            return ExecuteBatchFindReplaceActiveApply(matchesArray, requestId);
        }

        private static JsonObject ExecuteBatchFindReplaceActiveApply(
            JsonArray matchesArray,
            string requestId
        )
        {
            var document = Application.DocumentManager.MdiActiveDocument;
            if (document is null)
            {
                return BuildBatchFindReplacePipeFailure(
                    "suite_batch_find_replace_apply",
                    "AUTOCAD_NOT_READY",
                    "An active AutoCAD drawing is required for CAD batch apply.",
                    requestId
                );
            }

            var drawingPath = GetDocumentPath(document);
            var drawingName = Path.GetFileName(drawingPath);
            if (string.IsNullOrWhiteSpace(drawingName))
            {
                drawingName = NormalizeText(document.Name);
            }

            var drawing = new BatchFindReplaceProjectDrawing(
                DrawingPath: drawingPath,
                RelativePath: string.Empty,
                DrawingName: drawingName
            );
            var warnings = new List<string>();
            var changeRows = new JsonArray();
            var updated = 0;

            try
            {
                using (document.LockDocument())
                using (var transaction = document.Database.TransactionManager.StartTransaction())
                {
                    foreach (var node in matchesArray)
                    {
                        if (node is not JsonObject match)
                        {
                            continue;
                        }

                        if (
                            ApplyBatchFindReplaceMatch(
                                document.Database,
                                transaction,
                                match,
                                drawing,
                                warnings,
                                changeRows
                            )
                        )
                        {
                            updated += 1;
                        }
                    }

                    transaction.Commit();
                }

                if (updated > 0 && !string.IsNullOrWhiteSpace(drawing.DrawingPath))
                {
                    try
                    {
                        document.Database.SaveAs(drawing.DrawingPath, DwgVersion.Current);
                    }
                    catch (Exception ex)
                    {
                        warnings.Add($"Save failed for '{drawing.DrawingPath}': {ex.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                return BuildBatchFindReplacePipeFailure(
                    "suite_batch_find_replace_apply",
                    "APPLY_FAILED",
                    $"CAD batch apply failed: {ex.Message}",
                    requestId
                );
            }

            return BuildBatchFindReplacePipeResult(
                action: "suite_batch_find_replace_apply",
                success: true,
                code: string.Empty,
                message: "CAD batch apply completed.",
                data: new JsonObject
                {
                    ["drawingName"] = drawing.DrawingName,
                    ["updated"] = updated,
                    ["changedDrawingCount"] = updated > 0 ? 1 : 0,
                    ["changedItemCount"] = updated,
                    ["changes"] = changeRows,
                },
                warnings: warnings,
                requestId: requestId,
                configureMeta: meta => meta["updated"] = updated
            );
        }

        internal static JsonObject ExecuteBatchFindReplaceProjectPipeApply(JsonObject payload)
        {
            var requestId = ReadPipeString(payload, "requestId");
            if (payload["matches"] is not JsonArray matchesArray || matchesArray.Count <= 0)
            {
                return BuildBatchFindReplacePipeFailure(
                    "suite_batch_find_replace_project_apply",
                    "INVALID_REQUEST",
                    "matches must contain at least one preview row.",
                    requestId
                );
            }

            var groupedMatches = new Dictionary<string, List<JsonObject>>(StringComparer.OrdinalIgnoreCase);
            var drawingContextByPath = new Dictionary<string, BatchFindReplaceProjectDrawing>(
                StringComparer.OrdinalIgnoreCase
            );
            var warnings = new List<string>();

            foreach (var node in matchesArray)
            {
                if (node is not JsonObject match)
                {
                    continue;
                }

                var drawingPath = ReadPipeString(match, "drawingPath");
                if (string.IsNullOrWhiteSpace(drawingPath))
                {
                    warnings.Add(
                        "Skipped one project CAD apply row because it was missing drawingPath."
                    );
                    continue;
                }

                if (!groupedMatches.TryGetValue(drawingPath, out var drawingMatches))
                {
                    drawingMatches = new List<JsonObject>();
                    groupedMatches[drawingPath] = drawingMatches;
                }

                drawingMatches.Add(match);
                if (!drawingContextByPath.ContainsKey(drawingPath))
                {
                    var relativePath = ReadPipeString(match, "relativePath");
                    var drawingName = ReadPipeString(match, "drawingName");
                    if (string.IsNullOrWhiteSpace(drawingName))
                    {
                        drawingName = ReadPipeString(match, "file");
                    }

                    if (string.IsNullOrWhiteSpace(drawingName))
                    {
                        drawingName = Path.GetFileName(drawingPath);
                    }

                    drawingContextByPath[drawingPath] = new BatchFindReplaceProjectDrawing(
                        DrawingPath: drawingPath,
                        RelativePath: relativePath,
                        DrawingName: drawingName
                    );
                }
            }

            if (groupedMatches.Count <= 0)
            {
                return BuildBatchFindReplacePipeFailure(
                    "suite_batch_find_replace_project_apply",
                    "INVALID_REQUEST",
                    "matches must contain at least one preview row with drawingPath.",
                    requestId
                );
            }

            return ExecuteBatchFindReplaceProjectApply(
                groupedMatches,
                drawingContextByPath,
                warnings,
                requestId
            );
        }

        private static JsonObject ExecuteBatchFindReplaceProjectApply(
            Dictionary<string, List<JsonObject>> groupedMatches,
            Dictionary<string, BatchFindReplaceProjectDrawing> drawingContextByPath,
            List<string> warnings,
            string requestId
        )
        {
            var startingDocument = Application.DocumentManager.MdiActiveDocument;
            var changeRows = new JsonArray();
            var drawingResults = new JsonArray();
            var updated = 0;
            var changedDrawingCount = 0;

            foreach (
                var drawingPath in groupedMatches.Keys.OrderBy(
                    path => path,
                    StringComparer.OrdinalIgnoreCase
                )
            )
            {
                var drawing = drawingContextByPath[drawingPath];
                var drawingWarnings = new List<string>();
                var drawingUpdated = 0;
                var drawingSkipped = 0;
                var drawingChanged = false;
                var document = default(Document);
                var openedByPlugin = false;
                try
                {
                    document = OpenOrReuseDocument(drawingPath, out openedByPlugin);
                    Application.DocumentManager.MdiActiveDocument = document;

                    using (document.LockDocument())
                    using (var transaction = document.Database.TransactionManager.StartTransaction())
                    {
                        foreach (var match in groupedMatches[drawingPath])
                        {
                            if (
                                ApplyBatchFindReplaceMatch(
                                    document.Database,
                                    transaction,
                                    match,
                                    drawing,
                                    drawingWarnings,
                                    changeRows
                                )
                            )
                            {
                                drawingUpdated += 1;
                                updated += 1;
                                drawingChanged = true;
                            }
                            else
                            {
                                drawingSkipped += 1;
                            }
                        }

                        transaction.Commit();
                    }

                    if (drawingChanged)
                    {
                        try
                        {
                            document.Database.SaveAs(drawing.DrawingPath, DwgVersion.Current);
                        }
                        catch (Exception ex)
                        {
                            drawingWarnings.Add(
                                $"Save failed for '{drawing.DrawingPath}': {ex.Message}"
                            );
                        }
                    }
                }
                catch (Exception ex)
                {
                    drawingWarnings.Add($"Apply failed for '{drawing.DrawingPath}': {ex.Message}");
                    drawingSkipped += groupedMatches[drawingPath].Count;
                }
                finally
                {
                    if (drawingUpdated > 0)
                    {
                        changedDrawingCount += 1;
                    }

                    foreach (var warning in drawingWarnings)
                    {
                        warnings.Add(warning);
                    }

                    drawingResults.Add(
                        new JsonObject
                        {
                            ["drawingPath"] = drawing.DrawingPath,
                            ["drawingName"] = drawing.DrawingName,
                            ["relativePath"] = string.IsNullOrWhiteSpace(drawing.RelativePath)
                                ? null
                                : drawing.RelativePath,
                            ["updated"] = drawingUpdated,
                            ["skipped"] = drawingSkipped,
                            ["warnings"] = ToBatchJsonArray(drawingWarnings),
                        }
                    );

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

            return BuildBatchFindReplacePipeResult(
                action: "suite_batch_find_replace_project_apply",
                success: true,
                code: string.Empty,
                message: "Project CAD batch apply completed.",
                data: new JsonObject
                {
                    ["updated"] = updated,
                    ["changedDrawingCount"] = changedDrawingCount,
                    ["changedItemCount"] = updated,
                    ["drawings"] = drawingResults,
                    ["changes"] = changeRows,
                },
                warnings: warnings,
                requestId: requestId,
                configureMeta: meta =>
                {
                    meta["drawingCount"] = groupedMatches.Count;
                    meta["updated"] = updated;
                }
            );
        }

        private static bool ApplyBatchFindReplaceMatch(
            Database database,
            Transaction transaction,
            JsonObject match,
            BatchFindReplaceProjectDrawing drawing,
            List<string> warnings,
            JsonArray changeRows
        )
        {
            var handle = ReadPipeString(match, "handle").ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(handle))
            {
                warnings.Add(
                    $"Skipped one row for '{drawing.DrawingName}' because handle was missing."
                );
                return false;
            }

            var entityType = ReadPipeString(match, "entityType");
            var attributeTag = ReadPipeString(match, "attributeTag").ToUpperInvariant();
            var currentValue = ReadPipeString(match, "currentValue");
            var nextValue = ReadPipeString(match, "nextValue");
            var ruleId = ReadPipeString(match, "ruleId");

            if (
                !TryResolveEntityByHandle(
                    database,
                    transaction,
                    handle,
                    OpenMode.ForWrite,
                    out var entity
                )
            )
            {
                warnings.Add($"Target entity '{handle}' was not found.");
                return false;
            }

            if (string.Equals(entityType, "AttributeReference", StringComparison.OrdinalIgnoreCase))
            {
                if (!TryResolveBatchAttributeTarget(entity, transaction, attributeTag, out var attribute))
                {
                    warnings.Add(
                        $"Attribute '{attributeTag}' was not found on block handle {handle}."
                    );
                    return false;
                }

                var previousAttributeValue = NormalizeText(attribute.TextString);
                if (!string.Equals(previousAttributeValue, currentValue, StringComparison.Ordinal))
                {
                    warnings.Add(
                        $"Skipped attribute {attributeTag} on handle {handle} because the current value changed."
                    );
                    return false;
                }

                if (!WriteEntityTextValue(attribute, nextValue))
                {
                    return false;
                }

                changeRows.Add(
                    BuildBatchFindReplaceChangeRow(
                        drawing,
                        ruleId,
                        currentValue,
                        nextValue,
                        handle,
                        entityType,
                        attributeTag
                    )
                );
                return true;
            }

            if (!TryReadBatchComparableText(entity, out var previousValue))
            {
                warnings.Add($"Target '{handle}' is not a supported text entity.");
                return false;
            }

            if (!string.Equals(previousValue, currentValue, StringComparison.Ordinal))
            {
                warnings.Add($"Skipped handle {handle} because the current value changed.");
                return false;
            }

            if (
                entity is MText mText
                && HasFormattedMTextContents(mText)
                && !string.Equals(NormalizeText(mText.Contents), previousValue, StringComparison.Ordinal)
            )
            {
                warnings.Add(
                    $"Skipped MText handle {handle} because it contains formatting codes and cannot be safely rewritten."
                );
                return false;
            }

            if (!WriteEntityTextValue(entity, nextValue))
            {
                return false;
            }

            changeRows.Add(
                BuildBatchFindReplaceChangeRow(
                    drawing,
                    ruleId,
                    currentValue,
                    nextValue,
                    handle,
                    entityType,
                    attributeTag
                )
            );
            return true;
        }

        private static bool TryResolveBatchAttributeTarget(
            Entity entity,
            Transaction transaction,
            string attributeTag,
            out AttributeReference attribute
        )
        {
            attribute = null;

            if (entity is AttributeReference attributeReference)
            {
                attribute = attributeReference;
                return true;
            }

            if (entity is not BlockReference blockReference)
            {
                return false;
            }

            foreach (ObjectId attributeId in blockReference.AttributeCollection)
            {
                if (transaction.GetObject(attributeId, OpenMode.ForWrite) is not AttributeReference candidate)
                {
                    continue;
                }

                if (
                    string.Equals(
                        NormalizeText(candidate.Tag).ToUpperInvariant(),
                        attributeTag,
                        StringComparison.Ordinal
                    )
                )
                {
                    attribute = candidate;
                    return true;
                }
            }

            return false;
        }

        private static bool TryReadBatchComparableText(Entity entity, out string value)
        {
            switch (entity)
            {
                case MText mText:
                    // Autodesk's managed API exposes plain-text MText through Text; Contents is still the write surface.
                    value = NormalizeText(mText.Text);
                    return true;
                default:
                    return TryReadEntityTextValue(entity, out value);
            }
        }

        private static bool HasFormattedMTextContents(MText mText)
        {
            var rawContents = NormalizeText(mText.Contents);
            return rawContents.Contains("\\", StringComparison.Ordinal)
                || rawContents.Contains("{", StringComparison.Ordinal)
                || rawContents.Contains("}", StringComparison.Ordinal);
        }

        private static JsonObject BuildBatchFindReplaceChangeRow(
            BatchFindReplaceProjectDrawing drawing,
            string ruleId,
            string before,
            string after,
            string handle,
            string entityType,
            string attributeTag
        )
        {
            return new JsonObject
            {
                ["file"] = drawing.DrawingName,
                ["line"] = 0,
                ["ruleId"] = ruleId,
                ["before"] = before,
                ["after"] = after,
                ["handle"] = handle,
                ["entityType"] = entityType,
                ["attributeTag"] = string.IsNullOrWhiteSpace(attributeTag) ? null : attributeTag,
                ["drawingPath"] = drawing.DrawingPath,
                ["drawingName"] = drawing.DrawingName,
                ["relativePath"] = string.IsNullOrWhiteSpace(drawing.RelativePath)
                    ? null
                    : drawing.RelativePath,
            };
        }

        private static JsonObject BuildBatchFindReplacePipeFailure(
            string action,
            string code,
            string message,
            string requestId
        )
        {
            return BuildBatchFindReplacePipeResult(
                action: action,
                success: false,
                code: code,
                message: message,
                data: new JsonObject(),
                warnings: Array.Empty<string>(),
                requestId: requestId
            );
        }

        private static JsonObject BuildBatchFindReplacePipeResult(
            string action,
            bool success,
            string code,
            string message,
            JsonObject data,
            IEnumerable<string> warnings,
            string requestId,
            Action<JsonObject>? configureMeta = null
        )
        {
            var meta = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet+inproc",
                ["action"] = action,
            };
            if (!string.IsNullOrWhiteSpace(requestId))
            {
                meta["requestId"] = requestId;
            }

            configureMeta?.Invoke(meta);
            return new JsonObject
            {
                ["success"] = success,
                ["code"] = code,
                ["message"] = message,
                ["data"] = data,
                ["meta"] = meta,
                ["warnings"] = ToBatchJsonArray(warnings),
            };
        }

        private static JsonArray ToBatchJsonArray(IEnumerable<string> warnings)
        {
            var array = new JsonArray();
            foreach (var warning in warnings.Where(warning => !string.IsNullOrWhiteSpace(warning)))
            {
                array.Add(warning);
            }

            return array;
        }
    }
}
