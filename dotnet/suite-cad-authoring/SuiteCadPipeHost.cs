using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using System.Security.AccessControl;
using System.Security.Principal;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.Runtime;
using Application = Autodesk.AutoCAD.ApplicationServices.Application;
using Exception = System.Exception;

namespace SuiteCadAuthoring
{
    internal static class SuiteCadPipeHost
    {
        internal const string DefaultPipeName = "SUITE_ACADE_PIPE";

        private static readonly object SyncRoot = new object();
        private static readonly JsonSerializerOptions SerializerOptions = new JsonSerializerOptions(
            JsonSerializerDefaults.Web
        );

        private static CancellationTokenSource? _listenerCancellation;
        private static Task? _listenerTask;
        private static string _activePipeName = DefaultPipeName;
        private static readonly Queue<PendingPipeAction> PendingActions = new Queue<PendingPipeAction>();
        private static bool _idleHandlerAttached;
        private static int _applicationThreadId;

        internal static void StartIfEligible()
        {
            lock (SyncRoot)
            {
                if (_listenerTask is { IsCompleted: false })
                {
                    return;
                }

                if (!IsEligibleProfileActive(out var activeProfile))
                {
                    Trace.WriteLine(
                        $"[SuiteCadPipeHost] In-process pipe host skipped because active profile '{activeProfile}' is not the ACADE profile."
                    );
                    return;
                }

                _activePipeName = ResolvePipeName();
                _applicationThreadId = Environment.CurrentManagedThreadId;
                _listenerCancellation = new CancellationTokenSource();
                AttachIdleHandler();
                _listenerTask = Task.Run(() => ListenLoopAsync(_activePipeName, _listenerCancellation.Token));
            }
        }

        internal static void Stop()
        {
            CancellationTokenSource? cancellation = null;
            Task? task = null;
            lock (SyncRoot)
            {
                cancellation = _listenerCancellation;
                task = _listenerTask;
                _listenerCancellation = null;
                _listenerTask = null;
                while (PendingActions.Count > 0)
                {
                    PendingActions.Dequeue()
                        .Completion.TrySetException(
                            new OperationCanceledException("Suite in-process pipe host is stopping.")
                        );
                }
            }

            DetachIdleHandler();

            try
            {
                cancellation?.Cancel();
            }
            catch
            {
                // Best effort listener shutdown only.
            }

            try
            {
                task?.Wait(TimeSpan.FromSeconds(3));
            }
            catch
            {
                // Best effort listener shutdown only.
            }
            finally
            {
                cancellation?.Dispose();
            }
        }

        internal static SuiteCadPipeStatusResult GetStatus()
        {
            var activeProfile = ResolveCurrentProfileName();
            var eligible = IsAcadeProfileName(activeProfile);
            var started = false;
            var pipeName = ResolvePipeName();

            lock (SyncRoot)
            {
                started = _listenerTask is { IsCompleted: false };
                if (!string.IsNullOrWhiteSpace(_activePipeName))
                {
                    pipeName = _activePipeName;
                }
            }

            return new SuiteCadPipeStatusResult
            {
                HostEligible = eligible,
                HostStarted = started,
                PipeName = pipeName,
                ActiveProfile = activeProfile,
                Message = eligible
                    ? started
                        ? "Suite in-process ACADE pipe host is running."
                        : "Suite in-process ACADE pipe host is eligible but not running."
                    : $"Active profile '{activeProfile}' is not eligible for the ACADE pipe host.",
            };
        }

        private static async Task ListenLoopAsync(string pipeName, CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                using var server = CreateServerStream(pipeName);

                try
                {
                    await server.WaitForConnectionAsync(cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    Trace.WriteLine(
                        $"[SuiteCadPipeHost] Failed while waiting for pipe connections on {pipeName}: {ex.Message}"
                    );
                    await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken).ConfigureAwait(false);
                    continue;
                }

                try
                {
                    var requestJson = await ReadLineAsync(server, cancellationToken).ConfigureAwait(false);
                    var response = HandleRequest(requestJson);
                    await WriteJsonAsync(server, response, cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    var failure = BuildErrorResponse(
                        id: null,
                        code: "INTERNAL_ERROR",
                        message: "Unhandled pipe host exception.",
                        details: ex.Message
                    );
                    try
                    {
                        await WriteJsonAsync(server, failure, cancellationToken).ConfigureAwait(false);
                    }
                    catch
                    {
                        // Ignore secondary write failures during error reporting.
                    }
                }
            }
        }

