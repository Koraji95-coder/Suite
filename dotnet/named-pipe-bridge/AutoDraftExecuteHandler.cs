using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
    private const string AutoDraftNotesLayerName = "SUITE_AUTODRAFT_NOTES";
    private const int AutoDraftNotesLayerColorAci = 30;
    private const double AutoDraftDefaultMTextWidth = 36.0;
    private const double AutoDraftDefaultTextHeight = 2.5;

    private static readonly HashSet<string> SupportedAutoDraftExecuteCategories = new(
        StringComparer.OrdinalIgnoreCase
    )
    {
        "add",
        "delete",
        "dimension",
        "swap",
        "note",
        "title_block",
    };

    public static JsonObject HandleAutoDraftExecute(JsonObject payload)
    {
        var warnings = new List<string>();
        var dryRun = ReadBool(payload, "dry_run", fallback: true);
        if (!payload.TryGetPropertyValue("actions", out var actionsNode) || actionsNode is not JsonArray actionsArray)
        {
            return new JsonObject
            {
                ["success"] = false,
                ["code"] = "INVALID_REQUEST",
                ["message"] = "actions must be an array.",
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                },
                ["warnings"] = new JsonArray(),
            };
        }

        var evaluations = BuildAutoDraftActionEvaluations(actionsArray, warnings);
        AppendAutoDraftPreviewWarnings(evaluations, warnings);
        var actionCount = actionsArray.Count;
        var previewReady = evaluations.Count(item => item.ReadyForPreview);
        var previewSkipped = Math.Max(0, actionCount - previewReady);

        if (actionCount == 0)
        {
            return BuildAutoDraftExecuteResult(
                dryRun: dryRun,
                status: dryRun ? "preview-review" : "commit-blocked",
                accepted: 0,
                skipped: 0,
                previewReady: 0,
                committed: 0,
                message: "No AutoDraft actions were supplied.",
                warnings: warnings,
                cadNode: BuildAutoDraftCadSnapshot(
                    cadAvailable: false,
                    drawingName: null,
                    drawingPath: null,
                    readOnly: null,
                    commandMask: null,
                    commandStateAvailable: false,
                    activeLayout: null,
                    activeSpace: null,
                    layoutCount: null,
                    blockCount: null,
                    layerCount: null,
                    modelSpaceCount: null,
                    paperSpaceCount: null
                ),
                createdHandles: [],
                titleBlockUpdates: [],
                textReplacementUpdates: [],
                textDeleteUpdates: [],
                textSwapUpdates: [],
                dimensionTextUpdates: []
            );
        }

        AutoCadSession? session = null;
        try
        {
            session = ConnectAutoCad();
        }
        catch (Exception ex)
        {
            warnings.Add($"AutoCAD is unavailable: {ex.Message}");
            return BuildAutoDraftExecuteResult(
                dryRun: dryRun,
                status: "cad_unavailable",
                accepted: 0,
                skipped: actionCount,
                previewReady: previewReady,
                committed: 0,
                message: "AutoDraft execution requires an active AutoCAD session.",
                warnings: warnings,
                cadNode: BuildAutoDraftCadSnapshot(
                    cadAvailable: false,
                    drawingName: null,
                    drawingPath: null,
                    readOnly: null,
                    commandMask: null,
                    commandStateAvailable: false,
                    activeLayout: null,
                    activeSpace: null,
                    layoutCount: null,
                    blockCount: null,
                    layerCount: null,
                    modelSpaceCount: null,
                    paperSpaceCount: null
                ),
                createdHandles: [],
                titleBlockUpdates: [],
                textReplacementUpdates: [],
                textDeleteUpdates: [],
                textSwapUpdates: [],
                dimensionTextUpdates: []
            );
        }

        using (session)
        {
            var drawingContext = ReadAutoCadDrawingContext(session);

            if (!drawingContext.CommandStateAvailable)
            {
                warnings.Add(
                    "Could not read AutoCAD command activity state. Proceeding with conservative preflight only."
                );
            }

            var cadNode = BuildAutoDraftCadSnapshot(
                cadAvailable: true,
                drawingName: drawingContext.DrawingName,
                drawingPath: drawingContext.DrawingPath,
                readOnly: drawingContext.ReadOnly,
                commandMask: drawingContext.CommandMask,
                commandStateAvailable: drawingContext.CommandStateAvailable,
                activeLayout: drawingContext.ActiveLayout,
                activeSpace: drawingContext.ActiveSpace,
                layoutCount: drawingContext.LayoutCount,
                blockCount: drawingContext.BlockCount,
                layerCount: drawingContext.LayerCount,
                modelSpaceCount: drawingContext.ModelSpaceCount,
                paperSpaceCount: drawingContext.PaperSpaceCount
            );

            if (drawingContext.ReadOnly)
            {
                warnings.Add("Active drawing is read-only.");
                return BuildAutoDraftExecuteResult(
                    dryRun: dryRun,
                    status: "cad_not_ready",
                    accepted: 0,
                    skipped: actionCount,
                    previewReady: previewReady,
                    committed: 0,
                    message:
                        "Active drawing is read-only. AutoDraft execute was skipped.",
                    warnings: warnings,
                    cadNode: cadNode,
                    createdHandles: [],
                    titleBlockUpdates: [],
                    textReplacementUpdates: [],
                    textDeleteUpdates: [],
                    textSwapUpdates: [],
                    dimensionTextUpdates: []
                );
            }

            if (drawingContext.CommandStateAvailable && (drawingContext.CommandMask ?? 0) > 0)
            {
                warnings.Add(
                    $"AutoCAD command state is busy (CMDACTIVE={drawingContext.CommandMask})."
                );
                return BuildAutoDraftExecuteResult(
                    dryRun: dryRun,
                    status: "cad_not_ready",
                    accepted: 0,
                    skipped: actionCount,
                    previewReady: previewReady,
                    committed: 0,
                    message: "AutoCAD is busy. AutoDraft execute was skipped.",
                    warnings: warnings,
                    cadNode: cadNode,
                    createdHandles: [],
                    titleBlockUpdates: [],
                    textReplacementUpdates: [],
                    textDeleteUpdates: [],
                    textSwapUpdates: [],
                    dimensionTextUpdates: []
                );
            }

            if (dryRun)
            {
                var previewStatus = previewReady > 0 ? "preview-ready" : "preview-review";
                var previewMessage = previewReady > 0
                    ? $"Preview complete in '{drawingContext.DrawingName}'. {previewReady} action(s) are commit-ready; {previewSkipped} skipped."
                    : $"Preview complete in '{drawingContext.DrawingName}'. No actions are ready for commit; {previewSkipped} skipped.";

                return BuildAutoDraftExecuteResult(
                    dryRun: true,
                    status: previewStatus,
                    accepted: previewReady,
                    skipped: previewSkipped,
                    previewReady: previewReady,
                    committed: 0,
                    message: previewMessage,
                    warnings: warnings,
                    cadNode: cadNode,
                    createdHandles: [],
                    titleBlockUpdates: [],
                    textReplacementUpdates: [],
                    textDeleteUpdates: [],
                    textSwapUpdates: [],
                    dimensionTextUpdates: []
                );
            }

            var committed = 0;
            var createdHandles = new List<string>();
            var titleBlockUpdates = new List<JsonObject>();
            var textReplacementUpdates = new List<JsonObject>();
            var textDeleteUpdates = new List<JsonObject>();
            var textSwapUpdates = new List<JsonObject>();
            var dimensionTextUpdates = new List<JsonObject>();
            foreach (var evaluation in evaluations)
            {
                if (!evaluation.ReadyForPreview)
                {
                    continue;
                }

                if (!evaluation.CommitEnabled)
                {
                    warnings.Add($"{evaluation.ActionId}: {evaluation.CommitBlockReason}");
                    continue;
                }

                if (evaluation.ActionObject is null)
                {
                    warnings.Add($"{evaluation.ActionId}: missing action payload.");
                    continue;
                }

                if (TryCommitAutoDraftAction(
                        session: session,
                        actionObject: evaluation.ActionObject,
                        evaluation: evaluation,
                        warnings: warnings,
                        out var createdHandle,
                        out var skipReason,
                        out var titleBlockActionUpdates,
                        out var textReplacementActionUpdates,
                        out var textDeleteActionUpdates,
                        out var textSwapActionUpdates,
                        out var dimensionTextActionUpdates
                    ))
                {
                    committed += 1;
                    if (!string.IsNullOrWhiteSpace(createdHandle))
                    {
                        createdHandles.Add(createdHandle);
                    }
                    if (titleBlockActionUpdates.Count > 0)
                    {
                        titleBlockUpdates.AddRange(titleBlockActionUpdates);
                    }
                    if (textReplacementActionUpdates.Count > 0)
                    {
                        textReplacementUpdates.AddRange(textReplacementActionUpdates);
                    }
                    if (textDeleteActionUpdates.Count > 0)
                    {
                        textDeleteUpdates.AddRange(textDeleteActionUpdates);
                    }
                    if (textSwapActionUpdates.Count > 0)
                    {
                        textSwapUpdates.AddRange(textSwapActionUpdates);
                    }
                    if (dimensionTextActionUpdates.Count > 0)
                    {
                        dimensionTextUpdates.AddRange(dimensionTextActionUpdates);
                    }
                }
                else if (!string.IsNullOrWhiteSpace(skipReason))
                {
                    warnings.Add($"{evaluation.ActionId}: {skipReason}");
                }
            }

            var commitSkipped = Math.Max(0, actionCount - committed);
            var commitStatus = committed <= 0
                ? "commit-blocked"
                : commitSkipped > 0
                    ? "partially-committed"
                    : "committed";
            var commitMessage = committed <= 0
                ? $"Commit blocked in '{drawingContext.DrawingName}'. 0 action(s) were written; {commitSkipped} skipped."
                : commitSkipped > 0
                    ? $"Commit completed in '{drawingContext.DrawingName}'. {committed} action(s) were written; {commitSkipped} skipped."
                    : $"Commit completed in '{drawingContext.DrawingName}'. {committed} action(s) were written.";

            return BuildAutoDraftExecuteResult(
                dryRun: false,
                status: commitStatus,
                accepted: committed,
                skipped: commitSkipped,
                previewReady: previewReady,
                committed: committed,
                message: commitMessage,
                warnings: warnings,
                cadNode: cadNode,
                createdHandles: createdHandles,
                titleBlockUpdates: titleBlockUpdates,
                textReplacementUpdates: textReplacementUpdates,
                textDeleteUpdates: textDeleteUpdates,
                textSwapUpdates: textSwapUpdates,
                dimensionTextUpdates: dimensionTextUpdates
            );
        }
    }

    private static List<AutoDraftActionEvaluation> BuildAutoDraftActionEvaluations(
        JsonArray actionsArray,
        List<string> warnings
    )
    {
        var evaluations = new List<AutoDraftActionEvaluation>(actionsArray.Count);
        var index = 0;
        foreach (var actionNode in actionsArray)
        {
            index += 1;
            if (actionNode is not JsonObject actionObject)
            {
                warnings.Add("Skipped one action because it was not a JSON object.");
                evaluations.Add(
                    new AutoDraftActionEvaluation(
                        ActionObject: null,
                        ActionId: $"action-{index}",
                        Category: "",
                        ReadyForPreview: false,
                        PreviewBlockReason: "action payload was not a JSON object",
                        CommitEnabled: false,
                        CommitBlockReason: "action payload was not a JSON object"
                    )
                );
                continue;
            }

            evaluations.Add(EvaluateAutoDraftAction(actionObject, index));
        }

        return evaluations;
    }

    private static AutoDraftActionEvaluation EvaluateAutoDraftAction(JsonObject actionObject, int index)
    {
        var actionId = ReadStringValue(actionObject, "id", "").Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            actionId = $"action-{index}";
        }

        var status = ReadStringValue(actionObject, "status", "").Trim().ToLowerInvariant();
        if (status is "review" or "needs_review")
        {
            return new AutoDraftActionEvaluation(
                ActionObject: actionObject,
                ActionId: actionId,
                Category: "",
                ReadyForPreview: false,
                PreviewBlockReason: "manual review",
                CommitEnabled: false,
                CommitBlockReason: "manual review"
            );
        }

        var ruleId = ReadStringValue(actionObject, "rule_id", "").Trim();
        if (string.IsNullOrWhiteSpace(ruleId))
        {
            return new AutoDraftActionEvaluation(
                ActionObject: actionObject,
                ActionId: actionId,
                Category: "",
                ReadyForPreview: false,
                PreviewBlockReason: "missing classification",
                CommitEnabled: false,
                CommitBlockReason: "missing classification"
            );
        }

        var category = ReadStringValue(actionObject, "category", "").Trim().ToLowerInvariant();
        if (!SupportedAutoDraftExecuteCategories.Contains(category))
        {
            return new AutoDraftActionEvaluation(
                ActionObject: actionObject,
                ActionId: actionId,
                Category: category,
                ReadyForPreview: false,
                PreviewBlockReason: "unsupported category",
                CommitEnabled: false,
                CommitBlockReason: "unsupported category"
            );
        }

        var confidence = ReadDouble(actionObject, "confidence", 0.0);
        if (confidence < 0.50)
        {
            return new AutoDraftActionEvaluation(
                ActionObject: actionObject,
                ActionId: actionId,
                Category: category,
                ReadyForPreview: false,
                PreviewBlockReason: "low confidence",
                CommitEnabled: false,
                CommitBlockReason: "low confidence"
            );
        }

        var actionText = ReadStringValue(actionObject, "action", "").Trim();
        if (string.IsNullOrWhiteSpace(actionText))
        {
            return new AutoDraftActionEvaluation(
                ActionObject: actionObject,
                ActionId: actionId,
                Category: category,
                ReadyForPreview: false,
                PreviewBlockReason: "missing action text",
                CommitEnabled: false,
                CommitBlockReason: "missing action text"
            );
        }

        var commitEnabled = false;
        var commitBlockReason = $"commit mode for category '{category}' is not enabled yet";
        if (string.Equals(category, "note", StringComparison.OrdinalIgnoreCase))
        {
            var markupObject = actionObject["markup"] as JsonObject;
            var noteText = ResolveAutoDraftNoteText(actionObject, markupObject);
            if (string.IsNullOrWhiteSpace(noteText))
            {
                commitBlockReason = "missing note text";
            }
            else if (!TryResolveAutoDraftNoteTarget(markupObject, out _, out _, out var targetReason))
            {
                commitBlockReason = targetReason;
            }
            else
            {
                commitEnabled = true;
                commitBlockReason = "";
            }
        }
        else if (string.Equals(category, "title_block", StringComparison.OrdinalIgnoreCase))
        {
            if (!TryResolveAutoDraftTitleBlockExecuteTarget(actionObject, out _, out var targetReason))
            {
                return new AutoDraftActionEvaluation(
                    ActionObject: actionObject,
                    ActionId: actionId,
                    Category: category,
                    ReadyForPreview: false,
                    PreviewBlockReason: targetReason,
                    CommitEnabled: false,
                    CommitBlockReason: targetReason
                );
            }

            commitEnabled = true;
            commitBlockReason = "";
        }
        else if (string.Equals(category, "add", StringComparison.OrdinalIgnoreCase))
        {
            if (TryResolveAutoDraftTextReplacementExecuteTarget(actionObject, out _, out var targetReason))
            {
                commitEnabled = true;
                commitBlockReason = "";
            }
            else
            {
                commitBlockReason = targetReason;
            }
        }
        else if (string.Equals(category, "delete", StringComparison.OrdinalIgnoreCase))
        {
            if (TryResolveAutoDraftTextDeleteExecuteTarget(actionObject, out _, out var targetReason))
            {
                commitEnabled = true;
                commitBlockReason = "";
            }
            else
            {
                commitBlockReason = targetReason;
            }
        }
        else if (string.Equals(category, "swap", StringComparison.OrdinalIgnoreCase))
        {
            if (TryResolveAutoDraftTextSwapExecuteTarget(actionObject, out _, out var targetReason))
            {
                commitEnabled = true;
                commitBlockReason = "";
            }
            else
            {
                commitBlockReason = targetReason;
            }
        }
        else if (string.Equals(category, "dimension", StringComparison.OrdinalIgnoreCase))
        {
            if (TryResolveAutoDraftDimensionTextExecuteTarget(actionObject, out _, out var targetReason))
            {
                commitEnabled = true;
                commitBlockReason = "";
            }
            else
            {
                commitBlockReason = targetReason;
            }
        }

        return new AutoDraftActionEvaluation(
            ActionObject: actionObject,
            ActionId: actionId,
            Category: category,
            ReadyForPreview: true,
            PreviewBlockReason: "",
            CommitEnabled: commitEnabled,
            CommitBlockReason: commitBlockReason
        );
    }

    private static bool TryCommitAutoDraftAction(
        AutoCadSession session,
        JsonObject actionObject,
        AutoDraftActionEvaluation evaluation,
        List<string> warnings,
        out string createdHandle,
        out string skipReason,
        out IReadOnlyList<JsonObject> titleBlockUpdates,
        out IReadOnlyList<JsonObject> textReplacementUpdates,
        out IReadOnlyList<JsonObject> textDeleteUpdates,
        out IReadOnlyList<JsonObject> textSwapUpdates,
        out IReadOnlyList<JsonObject> dimensionTextUpdates
    )
    {
        createdHandle = "";
        skipReason = "";
        titleBlockUpdates = Array.Empty<JsonObject>();
        textReplacementUpdates = Array.Empty<JsonObject>();
        textDeleteUpdates = Array.Empty<JsonObject>();
        textSwapUpdates = Array.Empty<JsonObject>();
        dimensionTextUpdates = Array.Empty<JsonObject>();

        if (string.Equals(evaluation.Category, "note", StringComparison.OrdinalIgnoreCase))
        {
            var markupObject = actionObject["markup"] as JsonObject;
            var noteText = ResolveAutoDraftNoteText(actionObject, markupObject);
            if (string.IsNullOrWhiteSpace(noteText))
            {
                skipReason = "missing note text";
                return false;
            }

            if (!TryResolveAutoDraftNoteTarget(markupObject, out var x, out var y, out var targetReason))
            {
                skipReason = targetReason;
                return false;
            }

            EnsureLayerExists(session.Document, AutoDraftNotesLayerName, AutoDraftNotesLayerColorAci);
            var sanitizedNoteText = SanitizeAutoDraftNoteText(noteText);
            try
            {
                dynamic entity = ((dynamic)session.Modelspace).AddMText(
                    CadPoint(SnapCoord(x), SnapCoord(y), 0.0),
                    AutoDraftDefaultMTextWidth,
                    sanitizedNoteText
                );
                SetEntityLayerAndColor(entity, AutoDraftNotesLayerName, AutoDraftNotesLayerColorAci);
                createdHandle = GetEntityHandle(entity);
                return true;
            }
            catch (Exception mtextEx)
            {
                BridgeLog.Warn(
                    $"AutoDraft note MText insert failed for {evaluation.ActionId}: {mtextEx.Message}. Falling back to AddText."
                );
                try
                {
                    dynamic entity = ((dynamic)session.Modelspace).AddText(
                        sanitizedNoteText,
                        CadPoint(SnapCoord(x), SnapCoord(y), 0.0),
                        AutoDraftDefaultTextHeight
                    );
                    SetEntityLayerAndColor(entity, AutoDraftNotesLayerName, AutoDraftNotesLayerColorAci);
                    createdHandle = GetEntityHandle(entity);
                    warnings.Add(
                        $"{evaluation.ActionId}: MText insert failed; fallback AddText was used."
                    );
                    return true;
                }
                catch (Exception textEx)
                {
                    BridgeLog.Warn(
                        $"AutoDraft note commit failed for {evaluation.ActionId}: {textEx.Message}"
                    );
                    skipReason = $"note creation failed: {textEx.Message}";
                    return false;
                }
            }
        }

        if (string.Equals(evaluation.Category, "title_block", StringComparison.OrdinalIgnoreCase))
        {
            return TryCommitAutoDraftTitleBlockAction(
                session: session,
                actionObject: actionObject,
                evaluation: evaluation,
                warnings: warnings,
                out createdHandle,
                out skipReason,
                out titleBlockUpdates
            );
        }

        if (string.Equals(evaluation.Category, "add", StringComparison.OrdinalIgnoreCase))
        {
            return TryCommitAutoDraftTextReplacementAction(
                session: session,
                actionObject: actionObject,
                evaluation: evaluation,
                warnings: warnings,
                out createdHandle,
                out skipReason,
                out textReplacementUpdates
            );
        }

        if (string.Equals(evaluation.Category, "delete", StringComparison.OrdinalIgnoreCase))
        {
            return TryCommitAutoDraftTextDeleteAction(
                session: session,
                actionObject: actionObject,
                evaluation: evaluation,
                warnings: warnings,
                out createdHandle,
                out skipReason,
                out textDeleteUpdates
            );
        }

        if (string.Equals(evaluation.Category, "swap", StringComparison.OrdinalIgnoreCase))
        {
            return TryCommitAutoDraftTextSwapAction(
                session: session,
                actionObject: actionObject,
                evaluation: evaluation,
                warnings: warnings,
                out createdHandle,
                out skipReason,
                out textSwapUpdates
            );
        }

        if (string.Equals(evaluation.Category, "dimension", StringComparison.OrdinalIgnoreCase))
        {
            return TryCommitAutoDraftDimensionTextAction(
                session: session,
                actionObject: actionObject,
                evaluation: evaluation,
                warnings: warnings,
                out createdHandle,
                out skipReason,
                out dimensionTextUpdates
            );
        }

        if (!string.Equals(evaluation.Category, "note", StringComparison.OrdinalIgnoreCase))
        {
            skipReason = $"commit mode for category '{evaluation.Category}' is not enabled yet";
            return false;
        }
        return false;
    }

    private static string ResolveAutoDraftNoteText(JsonObject actionObject, JsonObject? markupObject)
    {
        var markupText = markupObject is null ? "" : ReadStringValue(markupObject, "text", "").Trim();
        if (!string.IsNullOrWhiteSpace(markupText))
        {
            return markupText;
        }

        var explicitText = ReadStringValue(actionObject, "note_text", "").Trim();
        if (!string.IsNullOrWhiteSpace(explicitText))
        {
            return explicitText;
        }

        var actionText = ReadStringValue(actionObject, "action", "").Trim();
        return actionText;
    }

    private static bool TryResolveAutoDraftNoteTarget(
        JsonObject? markupObject,
        out double x,
        out double y,
        out string reason
    )
    {
        x = 0.0;
        y = 0.0;
        reason = "missing CAD-transformed note target";

        if (markupObject is null)
        {
            reason = "missing markup payload";
            return false;
        }

        var metaObject = markupObject["meta"] as JsonObject;
        var hasCadTransformFlag = metaObject is not null && ReadBool(metaObject, "cad_transform_applied", fallback: false);
        if (metaObject is not null && TryReadPoint(metaObject["cad_position"], out x, out y))
        {
            return true;
        }

        if (!hasCadTransformFlag)
        {
            reason = "missing CAD-transformed target";
            return false;
        }

        if (metaObject is not null && TryReadLastPoint(metaObject["callout_points"], out x, out y))
        {
            return true;
        }

        if (TryReadBoundsCenter(markupObject["bounds"], out x, out y))
        {
            return true;
        }

        reason = "missing CAD note insertion point";
        return false;
    }

    private static bool TryReadPoint(JsonNode? node, out double x, out double y)
    {
        x = 0.0;
        y = 0.0;
        if (node is not JsonObject pointObject)
        {
            return false;
        }

        var pointX = ReadDouble(pointObject, "x", double.NaN);
        var pointY = ReadDouble(pointObject, "y", double.NaN);
        if (double.IsNaN(pointX) || double.IsNaN(pointY))
        {
            return false;
        }

        x = pointX;
        y = pointY;
        return true;
    }

    private static bool TryReadLastPoint(JsonNode? node, out double x, out double y)
    {
        x = 0.0;
        y = 0.0;
        if (node is not JsonArray pointArray)
        {
            return false;
        }

        for (var index = pointArray.Count - 1; index >= 0; index -= 1)
        {
            if (TryReadPoint(pointArray[index], out x, out y))
            {
                return true;
            }
        }

        return false;
    }

    private static bool TryReadBoundsCenter(JsonNode? node, out double x, out double y)
    {
        x = 0.0;
        y = 0.0;
        if (node is not JsonObject boundsObject)
        {
            return false;
        }

        var originX = ReadDouble(boundsObject, "x", double.NaN);
        var originY = ReadDouble(boundsObject, "y", double.NaN);
        var width = ReadDouble(boundsObject, "width", double.NaN);
        var height = ReadDouble(boundsObject, "height", double.NaN);
        if (double.IsNaN(originX) || double.IsNaN(originY) || double.IsNaN(width) || double.IsNaN(height))
        {
            return false;
        }

        x = originX + (width / 2.0);
        y = originY + (height / 2.0);
        return true;
    }

    private static string SanitizeAutoDraftNoteText(string value)
    {
        var normalized = (value ?? "").Replace("\r\n", "\n").Replace("\r", "\n").Trim();
        if (normalized.Length <= 0)
        {
            return "AutoDraft note";
        }
        return normalized.Length <= 500 ? normalized : normalized.Substring(0, 500);
    }

    private static bool TryCommitAutoDraftTitleBlockAction(
        AutoCadSession session,
        JsonObject actionObject,
        AutoDraftActionEvaluation evaluation,
        List<string> warnings,
        out string createdHandle,
        out string skipReason,
        out IReadOnlyList<JsonObject> titleBlockUpdates
    )
    {
        createdHandle = "";
        skipReason = "";
        titleBlockUpdates = Array.Empty<JsonObject>();

        if (!TryResolveAutoDraftTitleBlockExecuteTarget(actionObject, out var target, out var targetReason))
        {
            skipReason = targetReason;
            return false;
        }

        var outcome = CommitAutoDraftTitleBlockExecuteTarget(session.Document, target, warnings);
        if (!outcome.Succeeded)
        {
            skipReason = outcome.SkipReason;
            return false;
        }

        var updateNodes = new List<JsonObject>();
        foreach (var updateNode in AutoDraftTitleBlockUpdatesToJsonArray(outcome.TitleBlockUpdates))
        {
            if (updateNode is JsonObject updateObject)
            {
                updateNodes.Add(updateObject);
            }
        }
        titleBlockUpdates = updateNodes;

        if (!outcome.WroteChanges)
        {
            skipReason = string.IsNullOrWhiteSpace(outcome.SkipReason)
                ? $"title block update produced no writes for {evaluation.ActionId}"
                : outcome.SkipReason;
            return false;
        }

        return true;
    }

    private static bool TryCommitAutoDraftTextReplacementAction(
        AutoCadSession session,
        JsonObject actionObject,
        AutoDraftActionEvaluation evaluation,
        List<string> warnings,
        out string createdHandle,
        out string skipReason,
        out IReadOnlyList<JsonObject> textReplacementUpdates
    )
    {
        createdHandle = "";
        skipReason = "";
        textReplacementUpdates = Array.Empty<JsonObject>();

        if (!TryResolveAutoDraftTextReplacementExecuteTarget(actionObject, out var target, out var targetReason))
        {
            skipReason = targetReason;
            return false;
        }

        var outcome = CommitAutoDraftTextReplacementExecuteTarget(session.Document, target, warnings);
        if (!outcome.Succeeded)
        {
            skipReason = outcome.SkipReason;
            return false;
        }

        var updateNodes = new List<JsonObject>();
        foreach (var updateNode in AutoDraftTextReplacementUpdatesToJsonArray(outcome.Updates))
        {
            if (updateNode is JsonObject updateObject)
            {
                updateNodes.Add(updateObject);
            }
        }
        textReplacementUpdates = updateNodes;
        createdHandle = outcome.Handle;

        if (!outcome.WroteChanges)
        {
            skipReason = string.IsNullOrWhiteSpace(outcome.SkipReason)
                ? $"text replacement produced no writes for {evaluation.ActionId}"
                : outcome.SkipReason;
            return false;
        }

        return true;
    }

    private static bool TryCommitAutoDraftTextDeleteAction(
        AutoCadSession session,
        JsonObject actionObject,
        AutoDraftActionEvaluation evaluation,
        List<string> warnings,
        out string createdHandle,
        out string skipReason,
        out IReadOnlyList<JsonObject> textDeleteUpdates
    )
    {
        createdHandle = "";
        skipReason = "";
        textDeleteUpdates = Array.Empty<JsonObject>();

        if (!TryResolveAutoDraftTextDeleteExecuteTarget(actionObject, out var target, out var targetReason))
        {
            skipReason = targetReason;
            return false;
        }

        var outcome = CommitAutoDraftTextDeleteExecuteTarget(session.Document, target, warnings);
        if (!outcome.Succeeded)
        {
            skipReason = outcome.SkipReason;
            return false;
        }

        var updateNodes = new List<JsonObject>();
        foreach (var updateNode in AutoDraftTextDeleteUpdatesToJsonArray(outcome.Updates))
        {
            if (updateNode is JsonObject updateObject)
            {
                updateNodes.Add(updateObject);
            }
        }
        textDeleteUpdates = updateNodes;
        createdHandle = outcome.Handle;

        if (!outcome.WroteChanges)
        {
            skipReason = string.IsNullOrWhiteSpace(outcome.SkipReason)
                ? $"text delete produced no writes for {evaluation.ActionId}"
                : outcome.SkipReason;
            return false;
        }

        return true;
    }

    private static bool TryCommitAutoDraftDimensionTextAction(
        AutoCadSession session,
        JsonObject actionObject,
        AutoDraftActionEvaluation evaluation,
        List<string> warnings,
        out string createdHandle,
        out string skipReason,
        out IReadOnlyList<JsonObject> dimensionTextUpdates
    )
    {
        createdHandle = "";
        skipReason = "";
        dimensionTextUpdates = Array.Empty<JsonObject>();

        if (!TryResolveAutoDraftDimensionTextExecuteTarget(actionObject, out var target, out var targetReason))
        {
            skipReason = targetReason;
            return false;
        }

        var outcome = CommitAutoDraftDimensionTextExecuteTarget(session.Document, target, warnings);
        if (!outcome.Succeeded)
        {
            skipReason = outcome.SkipReason;
            return false;
        }

        var updateNodes = new List<JsonObject>();
        foreach (var updateNode in AutoDraftDimensionTextUpdatesToJsonArray(outcome.Updates))
        {
            if (updateNode is JsonObject updateObject)
            {
                updateNodes.Add(updateObject);
            }
        }
        dimensionTextUpdates = updateNodes;
        createdHandle = outcome.Handle;

        if (!outcome.WroteChanges)
        {
            skipReason = string.IsNullOrWhiteSpace(outcome.SkipReason)
                ? $"dimension override produced no writes for {evaluation.ActionId}"
                : outcome.SkipReason;
            return false;
        }

        return true;
    }

    private static bool TryCommitAutoDraftTextSwapAction(
        AutoCadSession session,
        JsonObject actionObject,
        AutoDraftActionEvaluation evaluation,
        List<string> warnings,
        out string createdHandle,
        out string skipReason,
        out IReadOnlyList<JsonObject> textSwapUpdates
    )
    {
        createdHandle = "";
        skipReason = "";
        textSwapUpdates = Array.Empty<JsonObject>();

        if (!TryResolveAutoDraftTextSwapExecuteTarget(actionObject, out var target, out var targetReason))
        {
            skipReason = targetReason;
            return false;
        }

        var outcome = CommitAutoDraftTextSwapExecuteTarget(session.Document, target, warnings);
        if (!outcome.Succeeded)
        {
            skipReason = outcome.SkipReason;
            return false;
        }

        var updateNodes = new List<JsonObject>();
        foreach (var updateNode in AutoDraftTextSwapUpdatesToJsonArray(outcome.Updates))
        {
            if (updateNode is JsonObject updateObject)
            {
                updateNodes.Add(updateObject);
            }
        }
        textSwapUpdates = updateNodes;
        createdHandle = outcome.Handles.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? "";

        if (!outcome.WroteChanges)
        {
            skipReason = string.IsNullOrWhiteSpace(outcome.SkipReason)
                ? $"text swap produced no writes for {evaluation.ActionId}"
                : outcome.SkipReason;
            return false;
        }

        return true;
    }

    private static void AppendAutoDraftPreviewWarnings(
        IEnumerable<AutoDraftActionEvaluation> evaluations,
        List<string> warnings
    )
    {
        foreach (var evaluation in evaluations)
        {
            if (evaluation.ReadyForPreview || string.IsNullOrWhiteSpace(evaluation.PreviewBlockReason))
            {
                continue;
            }

            warnings.Add($"{evaluation.ActionId}: {evaluation.PreviewBlockReason}");
        }
    }

    private static JsonObject BuildAutoDraftCadSnapshot(
        bool cadAvailable,
        string? drawingName,
        string? drawingPath,
        bool? readOnly,
        int? commandMask,
        bool commandStateAvailable,
        string? activeLayout,
        string? activeSpace,
        int? layoutCount,
        int? blockCount,
        int? layerCount,
        int? modelSpaceCount,
        int? paperSpaceCount
    )
    {
        var cadNode = new JsonObject
        {
            ["available"] = cadAvailable,
            ["drawingName"] = string.IsNullOrWhiteSpace(drawingName) ? null : drawingName,
            ["drawingPath"] = string.IsNullOrWhiteSpace(drawingPath) ? null : drawingPath,
            ["commandStateAvailable"] = commandStateAvailable,
            ["activeLayout"] = string.IsNullOrWhiteSpace(activeLayout) ? null : activeLayout,
            ["activeSpace"] = string.IsNullOrWhiteSpace(activeSpace) ? null : activeSpace,
        };

        cadNode["readOnly"] = readOnly is bool readOnlyValue ? readOnlyValue : null;
        cadNode["commandMask"] = commandMask is int commandMaskValue ? commandMaskValue : null;
        cadNode["layoutCount"] = layoutCount is int layoutCountValue ? layoutCountValue : null;
        cadNode["blockCount"] = blockCount is int blockCountValue ? blockCountValue : null;
        cadNode["layerCount"] = layerCount is int layerCountValue ? layerCountValue : null;
        cadNode["modelSpaceCount"] = modelSpaceCount is int modelSpaceCountValue ? modelSpaceCountValue : null;
        cadNode["paperSpaceCount"] = paperSpaceCount is int paperSpaceCountValue ? paperSpaceCountValue : null;
        cadNode["writable"] = cadAvailable
            && readOnly is bool readOnlyState
            && !readOnlyState
            && (!commandStateAvailable || (commandMask ?? 0) <= 0);
        return cadNode;
    }

    private static JsonObject BuildAutoDraftExecuteResult(
        bool dryRun,
        string status,
        int accepted,
        int skipped,
        int previewReady,
        int committed,
        string message,
        IReadOnlyCollection<string> warnings,
        JsonObject cadNode,
        IReadOnlyCollection<string> createdHandles,
        IReadOnlyCollection<JsonObject> titleBlockUpdates,
        IReadOnlyCollection<JsonObject> textReplacementUpdates,
        IReadOnlyCollection<JsonObject> textDeleteUpdates,
        IReadOnlyCollection<JsonObject> textSwapUpdates,
        IReadOnlyCollection<JsonObject> dimensionTextUpdates
    )
    {
        var jobId = $"autodraft-{Guid.NewGuid():N}";
        var titleBlockUpdateNode = new JsonArray();
        foreach (var update in titleBlockUpdates)
        {
            titleBlockUpdateNode.Add(update.DeepClone());
        }
        var textReplacementUpdateNode = new JsonArray();
        foreach (var update in textReplacementUpdates)
        {
            textReplacementUpdateNode.Add(update.DeepClone());
        }
        var textDeleteUpdateNode = new JsonArray();
        foreach (var update in textDeleteUpdates)
        {
            textDeleteUpdateNode.Add(update.DeepClone());
        }
        var textSwapUpdateNode = new JsonArray();
        foreach (var update in textSwapUpdates)
        {
            textSwapUpdateNode.Add(update.DeepClone());
        }
        var dimensionTextUpdateNode = new JsonArray();
        foreach (var update in dimensionTextUpdates)
        {
            dimensionTextUpdateNode.Add(update.DeepClone());
        }

        var updatedHandles = new JsonArray();
        foreach (var handle in titleBlockUpdates
            .Concat(textReplacementUpdates)
            .Concat(textDeleteUpdates)
            .Concat(textSwapUpdates)
            .Concat(dimensionTextUpdates)
            .Select(update => update["handle"]?.GetValue<string>() ?? "")
            .Where(handle => !string.IsNullOrWhiteSpace(handle))
            .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            updatedHandles.Add(handle);
        }

        var commitNode = new JsonObject
        {
            ["requested"] = !dryRun,
            ["committed"] = Math.Max(0, committed),
            ["createdHandles"] = ToJsonArray(createdHandles),
            ["updatedHandles"] = updatedHandles,
            ["updatedAttributes"] = titleBlockUpdates.Count,
            ["updatedTextEntities"] = textReplacementUpdates.Count + textDeleteUpdates.Count + textSwapUpdates.Count + dimensionTextUpdates.Count,
            ["notesLayer"] = AutoDraftNotesLayerName,
            ["titleBlockUpdates"] = titleBlockUpdateNode,
            ["textReplacementUpdates"] = textReplacementUpdateNode,
            ["textDeleteUpdates"] = textDeleteUpdateNode,
            ["textSwapUpdates"] = textSwapUpdateNode,
            ["dimensionTextUpdates"] = dimensionTextUpdateNode,
        };

        var dataNode = new JsonObject
        {
            ["jobId"] = jobId,
            ["status"] = status,
            ["accepted"] = Math.Max(0, accepted),
            ["skipped"] = Math.Max(0, skipped),
            ["dryRun"] = dryRun,
            ["mode"] = dryRun ? "preview" : "commit",
            ["previewReady"] = Math.Max(0, previewReady),
            ["message"] = message,
            ["cad"] = cadNode,
            ["commit"] = commitNode.DeepClone(),
        };

        return new JsonObject
        {
            ["success"] = true,
            ["code"] = "",
            ["message"] = message,
            ["data"] = dataNode,
            ["warnings"] = ToJsonArray(warnings),
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["commit"] = commitNode,
            },
        };
    }

    private readonly record struct AutoDraftActionEvaluation(
        JsonObject? ActionObject,
        string ActionId,
        string Category,
        bool ReadyForPreview,
        string PreviewBlockReason,
        bool CommitEnabled,
        string CommitBlockReason
    );
}
