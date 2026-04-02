using System.Diagnostics;
using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
    public static JsonObject HandleEtapCleanupRun(JsonObject payload)
    {
        var stopwatch = Stopwatch.StartNew();
        var warnings = new List<string>();

        var command = "ETAPFIX";
        if (payload.TryGetPropertyValue("command", out var commandNode)
            && commandNode is JsonValue commandValue
            && commandValue.TryGetValue<string>(out var commandText)
            && !string.IsNullOrWhiteSpace(commandText))
        {
            command = commandText.Trim().ToUpperInvariant();
        }

        if (!EtapCleanupCommandAllowList.Contains(command))
        {
            return new JsonObject
            {
                ["success"] = false,
                ["code"] = "INVALID_REQUEST",
                ["message"] =
                    $"Unsupported ETAP cleanup command '{command}'. Allowed values: {string.Join(", ", EtapCleanupCommandAllowList.OrderBy(item => item, StringComparer.OrdinalIgnoreCase))}.",
                ["data"] = new JsonObject(),
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                    ["providerPath"] = "dotnet",
                    ["action"] = "etap_dxf_cleanup_run",
                    ["command"] = command,
                },
                ["warnings"] = new JsonArray(),
            };
        }

        var waitForCompletion = ReadBool(payload, "waitForCompletion", fallback: true);
        var timeoutMs = ClampInt(
            ReadInt(payload, "timeoutMs", DefaultEtapCleanupTimeoutMs),
            1_000,
            10 * 60 * 1000
        );
        var saveDrawing = ReadBool(payload, "saveDrawing", fallback: false);

        var pluginDllPath = "";
        if (payload.TryGetPropertyValue("pluginDllPath", out var dllPathNode)
            && dllPathNode is JsonValue dllPathValue
            && dllPathValue.TryGetValue<string>(out var dllPathRaw))
        {
            pluginDllPath = (dllPathRaw ?? "").Trim().Trim('"');
        }

        if (string.IsNullOrWhiteSpace(pluginDllPath))
        {
            var discoveredPluginPath = TryResolveDefaultEtapPluginDllPath();
            if (!string.IsNullOrWhiteSpace(discoveredPluginPath))
            {
                pluginDllPath = discoveredPluginPath;
                warnings.Add(
                    $"No pluginDllPath provided; auto-discovered ETAP plugin DLL at '{pluginDllPath}'."
                );
            }
        }

        if (!string.IsNullOrWhiteSpace(pluginDllPath))
        {
            if (pluginDllPath.Contains('\r') || pluginDllPath.Contains('\n'))
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "INVALID_REQUEST",
                    ["message"] = "pluginDllPath cannot contain newline characters.",
                    ["data"] = new JsonObject(),
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "etap_dxf_cleanup_run",
                        ["command"] = command,
                    },
                    ["warnings"] = new JsonArray(),
                };
            }
            if (!Path.IsPathRooted(pluginDllPath))
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "INVALID_REQUEST",
                    ["message"] = "pluginDllPath must be an absolute path.",
                    ["data"] = new JsonObject(),
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "etap_dxf_cleanup_run",
                        ["command"] = command,
                    },
                    ["warnings"] = new JsonArray(),
                };
            }
            if (!pluginDllPath.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "INVALID_REQUEST",
                    ["message"] = "pluginDllPath must point to a .dll file.",
                    ["data"] = new JsonObject(),
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "etap_dxf_cleanup_run",
                        ["command"] = command,
                    },
                    ["warnings"] = new JsonArray(),
                };
            }
            if (!File.Exists(pluginDllPath))
            {
                return new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "PLUGIN_DLL_NOT_FOUND",
                    ["message"] = $"Plugin DLL not found: {pluginDllPath}",
                    ["data"] = new JsonObject(),
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet",
                        ["action"] = "etap_dxf_cleanup_run",
                        ["command"] = command,
                    },
                    ["warnings"] = new JsonArray(),
                };
            }
        }

        using var session = ConnectAutoCad();
        var drawingName = StringOrDefault(ReadProperty(session.Document, "Name"), "Unknown.dwg");
        var commandScript = !string.IsNullOrWhiteSpace(pluginDllPath)
            ? BuildSuitePluginCommandScript(pluginDllPath, command)
            : $"{command}\n";

        if (saveDrawing)
        {
            commandScript += "_.QSAVE\n";
        }

        ReadWithTransientComRetry(
            () =>
            {
                ((dynamic)session.Document).SendCommand(commandScript);
                return true;
            },
            $"SendCommand({command})"
        );

        var commandCompleted = true;
        var sawActiveCommand = false;
        var commandStateAvailable = true;
        var lastCommandMask = 0;
        if (waitForCompletion)
        {
            (commandCompleted, sawActiveCommand, commandStateAvailable, lastCommandMask) =
                WaitForAutoCadCommandCompletion(session, timeoutMs);

            if (!commandStateAvailable)
            {
                warnings.Add(
                    "Unable to read CMDACTIVE state from AutoCAD; command was queued but completion could not be verified."
                );
            }
            else if (!sawActiveCommand)
            {
                warnings.Add(
                    "AutoCAD did not report an active command state; completion was inferred. Verify the command output in AutoCAD."
                );
            }
        }
        else
        {
            warnings.Add("Command was queued without waiting for completion.");
        }

        if (!commandCompleted)
        {
            return new JsonObject
            {
                ["success"] = false,
                ["code"] = "AUTOCAD_COMMAND_TIMEOUT",
                ["message"] =
                    $"Timed out waiting for AutoCAD to finish '{command}' after {timeoutMs}ms.",
                ["data"] = new JsonObject
                {
                    ["drawing"] = new JsonObject
                    {
                        ["name"] = drawingName,
                    },
                    ["command"] = command,
                    ["commandScript"] = commandScript.Trim(),
                    ["waitForCompletion"] = waitForCompletion,
                    ["lastCommandMask"] = lastCommandMask,
                },
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                    ["providerPath"] = "dotnet",
                    ["action"] = "etap_dxf_cleanup_run",
                    ["elapsedMs"] = stopwatch.ElapsedMilliseconds,
                    ["command"] = command,
                    ["waitForCompletion"] = waitForCompletion,
                    ["timeoutMs"] = timeoutMs,
                    ["commandStateAvailable"] = commandStateAvailable,
                    ["sawActiveCommand"] = sawActiveCommand,
                },
                ["warnings"] = ToJsonArray(warnings),
            };
        }

        return new JsonObject
        {
            ["success"] = true,
            ["code"] = "",
            ["message"] =
                waitForCompletion
                    ? $"Queued and completed ETAP cleanup command '{command}'."
                    : $"Queued ETAP cleanup command '{command}'.",
            ["data"] = new JsonObject
            {
                ["drawing"] = new JsonObject
                {
                    ["name"] = drawingName,
                },
                ["command"] = command,
                ["commandScript"] = commandScript.Trim(),
                ["pluginDllPath"] = string.IsNullOrWhiteSpace(pluginDllPath) ? null : pluginDllPath,
                ["saveDrawing"] = saveDrawing,
                ["waitForCompletion"] = waitForCompletion,
            },
            ["meta"] = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet",
                ["action"] = "etap_dxf_cleanup_run",
                ["elapsedMs"] = stopwatch.ElapsedMilliseconds,
                ["command"] = command,
                ["waitForCompletion"] = waitForCompletion,
                ["timeoutMs"] = timeoutMs,
                ["commandStateAvailable"] = commandStateAvailable,
                ["sawActiveCommand"] = sawActiveCommand,
            },
            ["warnings"] = ToJsonArray(warnings),
        };
    }
}

