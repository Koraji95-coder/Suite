using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
    private static readonly HashSet<string> SupportedAutoDraftExecuteCategories = new(
        StringComparer.OrdinalIgnoreCase
    )
    {
        "add",
        "delete",
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

        var actionCount = actionsArray.Count;
        if (actionCount == 0)
        {
            return BuildAutoDraftExecuteResult(
                dryRun: dryRun,
                status: dryRun ? "dry-run" : "preflight-only",
                accepted: 0,
                skipped: 0,
                message: "No AutoDraft actions were supplied.",
                warnings: warnings,
                cadAvailable: false,
                drawingName: null,
                readOnly: null,
                commandMask: null,
                commandStateAvailable: false
            );
        }

        var accepted = 0;
        var skipped = 0;
        foreach (var actionNode in actionsArray)
        {
            if (actionNode is not JsonObject actionObject)
            {
                skipped += 1;
                warnings.Add("Skipped one action because it was not a JSON object.");
                continue;
            }

            if (IsAutoDraftActionExecutionReady(actionObject, out var reason))
            {
                accepted += 1;
                continue;
            }

            skipped += 1;
            if (!string.IsNullOrWhiteSpace(reason))
            {
                warnings.Add(reason);
            }
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
                message: "AutoDraft execution requires an active AutoCAD session.",
                warnings: warnings,
                cadAvailable: false,
                drawingName: null,
                readOnly: null,
                commandMask: null,
                commandStateAvailable: false
            );
        }

        using (session)
        {
            var drawingName = StringOrDefault(ReadProperty(session.Document, "Name"), "Unknown.dwg");
            var readOnly = TryReadBoolLike(ReadProperty(session.Document, "ReadOnly"), fallback: false);
            var commandStateAvailable = TryReadCommandActiveMask(session, out var commandMask);
            if (!commandStateAvailable)
            {
                warnings.Add("Could not read AutoCAD command activity state. Proceeding with conservative preflight only.");
            }

            if (readOnly)
            {
                warnings.Add("Active drawing is read-only.");
                return BuildAutoDraftExecuteResult(
                    dryRun: dryRun,
                    status: "cad_not_ready",
                    accepted: 0,
                    skipped: actionCount,
                    message: "Active drawing is read-only. AutoDraft execute was skipped.",
                    warnings: warnings,
                    cadAvailable: true,
                    drawingName: drawingName,
                    readOnly: true,
                    commandMask: commandStateAvailable ? commandMask : null,
                    commandStateAvailable: commandStateAvailable
                );
            }

            if (commandStateAvailable && commandMask > 0)
            {
                warnings.Add($"AutoCAD command state is busy (CMDACTIVE={commandMask}).");
                return BuildAutoDraftExecuteResult(
                    dryRun: dryRun,
                    status: "cad_not_ready",
                    accepted: 0,
                    skipped: actionCount,
                    message: "AutoCAD is busy. AutoDraft execute was skipped.",
                    warnings: warnings,
                    cadAvailable: true,
                    drawingName: drawingName,
                    readOnly: false,
                    commandMask: commandMask,
                    commandStateAvailable: true
                );
            }

            var status = dryRun ? "dry-run" : "preflight-only";
            var message = dryRun
                ? $"Dry-run preflight complete in '{drawingName}'. {accepted} action(s) are execution-ready; {skipped} skipped."
                : $"CAD preflight completed in '{drawingName}'. {accepted} action(s) are execution-ready; {skipped} skipped. CAD writes are not enabled yet in bridge mode.";

            return BuildAutoDraftExecuteResult(
                dryRun: dryRun,
                status: status,
                accepted: accepted,
                skipped: skipped,
                message: message,
                warnings: warnings,
                cadAvailable: true,
                drawingName: drawingName,
                readOnly: false,
                commandMask: commandStateAvailable ? commandMask : null,
                commandStateAvailable: commandStateAvailable
            );
        }
    }

    private static bool IsAutoDraftActionExecutionReady(JsonObject actionObject, out string? reason)
    {
        reason = null;
        var status = ReadStringValue(actionObject, "status", "").Trim().ToLowerInvariant();
        if (status is "review" or "needs_review")
        {
            reason = "manual review";
            return false;
        }

        var ruleId = ReadStringValue(actionObject, "rule_id", "").Trim();
        if (string.IsNullOrWhiteSpace(ruleId))
        {
            reason = "missing classification";
            return false;
        }

        var category = ReadStringValue(actionObject, "category", "").Trim().ToLowerInvariant();
        if (!SupportedAutoDraftExecuteCategories.Contains(category))
        {
            reason = "unsupported category";
            return false;
        }

        var confidence = ReadDouble(actionObject, "confidence", 0.0);
        if (confidence < 0.50)
        {
            reason = "low confidence";
            return false;
        }

        var actionText = ReadStringValue(actionObject, "action", "").Trim();
        if (string.IsNullOrWhiteSpace(actionText))
        {
            reason = "missing action text";
            return false;
        }

        return true;
    }

    private static JsonObject BuildAutoDraftExecuteResult(
        bool dryRun,
        string status,
        int accepted,
        int skipped,
        string message,
        IReadOnlyCollection<string> warnings,
        bool cadAvailable,
        string? drawingName,
        bool? readOnly,
        int? commandMask,
        bool commandStateAvailable
    )
    {
        var jobId = $"autodraft-{Guid.NewGuid():N}";
        var cadNode = new JsonObject
        {
            ["available"] = cadAvailable,
            ["drawingName"] = drawingName,
            ["commandStateAvailable"] = commandStateAvailable,
        };
        if (readOnly is bool readOnlyValue)
        {
            cadNode["readOnly"] = readOnlyValue;
        }
        else
        {
            cadNode["readOnly"] = null;
        }

        if (commandMask is int commandMaskValue)
        {
            cadNode["commandMask"] = commandMaskValue;
        }
        else
        {
            cadNode["commandMask"] = null;
        }

        var dataNode = new JsonObject
        {
            ["jobId"] = jobId,
            ["status"] = status,
            ["accepted"] = Math.Max(0, accepted),
            ["skipped"] = Math.Max(0, skipped),
            ["dryRun"] = dryRun,
            ["message"] = message,
            ["cad"] = cadNode,
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
            },
        };
    }
}
