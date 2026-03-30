using System.Text.Json;
using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
    private const string SuiteMarkupAuthoringPluginCommand = "SUITEMARKUPAUTHORAPPLY";

    public static JsonObject HandleSuiteMarkupAuthoringProjectPreview(JsonObject payload)
    {
        var projectId = ReadStringValue(payload, "projectId", "").Trim();
        var issueSetId = ReadStringValue(payload, "issueSetId", "").Trim();
        if (string.IsNullOrWhiteSpace(projectId))
        {
            return BuildSuiteInvalidRequestResult("projectId is required.");
        }
        if (string.IsNullOrWhiteSpace(issueSetId))
        {
            return BuildSuiteInvalidRequestResult("issueSetId is required.");
        }
        if (payload["operations"] is not JsonArray operationsArray || operationsArray.Count <= 0)
        {
            return BuildSuiteInvalidRequestResult("operations must contain at least one markup preview row.");
        }

        var warnings = new List<string>();
        var operationCount = 0;
        foreach (var node in operationsArray)
        {
            if (node is not JsonObject operation)
            {
                continue;
            }

            var drawingPath = ReadStringValue(operation, "drawingPath", "").Trim();
            if (string.IsNullOrWhiteSpace(drawingPath))
            {
                return BuildSuiteInvalidRequestResult(
                    "operations must contain drawingPath for every markup preview row."
                );
            }

            var operationType = ReadStringValue(operation, "operationType", "").Trim();
            if (string.IsNullOrWhiteSpace(operationType))
            {
                return BuildSuiteInvalidRequestResult(
                    "operations must contain operationType for every markup preview row."
                );
            }

            operationCount += 1;
            if (operation["warnings"] is JsonArray warningArray)
            {
                warnings.AddRange(
                    warningArray
                        .Select(entry => entry?.GetValue<string>() ?? "")
                        .Where(entry => !string.IsNullOrWhiteSpace(entry))
                );
            }
        }

        var pluginDllPath = ResolveSuiteCadAuthoringPluginDllPath(payload, out var pluginValidationError);
        if (!string.IsNullOrWhiteSpace(pluginValidationError))
        {
            warnings.Add(pluginValidationError);
        }

        return new JsonObject
        {
            ["success"] = true,
            ["code"] = "",
            ["message"] = "Bluebeam markup preview is ready for review.",
            ["data"] = new JsonObject
            {
                ["operationCount"] = operationCount,
                ["pluginReady"] = string.IsNullOrWhiteSpace(pluginValidationError),
                ["drawings"] = BuildSuiteMarkupDrawingSummaries(operationsArray),
                ["operations"] = operationsArray.DeepClone(),
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet",
                ["action"] = "suite_markup_authoring_project_preview",
                ["pluginDllPath"] = string.IsNullOrWhiteSpace(pluginDllPath) ? null : pluginDllPath,
            },
            ["warnings"] = ToJsonArray(warnings.Distinct(StringComparer.OrdinalIgnoreCase)),
        };
    }

    public static JsonObject HandleSuiteMarkupAuthoringProjectApply(JsonObject payload)
    {
        var projectId = ReadStringValue(payload, "projectId", "").Trim();
        var issueSetId = ReadStringValue(payload, "issueSetId", "").Trim();
        if (string.IsNullOrWhiteSpace(projectId))
        {
            return BuildSuiteInvalidRequestResult("projectId is required.");
        }
        if (string.IsNullOrWhiteSpace(issueSetId))
        {
            return BuildSuiteInvalidRequestResult("issueSetId is required.");
        }
        if (payload["operations"] is not JsonArray operationsArray || operationsArray.Count <= 0)
        {
            return BuildSuiteInvalidRequestResult("operations must contain at least one approved markup row.");
        }

        foreach (var node in operationsArray)
        {
            if (node is not JsonObject operation)
            {
                continue;
            }

            var operationType = ReadStringValue(operation, "operationType", "").Trim();
            if (string.IsNullOrWhiteSpace(operationType))
            {
                return BuildSuiteInvalidRequestResult(
                    "operations must contain operationType for every approved markup row."
                );
            }

            var drawingPath = ReadStringValue(operation, "drawingPath", "").Trim();
            if (string.IsNullOrWhiteSpace(drawingPath))
            {
                return BuildSuiteInvalidRequestResult(
                    "operations must contain drawingPath for every approved markup row."
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
                    ["action"] = "suite_markup_authoring_project_apply",
                },
                ["warnings"] = new JsonArray(),
            };
        }

        var tempRoot = Path.Combine(
            Path.GetTempPath(),
            "suite-markup-authoring",
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
                ["projectRootPath"] = ReadStringValue(payload, "projectRootPath", "").Trim(),
                ["operations"] = operationsArray.DeepClone(),
            };
            File.WriteAllText(
                payloadPath,
                pluginPayload.ToJsonString(new JsonSerializerOptions { WriteIndented = true })
            );

            using var session = ConnectAutoCad();
            var escapedPluginPath = pluginDllPath.Replace("\"", "\"\"");
            var escapedPayloadPath = payloadPath.Replace("\"", "\"\"");
            var escapedResultPath = resultPath.Replace("\"", "\"\"");
            var commandScript =
                $"_.NETLOAD \"{escapedPluginPath}\" _.{SuiteMarkupAuthoringPluginCommand} \"{escapedPayloadPath}\" \"{escapedResultPath}\"\n";

            ReadWithTransientComRetry(
                () =>
                {
                    ((dynamic)session.Document).SendCommand(commandScript);
                    return true;
                },
                $"SendCommand({SuiteMarkupAuthoringPluginCommand})"
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
                        $"Timed out waiting for AutoCAD to finish '{SuiteMarkupAuthoringPluginCommand}'.",
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
                        ["action"] = "suite_markup_authoring_project_apply",
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
                        ["action"] = "suite_markup_authoring_project_apply",
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
                        ["action"] = "suite_markup_authoring_project_apply",
                    },
                    ["warnings"] = ToJsonArray(warnings),
                };
            }

            var meta = parsed["meta"] as JsonObject ?? new JsonObject();
            meta["source"] = "dotnet";
            meta["providerPath"] = "dotnet+plugin";
            meta["action"] = "suite_markup_authoring_project_apply";
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
                ["message"] = $"Markup authoring apply failed: {DescribeException(ex)}",
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
                    ["action"] = "suite_markup_authoring_project_apply",
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

    private static JsonArray BuildSuiteMarkupDrawingSummaries(JsonArray operations)
    {
        var grouped = operations
            .OfType<JsonObject>()
            .GroupBy(
                operation => ReadStringValue(operation, "drawingPath", "").Trim(),
                StringComparer.OrdinalIgnoreCase
            );
        var summaries = new JsonArray();
        foreach (var group in grouped)
        {
            if (string.IsNullOrWhiteSpace(group.Key))
            {
                continue;
            }

            var warnings = group
                .SelectMany(operation =>
                    operation["warnings"] is JsonArray warningArray
                        ? warningArray.Select(entry => entry?.GetValue<string>() ?? "")
                        : Array.Empty<string>()
                )
                .Where(warning => !string.IsNullOrWhiteSpace(warning))
                .Distinct(StringComparer.OrdinalIgnoreCase);

            summaries.Add(
                new JsonObject
                {
                    ["drawingPath"] = group.Key,
                    ["drawingName"] = ReadStringValue(group.First(), "drawingName", Path.GetFileName(group.Key)),
                    ["relativePath"] = ReadStringValue(group.First(), "relativePath", ""),
                    ["operationCount"] = group.Count(),
                    ["approvedCount"] = group.Count(operation =>
                        operation["approved"] is JsonValue approvedNode
                        && approvedNode.TryGetValue<bool>(out var approved)
                        && approved
                    ),
                    ["warnings"] = ToJsonArray(warnings),
                }
            );
        }

        return summaries;
    }
}
