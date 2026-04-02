using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

static partial class ConduitRouteStubHandlers
{
    private const string SuiteTerminalAuthoringPluginCommand = "SUITETERMINALAUTHORAPPLY";
    private static readonly string[] SuiteCadAuthoringPluginRelativePathCandidates =
    {
        Path.Combine("dotnet", "suite-cad-authoring", "bin", "Debug", "net8.0-windows", "SuiteCadAuthoring.dll"),
        Path.Combine("dotnet", "suite-cad-authoring", "bin", "Release", "net8.0-windows", "SuiteCadAuthoring.dll"),
        Path.Combine("dotnet", "suite-cad-authoring", "bin", "Debug", "net48", "SuiteCadAuthoring.dll"),
        Path.Combine("dotnet", "suite-cad-authoring", "bin", "Release", "net48", "SuiteCadAuthoring.dll"),
    };

    private readonly record struct SuiteTerminalStripScheduleRow(
        string RowId,
        string DrawingPath,
        string DrawingNumber,
        string PanelId,
        string Side,
        string StripId,
        int TerminalCount,
        List<string> Labels
    );

    private readonly record struct SuiteTerminalConnectionScheduleRow(
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

    private readonly record struct SuiteTerminalStripScan(
        string PanelId,
        string Side,
        string StripId,
        int TerminalCount,
        List<string> Labels,
        double X,
        double Y
    );

    public static JsonObject HandleSuiteTerminalAuthoringProjectPreview(JsonObject payload)
    {
        var projectId = ReadStringValue(payload, "projectId", "").Trim();
        var issueSetId = ReadStringValue(payload, "issueSetId", "").Trim();
        var scheduleSnapshotId = ReadStringValue(payload, "scheduleSnapshotId", "").Trim();
        if (string.IsNullOrWhiteSpace(projectId))
        {
            return BuildSuiteInvalidRequestResult("projectId is required.");
        }
        if (string.IsNullOrWhiteSpace(issueSetId))
        {
            return BuildSuiteInvalidRequestResult("issueSetId is required.");
        }
        if (string.IsNullOrWhiteSpace(scheduleSnapshotId))
        {
            return BuildSuiteInvalidRequestResult("scheduleSnapshotId is required.");
        }

        var drawings = ReadSuiteCadProjectDrawings(payload, out var validationError);
        if (validationError.Length > 0)
        {
            return BuildSuiteInvalidRequestResult(validationError);
        }

        var stripRows = ReadSuiteTerminalStripScheduleRows(payload, out validationError);
        if (validationError.Length > 0)
        {
            return BuildSuiteInvalidRequestResult(validationError);
        }

        var connectionRows = ReadSuiteTerminalConnectionScheduleRows(payload, out validationError);
        if (validationError.Length > 0)
        {
            return BuildSuiteInvalidRequestResult(validationError);
        }

        using var session = ConnectAutoCad();
        var warnings = new List<string>();
        var operations = new JsonArray();
        var stripsByDrawingPath = new Dictionary<string, Dictionary<string, SuiteTerminalStripScan>>(
            StringComparer.OrdinalIgnoreCase
        );
        var drawingWarnings = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (var drawing in drawings)
        {
            var perDrawingWarnings = new List<string>();
            drawingWarnings[drawing.DrawingPath] = perDrawingWarnings;
            try
            {
                using var documentScope = OpenSuiteDocument(
                    session.Application,
                    session.Document,
                    drawing.DrawingPath,
                    readOnly: true
                );
                TryActivateSuiteDocument(documentScope.Document);
                stripsByDrawingPath[drawing.DrawingPath] = ScanSuiteTerminalStrips(
                    documentScope.Document,
                    perDrawingWarnings
                );
            }
            catch (Exception ex)
            {
                perDrawingWarnings.Add(
                    $"Preview failed for '{drawing.DrawingPath}': {DescribeException(ex)}"
                );
                stripsByDrawingPath[drawing.DrawingPath] = new Dictionary<string, SuiteTerminalStripScan>(
                    StringComparer.OrdinalIgnoreCase
                );
            }
            warnings.AddRange(perDrawingWarnings);
        }

        TryActivateSuiteDocument(session.Document);

        foreach (var row in stripRows)
        {
            var resolvedDrawing = ResolveSuiteTerminalDrawing(row.DrawingPath, row.DrawingNumber, drawings);
            if (!resolvedDrawing.Resolved)
            {
                operations.Add(
                    BuildSuiteTerminalUnresolvedOperation(
                        row.RowId,
                        source: "strip",
                        drawingPath: resolvedDrawing.Drawing?.DrawingPath,
                        drawingName: resolvedDrawing.Drawing?.DrawingName,
                        relativePath: resolvedDrawing.Drawing?.RelativePath,
                        stripId: row.StripId,
                        routeRef: "",
                        detail: $"Terminal strip row '{row.RowId}' could not be resolved to exactly one selected drawing.",
                        warning: resolvedDrawing.Warning
                    )
                );
                continue;
            }

            var drawing = resolvedDrawing.Drawing!.Value;
            var drawingStrips = stripsByDrawingPath.TryGetValue(drawing.DrawingPath, out var scannedStrips)
                ? scannedStrips
                : new Dictionary<string, SuiteTerminalStripScan>(StringComparer.OrdinalIgnoreCase);
            if (!drawingStrips.TryGetValue(row.StripId, out var scannedStrip))
            {
                operations.Add(
                    BuildSuiteTerminalUnresolvedOperation(
                        row.RowId,
                        source: "strip",
                        drawingPath: drawing.DrawingPath,
                        drawingName: drawing.DrawingName,
                        relativePath: drawing.RelativePath,
                        stripId: row.StripId,
                        routeRef: "",
                        detail: $"Terminal strip '{row.StripId}' was not found in {drawing.DrawingName}.",
                        warning: $"Preview could not match strip '{row.StripId}' in '{drawing.DrawingName}'."
                    )
                );
                continue;
            }

            var desiredLabels = NormalizeSuiteTerminalLabels(row.Labels, row.TerminalCount);
            var currentLabels = NormalizeSuiteTerminalLabels(scannedStrip.Labels, row.TerminalCount);
            if (desiredLabels.SequenceEqual(currentLabels))
            {
                continue;
            }

            operations.Add(
                BuildSuiteTerminalLabelUpsertOperation(
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
            var resolvedDrawing = ResolveSuiteTerminalDrawing(row.DrawingPath, row.DrawingNumber, drawings);
            if (!resolvedDrawing.Resolved)
            {
                operations.Add(
                    BuildSuiteTerminalUnresolvedOperation(
                        row.RowId,
                        source: "connection",
                        drawingPath: resolvedDrawing.Drawing?.DrawingPath,
                        drawingName: resolvedDrawing.Drawing?.DrawingName,
                        relativePath: resolvedDrawing.Drawing?.RelativePath,
                        stripId: "",
                        routeRef: row.RouteRef,
                        detail: $"Terminal connection row '{row.RowId}' could not be resolved to exactly one selected drawing.",
                        warning: resolvedDrawing.Warning
                    )
                );
                continue;
            }

            var drawing = resolvedDrawing.Drawing!.Value;
            var drawingStrips = stripsByDrawingPath.TryGetValue(drawing.DrawingPath, out var scannedStrips)
                ? scannedStrips
                : new Dictionary<string, SuiteTerminalStripScan>(StringComparer.OrdinalIgnoreCase);

            if (!drawingStrips.TryGetValue(row.FromStripId, out var fromStrip))
            {
                operations.Add(
                    BuildSuiteTerminalUnresolvedOperation(
                        row.RowId,
                        source: "connection",
                        drawingPath: drawing.DrawingPath,
                        drawingName: drawing.DrawingName,
                        relativePath: drawing.RelativePath,
                        stripId: row.FromStripId,
                        routeRef: row.RouteRef,
                        detail: $"Route '{row.RouteRef}' could not find source strip '{row.FromStripId}' in {drawing.DrawingName}.",
                        warning: $"Preview could not match source strip '{row.FromStripId}' for route '{row.RouteRef}'."
                    )
                );
                continue;
            }

            if (!drawingStrips.TryGetValue(row.ToStripId, out var toStrip))
            {
                operations.Add(
                    BuildSuiteTerminalUnresolvedOperation(
                        row.RowId,
                        source: "connection",
                        drawingPath: drawing.DrawingPath,
                        drawingName: drawing.DrawingName,
                        relativePath: drawing.RelativePath,
                        stripId: row.ToStripId,
                        routeRef: row.RouteRef,
                        detail: $"Route '{row.RouteRef}' could not find destination strip '{row.ToStripId}' in {drawing.DrawingName}.",
                        warning: $"Preview could not match destination strip '{row.ToStripId}' for route '{row.RouteRef}'."
                    )
                );
                continue;
            }

            operations.Add(
                BuildSuiteTerminalRouteOperation(
                    projectId,
                    drawing,
                    row,
                    fromStrip,
                    toStrip
                )
            );
        }

        var drawingSummaries = BuildSuiteTerminalDrawingSummaries(drawings, operations, drawingWarnings);
        var stripUpdateCount = CountTerminalOperations(operations, "label-upsert");
        var routeUpsertCount = CountTerminalOperations(operations, "route-insert")
            + CountTerminalOperations(operations, "route-update");
        var unresolvedCount = CountTerminalOperations(operations, "unresolved");

        return new JsonObject
        {
            ["success"] = true,
            ["code"] = "",
            ["message"] = "Project terminal authoring preview completed.",
            ["data"] = new JsonObject
            {
                ["operationCount"] = operations.Count,
                ["stripUpdateCount"] = stripUpdateCount,
                ["routeUpsertCount"] = routeUpsertCount,
                ["unresolvedCount"] = unresolvedCount,
                ["drawings"] = drawingSummaries,
                ["operations"] = operations,
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet",
                ["action"] = "suite_terminal_authoring_project_preview",
                ["drawingCount"] = drawings.Count,
                ["operationCount"] = operations.Count,
            },
            ["warnings"] = ToJsonArray(warnings),
        };
    }

    public static JsonObject HandleSuiteTerminalAuthoringProjectApply(JsonObject payload)
    {
        var projectId = ReadStringValue(payload, "projectId", "").Trim();
        var issueSetId = ReadStringValue(payload, "issueSetId", "").Trim();
        var scheduleSnapshotId = ReadStringValue(payload, "scheduleSnapshotId", "").Trim();
        if (string.IsNullOrWhiteSpace(projectId))
        {
            return BuildSuiteInvalidRequestResult("projectId is required.");
        }
        if (string.IsNullOrWhiteSpace(issueSetId))
        {
            return BuildSuiteInvalidRequestResult("issueSetId is required.");
        }
        if (string.IsNullOrWhiteSpace(scheduleSnapshotId))
        {
            return BuildSuiteInvalidRequestResult("scheduleSnapshotId is required.");
        }

        if (payload["operations"] is not JsonArray operationsArray || operationsArray.Count <= 0)
        {
            return BuildSuiteInvalidRequestResult("operations must contain at least one approved preview row.");
        }

        foreach (var node in operationsArray)
        {
            if (node is not JsonObject operation)
            {
                continue;
            }

            var operationType = ReadStringValue(operation, "operationType", "").Trim().ToLowerInvariant();
            if (operationType == "unresolved")
            {
                return BuildSuiteInvalidRequestResult("operations cannot include unresolved preview rows.");
            }

            var drawingPath = ReadStringValue(operation, "drawingPath", "").Trim();
            if (string.IsNullOrWhiteSpace(drawingPath))
            {
                return BuildSuiteInvalidRequestResult(
                    "operations must contain drawingPath for every approved preview row."
                );
            }
        }

        var pluginDllPath = ResolveSuiteCadAuthoringPluginDllPath(payload, out var pluginValidationError);
        if (!string.IsNullOrWhiteSpace(pluginValidationError))
        {
            return new JsonObject
            {
                ["success"] = false,
                ["code"] = "PLUGIN_NOT_READY",
                ["message"] = pluginValidationError,
                ["data"] = new JsonObject(),
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                    ["providerPath"] = "dotnet",
                    ["action"] = "suite_terminal_authoring_project_apply",
                },
                ["warnings"] = new JsonArray(),
            };
        }

        var tempRoot = Path.Combine(
            Path.GetTempPath(),
            "suite-terminal-authoring",
            Guid.NewGuid().ToString("N")
        );
        Directory.CreateDirectory(tempRoot);
        var payloadPath = Path.Combine(tempRoot, "payload.json");
        var resultPath = Path.Combine(tempRoot, "result.json");
        var warnings = new List<string>();

        try
        {
            var pluginPayload = new JsonObject
            {
                ["requestId"] = ReadStringValue(payload, "requestId", "").Trim(),
                ["projectId"] = projectId,
                ["issueSetId"] = issueSetId,
                ["scheduleSnapshotId"] = scheduleSnapshotId,
                ["operations"] = operationsArray.DeepClone(),
            };
            File.WriteAllText(
                payloadPath,
                pluginPayload.ToJsonString(new JsonSerializerOptions { WriteIndented = true })
            );

            using var session = ConnectAutoCad();
            var commandScript = BuildSuitePluginCommandScript(
                pluginDllPath,
                SuiteTerminalAuthoringPluginCommand,
                payloadPath,
                resultPath
            );

            ReadWithTransientComRetry(
                () =>
                {
                    ((dynamic)session.Document).SendCommand(commandScript);
                    return true;
                },
                $"SendCommand({SuiteTerminalAuthoringPluginCommand})"
            );

            var (completed, sawActiveCommand, commandStateAvailable, lastCommandMask) =
                WaitForAutoCadCommandCompletion(session, 180_000);
            if (!completed)
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "AUTOCAD_COMMAND_TIMEOUT",
                    ["message"] =
                        $"Timed out waiting for AutoCAD to finish '{SuiteTerminalAuthoringPluginCommand}'.",
                    ["data"] = new JsonObject
                    {
                        ["pluginDllPath"] = pluginDllPath,
                        ["payloadPath"] = payloadPath,
                        ["resultPath"] = resultPath,
                        ["lastCommandMask"] = lastCommandMask,
                    },
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "suite_terminal_authoring_project_apply",
                        ["commandStateAvailable"] = commandStateAvailable,
                        ["sawActiveCommand"] = sawActiveCommand,
                    },
                    ["warnings"] = ToJsonArray(warnings),
                };
            }

            if (!File.Exists(resultPath))
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "PLUGIN_RESULT_MISSING",
                    ["message"] = $"SuiteCadAuthoring did not produce a result file at '{resultPath}'.",
                    ["data"] = new JsonObject
                    {
                        ["pluginDllPath"] = pluginDllPath,
                        ["payloadPath"] = payloadPath,
                        ["resultPath"] = resultPath,
                    },
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "suite_terminal_authoring_project_apply",
                    },
                    ["warnings"] = ToJsonArray(warnings),
                };
            }

            var parsed = JsonNode.Parse(File.ReadAllText(resultPath)) as JsonObject;
            if (parsed is null)
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "PLUGIN_RESULT_INVALID",
                    ["message"] = "SuiteCadAuthoring returned malformed JSON.",
                    ["data"] = new JsonObject
                    {
                        ["pluginDllPath"] = pluginDllPath,
                        ["payloadPath"] = payloadPath,
                        ["resultPath"] = resultPath,
                    },
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "suite_terminal_authoring_project_apply",
                    },
                    ["warnings"] = ToJsonArray(warnings),
                };
            }

            var meta = parsed["meta"] as JsonObject ?? new JsonObject();
            meta["source"] = "dotnet";
            meta["providerPath"] = "dotnet+plugin";
            meta["action"] = "suite_terminal_authoring_project_apply";
            meta["pluginDllPath"] = pluginDllPath;
            parsed["meta"] = meta;

            var parsedWarnings = parsed["warnings"] as JsonArray;
            if (parsedWarnings is not null)
            {
                foreach (var warning in warnings)
                {
                    parsedWarnings.Add(warning);
                }
            }
            else
            {
                parsed["warnings"] = ToJsonArray(warnings);
            }

            return parsed;
        }
        catch (Exception ex)
        {
            return new JsonObject
            {
                ["success"] = false,
                ["code"] = "PLUGIN_APPLY_FAILED",
                ["message"] = $"Terminal authoring apply failed: {DescribeException(ex)}",
                ["data"] = new JsonObject
                {
                    ["pluginDllPath"] = pluginDllPath,
                    ["payloadPath"] = payloadPath,
                    ["resultPath"] = resultPath,
                },
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                    ["providerPath"] = "dotnet",
                    ["action"] = "suite_terminal_authoring_project_apply",
                },
                ["warnings"] = ToJsonArray(warnings),
            };
        }
        finally
        {
            try
            {
                if (Directory.Exists(tempRoot))
                {
                    Directory.Delete(tempRoot, recursive: true);
                }
            }
            catch
            {
                // Best effort cleanup.
            }
        }
    }

    private static List<SuiteTerminalStripScheduleRow> ReadSuiteTerminalStripScheduleRows(
        JsonObject payload,
        out string validationError
    )
    {
        validationError = "";
        if (payload["stripRows"] is not JsonArray rowsArray || rowsArray.Count <= 0)
        {
            validationError = "stripRows must contain at least one TerminalStrips row.";
            return [];
        }

        var rows = new List<SuiteTerminalStripScheduleRow>();
        foreach (var node in rowsArray)
        {
            if (node is not JsonObject rowObj)
            {
                continue;
            }

            var rowId = ReadStringValue(rowObj, "id", "").Trim();
            var stripId = ReadStringValue(rowObj, "stripId", "").Trim().ToUpperInvariant();
            var drawingPath = ReadStringValue(rowObj, "drawingPath", "").Trim();
            var drawingNumber = ReadStringValue(rowObj, "drawingNumber", "").Trim();
            if (string.IsNullOrWhiteSpace(rowId) || string.IsNullOrWhiteSpace(stripId))
            {
                continue;
            }

            var labels = ReadStringArray(rowObj, "labels")
                .Select(entry => (entry ?? "").Trim())
                .ToList();
            var terminalCount = ClampInt(
                ReadInt(rowObj, "terminalCount", labels.Count > 0 ? labels.Count : 1),
                1,
                2000
            );

            rows.Add(
                new SuiteTerminalStripScheduleRow(
                    RowId: rowId,
                    DrawingPath: drawingPath,
                    DrawingNumber: drawingNumber,
                    PanelId: ReadStringValue(rowObj, "panelId", "").Trim().ToUpperInvariant(),
                    Side: NormalizeSide(ReadStringValue(rowObj, "side", "").Trim()),
                    StripId: stripId,
                    TerminalCount: terminalCount,
                    Labels: NormalizeSuiteTerminalLabels(labels, terminalCount)
                )
            );
        }

        if (rows.Count <= 0)
        {
            validationError = "No valid TerminalStrips rows were provided.";
        }
        return rows;
    }

    private static List<SuiteTerminalConnectionScheduleRow> ReadSuiteTerminalConnectionScheduleRows(
        JsonObject payload,
        out string validationError
    )
    {
        validationError = "";
        if (payload["connectionRows"] is not JsonArray rowsArray || rowsArray.Count <= 0)
        {
            return [];
        }

        var rows = new List<SuiteTerminalConnectionScheduleRow>();
        foreach (var node in rowsArray)
        {
            if (node is not JsonObject rowObj)
            {
                continue;
            }

            var rowId = ReadStringValue(rowObj, "id", "").Trim();
            var routeRef = ReadStringValue(rowObj, "routeRef", "").Trim();
            if (string.IsNullOrWhiteSpace(rowId) || string.IsNullOrWhiteSpace(routeRef))
            {
                continue;
            }

            var routeType = ReadStringValue(rowObj, "routeType", "conductor").Trim().ToLowerInvariant();
            routeType = routeType == "jumper" ? "jumper" : "conductor";
            rows.Add(
                new SuiteTerminalConnectionScheduleRow(
                    RowId: rowId,
                    DrawingPath: ReadStringValue(rowObj, "drawingPath", "").Trim(),
                    DrawingNumber: ReadStringValue(rowObj, "drawingNumber", "").Trim(),
                    RouteRef: routeRef,
                    RouteType: routeType,
                    CableType: ReadStringValue(rowObj, "cableType", "DC").Trim(),
                    WireFunction: ReadStringValue(rowObj, "wireFunction", "Control").Trim(),
                    FromStripId: ReadStringValue(rowObj, "fromStripId", "").Trim().ToUpperInvariant(),
                    FromTerminal: ClampInt(ReadInt(rowObj, "fromTerminal", 1), 1, 2000),
                    ToStripId: ReadStringValue(rowObj, "toStripId", "").Trim().ToUpperInvariant(),
                    ToTerminal: ClampInt(ReadInt(rowObj, "toTerminal", 1), 1, 2000),
                    AnnotateRef: ReadBool(rowObj, "annotateRef", fallback: true)
                )
            );
        }

        return rows;
    }

    private static Dictionary<string, SuiteTerminalStripScan> ScanSuiteTerminalStrips(
        object document,
        List<string> warnings
    )
    {
        var profile = ReadTerminalScanProfile(new JsonObject());
        var strips = new Dictionary<string, SuiteTerminalStripScan>(StringComparer.OrdinalIgnoreCase);
        var modelspace = ReadProperty(document, "ModelSpace") ?? ReadProperty(document, "Modelspace");
        if (modelspace is null)
        {
            warnings.Add("ModelSpace is unavailable while scanning terminal strips.");
            return strips;
        }

        var count = ReadCount(modelspace);
        for (var index = 0; index < count; index++)
        {
            var entity = ReadItem(modelspace, index);
            if (entity is null)
            {
                continue;
            }

            var objectName = SafeUpper(ReadProperty(entity, "ObjectName"));
            if (!objectName.Contains("BLOCKREFERENCE", StringComparison.Ordinal))
            {
                continue;
            }

            var attrs = ReadAttributeMap(entity);
            var blockName = StringOrDefault(ReadProperty(entity, "EffectiveName"), "");
            if (string.IsNullOrWhiteSpace(blockName))
            {
                blockName = StringOrDefault(ReadProperty(entity, "Name"), "");
            }

            if (LooksLikeJumperBlock(blockName, attrs) || !LooksLikeTerminalBlock(blockName, attrs, profile))
            {
                continue;
            }

            if (!TryReadPoint(ReadProperty(entity, "InsertionPoint"), out var x, out var y))
            {
                continue;
            }

            var stripId = FirstAttr(attrs, profile.StripIdKeys).Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(stripId))
            {
                continue;
            }
            if (strips.ContainsKey(stripId))
            {
                warnings.Add($"Drawing contains duplicate terminal strip id '{stripId}'. Preview will use the first block reference.");
                continue;
            }

            var panelId = FirstAttr(attrs, profile.PanelIdKeys).Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(panelId))
            {
                panelId = DerivePanelFromStripId(stripId);
            }
            var side = NormalizeSide(FirstAttr(attrs, profile.SideKeys));
            var terminalCount = ParseTerminalCount(
                attrs,
                profile.TerminalCountKeys,
                profile.DefaultTerminalCount
            );
            strips[stripId] = new SuiteTerminalStripScan(
                PanelId: panelId,
                Side: side,
                StripId: stripId,
                TerminalCount: terminalCount,
                Labels: ParseTerminalLabels(attrs, terminalCount),
                X: x,
                Y: y
            );
        }

        return strips;
    }

    private static (bool Resolved, SuiteCadProjectDrawing? Drawing, string Warning) ResolveSuiteTerminalDrawing(
        string drawingPath,
        string drawingNumber,
        IReadOnlyList<SuiteCadProjectDrawing> drawings
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
                .Where(drawing =>
                    string.Equals(drawing.DrawingPath, pathToken, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(drawing.RelativePath, pathToken, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(drawing.DrawingName, pathToken, StringComparison.OrdinalIgnoreCase)
                )
                .Distinct()
                .ToList();

            if (pathMatches.Count == 1)
            {
                return (true, pathMatches[0], "");
            }
            if (pathMatches.Count > 1)
            {
                return (false, null, $"Drawing reference '{pathToken}' matched more than one selected drawing.");
            }
        }

        var drawingKey = NormalizeSuiteTerminalKey(drawingNumberToken);
        if (!string.IsNullOrWhiteSpace(drawingKey))
        {
            var numberMatches = drawings
                .Where(drawing => NormalizeSuiteTerminalDrawingToken(drawing) == drawingKey)
                .Distinct()
                .ToList();
            if (numberMatches.Count == 1)
            {
                return (true, numberMatches[0], "");
            }
            if (numberMatches.Count > 1)
            {
                return (false, null, $"Drawing number '{drawingNumberToken}' matched more than one selected drawing.");
            }
        }

        var reference = !string.IsNullOrWhiteSpace(pathToken) ? pathToken : drawingNumberToken;
        return (false, null, $"Drawing reference '{reference}' did not match any selected issue-set drawing.");
    }

    private static JsonObject BuildSuiteTerminalLabelUpsertOperation(
        string projectId,
        SuiteCadProjectDrawing drawing,
        SuiteTerminalStripScheduleRow row,
        List<string> currentLabels,
        List<string> desiredLabels
    )
    {
        return new JsonObject
        {
            ["operationId"] = $"strip::{row.RowId}::{NormalizeSuiteTerminalDrawingToken(drawing)}",
            ["rowId"] = row.RowId,
            ["source"] = "strip",
            ["operationType"] = "label-upsert",
            ["drawingPath"] = drawing.DrawingPath,
            ["drawingName"] = drawing.DrawingName,
            ["relativePath"] = string.IsNullOrWhiteSpace(drawing.RelativePath) ? null : drawing.RelativePath,
            ["panelId"] = row.PanelId,
            ["side"] = row.Side,
            ["stripId"] = row.StripId,
            ["terminalCount"] = row.TerminalCount,
            ["labels"] = ToJsonArray(desiredLabels),
            ["routeRef"] = null,
            ["routeType"] = null,
            ["cableType"] = null,
            ["wireFunction"] = null,
            ["annotateRef"] = null,
            ["fromStripId"] = null,
            ["fromTerminal"] = null,
            ["toStripId"] = null,
            ["toTerminal"] = null,
            ["stripKey"] = BuildSuiteManagedStripKey(drawing, row.StripId),
            ["routeKey"] = null,
            ["before"] = FormatSuiteTerminalLabels(currentLabels),
            ["after"] = FormatSuiteTerminalLabels(desiredLabels),
            ["detail"] = $"Update strip '{row.StripId}' labels in {drawing.DrawingName}.",
            ["warning"] = null,
            ["path"] = new JsonArray(),
        };
    }

    private static JsonObject BuildSuiteTerminalRouteOperation(
        string projectId,
        SuiteCadProjectDrawing drawing,
        SuiteTerminalConnectionScheduleRow row,
        SuiteTerminalStripScan fromStrip,
        SuiteTerminalStripScan toStrip
    )
    {
        return new JsonObject
        {
            ["operationId"] = $"route::{row.RowId}::{NormalizeSuiteTerminalDrawingToken(drawing)}::{NormalizeSuiteTerminalKey(row.RouteRef)}",
            ["rowId"] = row.RowId,
            ["source"] = "connection",
            ["operationType"] = "route-insert",
            ["drawingPath"] = drawing.DrawingPath,
            ["drawingName"] = drawing.DrawingName,
            ["relativePath"] = string.IsNullOrWhiteSpace(drawing.RelativePath) ? null : drawing.RelativePath,
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
            ["routeKey"] = BuildSuiteManagedRouteKey(projectId, drawing, row.RouteType, row.RouteRef),
            ["before"] = null,
            ["after"] = $"{row.RouteType} {row.RouteRef}: {row.FromStripId}-{row.FromTerminal} to {row.ToStripId}-{row.ToTerminal}",
            ["detail"] = $"Insert Suite-managed {row.RouteType} route '{row.RouteRef}' in {drawing.DrawingName}.",
            ["warning"] = null,
            ["path"] = BuildSuiteTerminalRoutePath(fromStrip, row.FromTerminal, toStrip, row.ToTerminal),
        };
    }

    private static JsonObject BuildSuiteTerminalUnresolvedOperation(
        string rowId,
        string source,
        string? drawingPath,
        string? drawingName,
        string? relativePath,
        string stripId,
        string routeRef,
        string detail,
        string warning
    )
    {
        return new JsonObject
        {
            ["operationId"] = $"unresolved::{source}::{NormalizeSuiteTerminalKey(rowId)}::{NormalizeSuiteTerminalKey(drawingPath ?? drawingName ?? routeRef ?? stripId)}",
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

    private static JsonArray BuildSuiteTerminalDrawingSummaries(
        IReadOnlyList<SuiteCadProjectDrawing> drawings,
        JsonArray operations,
        IReadOnlyDictionary<string, List<string>> drawingWarnings
    )
    {
        var summaries = new JsonArray();
        foreach (var drawing in drawings)
        {
            var scopedOperations = operations
                .OfType<JsonObject>()
                .Where(operation => string.Equals(
                    ReadStringValue(operation, "drawingPath", "").Trim(),
                    drawing.DrawingPath,
                    StringComparison.OrdinalIgnoreCase
                ))
                .ToList();

            var warnings = new List<string>();
            if (drawingWarnings.TryGetValue(drawing.DrawingPath, out var drawingWarningEntries))
            {
                warnings.AddRange(drawingWarningEntries);
            }
            warnings.AddRange(
                scopedOperations
                    .Select(operation => ReadStringValue(operation, "warning", "").Trim())
                    .Where(warning => !string.IsNullOrWhiteSpace(warning))
            );

            summaries.Add(
                new JsonObject
                {
                    ["drawingPath"] = drawing.DrawingPath,
                    ["drawingName"] = drawing.DrawingName,
                    ["relativePath"] = string.IsNullOrWhiteSpace(drawing.RelativePath) ? null : drawing.RelativePath,
                    ["operationCount"] = scopedOperations.Count,
                    ["stripUpdateCount"] = scopedOperations.Count(operation =>
                        string.Equals(ReadStringValue(operation, "operationType", ""), "label-upsert", StringComparison.OrdinalIgnoreCase)
                    ),
                    ["routeUpsertCount"] = scopedOperations.Count(operation =>
                    {
                        var operationType = ReadStringValue(operation, "operationType", "");
                        return string.Equals(operationType, "route-insert", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(operationType, "route-update", StringComparison.OrdinalIgnoreCase);
                    }),
                    ["unresolvedCount"] = scopedOperations.Count(operation =>
                        string.Equals(ReadStringValue(operation, "operationType", ""), "unresolved", StringComparison.OrdinalIgnoreCase)
                    ),
                    ["warnings"] = ToJsonArray(warnings.Distinct(StringComparer.OrdinalIgnoreCase)),
                }
            );
        }
        return summaries;
    }

    private static int CountTerminalOperations(JsonArray operations, string operationType)
    {
        return operations
            .OfType<JsonObject>()
            .Count(operation =>
                string.Equals(
                    ReadStringValue(operation, "operationType", ""),
                    operationType,
                    StringComparison.OrdinalIgnoreCase
                )
            );
    }

    private static string NormalizeSuiteTerminalDrawingToken(SuiteCadProjectDrawing drawing)
    {
        var relativePath = (drawing.RelativePath ?? "").Trim();
        if (!string.IsNullOrWhiteSpace(relativePath))
        {
            return NormalizeSuiteTerminalKey(Path.GetFileNameWithoutExtension(relativePath));
        }
        return NormalizeSuiteTerminalKey(Path.GetFileNameWithoutExtension(drawing.DrawingName));
    }

    private static string NormalizeSuiteTerminalKey(string value)
    {
        return Regex.Replace((value ?? "").Trim().ToUpperInvariant(), "[^A-Z0-9]+", "");
    }

    private static string BuildSuiteManagedStripKey(SuiteCadProjectDrawing drawing, string stripId)
    {
        return $"{NormalizeSuiteTerminalKey(drawing.RelativePath)}::{NormalizeSuiteTerminalKey(stripId)}";
    }

    private static string BuildSuiteManagedRouteKey(
        string projectId,
        SuiteCadProjectDrawing drawing,
        string routeType,
        string routeRef
    )
    {
        return string.Join(
            "::",
            [
                NormalizeSuiteTerminalKey(projectId),
                NormalizeSuiteTerminalKey(drawing.RelativePath),
                NormalizeSuiteTerminalKey(routeType),
                NormalizeSuiteTerminalKey(routeRef),
            ]
        );
    }

    private static List<string> NormalizeSuiteTerminalLabels(
        IReadOnlyList<string> rawLabels,
        int terminalCount
    )
    {
        var count = ClampInt(terminalCount <= 0 ? rawLabels.Count : terminalCount, 1, 2000);
        var output = new List<string>(count);
        for (var index = 0; index < count; index++)
        {
            var value = index < rawLabels.Count ? rawLabels[index] ?? "" : "";
            output.Add(value.Trim());
        }
        return output;
    }

    private static string FormatSuiteTerminalLabels(IReadOnlyList<string> labels)
    {
        return string.Join(
            " | ",
            labels.Select(label => string.IsNullOrWhiteSpace(label) ? "[blank]" : label.Trim())
        );
    }

    private static JsonArray BuildSuiteTerminalRoutePath(
        SuiteTerminalStripScan fromStrip,
        int fromTerminal,
        SuiteTerminalStripScan toStrip,
        int toTerminal
    )
    {
        var fromPoint = BuildSuiteTerminalAnchorPoint(fromStrip, fromTerminal, outbound: true);
        var toPoint = BuildSuiteTerminalAnchorPoint(toStrip, toTerminal, outbound: false);
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

    private static GeometryPoint BuildSuiteTerminalAnchorPoint(
        SuiteTerminalStripScan strip,
        int terminalIndex,
        bool outbound
    )
    {
        var step = 0.18;
        var clampedIndex = ClampInt(terminalIndex, 1, Math.Max(1, strip.TerminalCount));
        var yOffset = ((strip.TerminalCount - 1) * step * 0.5) - ((clampedIndex - 1) * step);
        var xOffset = strip.Side switch
        {
            "R" => outbound ? 0.8 : -0.8,
            "L" => outbound ? -0.8 : 0.8,
            _ => outbound ? 0.8 : -0.8,
        };

        return new GeometryPoint(strip.X + xOffset, strip.Y + yOffset);
    }

    private static string ResolveSuiteCadAuthoringPluginDllPath(
        JsonObject payload,
        out string validationError
    )
    {
        validationError = "";
        var explicitPath = ReadStringValue(payload, "pluginDllPath", "").Trim().Trim('"');
        if (string.IsNullOrWhiteSpace(explicitPath))
        {
            explicitPath = (Environment.GetEnvironmentVariable("SUITE_CAD_AUTHORING_PLUGIN_DLL") ?? "")
                .Trim()
                .Trim('"');
        }

        if (!string.IsNullOrWhiteSpace(explicitPath))
        {
            if (!Path.IsPathRooted(explicitPath))
            {
                validationError = "pluginDllPath must be an absolute path.";
                return "";
            }
            if (!File.Exists(explicitPath))
            {
                validationError = $"SuiteCadAuthoring plugin DLL was not found at '{explicitPath}'.";
                return "";
            }
            return explicitPath;
        }

        foreach (var bundleCandidate in EnumerateSuiteCadAuthoringBundleDllCandidates())
        {
            if (File.Exists(bundleCandidate))
            {
                return bundleCandidate;
            }
        }

        foreach (var root in EnumerateSearchRoots())
        {
            foreach (var relativePath in SuiteCadAuthoringPluginRelativePathCandidates)
            {
                string candidatePath;
                try
                {
                    candidatePath = Path.GetFullPath(Path.Combine(root, relativePath));
                }
                catch
                {
                    continue;
                }

                if (File.Exists(candidatePath))
                {
                    return candidatePath;
                }
            }
        }

        validationError =
            "SuiteCadAuthoring plugin is not installed. Run scripts/install-suite-cad-authoring-plugin.ps1, or supply pluginDllPath explicitly.";
        return "";
    }

    private static IEnumerable<string> EnumerateSuiteCadAuthoringBundleDllCandidates()
    {
        var candidates = new List<string>();
        var bundleRelativePath = Path.Combine(
            "Autodesk",
            "ApplicationPlugins",
            "SuiteCadAuthoring.bundle",
            "Contents",
            "Win64",
            "SuiteCadAuthoring.dll"
        );

        foreach (var root in new[]
        {
            Environment.GetEnvironmentVariable("APPDATA"),
            Environment.GetEnvironmentVariable("ProgramData"),
            Environment.GetEnvironmentVariable("ALLUSERSPROFILE"),
            Environment.GetEnvironmentVariable("ProgramFiles"),
            Environment.GetEnvironmentVariable("ProgramFiles(x86)"),
        })
        {
            if (string.IsNullOrWhiteSpace(root))
            {
                continue;
            }

            try
            {
                candidates.Add(Path.GetFullPath(Path.Combine(root, bundleRelativePath)));
            }
            catch
            {
                // Skip invalid environment-specific candidates.
            }
        }

        var userProfile = Environment.GetEnvironmentVariable("USERPROFILE");
        if (!string.IsNullOrWhiteSpace(userProfile))
        {
            try
            {
                candidates.Add(
                    Path.GetFullPath(
                        Path.Combine(
                            userProfile,
                            "AppData",
                            "Roaming",
                            "Autodesk",
                            "ApplicationPlugins",
                            "SuiteCadAuthoring.bundle",
                            "Contents",
                            "Win64",
                            "SuiteCadAuthoring.dll"
                        )
                    )
                );
            }
            catch
            {
                // Skip invalid USERPROFILE-derived candidate.
            }
        }

        return candidates.Distinct(StringComparer.OrdinalIgnoreCase);
    }
}
