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
        private readonly record struct BatchFindReplaceRule(
            string Id,
            Regex Pattern,
            string Replacement,
            bool UseRegex,
            bool MatchCase
        );

        private readonly record struct BatchFindReplaceTextTarget(
            string Handle,
            string EntityType,
            string LayoutName,
            string BlockName,
            string AttributeTag,
            string CurrentValue
        );

        internal static JsonObject ExecuteBatchFindReplacePipePreview(JsonObject payload)
        {
            var requestId = ReadPipeString(payload, "requestId");
            var rules = ReadBatchFindReplaceRules(payload, out var validationError);
            if (!string.IsNullOrWhiteSpace(validationError))
            {
                return BuildBatchFindReplacePipeFailure(
                    "suite_batch_find_replace_preview",
                    "INVALID_REQUEST",
                    validationError,
                    requestId
                );
            }

            var document = Application.DocumentManager.MdiActiveDocument;
            if (document is null)
            {
                return BuildBatchFindReplacePipeFailure(
                    "suite_batch_find_replace_preview",
                    "AUTOCAD_NOT_READY",
                    "An active AutoCAD drawing is required for CAD batch preview.",
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
            var matches = new JsonArray();
            var warnings = new List<string>();

            try
            {
                using (document.LockDocument())
                using (var transaction = document.Database.TransactionManager.StartTransaction())
                {
                    foreach (
                        var target in EnumerateBatchFindReplaceTargets(
                            document.Database,
                            transaction,
                            warnings
                        )
                    )
                    {
                        var currentValue = target.CurrentValue;
                        foreach (var rule in rules)
                        {
                            var nextValue = rule.Pattern.Replace(currentValue, rule.Replacement);
                            if (string.Equals(currentValue, nextValue, StringComparison.Ordinal))
                            {
                                continue;
                            }

                            matches.Add(
                                BuildBatchFindReplacePreviewMatch(
                                    drawing,
                                    target,
                                    rule,
                                    currentValue,
                                    nextValue
                                )
                            );
                            currentValue = nextValue;
                        }
                    }

                    transaction.Commit();
                }
            }
            catch (Exception ex)
            {
                return BuildBatchFindReplacePipeFailure(
                    "suite_batch_find_replace_preview",
                    "PREVIEW_FAILED",
                    $"CAD batch preview failed: {ex.Message}",
                    requestId
                );
            }

            return BuildBatchFindReplacePipeResult(
                action: "suite_batch_find_replace_preview",
                success: true,
                code: string.Empty,
                message: "CAD batch preview completed.",
                data: new JsonObject
                {
                    ["drawingName"] = drawing.DrawingName,
                    ["drawings"] = new JsonArray
                    {
                        new JsonObject
                        {
                            ["drawingPath"] = drawing.DrawingPath,
                            ["drawingName"] = drawing.DrawingName,
                            ["relativePath"] = null,
                            ["matchCount"] = matches.Count,
                        },
                    },
                    ["matches"] = matches,
                },
                warnings: warnings,
                requestId: requestId,
                configureMeta: meta => meta["matchCount"] = matches.Count
            );
        }

        internal static JsonObject ExecuteBatchFindReplaceProjectPipePreview(JsonObject payload)
        {
            var requestId = ReadPipeString(payload, "requestId");
            var rules = ReadBatchFindReplaceRules(payload, out var validationError);
            if (!string.IsNullOrWhiteSpace(validationError))
            {
                return BuildBatchFindReplacePipeFailure(
                    "suite_batch_find_replace_project_preview",
                    "INVALID_REQUEST",
                    validationError,
                    requestId
                );
            }

            var drawings = ReadBatchFindReplaceProjectDrawings(payload, out validationError);
            if (!string.IsNullOrWhiteSpace(validationError))
            {
                return BuildBatchFindReplacePipeFailure(
                    "suite_batch_find_replace_project_preview",
                    "INVALID_REQUEST",
                    validationError,
                    requestId
                );
            }

            var startingDocument = Application.DocumentManager.MdiActiveDocument;
            var warnings = new List<string>();
            var matches = new JsonArray();
            var drawingsArray = new JsonArray();

            foreach (var drawing in drawings)
            {
                var drawingWarnings = new List<string>();
                var drawingMatchCount = 0;
                Document document = null;
                var openedByPlugin = false;

                try
                {
                    document = OpenOrReuseDocument(drawing.DrawingPath, out openedByPlugin);
                    Application.DocumentManager.MdiActiveDocument = document;

                    using (document.LockDocument())
                    using (var transaction = document.Database.TransactionManager.StartTransaction())
                    {
                        foreach (
                            var target in EnumerateBatchFindReplaceTargets(
                                document.Database,
                                transaction,
                                drawingWarnings
                            )
                        )
                        {
                            var currentValue = target.CurrentValue;
                            foreach (var rule in rules)
                            {
                                var nextValue = rule.Pattern.Replace(currentValue, rule.Replacement);
                                if (string.Equals(currentValue, nextValue, StringComparison.Ordinal))
                                {
                                    continue;
                                }

                                matches.Add(
                                    BuildBatchFindReplacePreviewMatch(
                                        drawing,
                                        target,
                                        rule,
                                        currentValue,
                                        nextValue
                                    )
                                );
                                drawingMatchCount += 1;
                                currentValue = nextValue;
                            }
                        }

                        transaction.Commit();
                    }
                }
                catch (Exception ex)
                {
                    drawingWarnings.Add(
                        $"Preview failed for '{drawing.DrawingPath}': {ex.Message}"
                    );
                }
                finally
                {
                    warnings.AddRange(drawingWarnings);
                    drawingsArray.Add(
                        new JsonObject
                        {
                            ["drawingPath"] = drawing.DrawingPath,
                            ["drawingName"] = drawing.DrawingName,
                            ["relativePath"] = string.IsNullOrWhiteSpace(drawing.RelativePath)
                                ? null
                                : drawing.RelativePath,
                            ["matchCount"] = drawingMatchCount,
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
                action: "suite_batch_find_replace_project_preview",
                success: true,
                code: string.Empty,
                message: "Project CAD batch preview completed.",
                data: new JsonObject
                {
                    ["matches"] = matches,
                    ["drawings"] = drawingsArray,
                },
                warnings: warnings,
                requestId: requestId,
                configureMeta: meta =>
                {
                    meta["drawingCount"] = drawings.Count;
                    meta["matchCount"] = matches.Count;
                }
            );
        }

        private static List<BatchFindReplaceRule> ReadBatchFindReplaceRules(
            JsonObject payload,
            out string validationError
        )
        {
            validationError = string.Empty;
            if (payload["rules"] is not JsonArray rulesArray || rulesArray.Count <= 0)
            {
                validationError = "rules must contain at least one replacement rule.";
                return new List<BatchFindReplaceRule>();
            }

            var rules = new List<BatchFindReplaceRule>();
            for (var index = 0; index < rulesArray.Count; index++)
            {
                if (rulesArray[index] is not JsonObject ruleObject)
                {
                    continue;
                }

                var find = ReadPipeString(ruleObject, "find");
                if (string.IsNullOrWhiteSpace(find))
                {
                    continue;
                }

                var id = ReadPipeString(ruleObject, "id");
                if (string.IsNullOrWhiteSpace(id))
                {
                    id = $"rule-{index + 1}";
                }

                var replacement = ReadPipeString(ruleObject, "replace");
                var useRegex = TryReadPipeBool(ruleObject, "useRegex");
                var matchCase = TryReadPipeBool(ruleObject, "matchCase");
                var regexOptions = matchCase ? RegexOptions.None : RegexOptions.IgnoreCase;

                try
                {
                    rules.Add(
                        new BatchFindReplaceRule(
                            Id: id,
                            Pattern: new Regex(
                                useRegex ? find : Regex.Escape(find),
                                regexOptions
                            ),
                            Replacement: replacement,
                            UseRegex: useRegex,
                            MatchCase: matchCase
                        )
                    );
                }
                catch (Exception ex)
                {
                    validationError = $"Invalid regex for rule '{id}': {ex.Message}";
                    return new List<BatchFindReplaceRule>();
                }
            }

            if (rules.Count <= 0)
            {
                validationError = "No valid rules provided.";
            }

            return rules;
        }

        private static List<BatchFindReplaceProjectDrawing> ReadBatchFindReplaceProjectDrawings(
            JsonObject payload,
            out string validationError
        )
        {
            validationError = string.Empty;
            if (payload["drawings"] is not JsonArray drawingsArray || drawingsArray.Count <= 0)
            {
                validationError = "drawings must contain at least one project drawing.";
                return new List<BatchFindReplaceProjectDrawing>();
            }

            var drawings = new List<BatchFindReplaceProjectDrawing>();
            foreach (var node in drawingsArray)
            {
                if (node is not JsonObject drawingObject)
                {
                    continue;
                }

                var drawingPath = ReadPipeString(drawingObject, "path");
                if (string.IsNullOrWhiteSpace(drawingPath))
                {
                    continue;
                }

                var relativePath = ReadPipeString(drawingObject, "relativePath");
                var drawingName = ReadPipeString(drawingObject, "drawingName");
                if (string.IsNullOrWhiteSpace(drawingName))
                {
                    drawingName = Path.GetFileName(drawingPath);
                }

                drawings.Add(
                    new BatchFindReplaceProjectDrawing(
                        DrawingPath: drawingPath,
                        RelativePath: relativePath,
                        DrawingName: drawingName
                    )
                );
            }

            if (drawings.Count <= 0)
            {
                validationError = "No valid project drawings provided.";
            }

            return drawings;
        }

        private static IEnumerable<BatchFindReplaceTextTarget> EnumerateBatchFindReplaceTargets(
            Database database,
            Transaction transaction,
            List<string> warnings
        )
        {
            var seenHandles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var entity in EnumerateLayoutEntities(database, transaction))
            {
                var handle = NormalizeText(entity.Handle.ToString()).ToUpperInvariant();
                var actualType = NormalizeText(entity.GetType().Name);
                if (string.IsNullOrWhiteSpace(handle) || !seenHandles.Add($"{actualType}:{handle}"))
                {
                    continue;
                }

                var layoutName = ResolveBatchFindReplaceLayoutName(entity, transaction);
                switch (entity)
                {
                    case DBText dbText:
                        yield return new BatchFindReplaceTextTarget(
                            Handle: handle,
                            EntityType: "DBText",
                            LayoutName: layoutName,
                            BlockName: string.Empty,
                            AttributeTag: string.Empty,
                            CurrentValue: NormalizeText(dbText.TextString)
                        );
                        break;
                    case MText mText:
                        if (HasFormattedMTextContents(mText))
                        {
                            warnings.Add(
                                $"Skipped MText handle {handle} because it contains formatting codes and cannot be safely rewritten."
                            );
                            break;
                        }

                        yield return new BatchFindReplaceTextTarget(
                            Handle: handle,
                            EntityType: "MText",
                            LayoutName: layoutName,
                            BlockName: string.Empty,
                            AttributeTag: string.Empty,
                            CurrentValue: NormalizeText(mText.Text)
                        );
                        break;
                    case BlockReference blockReference:
                        var blockName = NormalizeText(blockReference.Name);
                        foreach (ObjectId attributeId in blockReference.AttributeCollection)
                        {
                            if (
                                transaction.GetObject(attributeId, OpenMode.ForRead)
                                is not AttributeReference attribute
                            )
                            {
                                continue;
                            }

                            yield return new BatchFindReplaceTextTarget(
                                Handle: handle,
                                EntityType: "AttributeReference",
                                LayoutName: layoutName,
                                BlockName: blockName,
                                AttributeTag: NormalizeText(attribute.Tag).ToUpperInvariant(),
                                CurrentValue: NormalizeText(attribute.TextString)
                            );
                        }
                        break;
                }
            }
        }

        private static string ResolveBatchFindReplaceLayoutName(
            Entity entity,
            Transaction transaction
        )
        {
            if (
                entity.OwnerId.IsNull
                || transaction.GetObject(entity.OwnerId, OpenMode.ForRead)
                    is not BlockTableRecord owner
            )
            {
                return string.Empty;
            }

            return NormalizeText(owner.Name);
        }

        private static JsonObject BuildBatchFindReplacePreviewMatch(
            BatchFindReplaceProjectDrawing drawing,
            BatchFindReplaceTextTarget target,
            BatchFindReplaceRule rule,
            string before,
            string after
        )
        {
            var groupKey = drawing.DrawingPath.Trim();
            var matchKey = string.Join(
                "::",
                new[]
                {
                    groupKey,
                    target.Handle,
                    target.AttributeTag,
                    rule.Id,
                    before,
                    after,
                }
            );

            return new JsonObject
            {
                ["file"] = drawing.DrawingName,
                ["line"] = 0,
                ["ruleId"] = rule.Id,
                ["handle"] = target.Handle,
                ["entityType"] = target.EntityType,
                ["layoutName"] = target.LayoutName,
                ["blockName"] = string.IsNullOrWhiteSpace(target.BlockName)
                    ? null
                    : target.BlockName,
                ["attributeTag"] = string.IsNullOrWhiteSpace(target.AttributeTag)
                    ? null
                    : target.AttributeTag,
                ["before"] = before,
                ["after"] = after,
                ["currentValue"] = before,
                ["nextValue"] = after,
                ["drawingPath"] = drawing.DrawingPath,
                ["drawingName"] = drawing.DrawingName,
                ["relativePath"] = string.IsNullOrWhiteSpace(drawing.RelativePath)
                    ? null
                    : drawing.RelativePath,
                ["groupKey"] = groupKey,
                ["matchKey"] = matchKey,
            };
        }

        private static bool TryReadPipeBool(JsonObject payload, string key)
        {
            if (!payload.TryGetPropertyValue(key, out var node) || node is not JsonValue value)
            {
                return false;
            }

            if (value.TryGetValue<bool>(out var boolValue))
            {
                return boolValue;
            }

            if (value.TryGetValue<string>(out var stringValue))
            {
                return bool.TryParse(stringValue, out var parsed) && parsed;
            }

            return false;
        }
    }
}