        private static JsonObject HandleRequest(string requestJson)
        {
            if (string.IsNullOrWhiteSpace(requestJson))
            {
                return BuildErrorResponse(id: null, code: "EMPTY_REQUEST", message: "Empty request payload.");
            }

            JsonNode? parsed;
            try
            {
                parsed = JsonNode.Parse(requestJson);
            }
            catch (Exception ex)
            {
                return BuildErrorResponse(
                    id: null,
                    code: "INVALID_JSON",
                    message: "Request is not valid JSON.",
                    details: ex.Message
                );
            }

            if (parsed is not JsonObject root)
            {
                return BuildErrorResponse(
                    id: null,
                    code: "INVALID_REQUEST",
                    message: "Request must be a JSON object."
                );
            }

            var requestId = ReadString(root, "id");
            var action = ReadString(root, "action");
            var payload = ReadObject(root, "payload");
            var requestToken = ReadString(root, "token");
            var correlationId = ResolveCorrelationId(requestId, payload);
            if (!IsTokenValid(requestToken))
            {
                return BuildErrorResponse(
                    id: requestId,
                    code: "AUTH_INVALID_TOKEN",
                    message: "Invalid or missing pipe token."
                );
            }

            if (string.IsNullOrWhiteSpace(action))
            {
                return BuildErrorResponse(
                    id: requestId,
                    code: "INVALID_REQUEST",
                    message: "Missing required 'action' field."
                );
            }

            try
            {
                var stopwatch = Stopwatch.StartNew();
                var normalizedAction = action.Trim().ToLowerInvariant();
                SuiteCadAcadeTraceLog.WriteTrace(
                    correlationId,
                    normalizedAction,
                    "pipe-request-received",
                    new
                    {
                        requestId,
                        action = normalizedAction,
                        pipeName = _activePipeName,
                        payloadKeys = payload.Select(item => item.Key).OrderBy(item => item).ToArray(),
                    }
                );
                var result = HandleAction(normalizedAction, payload);
                stopwatch.Stop();
                AttachMeta(result, correlationId, normalizedAction, stopwatch.ElapsedMilliseconds);
                SuiteCadAcadeTraceLog.WriteTrace(
                    correlationId,
                    normalizedAction,
                    "pipe-request-completed",
                    new
                    {
                        elapsedMs = stopwatch.ElapsedMilliseconds,
                        success = result["success"]?.GetValue<bool?>(),
                        code = result["code"]?.GetValue<string?>(),
                    }
                );
                return new JsonObject
                {
                    ["id"] = requestId,
                    ["ok"] = true,
                    ["result"] = result,
                    ["error"] = null,
                };
            }
            catch (Exception ex)
            {
                SuiteCadAcadeTraceLog.WriteTrace(
                    correlationId,
                    action.Trim().ToLowerInvariant(),
                    "pipe-request-failed",
                    null,
                    ex
                );
                return BuildErrorResponse(
                    id: requestId,
                    code: "ACTION_EXECUTION_FAILED",
                    message: $"Action '{action}' failed.",
                    details: ex.Message
                );
            }
        }

        private static JsonObject HandleAction(string action, JsonObject payload)
        {
            return action switch
            {
                "suite_acade_project_open" => SuiteCadAuthoringCommands.HandlePipeAcadeProjectOpen(payload),
                "suite_acade_project_create" => SuiteCadAuthoringCommands.HandlePipeAcadeProjectCreate(payload),
                "suite_pipe_status" => BuildStatusEnvelope(),
                _ => new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "ACTION_NOT_IMPLEMENTED",
                    ["message"] = $"Action '{action}' is not implemented by the in-process ACADE pipe host.",
                    ["warnings"] = new JsonArray("Unsupported action request was rejected by the in-process ACADE pipe host."),
                    ["meta"] = new JsonObject
                    {
                        ["source"] = "dotnet",
                        ["providerPath"] = "dotnet+inproc",
                    },
                },
            };
        }

        internal static bool IsOnApplicationThread =>
            _applicationThreadId != 0
            && Environment.CurrentManagedThreadId == _applicationThreadId;

        internal static TResult InvokeOnApplicationThread<TResult>(Func<TResult> callback)
        {
            if (_applicationThreadId == 0 || IsOnApplicationThread)
            {
                return callback();
            }

            var completion = new TaskCompletionSource<object>(
                TaskCreationOptions.RunContinuationsAsynchronously
            );
            lock (SyncRoot)
            {
                PendingActions.Enqueue(new PendingPipeAction(() => callback()!, completion));
            }

            AttachIdleHandler();
            var result = completion.Task.GetAwaiter().GetResult();
            return result is TResult typedResult ? typedResult : (TResult)result;
        }

