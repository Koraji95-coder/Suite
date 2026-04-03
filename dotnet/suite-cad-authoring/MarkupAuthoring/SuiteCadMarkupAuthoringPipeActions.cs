using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace SuiteCadAuthoring
{
    internal static class SuiteCadMarkupAuthoringPipeActions
    {
        internal static JsonObject? HandleAction(string action, JsonObject payload)
        {
            switch (action)
            {
                case "suite_markup_authoring_project_apply":
                    return SuiteCadPipeHost.InvokeOnApplicationThread(
                        () => SuiteCadAuthoringCommands.ExecuteMarkupAuthoringPipeApply(
                            payload.DeepClone() as JsonObject ?? new JsonObject()));
                default:
                    return null;
            }
        }
    }

    public sealed partial class SuiteCadAuthoringCommands
    {
        private static readonly JsonSerializerOptions PipeJsonOptions = new(JsonSerializerDefaults.Web)
        {
            WriteIndented = false,
        };

        internal static JsonObject ExecuteMarkupAuthoringPipeApply(JsonObject payload)
        {
            var requestId = ReadPipeString(payload, "requestId");
            var projectId = ReadPipeString(payload, "projectId");
            var issueSetId = ReadPipeString(payload, "issueSetId");

            if (string.IsNullOrWhiteSpace(projectId))
            {
                return BuildMarkupPipeFailure(
                    "INVALID_REQUEST",
                    "projectId is required.",
                    requestId);
            }

            if (string.IsNullOrWhiteSpace(issueSetId))
            {
                return BuildMarkupPipeFailure(
                    "INVALID_REQUEST",
                    "issueSetId is required.",
                    requestId);
            }

            if (payload["operations"] is not JsonArray operationsArray || operationsArray.Count <= 0)
            {
                return BuildMarkupPipeFailure(
                    "INVALID_REQUEST",
                    "operations must contain at least one approved markup row.",
                    requestId);
            }

            foreach (var node in operationsArray)
            {
                if (node is not JsonObject operation)
                {
                    continue;
                }

                var operationType = ReadPipeString(operation, "operationType");
                if (string.IsNullOrWhiteSpace(operationType))
                {
                    return BuildMarkupPipeFailure(
                        "INVALID_REQUEST",
                        "operations must contain operationType for every approved markup row.",
                        requestId);
                }

                var drawingPath = ReadPipeString(operation, "drawingPath");
                if (string.IsNullOrWhiteSpace(drawingPath))
                {
                    return BuildMarkupPipeFailure(
                        "INVALID_REQUEST",
                        "operations must contain drawingPath for every approved markup row.",
                        requestId);
                }
            }

            var tempRoot = Path.Combine(
                Path.GetTempPath(),
                "suite-markup-authoring-pipe",
                Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempRoot);

            var payloadPath = Path.Combine(tempRoot, "payload.json");
            var resultPath = Path.Combine(tempRoot, "result.json");

            try
            {
                File.WriteAllText(payloadPath, payload.ToJsonString(PipeJsonOptions));
                var envelope = ExecuteMarkupAuthoring(payloadPath, resultPath);
                return BuildMarkupPipeResult(envelope, requestId);
            }
            catch (Exception ex)
            {
                return BuildMarkupPipeFailure(
                    "PLUGIN_APPLY_FAILED",
                    $"Markup authoring apply failed: {ex.Message}",
                    requestId);
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
                    // Best effort cleanup only.
                }
            }
        }

        private static JsonObject BuildMarkupPipeFailure(
            string code,
            string message,
            string requestId)
        {
            return BuildMarkupPipeResult(BuildMarkupFailure(code, message), requestId);
        }

        private static JsonObject BuildMarkupPipeResult(
            MarkupAuthoringResultEnvelope envelope,
            string requestId)
        {
            var result = JsonSerializer.SerializeToNode(envelope, PipeJsonOptions) as JsonObject
                ?? new JsonObject();
            var meta = result["meta"] as JsonObject ?? new JsonObject();
            meta["source"] = "dotnet";
            meta["providerPath"] = "dotnet+inproc";
            meta["action"] = "suite_markup_authoring_project_apply";
            if (!string.IsNullOrWhiteSpace(requestId))
            {
                meta["requestId"] = requestId;
            }

            meta.Remove("payloadPath");
            meta.Remove("resultPath");
            result["meta"] = meta;
            result["warnings"] ??= new JsonArray();
            return result;
        }

        private static string ReadPipeString(JsonObject payload, string key)
        {
            if (!payload.TryGetPropertyValue(key, out var node) || node is null)
            {
                return string.Empty;
            }

            return node switch
            {
                JsonValue value when value.TryGetValue<string>(out var text) => NormalizeText(text),
                _ => NormalizeText(node.ToJsonString()),
            };
        }
    }
}
