using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Text.Json.Nodes;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.Colors;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using Application = Autodesk.AutoCAD.ApplicationServices.Application;

namespace SuiteCadAuthoring
{
    internal static class SuiteCadDrawingCleanupPipeActions
    {
        internal static JsonObject? HandleAction(string action, JsonObject payload)
        {
            switch (action)
            {
                case "suite_drawing_cleanup_preview":
                    return SuiteCadPipeHost.InvokeOnApplicationThread(
                        () => SuiteCadAuthoringCommands.ExecuteDrawingCleanupPipePreview(
                            payload.DeepClone() as JsonObject ?? new JsonObject()
                        )
                    );
                case "suite_drawing_cleanup_apply":
                    return SuiteCadPipeHost.InvokeOnApplicationThread(
                        () => SuiteCadAuthoringCommands.ExecuteDrawingCleanupPipeApply(
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
        private sealed class DrawingCleanupConfig
        {
            public double StandardTextHeight { get; set; } = 2.5;

            public double AnnotationTextHeight { get; set; } = 1.8;

            public double MinTextHeight { get; set; } = 1.0;

            public double MaxTextHeight { get; set; } = 10.0;

            public string StandardTextStyle { get; set; } = "SUITE_CLEANUP";

            public string StandardFontFile { get; set; } = "simplex.shx";

            public double RotationSnapDegrees { get; set; } = 90.0;

            public double RotationSnapToleranceDegrees { get; set; } = 8.0;

            public double ScaleTolerance { get; set; } = 0.05;

            public double MinTextGap { get; set; } = 1.5;

            public double MinTextToLineGap { get; set; } = 1.0;

            public double NudgeDistance { get; set; } = 2.0;

            public int MaxNudgeIterations { get; set; } = 10;

            public double BoundingBoxPadding { get; set; } = 0.5;

            public string BusLayer { get; set; } = "E-BUSES";

            public string CableLayer { get; set; } = "E-CABLES";

            public string EquipmentLayer { get; set; } = "E-EQUIPMENT";

            public string TextLabelLayer { get; set; } = "E-TEXT-LABELS";

            public string AnnotationLayer { get; set; } = "E-ANNOTATIONS";

            public string DimensionLayer { get; set; } = "E-DIMENSIONS";

            public string[] ProtectedTextLayerPatterns { get; set; } =
                { "DEFPOINTS", "*TITLE*", "*TBLOCK*", "*BORDER*", "*SHEET*", "*DIM*", "*VIEWPORT*", "*XREF*" };

            public string[] ProtectedTextContentPatterns { get; set; } =
                {
                    "*DO NOT SCALE*",
                    "*DRAWN BY*",
                    "*CHECKED BY*",
                    "*APPROVED BY*",
                    "*REVISION*",
                    "*REV.*",
                    "*DWG NO*",
                    "*SHEET * OF *",
                };

            public string[] TransformerBlockPatterns { get; set; } =
                { "XFMR", "TRANS", "TRANSFORMER" };

            public string[] BreakerBlockPatterns { get; set; } =
                { "BRK", "BREAKER", "CB_" };

            public string[] MotorBlockPatterns { get; set; } =
                { "MOT", "MOTOR", "MTR_" };

            public string[] GeneratorBlockPatterns { get; set; } =
                { "GEN", "GENERATOR", "GENSET" };

            public string[] BusBlockPatterns { get; set; } =
                { "BUS", "BUSBAR", "SWGR", "SWITCHGEAR", "MCC" };
        }

        private enum DrawingCleanupEntityType
        {
            Text,
            MText,
            BlockReference,
            Line,
            Polyline,
            Circle,
            Arc,
            Dimension,
            Leader,
            Other,
        }

        private sealed class DrawingCleanupEntityInfo
        {
            public ObjectId ObjectId { get; set; }

            public Extents3d BoundingBox { get; set; }

            public DrawingCleanupEntityType EntityType { get; set; }

            public string LayerName { get; set; } = string.Empty;

            public string TextContent { get; set; } = string.Empty;

            public string BlockName { get; set; } = string.Empty;

            public Point3d Position { get; set; }

            public double Rotation { get; set; }

            public double Width =>
                BoundingBox.MaxPoint.X - BoundingBox.MinPoint.X;

            public double Height =>
                BoundingBox.MaxPoint.Y - BoundingBox.MinPoint.Y;

            public Point3d Center =>
                new Point3d(
                    (BoundingBox.MinPoint.X + BoundingBox.MaxPoint.X) / 2.0,
                    (BoundingBox.MinPoint.Y + BoundingBox.MaxPoint.Y) / 2.0,
                    0
                );

            public Extents3d GetPaddedBounds(double padding)
            {
                return new Extents3d(
                    new Point3d(
                        BoundingBox.MinPoint.X - padding,
                        BoundingBox.MinPoint.Y - padding,
                        0
                    ),
                    new Point3d(
                        BoundingBox.MaxPoint.X + padding,
                        BoundingBox.MaxPoint.Y + padding,
                        0
                    )
                );
            }

            public bool Intersects(DrawingCleanupEntityInfo other, double padding = 0)
            {
                var first = GetPaddedBounds(padding);
                var second = other.GetPaddedBounds(padding);

                return first.MinPoint.X <= second.MaxPoint.X
                    && first.MaxPoint.X >= second.MinPoint.X
                    && first.MinPoint.Y <= second.MaxPoint.Y
                    && first.MaxPoint.Y >= second.MinPoint.Y;
            }
        }

        private sealed class DrawingCleanupFixDefinition
        {
            public string Id { get; set; } = string.Empty;

            public string Label { get; set; } = string.Empty;

            public string Description { get; set; } = string.Empty;

            public int Count { get; set; }

            public bool Selected { get; set; }

            public string Kind { get; set; } = string.Empty;
        }

        private sealed class DrawingCleanupAnalysis
        {
            public string EntryMode { get; set; } = string.Empty;

            public string Preset { get; set; } = string.Empty;

            public string DrawingName { get; set; } = string.Empty;

            public string DrawingPath { get; set; } = string.Empty;

            public string OutputPath { get; set; } = string.Empty;

            public bool SaveDrawing { get; set; }

            public int DeterministicCandidateCount { get; set; }

            public int ReviewCandidateCount { get; set; }

            public int LayerCandidateCount { get; set; }

            public int BlockCandidateCount { get; set; }

            public int TextCandidateCount { get; set; }

            public int TextLayerReviewCount { get; set; }

            public int OverlapReviewCount { get; set; }

            public List<DrawingCleanupFixDefinition> DeterministicFixes { get; } =
                new List<DrawingCleanupFixDefinition>();

            public List<DrawingCleanupFixDefinition> ReviewQueue { get; } =
                new List<DrawingCleanupFixDefinition>();
        }

        private sealed class DrawingCleanupApplyOutcome
        {
            public int LayerChanges { get; set; }

            public int BlockChanges { get; set; }

            public int TextChanges { get; set; }

            public int TextLayerReviewChanges { get; set; }

            public int OverlapReviewChanges { get; set; }

            public bool Saved { get; set; }
        }

        internal static JsonObject ExecuteDrawingCleanupPipePreview(JsonObject payload)
        {
            var requestId = ReadPipeString(payload, "requestId");
            if (
                !TryReadDrawingCleanupRequest(
                    payload,
                    out var entryMode,
                    out var preset,
                    out var sourcePath,
                    out var saveDrawing,
                    out var timeoutMs,
                    out var validationError
                )
            )
            {
                return BuildDrawingCleanupFailure(
                    "suite_drawing_cleanup_preview",
                    "INVALID_REQUEST",
                    validationError,
                    requestId
                );
            }

            try
            {
                DrawingCleanupAnalysis analysis;
                if (string.Equals(entryMode, "current_drawing", StringComparison.Ordinal))
                {
                    var document = Application.DocumentManager.MdiActiveDocument;
                    if (document is null)
                    {
                        return BuildDrawingCleanupFailure(
                            "suite_drawing_cleanup_preview",
                            "AUTOCAD_NOT_READY",
                            "An active AutoCAD drawing is required for current_drawing cleanup preview.",
                            requestId
                        );
                    }

                    using (document.LockDocument())
                    using (var transaction = document.Database.TransactionManager.StartTransaction())
                    {
                        analysis = AnalyzeDrawingCleanup(
                            document.Database,
                            transaction,
                            entryMode,
                            preset,
                            GetDocumentPath(document),
                            saveDrawing
                        );
                        transaction.Commit();
                    }
                }
                else
                {
                    using (var database = new Database(false, true))
                    {
                        LoadDrawingCleanupSource(database, sourcePath);
                        using (var transaction = database.TransactionManager.StartTransaction())
                        {
                            analysis = AnalyzeDrawingCleanup(
                                database,
                                transaction,
                                entryMode,
                                preset,
                                sourcePath,
                                saveDrawing
                            );
                            transaction.Commit();
                        }
                    }
                }

                return BuildDrawingCleanupResult(
                    action: "suite_drawing_cleanup_preview",
                    success: true,
                    code: string.Empty,
                    message: analysis.DeterministicCandidateCount + analysis.ReviewCandidateCount > 0
                        ? "Drawing cleanup preview completed."
                        : "No drawing cleanup candidates were found for the selected preset.",
                    data: BuildDrawingCleanupData(
                        analysis,
                        appliedDeterministicCount: 0,
                        appliedReviewCount: 0
                    ),
                    warnings: new List<string>(),
                    requestId: requestId,
                    configureMeta: meta =>
                    {
                        meta["entryMode"] = entryMode;
                        meta["preset"] = preset;
                        meta["timeoutMs"] = timeoutMs;
                    }
                );
            }
            catch (Exception ex)
            {
                return BuildDrawingCleanupFailure(
                    "suite_drawing_cleanup_preview",
                    "PREVIEW_FAILED",
                    $"Drawing cleanup preview failed: {ex.Message}",
                    requestId
                );
            }
        }

        internal static JsonObject ExecuteDrawingCleanupPipeApply(JsonObject payload)
        {
            var requestId = ReadPipeString(payload, "requestId");
            if (
                !TryReadDrawingCleanupRequest(
                    payload,
                    out var entryMode,
                    out var preset,
                    out var sourcePath,
                    out var saveDrawing,
                    out var timeoutMs,
                    out var validationError
                )
            )
            {
                return BuildDrawingCleanupFailure(
                    "suite_drawing_cleanup_apply",
                    "INVALID_REQUEST",
                    validationError,
                    requestId
                );
            }

            var selectedFixIds = ReadCleanupSelectionIds(payload, "selectedFixIds");
            var approvedReviewIds = ReadCleanupSelectionIds(payload, "approvedReviewIds");

            try
            {
                DrawingCleanupAnalysis analysis;
                DrawingCleanupApplyOutcome outcome;
                var warnings = new List<string>();

                if (string.Equals(entryMode, "current_drawing", StringComparison.Ordinal))
                {
                    var document = Application.DocumentManager.MdiActiveDocument;
                    if (document is null)
                    {
                        return BuildDrawingCleanupFailure(
                            "suite_drawing_cleanup_apply",
                            "AUTOCAD_NOT_READY",
                            "An active AutoCAD drawing is required for current_drawing cleanup apply.",
                            requestId
                        );
                    }

                    using (document.LockDocument())
                    using (var transaction = document.Database.TransactionManager.StartTransaction())
                    {
                        analysis = AnalyzeDrawingCleanup(
                            document.Database,
                            transaction,
                            entryMode,
                            preset,
                            GetDocumentPath(document),
                            saveDrawing
                        );

                        ResolveCleanupSelections(analysis, selectedFixIds, approvedReviewIds);
                        var entities = ScanDrawingCleanupEntities(document.Database, transaction);
                        outcome = ApplyDrawingCleanup(
                            document.Database,
                            transaction,
                            entities,
                            analysis,
                            warnings
                        );

                        transaction.Commit();

                        if (saveDrawing)
                        {
                            var drawingPath = GetDocumentPath(document);
                            if (string.IsNullOrWhiteSpace(drawingPath))
                            {
                                warnings.Add("The active drawing does not have a file path, so saveDrawing was skipped.");
                            }
                            else
                            {
                                document.Database.SaveAs(drawingPath, DwgVersion.Current);
                                outcome.Saved = true;
                            }
                        }
                    }
                }
                else
                {
                    using (var database = new Database(false, true))
                    {
                        LoadDrawingCleanupSource(database, sourcePath);
                        using (var transaction = database.TransactionManager.StartTransaction())
                        {
                            analysis = AnalyzeDrawingCleanup(
                                database,
                                transaction,
                                entryMode,
                                preset,
                                sourcePath,
                                saveDrawing
                            );

                            ResolveCleanupSelections(analysis, selectedFixIds, approvedReviewIds);
                            var entities = ScanDrawingCleanupEntities(database, transaction);
                            outcome = ApplyDrawingCleanup(
                                database,
                                transaction,
                                entities,
                                analysis,
                                warnings
                            );
                            transaction.Commit();
                        }

                        if (saveDrawing)
                        {
                            if (string.IsNullOrWhiteSpace(analysis.OutputPath))
                            {
                                warnings.Add("No output path could be resolved for the imported drawing.");
                            }
                            else
                            {
                                database.SaveAs(analysis.OutputPath, DwgVersion.Current);
                                outcome.Saved = true;
                            }
                        }
                    }
                }

                var appliedDeterministicCount =
                    outcome.LayerChanges + outcome.BlockChanges + outcome.TextChanges;
                var appliedReviewCount =
                    outcome.TextLayerReviewChanges + outcome.OverlapReviewChanges;

                return BuildDrawingCleanupResult(
                    action: "suite_drawing_cleanup_apply",
                    success: true,
                    code: string.Empty,
                    message:
                        appliedDeterministicCount + appliedReviewCount > 0 || outcome.Saved
                            ? "Drawing cleanup apply completed."
                            : "Drawing cleanup apply completed with no approved changes.",
                    data: BuildDrawingCleanupData(
                        analysis,
                        appliedDeterministicCount,
                        appliedReviewCount,
                        outcome
                    ),
                    warnings: warnings,
                    requestId: requestId,
                    configureMeta: meta =>
                    {
                        meta["entryMode"] = entryMode;
                        meta["preset"] = preset;
                        meta["timeoutMs"] = timeoutMs;
                    }
                );
            }
            catch (Exception ex)
            {
                return BuildDrawingCleanupFailure(
                    "suite_drawing_cleanup_apply",
                    "APPLY_FAILED",
                    $"Drawing cleanup apply failed: {ex.Message}",
                    requestId
                );
            }
        }

        internal static bool TryReadDrawingCleanupRequest(
            JsonObject payload,
            out string entryMode,
            out string preset,
            out string sourcePath,
            out bool saveDrawing,
            out int timeoutMs,
            out string validationError
        )
        {
            validationError = string.Empty;
            entryMode = NormalizeText(ReadPipeString(payload, "entryMode")).ToLowerInvariant();
            preset = NormalizeText(ReadPipeString(payload, "preset")).ToLowerInvariant();
            sourcePath = ReadPipeString(payload, "sourcePath");
            saveDrawing = TryReadPipeBool(payload, "saveDrawing");
            timeoutMs = 90000;

            if (payload["timeoutMs"] is JsonValue timeoutNode)
            {
                if (
                    !timeoutNode.TryGetValue<int>(out timeoutMs)
                    && !int.TryParse(
                        Convert.ToString(timeoutNode, CultureInfo.InvariantCulture),
                        NumberStyles.Integer,
                        CultureInfo.InvariantCulture,
                        out timeoutMs
                    )
                )
                {
                    validationError = "timeoutMs must be an integer.";
                    return false;
                }
            }
            timeoutMs = Math.Max(1000, Math.Min(600000, timeoutMs));

            var validEntryModes = new HashSet<string>(StringComparer.Ordinal)
            {
                "current_drawing",
                "import_file",
            };
            if (!validEntryModes.Contains(entryMode))
            {
                validationError = "entryMode must be either 'current_drawing' or 'import_file'.";
                return false;
            }

            var validPresets = new HashSet<string>(StringComparer.Ordinal)
            {
                "full",
                "text",
                "blocks",
                "layers",
                "overlap",
                "import_full",
            };
            if (!validPresets.Contains(preset))
            {
                validationError =
                    "preset must be one of 'full', 'text', 'blocks', 'layers', 'overlap', or 'import_full'.";
                return false;
            }

            if (string.Equals(entryMode, "import_file", StringComparison.Ordinal))
            {
                if (string.IsNullOrWhiteSpace(sourcePath))
                {
                    validationError = "sourcePath is required when entryMode is 'import_file'.";
                    return false;
                }
                if (!Path.IsPathRooted(sourcePath))
                {
                    validationError = "sourcePath must be an absolute file path.";
                    return false;
                }
                if (!File.Exists(sourcePath))
                {
                    validationError = $"sourcePath was not found: {sourcePath}";
                    return false;
                }
                var extension = NormalizeText(Path.GetExtension(sourcePath)).ToLowerInvariant();
                if (extension != ".dxf" && extension != ".dwg")
                {
                    validationError = "sourcePath must point to a .dxf or .dwg file.";
                    return false;
                }
            }

            if (
                string.Equals(entryMode, "current_drawing", StringComparison.Ordinal)
                && string.Equals(preset, "import_full", StringComparison.Ordinal)
            )
            {
                validationError =
                    "preset 'import_full' requires entryMode 'import_file'.";
                return false;
            }

            return true;
        }

        private static HashSet<string> ReadCleanupSelectionIds(JsonObject payload, string key)
        {
            var selected = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (payload[key] is not JsonArray array)
            {
                return selected;
            }

            foreach (var node in array)
            {
                if (node == null)
                {
                    continue;
                }
                var value = NormalizeText(node.ToString());
                if (!string.IsNullOrWhiteSpace(value))
                {
                    selected.Add(value);
                }
            }

            return selected;
        }

        private static DrawingCleanupAnalysis AnalyzeDrawingCleanup(
            Database database,
            Transaction transaction,
            string entryMode,
            string preset,
            string drawingPath,
            bool saveDrawing
        )
        {
            var config = new DrawingCleanupConfig();
            var entities = ScanDrawingCleanupEntities(database, transaction);
            var analysis = new DrawingCleanupAnalysis
            {
                EntryMode = entryMode,
                Preset = preset,
                DrawingPath = drawingPath,
                DrawingName = ResolveDrawingCleanupName(drawingPath),
                OutputPath = DetermineDrawingCleanupOutputPath(entryMode, drawingPath),
                SaveDrawing = saveDrawing,
            };

            var includeLayers = preset == "full" || preset == "layers" || preset == "import_full";
            var includeBlocks = preset == "full" || preset == "blocks" || preset == "import_full";
            var includeText = preset == "full" || preset == "text" || preset == "import_full";
            var includeOverlap = preset == "full" || preset == "text" || preset == "overlap" || preset == "import_full";

            if (includeLayers)
            {
                analysis.LayerCandidateCount = CountLayerCleanupCandidates(entities, config);
                analysis.TextLayerReviewCount = CountTextLayerCleanupCandidates(entities, config);
                analysis.DeterministicFixes.Add(
                    new DrawingCleanupFixDefinition
                    {
                        Id = "normalize_layers",
                        Label = "Normalize linework and block layers",
                        Description = "Create the standard electrical cleanup layers and move non-text entities onto the expected layer family.",
                        Count = analysis.LayerCandidateCount,
                        Selected = true,
                        Kind = "deterministic",
                    }
                );
                analysis.ReviewQueue.Add(
                    new DrawingCleanupFixDefinition
                    {
                        Id = "review_text_layers",
                        Label = "Review text layer reassignment",
                        Description = "Move text to label or annotation layers only after operator approval.",
                        Count = analysis.TextLayerReviewCount,
                        Selected = false,
                        Kind = "review",
                    }
                );
            }

            if (includeBlocks)
            {
                analysis.BlockCandidateCount = CountBlockCleanupCandidates(
                    database,
                    transaction,
                    entities,
                    config
                );
                analysis.DeterministicFixes.Add(
                    new DrawingCleanupFixDefinition
                    {
                        Id = "normalize_blocks",
                        Label = "Normalize block scale and attributes",
                        Description = "Repair non-uniform block scales, snap near-orthogonal rotations, and restore readable attribute heights.",
                        Count = analysis.BlockCandidateCount,
                        Selected = true,
                        Kind = "deterministic",
                    }
                );
            }

            if (includeText)
            {
                analysis.TextCandidateCount = CountTextNormalizationCandidates(
                    database,
                    transaction,
                    entities,
                    config
                );
                analysis.DeterministicFixes.Add(
                    new DrawingCleanupFixDefinition
                    {
                        Id = "normalize_text",
                        Label = "Normalize text height, style, and rotation",
                        Description = "Standardize readable text metadata while leaving protected title-block content in place.",
                        Count = analysis.TextCandidateCount,
                        Selected = true,
                        Kind = "deterministic",
                    }
                );
            }

            if (includeOverlap)
            {
                analysis.OverlapReviewCount = CountOverlapCleanupCandidates(entities, config);
                analysis.ReviewQueue.Add(
                    new DrawingCleanupFixDefinition
                    {
                        Id = "review_overlaps",
                        Label = "Review overlap resolution",
                        Description = "Move overlapping text only after approval because the nudge direction is heuristic.",
                        Count = analysis.OverlapReviewCount,
                        Selected = false,
                        Kind = "review",
                    }
                );
            }

            if (
                string.Equals(entryMode, "import_file", StringComparison.Ordinal)
                && saveDrawing
                && (preset == "import_full" || preset == "full")
            )
            {
                analysis.DeterministicFixes.Add(
                    new DrawingCleanupFixDefinition
                    {
                        Id = "save_imported_drawing",
                        Label = "Save imported drawing",
                        Description = "Write the cleaned import back out as a DWG file.",
                        Count = 1,
                        Selected = true,
                        Kind = "deterministic",
                    }
                );
            }

            analysis.DeterministicCandidateCount = analysis.DeterministicFixes.Sum(
                item => Math.Max(0, item.Count)
            );
            analysis.ReviewCandidateCount = analysis.ReviewQueue.Sum(
                item => Math.Max(0, item.Count)
            );
            return analysis;
        }

        private static void ResolveCleanupSelections(
            DrawingCleanupAnalysis analysis,
            HashSet<string> selectedFixIds,
            HashSet<string> approvedReviewIds
        )
        {
            if (selectedFixIds.Count <= 0)
            {
                foreach (var item in analysis.DeterministicFixes)
                {
                    if (item.Selected)
                    {
                        selectedFixIds.Add(item.Id);
                    }
                }
            }

            foreach (var item in analysis.DeterministicFixes)
            {
                item.Selected = selectedFixIds.Contains(item.Id);
            }

            foreach (var item in analysis.ReviewQueue)
            {
                item.Selected = approvedReviewIds.Contains(item.Id);
            }
        }

        private static DrawingCleanupApplyOutcome ApplyDrawingCleanup(
            Database database,
            Transaction transaction,
            List<DrawingCleanupEntityInfo> entities,
            DrawingCleanupAnalysis analysis,
            List<string> warnings
        )
        {
            var config = new DrawingCleanupConfig();
            var selectedFixes = new HashSet<string>(
                analysis.DeterministicFixes.Where(item => item.Selected).Select(item => item.Id),
                StringComparer.OrdinalIgnoreCase
            );
            var selectedReviews = new HashSet<string>(
                analysis.ReviewQueue.Where(item => item.Selected).Select(item => item.Id),
                StringComparer.OrdinalIgnoreCase
            );
            var outcome = new DrawingCleanupApplyOutcome();

            if (selectedFixes.Contains("normalize_layers"))
            {
                EnsureDrawingCleanupLayers(database, transaction, config);
                outcome.LayerChanges = ApplyLayerCleanup(
                    database,
                    transaction,
                    entities,
                    config,
                    includeText: false
                );
            }

            if (selectedReviews.Contains("review_text_layers"))
            {
                EnsureDrawingCleanupLayers(database, transaction, config);
                outcome.TextLayerReviewChanges = ApplyLayerCleanup(
                    database,
                    transaction,
                    entities,
                    config,
                    includeText: true
                );
            }

            if (selectedFixes.Contains("normalize_blocks"))
            {
                outcome.BlockChanges = ApplyBlockCleanup(
                    transaction,
                    entities,
                    config
                );
            }

            if (selectedFixes.Contains("normalize_text"))
            {
                outcome.TextChanges = ApplyTextNormalization(
                    database,
                    transaction,
                    entities,
                    config
                );
            }

            if (selectedReviews.Contains("review_overlaps"))
            {
                var refreshedEntities = ScanDrawingCleanupEntities(database, transaction);
                outcome.OverlapReviewChanges = ApplyOverlapCleanup(
                    transaction,
                    refreshedEntities,
                    config
                );
            }

            if (
                selectedFixes.Contains("save_imported_drawing")
                && string.IsNullOrWhiteSpace(analysis.OutputPath)
            )
            {
                warnings.Add("The imported drawing did not resolve to an output path.");
            }

            return outcome;
        }

        private static JsonObject BuildDrawingCleanupData(
            DrawingCleanupAnalysis analysis,
            int appliedDeterministicCount,
            int appliedReviewCount,
            DrawingCleanupApplyOutcome outcome = null
        )
        {
            return new JsonObject
            {
                ["summary"] = new JsonObject
                {
                    ["entryMode"] = analysis.EntryMode,
                    ["preset"] = analysis.Preset,
                    ["deterministicCandidateCount"] = analysis.DeterministicCandidateCount,
                    ["reviewCandidateCount"] = analysis.ReviewCandidateCount,
                    ["layerCandidateCount"] = analysis.LayerCandidateCount,
                    ["blockCandidateCount"] = analysis.BlockCandidateCount,
                    ["textCandidateCount"] = analysis.TextCandidateCount,
                    ["textLayerReviewCount"] = analysis.TextLayerReviewCount,
                    ["overlapReviewCount"] = analysis.OverlapReviewCount,
                    ["appliedDeterministicCount"] = appliedDeterministicCount,
                    ["appliedReviewCount"] = appliedReviewCount,
                    ["saved"] = outcome?.Saved ?? false,
                    ["appliedLayerChanges"] = outcome?.LayerChanges ?? 0,
                    ["appliedBlockChanges"] = outcome?.BlockChanges ?? 0,
                    ["appliedTextChanges"] = outcome?.TextChanges ?? 0,
                    ["appliedTextLayerReviewChanges"] = outcome?.TextLayerReviewChanges ?? 0,
                    ["appliedOverlapReviewChanges"] = outcome?.OverlapReviewChanges ?? 0,
                },
                ["deterministicFixes"] = ToDrawingCleanupJsonArray(analysis.DeterministicFixes),
                ["reviewQueue"] = ToDrawingCleanupJsonArray(analysis.ReviewQueue),
                ["drawing"] = new JsonObject
                {
                    ["name"] = analysis.DrawingName,
                    ["path"] = string.IsNullOrWhiteSpace(analysis.DrawingPath)
                        ? null
                        : analysis.DrawingPath,
                    ["outputPath"] = string.IsNullOrWhiteSpace(analysis.OutputPath)
                        ? null
                        : analysis.OutputPath,
                    ["saveDrawing"] = analysis.SaveDrawing,
                },
            };
        }

        private static JsonArray ToDrawingCleanupJsonArray(
            IEnumerable<DrawingCleanupFixDefinition> items
        )
        {
            var array = new JsonArray();
            foreach (var item in items)
            {
                array.Add(
                    new JsonObject
                    {
                        ["id"] = item.Id,
                        ["label"] = item.Label,
                        ["description"] = item.Description,
                        ["count"] = item.Count,
                        ["selected"] = item.Selected,
                        ["kind"] = item.Kind,
                    }
                );
            }
            return array;
        }

        internal static JsonObject BuildDrawingCleanupFailure(
            string action,
            string code,
            string message,
            string requestId
        )
        {
            return BuildDrawingCleanupResult(
                action,
                success: false,
                code: code,
                message: message,
                data: null,
                warnings: new List<string>(),
                requestId: requestId
            );
        }

        internal static JsonObject BuildDrawingCleanupResult(
            string action,
            bool success,
            string code,
            string message,
            JsonObject data,
            List<string> warnings,
            string requestId,
            Action<JsonObject> configureMeta = null
        )
        {
            var meta = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet+inproc",
                ["action"] = action,
                ["requestId"] = string.IsNullOrWhiteSpace(requestId) ? null : requestId,
            };
            configureMeta?.Invoke(meta);

            return new JsonObject
            {
                ["success"] = success,
                ["code"] = code,
                ["message"] = message,
                ["requestId"] = string.IsNullOrWhiteSpace(requestId) ? null : requestId,
                ["data"] = data,
                ["warnings"] = ToBatchJsonArray(warnings),
                ["meta"] = meta,
            };
        }

        private static string ResolveDrawingCleanupName(string drawingPath)
        {
            var fileName = NormalizeText(Path.GetFileName(drawingPath));
            if (!string.IsNullOrWhiteSpace(fileName))
            {
                return fileName;
            }
            return "Drawing";
        }

        private static string DetermineDrawingCleanupOutputPath(string entryMode, string drawingPath)
        {
            if (!string.Equals(entryMode, "import_file", StringComparison.Ordinal))
            {
                return string.Empty;
            }

            var extension = NormalizeText(Path.GetExtension(drawingPath)).ToLowerInvariant();
            if (extension == ".dxf")
            {
                return Path.ChangeExtension(drawingPath, ".dwg");
            }

            return drawingPath;
        }

        private static void LoadDrawingCleanupSource(Database database, string sourcePath)
        {
            var extension = NormalizeText(Path.GetExtension(sourcePath)).ToLowerInvariant();
            if (extension == ".dxf")
            {
                database.DxfIn(sourcePath, null);
                return;
            }

            database.ReadDwgFile(sourcePath, FileShare.ReadWrite, true, string.Empty);
        }

        private static List<DrawingCleanupEntityInfo> ScanDrawingCleanupEntities(
            Database database,
            Transaction transaction
        )
        {
            var results = new List<DrawingCleanupEntityInfo>();
            var modelSpace = GetModelSpace(transaction, database);
            foreach (ObjectId entityId in modelSpace)
            {
                var entity = transaction.GetObject(entityId, OpenMode.ForRead, false) as Entity;
                if (entity == null || entity.IsErased)
                {
                    continue;
                }

                DrawingCleanupEntityInfo info;
                try
                {
                    info = new DrawingCleanupEntityInfo
                    {
                        ObjectId = entity.ObjectId,
                        BoundingBox = entity.GeometricExtents,
                        LayerName = NormalizeText(entity.Layer),
                    };
                }
                catch
                {
                    continue;
                }

                switch (entity)
                {
                    case DBText dbText:
                        info.EntityType = DrawingCleanupEntityType.Text;
                        info.TextContent = NormalizeText(dbText.TextString);
                        info.Position = dbText.Position;
                        info.Rotation = dbText.Rotation;
                        break;
                    case MText mText:
                        info.EntityType = DrawingCleanupEntityType.MText;
                        info.TextContent = NormalizeText(mText.Contents);
                        info.Position = mText.Location;
                        info.Rotation = mText.Rotation;
                        break;
                    case BlockReference blockReference:
                        info.EntityType = DrawingCleanupEntityType.BlockReference;
                        info.BlockName = ResolveDrawingCleanupBlockName(blockReference, transaction);
                        info.Position = blockReference.Position;
                        info.Rotation = blockReference.Rotation;
                        break;
                    case Line line:
                        info.EntityType = DrawingCleanupEntityType.Line;
                        info.Position = line.StartPoint;
                        break;
                    case Polyline polyline:
                        info.EntityType = DrawingCleanupEntityType.Polyline;
                        info.Position = polyline.StartPoint;
                        break;
                    case Circle circle:
                        info.EntityType = DrawingCleanupEntityType.Circle;
                        info.Position = circle.Center;
                        break;
                    case Arc arc:
                        info.EntityType = DrawingCleanupEntityType.Arc;
                        info.Position = arc.Center;
                        break;
                    case Dimension dimension:
                        info.EntityType = DrawingCleanupEntityType.Dimension;
                        info.TextContent = NormalizeText(dimension.DimensionText);
                        info.Position = dimension.TextPosition;
                        break;
                    case Leader _:
                        info.EntityType = DrawingCleanupEntityType.Leader;
                        info.Position = info.Center;
                        break;
                    default:
                        info.EntityType = DrawingCleanupEntityType.Other;
                        info.Position = info.Center;
                        break;
                }

                results.Add(info);
            }

            return results;
        }

        private static string ResolveDrawingCleanupBlockName(
            BlockReference blockReference,
            Transaction transaction
        )
        {
            if (blockReference.IsDynamicBlock)
            {
                var dynamicRecord = transaction.GetObject(
                    blockReference.DynamicBlockTableRecord,
                    OpenMode.ForRead
                ) as BlockTableRecord;
                return NormalizeText(dynamicRecord?.Name ?? blockReference.Name);
            }

            return NormalizeText(blockReference.Name);
        }

        private static int CountLayerCleanupCandidates(
            IReadOnlyList<DrawingCleanupEntityInfo> entities,
            DrawingCleanupConfig config
        )
        {
            var count = 0;
            foreach (var entity in entities)
            {
                if (
                    entity.EntityType == DrawingCleanupEntityType.Text
                    || entity.EntityType == DrawingCleanupEntityType.MText
                )
                {
                    continue;
                }

                var targetLayer = DetermineDrawingCleanupLayer(entity, config);
                if (
                    !string.IsNullOrWhiteSpace(targetLayer)
                    && !string.Equals(entity.LayerName, targetLayer, StringComparison.OrdinalIgnoreCase)
                )
                {
                    count += 1;
                }
            }

            return count;
        }

        private static int CountTextLayerCleanupCandidates(
            IReadOnlyList<DrawingCleanupEntityInfo> entities,
            DrawingCleanupConfig config
        )
        {
            return entities.Count(
                entity =>
                    (entity.EntityType == DrawingCleanupEntityType.Text
                        || entity.EntityType == DrawingCleanupEntityType.MText)
                    && !IsProtectedCleanupText(entity, config)
                    && !string.IsNullOrWhiteSpace(DetermineDrawingCleanupLayer(entity, config))
                    && !string.Equals(
                        entity.LayerName,
                        DetermineDrawingCleanupLayer(entity, config),
                        StringComparison.OrdinalIgnoreCase
                    )
            );
        }

        private static int CountBlockCleanupCandidates(
            Database database,
            Transaction transaction,
            IReadOnlyList<DrawingCleanupEntityInfo> entities,
            DrawingCleanupConfig config
        )
        {
            var changed = 0;
            foreach (
                var blockInfo in entities.Where(
                    entity => entity.EntityType == DrawingCleanupEntityType.BlockReference
                )
            )
            {
                var blockReference = transaction.GetObject(
                    blockInfo.ObjectId,
                    OpenMode.ForRead,
                    false
                ) as BlockReference;
                if (blockReference == null || blockReference.IsErased)
                {
                    continue;
                }

                if (BlockRequiresCleanup(blockReference, transaction, config))
                {
                    changed += 1;
                }
            }

            return changed;
        }

        private static bool BlockRequiresCleanup(
            BlockReference blockReference,
            Transaction transaction,
            DrawingCleanupConfig config
        )
        {
            if (RequiresScaleNormalization(blockReference, config))
            {
                return true;
            }
            if (RequiresRotationNormalization(blockReference.Rotation, config))
            {
                return true;
            }

            foreach (ObjectId attributeId in blockReference.AttributeCollection)
            {
                var attribute = transaction.GetObject(
                    attributeId,
                    OpenMode.ForRead,
                    false
                ) as AttributeReference;
                if (attribute == null || attribute.IsErased)
                {
                    continue;
                }

                if (
                    attribute.Height < config.MinTextHeight
                    || attribute.Height > config.MaxTextHeight
                )
                {
                    return true;
                }
                if (attribute.Invisible && IsDrawingCleanupImportantAttribute(attribute.Tag))
                {
                    return true;
                }
            }

            return false;
        }

        private static int CountTextNormalizationCandidates(
            Database database,
            Transaction transaction,
            IReadOnlyList<DrawingCleanupEntityInfo> entities,
            DrawingCleanupConfig config
        )
        {
            var styleId = EnsureDrawingCleanupTextStyle(database, transaction, config);
            var changed = 0;
            foreach (
                var entityInfo in entities.Where(
                    entry =>
                        entry.EntityType == DrawingCleanupEntityType.Text
                        || entry.EntityType == DrawingCleanupEntityType.MText
                )
            )
            {
                if (IsProtectedCleanupText(entityInfo, config))
                {
                    continue;
                }

                var entity = transaction.GetObject(entityInfo.ObjectId, OpenMode.ForRead, false) as Entity;
                if (entity == null || entity.IsErased)
                {
                    continue;
                }

                if (TextRequiresCleanup(entity, styleId, config))
                {
                    changed += 1;
                }
            }

            return changed;
        }

        private static bool TextRequiresCleanup(
            Entity entity,
            ObjectId styleId,
            DrawingCleanupConfig config
        )
        {
            if (entity is DBText dbText)
            {
                var targetHeight = GetDrawingCleanupTargetTextHeight(
                    StripCleanupFormatting(dbText.TextString),
                    config
                );
                return !NearlyEqual(dbText.Height, targetHeight)
                    || dbText.TextStyleId != styleId
                    || RequiresRotationNormalization(dbText.Rotation, config);
            }

            if (entity is MText mText)
            {
                var targetHeight = GetDrawingCleanupTargetTextHeight(
                    StripCleanupFormatting(mText.Contents),
                    config
                );
                return !NearlyEqual(mText.TextHeight, targetHeight)
                    || mText.TextStyleId != styleId
                    || RequiresRotationNormalization(mText.Rotation, config)
                    || (mText.Width > 0 && mText.Width < mText.TextHeight * 2.0);
            }

            return false;
        }

        private static int CountOverlapCleanupCandidates(
            IReadOnlyList<DrawingCleanupEntityInfo> entities,
            DrawingCleanupConfig config
        )
        {
            var movable = entities
                .Where(
                    entity =>
                        (entity.EntityType == DrawingCleanupEntityType.Text
                            || entity.EntityType == DrawingCleanupEntityType.MText)
                        && !IsProtectedCleanupText(entity, config)
                )
                .ToList();
            if (movable.Count <= 0)
            {
                return 0;
            }

            var obstacles = entities
                .Where(
                    entity =>
                        entity.EntityType != DrawingCleanupEntityType.Text
                        && entity.EntityType != DrawingCleanupEntityType.MText
                )
                .ToList();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var text in movable)
            {
                foreach (var other in movable)
                {
                    if (other.ObjectId == text.ObjectId)
                    {
                        continue;
                    }
                    if (!text.Intersects(other, config.BoundingBoxPadding))
                    {
                        continue;
                    }
                    seen.Add(text.ObjectId.Handle.ToString());
                    break;
                }

                if (seen.Contains(text.ObjectId.Handle.ToString()))
                {
                    continue;
                }

                foreach (var obstacle in obstacles)
                {
                    if (text.Intersects(obstacle, config.MinTextToLineGap))
                    {
                        seen.Add(text.ObjectId.Handle.ToString());
                        break;
                    }
                }
            }

            return seen.Count;
        }

        private static int ApplyLayerCleanup(
            Database database,
            Transaction transaction,
            IReadOnlyList<DrawingCleanupEntityInfo> entities,
            DrawingCleanupConfig config,
            bool includeText
        )
        {
            var moved = 0;
            foreach (var entityInfo in entities)
            {
                var isText =
                    entityInfo.EntityType == DrawingCleanupEntityType.Text
                    || entityInfo.EntityType == DrawingCleanupEntityType.MText;
                if (isText != includeText)
                {
                    continue;
                }
                if (isText && IsProtectedCleanupText(entityInfo, config))
                {
                    continue;
                }

                var targetLayer = DetermineDrawingCleanupLayer(entityInfo, config);
                if (string.IsNullOrWhiteSpace(targetLayer))
                {
                    continue;
                }
                if (
                    string.Equals(
                        entityInfo.LayerName,
                        targetLayer,
                        StringComparison.OrdinalIgnoreCase
                    )
                )
                {
                    continue;
                }

                var entity = transaction.GetObject(entityInfo.ObjectId, OpenMode.ForWrite, false) as Entity;
                if (entity == null || entity.IsErased)
                {
                    continue;
                }

                entity.Layer = targetLayer;
                entityInfo.LayerName = targetLayer;
                moved += 1;
            }

            return moved;
        }

        private static int ApplyBlockCleanup(
            Transaction transaction,
            IReadOnlyList<DrawingCleanupEntityInfo> entities,
            DrawingCleanupConfig config
        )
        {
            var changed = 0;
            foreach (
                var blockInfo in entities.Where(
                    entity => entity.EntityType == DrawingCleanupEntityType.BlockReference
                )
            )
            {
                var blockReference = transaction.GetObject(
                    blockInfo.ObjectId,
                    OpenMode.ForWrite,
                    false
                ) as BlockReference;
                if (blockReference == null || blockReference.IsErased)
                {
                    continue;
                }

                var blockChanged = false;
                blockChanged |= NormalizeDrawingCleanupScale(blockReference, config);
                blockChanged |= NormalizeDrawingCleanupRotation(blockReference, config);

                foreach (ObjectId attributeId in blockReference.AttributeCollection)
                {
                    var attribute = transaction.GetObject(
                        attributeId,
                        OpenMode.ForWrite,
                        false
                    ) as AttributeReference;
                    if (attribute == null || attribute.IsErased)
                    {
                        continue;
                    }

                    if (
                        attribute.Height < config.MinTextHeight
                        || attribute.Height > config.MaxTextHeight
                    )
                    {
                        attribute.Height = config.AnnotationTextHeight;
                        blockChanged = true;
                    }

                    if (attribute.Invisible && IsDrawingCleanupImportantAttribute(attribute.Tag))
                    {
                        attribute.Invisible = false;
                        blockChanged = true;
                    }
                }

                if (blockChanged)
                {
                    changed += 1;
                }
            }

            return changed;
        }

        private static int ApplyTextNormalization(
            Database database,
            Transaction transaction,
            IReadOnlyList<DrawingCleanupEntityInfo> entities,
            DrawingCleanupConfig config
        )
        {
            var styleId = EnsureDrawingCleanupTextStyle(database, transaction, config);
            var changed = 0;
            foreach (
                var entityInfo in entities.Where(
                    entry =>
                        entry.EntityType == DrawingCleanupEntityType.Text
                        || entry.EntityType == DrawingCleanupEntityType.MText
                )
            )
            {
                if (IsProtectedCleanupText(entityInfo, config))
                {
                    continue;
                }

                var entity = transaction.GetObject(entityInfo.ObjectId, OpenMode.ForWrite, false) as Entity;
                if (entity == null || entity.IsErased)
                {
                    continue;
                }

                var entityChanged = false;
                if (entity is DBText dbText)
                {
                    var targetHeight = GetDrawingCleanupTargetTextHeight(
                        StripCleanupFormatting(dbText.TextString),
                        config
                    );
                    if (!NearlyEqual(dbText.Height, targetHeight))
                    {
                        dbText.Height = targetHeight;
                        entityChanged = true;
                    }
                    if (dbText.TextStyleId != styleId)
                    {
                        dbText.TextStyleId = styleId;
                        entityChanged = true;
                    }

                    entityChanged |= NormalizeDrawingCleanupRotation(dbText, config);
                    if (entityChanged)
                    {
                        SafeAdjustDrawingCleanupDbTextAlignment(dbText, database);
                    }
                }
                else if (entity is MText mText)
                {
                    var targetHeight = GetDrawingCleanupTargetTextHeight(
                        StripCleanupFormatting(mText.Contents),
                        config
                    );
                    if (!NearlyEqual(mText.TextHeight, targetHeight))
                    {
                        mText.TextHeight = targetHeight;
                        entityChanged = true;
                    }
                    if (mText.TextStyleId != styleId)
                    {
                        mText.TextStyleId = styleId;
                        entityChanged = true;
                    }
                    entityChanged |= NormalizeDrawingCleanupRotation(mText, config);
                    if (mText.Width > 0 && mText.Width < mText.TextHeight * 2.0)
                    {
                        mText.Width = 0;
                        entityChanged = true;
                    }
                }

                if (entityChanged)
                {
                    changed += 1;
                }
            }

            return changed;
        }

        private static int ApplyOverlapCleanup(
            Transaction transaction,
            IReadOnlyList<DrawingCleanupEntityInfo> entities,
            DrawingCleanupConfig config
        )
        {
            var moved = 0;
            var movable = entities
                .Where(
                    entity =>
                        (entity.EntityType == DrawingCleanupEntityType.Text
                            || entity.EntityType == DrawingCleanupEntityType.MText)
                        && !IsProtectedCleanupText(entity, config)
                )
                .ToList();
            var obstacles = entities
                .Where(
                    entity =>
                        entity.EntityType != DrawingCleanupEntityType.Text
                        && entity.EntityType != DrawingCleanupEntityType.MText
                )
                .ToList();

            for (var pass = 0; pass < config.MaxNudgeIterations; pass++)
            {
                var anyMoved = false;
                foreach (var text in movable)
                {
                    var collided = false;
                    foreach (var other in movable)
                    {
                        if (other.ObjectId == text.ObjectId)
                        {
                            continue;
                        }
                        if (!text.Intersects(other, config.BoundingBoxPadding))
                        {
                            continue;
                        }

                        MoveDrawingCleanupEntity(
                            transaction,
                            text,
                            ComputeDrawingCleanupDisplacement(text, other, config.NudgeDistance)
                        );
                        anyMoved = true;
                        collided = true;
                        moved += 1;
                        break;
                    }

                    if (collided)
                    {
                        continue;
                    }

                    foreach (var obstacle in obstacles)
                    {
                        if (!text.Intersects(obstacle, config.MinTextToLineGap))
                        {
                            continue;
                        }

                        MoveDrawingCleanupEntity(
                            transaction,
                            text,
                            ComputeDrawingCleanupDisplacement(text, obstacle, config.NudgeDistance)
                        );
                        anyMoved = true;
                        moved += 1;
                        break;
                    }
                }

                if (!anyMoved)
                {
                    break;
                }
            }

            return moved;
        }

        private static void MoveDrawingCleanupEntity(
            Transaction transaction,
            DrawingCleanupEntityInfo entityInfo,
            Vector3d displacement
        )
        {
            var entity = transaction.GetObject(entityInfo.ObjectId, OpenMode.ForWrite, false) as Entity;
            if (entity == null || entity.IsErased)
            {
                return;
            }

            entity.TransformBy(Matrix3d.Displacement(displacement));
            try
            {
                entityInfo.BoundingBox = entity.GeometricExtents;
                entityInfo.Position = new Point3d(
                    entityInfo.Position.X + displacement.X,
                    entityInfo.Position.Y + displacement.Y,
                    entityInfo.Position.Z + displacement.Z
                );
            }
            catch
            {
                // Best effort cache refresh only.
            }
        }

        private static Vector3d ComputeDrawingCleanupDisplacement(
            DrawingCleanupEntityInfo target,
            DrawingCleanupEntityInfo obstacle,
            double distance
        )
        {
            var deltaX = target.Center.X - obstacle.Center.X;
            var deltaY = target.Center.Y - obstacle.Center.Y;
            var magnitude = Math.Sqrt((deltaX * deltaX) + (deltaY * deltaY));
            if (magnitude < 0.001)
            {
                return new Vector3d(0, -distance, 0);
            }

            var scale = distance / magnitude;
            return new Vector3d(deltaX * scale, deltaY * scale, 0);
        }

        private static void EnsureDrawingCleanupLayers(
            Database database,
            Transaction transaction,
            DrawingCleanupConfig config
        )
        {
            var layerTable = transaction.GetObject(database.LayerTableId, OpenMode.ForRead) as LayerTable;
            if (layerTable == null)
            {
                return;
            }

            var definitions = new[]
            {
                new { Name = config.BusLayer, ColorIndex = (short)1, Weight = LineWeight.LineWeight050, Description = "Busbars and bus sections" },
                new { Name = config.CableLayer, ColorIndex = (short)3, Weight = LineWeight.LineWeight030, Description = "Cables and conductors" },
                new { Name = config.EquipmentLayer, ColorIndex = (short)5, Weight = LineWeight.LineWeight035, Description = "Equipment blocks and device symbols" },
                new { Name = config.TextLabelLayer, ColorIndex = (short)7, Weight = LineWeight.LineWeight018, Description = "Primary equipment labels" },
                new { Name = config.AnnotationLayer, ColorIndex = (short)8, Weight = LineWeight.LineWeight013, Description = "Secondary annotations and values" },
                new { Name = config.DimensionLayer, ColorIndex = (short)2, Weight = LineWeight.LineWeight013, Description = "Dimensions and leaders" },
            };

            foreach (var definition in definitions)
            {
                if (layerTable.Has(definition.Name))
                {
                    continue;
                }

                layerTable.UpgradeOpen();
                var record = new LayerTableRecord
                {
                    Name = definition.Name,
                    Color = Color.FromColorIndex(ColorMethod.ByAci, definition.ColorIndex),
                    LineWeight = definition.Weight,
                    Description = definition.Description,
                };
                layerTable.Add(record);
                transaction.AddNewlyCreatedDBObject(record, true);
            }
        }

        private static string DetermineDrawingCleanupLayer(
            DrawingCleanupEntityInfo entity,
            DrawingCleanupConfig config
        )
        {
            switch (entity.EntityType)
            {
                case DrawingCleanupEntityType.Text:
                case DrawingCleanupEntityType.MText:
                    return IsAnnotationCleanupText(entity.TextContent)
                        ? config.AnnotationLayer
                        : config.TextLabelLayer;
                case DrawingCleanupEntityType.BlockReference:
                    var category = CategorizeDrawingCleanupBlock(entity.BlockName, config);
                    return string.Equals(category, "BUS", StringComparison.OrdinalIgnoreCase)
                        ? config.BusLayer
                        : config.EquipmentLayer;
                case DrawingCleanupEntityType.Line:
                case DrawingCleanupEntityType.Polyline:
                    var layerHint = NormalizeText(entity.LayerName).ToUpperInvariant();
                    if (layerHint.Contains("BUS") || layerHint.Contains("SWGR"))
                    {
                        return config.BusLayer;
                    }
                    return config.CableLayer;
                case DrawingCleanupEntityType.Dimension:
                case DrawingCleanupEntityType.Leader:
                    return config.DimensionLayer;
                default:
                    return string.Empty;
            }
        }

        private static string CategorizeDrawingCleanupBlock(
            string blockName,
            DrawingCleanupConfig config
        )
        {
            var upper = NormalizeText(blockName).ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(upper))
            {
                return "EQUIPMENT";
            }

            if (config.BusBlockPatterns.Any(pattern => upper.Contains(pattern)))
            {
                return "BUS";
            }
            if (config.TransformerBlockPatterns.Any(pattern => upper.Contains(pattern)))
            {
                return "TRANSFORMER";
            }
            if (config.BreakerBlockPatterns.Any(pattern => upper.Contains(pattern)))
            {
                return "BREAKER";
            }
            if (config.MotorBlockPatterns.Any(pattern => upper.Contains(pattern)))
            {
                return "MOTOR";
            }
            if (config.GeneratorBlockPatterns.Any(pattern => upper.Contains(pattern)))
            {
                return "GENERATOR";
            }

            return "EQUIPMENT";
        }

        private static bool RequiresScaleNormalization(
            BlockReference blockReference,
            DrawingCleanupConfig config
        )
        {
            var scaleX = Math.Abs(blockReference.ScaleFactors.X);
            var scaleY = Math.Abs(blockReference.ScaleFactors.Y);
            var scaleZ = Math.Abs(blockReference.ScaleFactors.Z);
            var baseline = Math.Max(0.001, scaleX);
            return Math.Abs(scaleX - scaleY) > (config.ScaleTolerance * baseline)
                || Math.Abs(scaleX - scaleZ) > (config.ScaleTolerance * baseline);
        }

        private static bool NormalizeDrawingCleanupScale(
            BlockReference blockReference,
            DrawingCleanupConfig config
        )
        {
            if (!RequiresScaleNormalization(blockReference, config))
            {
                return false;
            }

            var scaleX = Math.Abs(blockReference.ScaleFactors.X);
            var scaleY = Math.Abs(blockReference.ScaleFactors.Y);
            var averageScale = (scaleX + scaleY) / 2.0;
            var signX = blockReference.ScaleFactors.X >= 0 ? 1 : -1;
            var signY = blockReference.ScaleFactors.Y >= 0 ? 1 : -1;
            blockReference.ScaleFactors = new Scale3d(
                averageScale * signX,
                averageScale * signY,
                averageScale
            );
            return true;
        }

        private static bool RequiresRotationNormalization(
            double rotationRadians,
            DrawingCleanupConfig config
        )
        {
            var normalized = NormalizeAngle(rotationRadians);
            var snapped = SnapDrawingCleanupRotation(normalized, config);
            return !NearlyEqual(normalized, snapped);
        }

        private static bool NormalizeDrawingCleanupRotation(
            BlockReference blockReference,
            DrawingCleanupConfig config
        )
        {
            var normalized = NormalizeAngle(blockReference.Rotation);
            var snapped = SnapDrawingCleanupRotation(normalized, config);
            if (NearlyEqual(normalized, snapped))
            {
                return false;
            }
            blockReference.Rotation = snapped;
            return true;
        }

        private static bool NormalizeDrawingCleanupRotation(
            DBText dbText,
            DrawingCleanupConfig config
        )
        {
            var normalized = NormalizeAngle(dbText.Rotation);
            var snapped = SnapDrawingCleanupRotation(normalized, config);
            if (NearlyEqual(normalized, snapped))
            {
                return false;
            }
            dbText.Rotation = snapped;
            return true;
        }

        private static bool NormalizeDrawingCleanupRotation(
            MText mText,
            DrawingCleanupConfig config
        )
        {
            var normalized = NormalizeAngle(mText.Rotation);
            var snapped = SnapDrawingCleanupRotation(normalized, config);
            if (NearlyEqual(normalized, snapped))
            {
                return false;
            }
            mText.Rotation = snapped;
            return true;
        }

        private static double SnapDrawingCleanupRotation(
            double rotationRadians,
            DrawingCleanupConfig config
        )
        {
            if (config.RotationSnapDegrees <= 0)
            {
                return rotationRadians;
            }

            var currentDegrees = rotationRadians * 180.0 / Math.PI;
            var snappedDegrees =
                Math.Round(currentDegrees / config.RotationSnapDegrees)
                * config.RotationSnapDegrees;
            if (Math.Abs(currentDegrees - snappedDegrees) > config.RotationSnapToleranceDegrees)
            {
                return rotationRadians;
            }

            return snappedDegrees * Math.PI / 180.0;
        }

        private static ObjectId EnsureDrawingCleanupTextStyle(
            Database database,
            Transaction transaction,
            DrawingCleanupConfig config
        )
        {
            var textStyleTable = transaction.GetObject(
                database.TextStyleTableId,
                OpenMode.ForRead
            ) as TextStyleTable;
            if (textStyleTable == null)
            {
                return database.Textstyle;
            }

            if (textStyleTable.Has(config.StandardTextStyle))
            {
                return textStyleTable[config.StandardTextStyle];
            }

            textStyleTable.UpgradeOpen();
            var record = new TextStyleTableRecord
            {
                Name = config.StandardTextStyle,
                FileName = config.StandardFontFile,
            };
            var id = textStyleTable.Add(record);
            transaction.AddNewlyCreatedDBObject(record, true);
            return id;
        }

        private static string StripCleanupFormatting(string raw)
        {
            var text = NormalizeText(raw);
            if (string.IsNullOrWhiteSpace(text))
            {
                return string.Empty;
            }

            text = text.Replace("\\P", " ");
            text = Regex.Replace(text, @"\\[A-Za-z][^;]*;", string.Empty);
            text = text.Replace("{", string.Empty).Replace("}", string.Empty);
            return NormalizeText(text);
        }

        private static double GetDrawingCleanupTargetTextHeight(
            string text,
            DrawingCleanupConfig config
        )
        {
            return IsAnnotationCleanupText(text)
                ? config.AnnotationTextHeight
                : config.StandardTextHeight;
        }

        private static bool IsAnnotationCleanupText(string text)
        {
            var upper = NormalizeText(text).ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(upper))
            {
                return false;
            }

            return upper.Contains("KV")
                || upper.Contains(" V")
                || upper.Contains(" A")
                || upper.Contains("AMP")
                || upper.Contains("PF")
                || upper.Contains("P.F.")
                || upper.Contains("KW")
                || upper.Contains("MW")
                || upper.Contains("KVA")
                || upper.Contains("MVA")
                || upper.Contains("%")
                || upper.Contains("FLA");
        }