        private static void AttachIdleHandler()
        {
            lock (SyncRoot)
            {
                if (_idleHandlerAttached)
                {
                    return;
                }

                Application.Idle += OnApplicationIdle;
                _idleHandlerAttached = true;
            }
        }

        private static void DetachIdleHandler()
        {
            lock (SyncRoot)
            {
                if (!_idleHandlerAttached)
                {
                    return;
                }

                Application.Idle -= OnApplicationIdle;
                _idleHandlerAttached = false;
            }
        }

        private static void OnApplicationIdle(object? sender, EventArgs args)
        {
            PendingPipeAction? nextAction = null;
            lock (SyncRoot)
            {
                if (PendingActions.Count > 0)
                {
                    nextAction = PendingActions.Dequeue();
                }
            }

            if (nextAction == null)
            {
                return;
            }

            try
            {
                nextAction.Completion.TrySetResult(nextAction.Callback());
            }
            catch (Exception ex)
            {
                nextAction.Completion.TrySetException(ex);
            }
        }

        private static JsonObject BuildStatusEnvelope()
        {
            var status = GetStatus();
            return new JsonObject
            {
                ["success"] = true,
                ["code"] = "",
                ["message"] = status.Message,
                ["data"] = new JsonObject
                {
                    ["hostEligible"] = status.HostEligible,
                    ["hostStarted"] = status.HostStarted,
                    ["pipeName"] = status.PipeName,
                    ["activeProfile"] = status.ActiveProfile,
                },
                ["warnings"] = new JsonArray(),
                ["meta"] = new JsonObject
                {
                    ["source"] = "dotnet",
                    ["providerPath"] = "dotnet+inproc",
                },
            };
        }

        private static void AttachMeta(
            JsonObject result,
            string correlationId,
            string action,
            long actionElapsedMs
        )
        {
            if (result["meta"] is not JsonObject meta)
            {
                meta = new JsonObject();
                result["meta"] = meta;
            }

            if (!string.IsNullOrWhiteSpace(correlationId))
            {
                meta["requestId"] = correlationId;
            }
            meta["action"] = action;
            meta["actionMs"] = actionElapsedMs;
            meta["queueWaitMs"] = 0;
            meta["comReadRetryCount"] = 0;
        }

        private static bool IsEligibleProfileActive(out string activeProfile)
        {
            activeProfile = ResolveCurrentProfileName();
            return IsAcadeProfileName(activeProfile);
        }

        internal static bool IsAcadeProfileName(string? profileName)
        {
            return string.Equals(
                (profileName ?? string.Empty).Trim(),
                "<<ACADE>>",
                StringComparison.OrdinalIgnoreCase
            );
        }

        internal static string ResolveCurrentProfileName()
        {
            return InvokeOnApplicationThread(() =>
            {
                try
                {
                    return Convert.ToString(Application.GetSystemVariable("CPROFILE"))?.Trim() ?? string.Empty;
                }
                catch
                {
                    return string.Empty;
                }
            });
        }

        private static string ResolvePipeName()
        {
            var envValue = (Environment.GetEnvironmentVariable("AUTOCAD_DOTNET_ACADE_PIPE_NAME") ?? string.Empty)
                .Trim();
            return string.IsNullOrWhiteSpace(envValue) ? DefaultPipeName : envValue;
        }

        private static NamedPipeServerStream CreateServerStream(string pipeName)
        {
            try
            {
                return NamedPipeServerStreamAcl.Create(
                    pipeName,
                    PipeDirection.InOut,
                    1,
                    PipeTransmissionMode.Message,
                    PipeOptions.Asynchronous,
                    0,
                    0,
                    BuildPipeSecurity(),
                    HandleInheritability.None,
                    (PipeAccessRights)0
                );
            }
            catch (Exception ex)
            {
                Trace.WriteLine(
                    $"[SuiteCadPipeHost] Falling back to default pipe security for {pipeName}: {ex.Message}"
                );
                return new NamedPipeServerStream(
                    pipeName,
                    PipeDirection.InOut,
                    1,
                    PipeTransmissionMode.Message,
                    PipeOptions.Asynchronous
                );
            }
        }

        private static PipeSecurity BuildPipeSecurity()
        {
            var security = new PipeSecurity();
            security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);

