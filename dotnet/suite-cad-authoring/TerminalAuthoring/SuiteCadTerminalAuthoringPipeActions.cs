using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace SuiteCadAuthoring
{
    internal static partial class SuiteCadTerminalAuthoringPipeActions
    {
        internal static JsonObject? HandleAction(string action, JsonObject payload)
        {
            switch (action)
            {
                case "suite_terminal_authoring_project_preview":
                    return SuiteCadPipeHost.InvokeOnApplicationThread(
                        () => SuiteCadAuthoringCommands.ExecuteTerminalAuthoringPipePreview(
                            payload.DeepClone() as JsonObject ?? new JsonObject()
                        )
                    );
                case "suite_terminal_authoring_project_apply":
                    return SuiteCadPipeHost.InvokeOnApplicationThread(
                        () => SuiteCadAuthoringCommands.ExecuteTerminalAuthoringPipeApply(
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
        internal static JsonObject ExecuteTerminalAuthoringPipeApply(JsonObject payload)
        {
            var requestId = ReadPipeString(payload, "requestId");
            var projectId = ReadPipeString(payload, "projectId");
            var issueSetId = ReadPipeString(payload, "issueSetId");
            var scheduleSnapshotId = ReadPipeString(payload, "scheduleSnapshotId");

            if (string.IsNullOrWhiteSpace(projectId))
            {
                return BuildTerminalPipeFailure("INVALID_REQUEST", "projectId is required.", requestId);
            }

            if (string.IsNullOrWhiteSpace(issueSetId))
            {
                return BuildTerminalPipeFailure("INVALID_REQUEST", "issueSetId is required.", requestId);
            }

            if (string.IsNullOrWhiteSpace(scheduleSnapshotId))
            {
                return BuildTerminalPipeFailure(
                    "INVALID_REQUEST",
                    "scheduleSnapshotId is required.",
                    requestId
                );
            }

            if (payload["operations"] is not JsonArray operationsArray || operationsArray.Count <= 0)
            {
                return BuildTerminalPipeFailure(
                    "INVALID_REQUEST",
                    "operations must contain at least one approved preview row.",
                    requestId
                );
            }

            foreach (var node in operationsArray)
            {
                if (node is not JsonObject operation)
                {
                    continue;
                }

                var operationType = ReadPipeString(operation, "operationType").ToLowerInvariant();
                if (operationType == "unresolved")
                {
                    return BuildTerminalPipeFailure(
                        "INVALID_REQUEST",
                        "operations cannot include unresolved preview rows.",
                        requestId
                    );
                }

                var drawingPath = ReadPipeString(operation, "drawingPath");
                if (string.IsNullOrWhiteSpace(drawingPath))
                {
                    return BuildTerminalPipeFailure(
                        "INVALID_REQUEST",
                        "operations must contain drawingPath for every approved preview row.",
                        requestId
                    );
                }
            }

            var tempRoot = Path.Combine(
                Path.GetTempPath(),
                "suite-terminal-authoring-pipe",
                Guid.NewGuid().ToString("N")
            );
            Directory.CreateDirectory(tempRoot);

            var payloadPath = Path.Combine(tempRoot, "payload.json");
            var resultPath = Path.Combine(tempRoot, "result.json");

            try
            {
                File.WriteAllText(payloadPath, payload.ToJsonString(PipeJsonOptions));
                var envelope = Execute(payloadPath, resultPath);
                return BuildTerminalPipeResult(envelope, requestId);
            }
            catch (Exception ex)
            {
                return BuildTerminalPipeFailure(
                    "PLUGIN_APPLY_FAILED",
                    $"Terminal authoring apply failed: {ex.Message}",
                    requestId
                );
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

        private static JsonObject BuildTerminalPipeFailure(string code, string message, string requestId)
        {
            return BuildTerminalPipeResult(BuildFailure(code, message), requestId);
        }

        private static JsonObject BuildTerminalPipeResult(
            TerminalAuthoringResultEnvelope envelope,
            string requestId
        )
        {
            var result = JsonSerializer.SerializeToNode(envelope, PipeJsonOptions) as JsonObject
                ?? new JsonObject();
            var meta = result["meta"] as JsonObject ?? new JsonObject();
            meta["source"] = "dotnet";
            meta["providerPath"] = "dotnet+inproc";
            meta["action"] = "suite_terminal_authoring_project_apply";
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
    }
}