        private static bool IsProtectedCleanupText(
            DrawingCleanupEntityInfo entity,
            DrawingCleanupConfig config
        )
        {
            if (
                entity.EntityType != DrawingCleanupEntityType.Text
                && entity.EntityType != DrawingCleanupEntityType.MText
            )
            {
                return false;
            }

            var layer = NormalizeText(entity.LayerName).ToUpperInvariant();
            if (MatchesDrawingCleanupPatterns(layer, config.ProtectedTextLayerPatterns))
            {
                return true;
            }

            var content = StripCleanupFormatting(entity.TextContent).ToUpperInvariant();
            return MatchesDrawingCleanupPatterns(content, config.ProtectedTextContentPatterns);
        }

        private static bool MatchesDrawingCleanupPatterns(
            string value,
            IEnumerable<string> patterns
        )
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return false;
            }

            foreach (var rawPattern in patterns)
            {
                var pattern = NormalizeText(rawPattern);
                if (string.IsNullOrWhiteSpace(pattern))
                {
                    continue;
                }

                if (!pattern.Contains("*") && !pattern.Contains("?"))
                {
                    if (value.IndexOf(pattern, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        return true;
                    }
                    continue;
                }

                var regexPattern =
                    "^"
                    + Regex.Escape(pattern)
                        .Replace("\\*", ".*")
                        .Replace("\\?", ".")
                    + "$";
                if (Regex.IsMatch(value, regexPattern, RegexOptions.IgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        private static bool IsDrawingCleanupImportantAttribute(string tag)
        {
            var upper = NormalizeText(tag).ToUpperInvariant();
            return upper.Contains("ID")
                || upper.Contains("NAME")
                || upper.Contains("TAG")
                || upper.Contains("LABEL")
                || upper.Contains("VOLTAGE")
                || upper.Contains("RATING");
        }

        private static void SafeAdjustDrawingCleanupDbTextAlignment(
            DBText dbText,
            Database database
        )
        {
            try
            {
                dbText.AdjustAlignment(database);
            }
            catch
            {
                // Best effort alignment refresh only.
            }
        }

        private static double NormalizeAngle(double radians)
        {
            while (radians <= -Math.PI)
            {
                radians += Math.PI * 2.0;
            }
            while (radians > Math.PI)
            {
                radians -= Math.PI * 2.0;
            }
            return radians;
        }

        private static bool NearlyEqual(double left, double right, double tolerance = 0.001)
        {
            return Math.Abs(left - right) <= tolerance;
        }
    }
}