            AddPipeAccessRule(
                security,
                WindowsIdentity.GetCurrent().User,
                PipeAccessRights.FullControl
            );
            AddPipeAccessRule(
                security,
                new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
                PipeAccessRights.FullControl
            );
            AddPipeAccessRule(
                security,
                new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null),
                PipeAccessRights.FullControl
            );
            AddPipeAccessRule(
                security,
                new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid, null),
                PipeAccessRights.ReadWrite
            );
            AddPipeAccessRule(
                security,
                new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null),
                PipeAccessRights.ReadWrite
            );

            return security;
        }

        private static void AddPipeAccessRule(
            PipeSecurity security,
            IdentityReference? identity,
            PipeAccessRights rights
        )
        {
            if (identity == null)
            {
                return;
            }

            security.AddAccessRule(
                new PipeAccessRule(identity, rights, AccessControlType.Allow)
            );
        }

        private static bool IsTokenValid(string? requestToken)
        {
            var expectedToken = (Environment.GetEnvironmentVariable("AUTOCAD_DOTNET_TOKEN") ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(expectedToken))
            {
                return true;
            }

            return string.Equals(
                (requestToken ?? string.Empty).Trim(),
                expectedToken,
                StringComparison.Ordinal
            );
        }

        private static string ResolveCorrelationId(string? requestId, JsonObject payload)
        {
            var payloadRequestId = ReadString(payload, "requestId");
            if (!string.IsNullOrWhiteSpace(payloadRequestId))
            {
                return payloadRequestId.Trim();
            }

            return string.IsNullOrWhiteSpace(requestId) ? "unknown" : requestId.Trim();
        }

        private static string? ReadString(JsonObject obj, string key)
        {
            return obj.TryGetPropertyValue(key, out var node) && node is not null
                ? node.GetValue<string?>()
                : null;
        }

        private static JsonObject ReadObject(JsonObject obj, string key)
        {
            return obj.TryGetPropertyValue(key, out var node) && node is JsonObject value
                ? value
                : new JsonObject();
        }

        private static async Task<string> ReadLineAsync(
            NamedPipeServerStream server,
            CancellationToken cancellationToken
        )
        {
            var buffer = new byte[4096];
            var builder = new StringBuilder();

            while (true)
            {
                var bytesRead = await server.ReadAsync(buffer, 0, buffer.Length, cancellationToken)
                    .ConfigureAwait(false);
                if (bytesRead <= 0)
                {
                    break;
                }

                builder.Append(Encoding.UTF8.GetString(buffer, 0, bytesRead));
                if (builder.ToString().Contains('\n'))
                {
                    break;
                }
            }

            var line = builder.ToString();
            var newlineIndex = line.IndexOf('\n');
            return newlineIndex >= 0 ? line[..newlineIndex] : line;
        }

        private static async Task WriteJsonAsync(
            NamedPipeServerStream server,
            JsonObject payload,
            CancellationToken cancellationToken
        )
        {
            var json = payload.ToJsonString(SerializerOptions) + "\n";
            var bytes = Encoding.UTF8.GetBytes(json);
            await server.WriteAsync(bytes, 0, bytes.Length, cancellationToken).ConfigureAwait(false);
            await server.FlushAsync(cancellationToken).ConfigureAwait(false);
        }

        private static JsonObject BuildErrorResponse(
            string? id,
            string code,
            string message,
            string? details = null
        )
        {
            return new JsonObject
            {
                ["id"] = id,
                ["ok"] = false,
                ["result"] = null,
                ["error"] = details is null ? $"{code}: {message}" : $"{code}: {message} ({details})",
            };
        }

        private sealed class PendingPipeAction
        {
            internal PendingPipeAction(
                Func<object> callback,
                TaskCompletionSource<object> completion
            )
            {
                Callback = callback;
                Completion = completion;
            }

            internal Func<object> Callback { get; }

            internal TaskCompletionSource<object> Completion { get; }
        }
    }

    public sealed partial class SuiteCadAuthoringCommands
    {
        [CommandMethod("SUITEPIPESTATUS", CommandFlags.Session)]
        public void WritePipeStatus()
        {
            var status = SuiteCadPipeHost.GetStatus();
            var editor = Application.DocumentManager.MdiActiveDocument?.Editor;
            editor?.WriteMessage(
                $"\n[Suite] {status.Message} Pipe='{status.PipeName}', profile='{status.ActiveProfile}'."
            );
        }
    }
}
