using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using CoreApplication = Autodesk.AutoCAD.ApplicationServices.Core.Application;
using Application = Autodesk.AutoCAD.ApplicationServices.Application;
using Exception = System.Exception;

namespace SuiteCadAuthoring
{
    internal sealed class AcadeProjectOpenPayload
    {
        public string RequestId { get; set; }
        public string ProjectRootPath { get; set; }
        public string WdpPath { get; set; }
        public string UiMode { get; set; }
        public bool LaunchIfNeeded { get; set; }
        public bool AcadeLaunched { get; set; }
    }

    internal sealed class AcadeProjectVerificationData
    {
        public bool CommandCompleted { get; set; }
        public bool AepxObserved { get; set; }
        public bool LastProjObserved { get; set; }
        public bool ActiveProjectObserved { get; set; }
        public string ActiveProjectPath { get; set; } = string.Empty;
        public string ActiveProjectFilePath { get; set; } = string.Empty;
        public string ActiveProjectDatabasePath { get; set; } = string.Empty;
    }

    internal sealed class AcadeProjectOpenResultEnvelope
    {
        public bool Success { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
        public AcadeProjectOpenResultData Data { get; set; } = new AcadeProjectOpenResultData();
        public List<string> Warnings { get; set; } = new List<string>();
        public Dictionary<string, object> Meta { get; set; } = new Dictionary<string, object>();
    }

    internal sealed class AcadeProjectOpenResultData
    {
        public string WdpPath { get; set; }
        public bool AcadeLaunched { get; set; }
        public bool ProjectActivated { get; set; }
        public string Strategy { get; set; }
        public string ActiveProjectPath { get; set; }
        public string ActiveProjectFilePath { get; set; }
        public string ActiveProjectDatabasePath { get; set; }
        public bool SwitchAttempted { get; set; }
        public string SwitchBlockedReason { get; set; }
        public bool TemporaryDocumentCreated { get; set; }
        public bool TemporaryDocumentClosed { get; set; }
        public AcadeProjectVerificationData Verification { get; set; } = new AcadeProjectVerificationData();
    }

    internal sealed class AcadeProjectOpenInvocationResult
    {
        public bool Success { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
        public string Strategy { get; set; }
        public string AssemblyPath { get; set; }
        public int InvocationAttempts { get; set; }
        public string ActiveProjectPath { get; set; }
        public string ActiveProjectFilePath { get; set; }
        public string ActiveProjectDatabasePath { get; set; }
        public string ActiveProjectDisplayName { get; set; }
        public bool SwitchAttempted { get; set; }
        public string SwitchBlockedReason { get; set; }
        public List<string> Warnings { get; set; } = new List<string>();
    }

    internal sealed class AcadeProjectObservation
    {
        public bool AepxExists { get; set; }
        public DateTime? AepxLastWriteUtc { get; set; }
        public bool LastProjObserved { get; set; }
        public DateTime? LastProjLastWriteUtc { get; set; }
    }

    internal sealed class AcadeWorkingDocumentContext
    {
        public Document Document { get; set; }
        public bool TemporaryDocumentCreated { get; set; }
        public bool TemporaryDocumentClosed { get; set; }
    }

    internal sealed class AcadeRuntimeReadinessData
    {
        public bool Ready { get; set; }
        public bool WdLoadReady { get; set; }
        public bool WdLoadArxReady { get; set; }
        public int IdlePulseCount { get; set; }
        public string ActiveCommandNames { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
    }

    internal sealed class AcadeProjectIdentity
    {
        public string ProjectFilePath { get; set; } = string.Empty;
        public string DatabasePath { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;

        public string PreferredPath =>
            string.IsNullOrWhiteSpace(ProjectFilePath)
                ? (DatabasePath ?? string.Empty).Trim()
                : (ProjectFilePath ?? string.Empty).Trim();
    }

    internal sealed class AcadeProjectSwitchEligibility
    {
        public bool Eligible { get; set; }
        public string BlockedReason { get; set; } = string.Empty;
        public string ActiveCommandNames { get; set; } = string.Empty;
        public int DatabaseModified { get; set; }
        public bool TrackerIsCreating { get; set; }
        public bool TemporaryDocumentPending { get; set; }
    }

    public sealed partial class SuiteCadAuthoringCommands
    {
        private static readonly ConcurrentDictionary<string, string> DerivedAcadeProjectFilePathCache =
            new(StringComparer.OrdinalIgnoreCase);

        [LispFunction("SUITEACADEPROJECTOPENRUN")]
        public ResultBuffer OpenAcadeProjectLisp(ResultBuffer arguments)
        {
            var args = arguments?.AsArray() ?? Array.Empty<TypedValue>();
            var payloadPath = args.Length > 0 ? NormalizeText(Convert.ToString(args[0].Value)) : "";
            var resultPath = args.Length > 1 ? NormalizeText(Convert.ToString(args[1].Value)) : "";
            var envelope = ExecuteAcadeProjectOpenAndWriteResult(
                payloadPath,
                resultPath,
                Application.DocumentManager.MdiActiveDocument?.Editor
            );

            return envelope.Success
                ? new ResultBuffer(new TypedValue((int)LispDataType.T_atom, true))
                : new ResultBuffer(
                    new TypedValue((int)LispDataType.Text, NormalizeText(envelope.Message))
                );
        }

        [CommandMethod("SUITEACADEPROJECTOPEN", CommandFlags.Session)]
        public void OpenAcadeProject()
        {
            var document = Application.DocumentManager.MdiActiveDocument;
            var editor = document?.Editor;
            if (editor == null)
            {
                return;
            }

            var payloadPrompt = editor.GetString("\nSuite ACADE project-open payload JSON path: ");
            if (payloadPrompt.Status != PromptStatus.OK || string.IsNullOrWhiteSpace(payloadPrompt.StringResult))
            {
                return;
            }

            var resultPrompt = editor.GetString("\nSuite ACADE project-open result JSON path: ");
            if (resultPrompt.Status != PromptStatus.OK || string.IsNullOrWhiteSpace(resultPrompt.StringResult))
            {
                return;
            }

            var envelope = ExecuteAcadeProjectOpenAndWriteResult(
                payloadPrompt.StringResult.Trim(),
                resultPrompt.StringResult.Trim(),
                editor
            );
            editor.WriteMessage($"\n[Suite] {envelope.Message}");
        }

        internal static JsonObject HandlePipeAcadeProjectOpen(JsonObject payload)
        {
            var envelope = ExecuteAcadeProjectOpenPayload(payload);
            return JsonSerializer.SerializeToNode(envelope, JsonOptions) as JsonObject
                ?? new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "PLUGIN_RESULT_INVALID",
                    ["message"] = "Unable to serialize the ACADE project-open result.",
                    ["warnings"] = new JsonArray(),
                    ["meta"] = new JsonObject
                    {
                        ["providerPath"] = "dotnet+inproc",
                    },
                };
        }

        private static AcadeProjectOpenResultEnvelope ExecuteAcadeProjectOpenAndWriteResult(
            string payloadPath,
            string resultPath,
            Editor? editor
        )
        {
            var envelope = ExecuteAcadeProjectOpen(payloadPath, resultPath);
            try
            {
                if (!string.IsNullOrWhiteSpace(resultPath) && Path.IsPathRooted(resultPath))
                {
                    File.WriteAllText(
                        resultPath.Trim(),
                        JsonSerializer.Serialize(envelope, JsonOptions)
                    );
                }
            }
            catch (Exception ex)
            {
                editor?.WriteMessage(
                    $"\n[Suite] Failed to write ACADE project-open result file: {ex.Message}"
                );
            }

            return envelope;
        }

        private static AcadeProjectOpenResultEnvelope ExecuteAcadeProjectOpen(
            string payloadPath,
            string resultPath
        )
        {
            if (!Path.IsPathRooted(payloadPath))
            {
                return BuildAcadeProjectOpenFailure("INVALID_REQUEST", "Payload path must be absolute.");
            }
            if (!File.Exists(payloadPath))
            {
                return BuildAcadeProjectOpenFailure(
                    "INVALID_REQUEST",
                    $"Payload file was not found: {payloadPath}"
                );
            }
            if (!Path.IsPathRooted(resultPath))
            {
                return BuildAcadeProjectOpenFailure("INVALID_REQUEST", "Result path must be absolute.");
            }

            AcadeProjectOpenPayload payload;
            try
            {
                payload = JsonSerializer.Deserialize<AcadeProjectOpenPayload>(
                    File.ReadAllText(payloadPath),
                    JsonOptions
                );
            }
            catch (Exception ex)
            {
                return BuildAcadeProjectOpenFailure(
                    "INVALID_REQUEST",
                    $"Unable to parse payload JSON: {ex.Message}"
                );
            }

            if (payload == null)
            {
                return BuildAcadeProjectOpenFailure("INVALID_REQUEST", "Payload was empty.");
            }

            return ExecuteAcadeProjectOpenPayload(payload);
        }

        private static AcadeProjectOpenResultEnvelope ExecuteAcadeProjectOpenPayload(
            JsonObject payload
        )
        {
            AcadeProjectOpenPayload requestPayload;
            try
            {
                requestPayload = JsonSerializer.Deserialize<AcadeProjectOpenPayload>(
                    payload.ToJsonString(),
                    JsonOptions
                );
            }
            catch (Exception ex)
            {
                return BuildAcadeProjectOpenFailure(
                    "INVALID_REQUEST",
                    $"Unable to parse payload JSON: {ex.Message}"
                );
            }

            if (requestPayload == null)
            {
                return BuildAcadeProjectOpenFailure("INVALID_REQUEST", "Payload was empty.");
            }

            return ExecuteAcadeProjectOpenPayload(requestPayload);
        }

        internal static AcadeProjectOpenResultEnvelope ExecuteAcadeProjectOpenPayload(
            AcadeProjectOpenPayload payload
        )
        {
            var requestId = NormalizeText(payload.RequestId);
            var tracePath = SuiteCadAcadeTraceLog.ResolveTracePath(requestId);
            void Trace(string stage, object? data = null, Exception? exception = null)
            {
                SuiteCadAcadeTraceLog.WriteTrace(requestId, "suite_acade_project_open", stage, data, exception);
            }

            AcadeProjectOpenResultEnvelope Fail(string code, string message)
            {
                var failure = BuildAcadeProjectOpenFailure(code, message);
                failure.Meta["tracePath"] = tracePath;
                return failure;
            }

            var wdpPath = NormalizeText(payload.WdpPath);
            Trace(
                "entered-handler",
                new
                {
                    payloadRequestId = requestId,
                    payload.ProjectRootPath,
                    payload.WdpPath,
                    payload.UiMode,
                    payload.LaunchIfNeeded,
                    payload.AcadeLaunched,
                }
            );
            if (wdpPath.Length == 0)
            {
                Trace("invalid-request", new { reason = "wdpPath is required" });
                return Fail("INVALID_REQUEST", "wdpPath is required.");
            }
            if (!Path.IsPathRooted(wdpPath))
            {
                Trace("invalid-request", new { reason = "wdpPath must be absolute", wdpPath });
                return Fail("INVALID_REQUEST", "wdpPath must be absolute.");
            }

            try
            {
                wdpPath = Path.GetFullPath(wdpPath);
            }
            catch (Exception ex)
            {
                Trace("invalid-request", new { reason = "wdpPath invalid", wdpPath }, ex);
                return Fail(
                    "INVALID_REQUEST",
                    $"wdpPath is invalid: {ex.Message}"
                );
            }

            if (!File.Exists(wdpPath))
            {
                Trace("invalid-request", new { reason = "wdpPath not found", wdpPath });
                return Fail(
                    "INVALID_REQUEST",
                    $"wdpPath was not found: {wdpPath}"
                );
            }

            var warnings = new List<string>();
            var activeProfile = SuiteCadPipeHost.ResolveCurrentProfileName();
            Trace("profile-resolved", new { activeProfile, wdpPath });
            if (!SuiteCadPipeHost.IsAcadeProfileName(activeProfile))
            {
                var profileFailure = Fail(
                    "AUTOCAD_PROFILE_MISMATCH",
                    $"Active AutoCAD profile '{activeProfile}' is not the required '<<ACADE>>' profile."
                );
                profileFailure.Meta["providerPath"] = "dotnet+inproc";
                profileFailure.Meta["activeProfile"] = activeProfile;
                Trace("profile-mismatch", new { activeProfile, wdpPath });
                return profileFailure;
            }

            if (!TryEnsureAcadeWorkingDocument(warnings, out var workingDocumentContext))
            {
                var noDocumentFailure = Fail(
                    "AUTOCAD_ELECTRICAL_NOT_READY",
                    "AutoCAD documents collection is unavailable."
                );
                noDocumentFailure.Meta["providerPath"] = "dotnet+inproc";
                noDocumentFailure.Meta["activeProfile"] = activeProfile;
                noDocumentFailure.Warnings = warnings;
                Trace("working-document-unavailable", new { warnings, activeProfile, wdpPath });
                return noDocumentFailure;
            }

            Trace(
                "working-document-ready",
                new
                {
                    activeProfile,
                    documentName = NormalizeText(workingDocumentContext.Document?.Name),
                    documentPath = NormalizeText(workingDocumentContext.Document?.Database?.Filename),
                    workingDocumentContext.TemporaryDocumentCreated,
                }
            );

            if (
                !TryEnsureAcadeProjectRuntimeReady(
                    workingDocumentContext,
                    warnings,
                    out var readiness
                )
            )
            {
                var runtimeFailure = Fail(
                    "AUTOCAD_ELECTRICAL_NOT_READY",
                    string.IsNullOrWhiteSpace(readiness.Message)
                        ? "AutoCAD Electrical project runtime is not ready yet."
                        : readiness.Message
                );
                runtimeFailure.Meta["providerPath"] = "dotnet+inproc";
                runtimeFailure.Meta["activeProfile"] = activeProfile;
                AppendAcadeRuntimeReadinessMeta(runtimeFailure.Meta, readiness);
                runtimeFailure.Warnings = warnings;
                TryCloseTemporaryAcadeDocument(workingDocumentContext, runtimeFailure.Warnings);
                Trace(
                    "runtime-not-ready",
                    new
                    {
                        activeProfile,
                        readiness.Ready,
                        readiness.WdLoadReady,
                        readiness.WdLoadArxReady,
                        readiness.IdlePulseCount,
                        readiness.ActiveCommandNames,
                        readiness.Message,
                        warnings,
                    }
                );
                return runtimeFailure;
            }

            Trace(
                "runtime-ready",
                new
                {
                    activeProfile,
                    readiness.Ready,
                    readiness.WdLoadReady,
                    readiness.WdLoadArxReady,
                    readiness.IdlePulseCount,
                    readiness.ActiveCommandNames,
                    readiness.Message,
                }
            );

            var observation = CaptureAcadeProjectObservation(wdpPath, warnings);
            Trace(
                "pre-verification-observation",
                new
                {
                    wdpPath,
                    observation.AepxExists,
                    observation.AepxLastWriteUtc,
                    observation.LastProjObserved,
                    observation.LastProjLastWriteUtc,
                }
            );

            var invocation = TryInvokeAcadeProjectOpen(requestId, wdpPath, workingDocumentContext);
            Trace(
                "invoke-completed",
                new
                {
                    invocation.Success,
                    invocation.Code,
                    invocation.Message,
                    invocation.Strategy,
                    invocation.ActiveProjectPath,
                    invocation.SwitchAttempted,
                    invocation.InvocationAttempts,
                    warningCount = invocation.Warnings.Count,
                }
            );
            var verification = VerifyAcadeProjectSideEffects(
                wdpPath,
                observation,
                invocation.ActiveProjectPath,
                warnings
            );
            if (
                !string.IsNullOrWhiteSpace(verification.ActiveProjectPath)
                && string.IsNullOrWhiteSpace(invocation.ActiveProjectPath)
            )
            {
                invocation.ActiveProjectPath = verification.ActiveProjectPath;
            }

            var projectActivated = invocation.Success && (
                verification.AepxObserved
                || verification.LastProjObserved
                || verification.ActiveProjectObserved
            );
            if (
                !projectActivated
                && verification.ActiveProjectObserved
                && string.IsNullOrWhiteSpace(invocation.Code)
            )
            {
                invocation.Success = true;
                projectActivated = true;
            }

            if (projectActivated)
            {
                TryCloseTemporaryAcadeDocument(workingDocumentContext, warnings);
            }

            Trace(
                "verification-completed",
                new
                {
                    verification.CommandCompleted,
                    verification.AepxObserved,
                    verification.LastProjObserved,
                    verification.ActiveProjectObserved,
                    verification.ActiveProjectPath,
                    projectActivated,
                    workingDocumentContext.TemporaryDocumentCreated,
                    workingDocumentContext.TemporaryDocumentClosed,
                    warnings,
                }
            );

            var envelope = new AcadeProjectOpenResultEnvelope
            {
                Success = projectActivated,
                Code = projectActivated
                    ? string.Empty
                    : (
                        NormalizeText(invocation.Code).Length > 0
                            ? NormalizeText(invocation.Code)
                            : "ACADE_PROJECT_NOT_VERIFIED"
                    ),
                Message = projectActivated
                    ? "ACADE project open command completed."
                    : (
                        NormalizeText(invocation.Message).Length > 0
                            ? NormalizeText(invocation.Message)
                            : "ACADE project did not produce a verified open-project side effect."
                    ),
                Data = new AcadeProjectOpenResultData
                {
                    WdpPath = wdpPath,
                    AcadeLaunched = payload.AcadeLaunched,
                    ProjectActivated = projectActivated,
                    Strategy = NormalizeText(invocation.Strategy),
                    ActiveProjectPath = NormalizeText(invocation.ActiveProjectPath),
                    ActiveProjectFilePath = NormalizeText(invocation.ActiveProjectFilePath),
                    ActiveProjectDatabasePath = NormalizeText(invocation.ActiveProjectDatabasePath),
                    SwitchAttempted = invocation.SwitchAttempted,
                    SwitchBlockedReason = NormalizeText(invocation.SwitchBlockedReason),
                    TemporaryDocumentCreated = workingDocumentContext.TemporaryDocumentCreated,
                    TemporaryDocumentClosed = workingDocumentContext.TemporaryDocumentClosed,
                    Verification = verification,
                },
                Warnings = warnings
                    .Concat(invocation.Warnings)
                    .Where(item => !string.IsNullOrWhiteSpace(item))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList(),
                Meta = new Dictionary<string, object>
                {
                    ["providerPath"] = "dotnet+inproc",
                    ["activeProfile"] = activeProfile,
                    ["strategy"] = NormalizeText(invocation.Strategy),
                    ["assemblyPath"] = NormalizeText(invocation.AssemblyPath),
                    ["invocationAttempts"] = invocation.InvocationAttempts,
                    ["switchAttempted"] = invocation.SwitchAttempted,
                    ["switchBlockedReason"] = NormalizeText(invocation.SwitchBlockedReason),
                    ["temporaryDocumentCreated"] = workingDocumentContext.TemporaryDocumentCreated,
                    ["temporaryDocumentClosed"] = workingDocumentContext.TemporaryDocumentClosed,
                    ["tracePath"] = tracePath,
                },
            };
            AppendAcadeRuntimeReadinessMeta(envelope.Meta, readiness);

            if (!string.IsNullOrWhiteSpace(invocation.ActiveProjectPath))
            {
                envelope.Meta["activeProjectPath"] = invocation.ActiveProjectPath;
            }
            if (!string.IsNullOrWhiteSpace(invocation.ActiveProjectFilePath))
            {
                envelope.Meta["activeProjectFilePath"] = invocation.ActiveProjectFilePath;
            }
            if (!string.IsNullOrWhiteSpace(invocation.ActiveProjectDatabasePath))
            {
                envelope.Meta["activeProjectDatabasePath"] = invocation.ActiveProjectDatabasePath;
            }

            if (!envelope.Success && envelope.Message.Length == 0)
            {
                envelope.Message = "ACADE project open failed.";
            }

            Trace(
                "returning-envelope",
                new
                {
                    envelope.Success,
                    envelope.Code,
                    envelope.Message,
                    tracePath,
                }
            );

            return envelope;
        }

        private static AcadeProjectOpenResultEnvelope BuildAcadeProjectOpenFailure(
            string code,
            string message
        )
        {
            return new AcadeProjectOpenResultEnvelope
            {
                Success = false,
                Code = code,
                Message = message,
                Meta = new Dictionary<string, object>
                {
                    ["providerPath"] = "plugin",
                },
            };
        }

        private static AcadeProjectOpenInvocationResult TryInvokeAcadeProjectOpen(
            string requestId,
            string wdpPath,
            AcadeWorkingDocumentContext workingDocumentContext
        )
        {
            var result = new AcadeProjectOpenInvocationResult();
            void Trace(string stage, object? data = null, Exception? exception = null)
            {
                SuiteCadAcadeTraceLog.WriteTrace(requestId, "suite_acade_project_open", stage, data, exception);
            }

            Trace("invoke-start", new { wdpPath });
            Assembly acePageManAssembly;
            try
            {
                acePageManAssembly = LoadAcePageManAssembly(out var assemblyPath);
                result.AssemblyPath = assemblyPath;
                Trace("assembly-loaded", new { assemblyPath });
            }
            catch (Exception ex)
            {
                result.Code = "ACADE_PROJECT_OPEN_FAILED";
                result.Message = $"Unable to load AcePageManMgd.dll: {ex.Message}";
                Trace("assembly-load-failed", new { wdpPath }, ex);
                return result;
            }

            TryPrimeAcadeProjectManager(acePageManAssembly, result);
            Trace("project-manager-primed", new { warningCount = result.Warnings.Count });

            AcadeProjectIdentity currentActiveProjectIdentity = null;
            if (TryGetActiveProjectIdentity(acePageManAssembly, out currentActiveProjectIdentity))
            {
                ApplyActiveProjectIdentity(result, currentActiveProjectIdentity);
                Trace(
                    "active-project-detected",
                    new
                    {
                        result.ActiveProjectPath,
                        result.ActiveProjectFilePath,
                        result.ActiveProjectDatabasePath,
                        result.ActiveProjectDisplayName,
                    }
                );
                if (
                    !string.IsNullOrWhiteSpace(result.ActiveProjectPath)
                    && LooksLikeSameAcadeProject(currentActiveProjectIdentity, wdpPath)
                )
                {
                    result.Success = true;
                    result.Strategy = "ProjectManager.GetActiveProject";
                    result.Message = "ACADE project is already active.";
                    Trace(
                        "already-active",
                        new
                        {
                            result.ActiveProjectPath,
                            result.ActiveProjectFilePath,
                            result.ActiveProjectDatabasePath,
                        }
                    );
                    return result;
                }

                if (!string.IsNullOrWhiteSpace(result.ActiveProjectPath))
                {
                    result.SwitchAttempted = true;
                    Trace(
                        "switch-required",
                        new
                        {
                            result.ActiveProjectPath,
                            result.ActiveProjectFilePath,
                            result.ActiveProjectDatabasePath,
                            wdpPath,
                        }
                    );
                    var switchEligibility = EvaluateAcadeProjectSwitchEligibility(workingDocumentContext);
                    result.SwitchBlockedReason = NormalizeText(switchEligibility.BlockedReason);
                    Trace(
                        "switch-eligibility",
                        new
                        {
                            switchEligibility.Eligible,
                            switchEligibility.BlockedReason,
                            switchEligibility.ActiveCommandNames,
                            switchEligibility.DatabaseModified,
                            switchEligibility.TrackerIsCreating,
                            switchEligibility.TemporaryDocumentPending,
                        }
                    );
                    if (!switchEligibility.Eligible)
                    {
                        result.Code = "ACADE_PROJECT_SWITCH_BLOCKED";
                        result.Message =
                            NormalizeText(switchEligibility.BlockedReason).Length > 0
                                ? NormalizeText(switchEligibility.BlockedReason)
                                : "ACADE cannot switch projects because the current session is not clean.";
                        result.Warnings.Add(result.Message);
                        return result;
                    }

                    Trace(
                        "close-stage-start",
                        new
                        {
                            currentActiveProjectPath = result.ActiveProjectPath,
                            currentActiveProjectFilePath = result.ActiveProjectFilePath,
                            currentActiveProjectDatabasePath = result.ActiveProjectDatabasePath,
                        }
                    );
                    if (!TryCloseCurrentProject(acePageManAssembly, currentActiveProjectIdentity, result, Trace))
                    {
                        if (NormalizeText(result.Code).Length == 0)
                        {
                            result.Code = "ACADE_PROJECT_CLOSE_FAILED";
                        }
                        if (NormalizeText(result.Message).Length == 0)
                        {
                            result.Message =
                                "ACADE could not close the current project before switching.";
                        }
                        Trace(
                            "close-stage-finished",
                            new
                            {
                                success = false,
                                result.Code,
                                result.Message,
                                result.Strategy,
                                result.ActiveProjectPath,
                                result.ActiveProjectFilePath,
                                result.ActiveProjectDatabasePath,
                            }
                        );
                        return result;
                    }

                    Trace(
                        "close-stage-finished",
                        new
                        {
                            success = true,
                            result.Strategy,
                            result.ActiveProjectPath,
                            result.ActiveProjectFilePath,
                            result.ActiveProjectDatabasePath,
                        }
                    );
                    result.ActiveProjectPath = string.Empty;
                    result.ActiveProjectFilePath = string.Empty;
                    result.ActiveProjectDatabasePath = string.Empty;
                    result.ActiveProjectDisplayName = string.Empty;
                }
            }

            bool TryStrategy(string stageName, string strategyName, Func<bool> callback)
            {
                var warningStartIndex = result.Warnings.Count;
                Trace(
                    $"{stageName}-strategy-start",
                    new
                    {
                        strategyName,
                        wdpPath,
                        result.ActiveProjectPath,
                        result.ActiveProjectFilePath,
                        result.ActiveProjectDatabasePath,
                        result.SwitchAttempted,
                    }
                );
                var success = callback();
                if (
                    (success || string.IsNullOrWhiteSpace(result.ActiveProjectFilePath))
                    && TryGetActiveProjectIdentity(acePageManAssembly, out var activeProjectIdentity)
                )
                {
                    ApplyActiveProjectIdentity(result, activeProjectIdentity);
                }
                var newWarnings = result.Warnings.Skip(warningStartIndex).ToArray();
                Trace(
                    $"{stageName}-strategy-finished",
                    new
                    {
                        strategyName,
                        success,
                        result.Code,
                        result.Message,
                        result.Strategy,
                        result.ActiveProjectPath,
                        result.ActiveProjectFilePath,
                        result.ActiveProjectDatabasePath,
                        warnings = newWarnings,
                    }
                );
                return success;
            }

            Trace("open-stage-start", new { wdpPath, result.SwitchAttempted });
            if (
                !TryStrategy(
                    "open",
                    "ace_pm_wdp_filer",
                    () => TryOpenProjectViaAcePmWdpFiler(acePageManAssembly, wdpPath, result)
                )
                && !TryStrategy(
                    "open",
                    "wd_load_project",
                    () => TryOpenProjectViaWdLoadProjectLispInvoke(acePageManAssembly, wdpPath, result)
                )
                && !TryStrategy(
                    "open",
                    "gblpm_open_project",
                    () => TryOpenProjectViaGlobalProjectLispInvoke(acePageManAssembly, wdpPath, result)
                )
                && !TryStrategy(
                    "open",
                    "pmopenproject_invoke",
                    () => TryOpenProjectViaLispInvoke(acePageManAssembly, wdpPath, result)
                )
            )
            {
                if (NormalizeText(result.Code).Length == 0)
                {
                    result.Code = "ACADE_PROJECT_OPEN_FAILED";
                }
                if (NormalizeText(result.Message).Length == 0)
                {
                    result.Message = "ACADE internal project-open API did not accept the request.";
                }
                Trace(
                    "open-stage-finished",
                    new
                    {
                        success = false,
                        result.Code,
                        result.Message,
                        result.Strategy,
                        result.ActiveProjectPath,
                        result.ActiveProjectFilePath,
                        result.ActiveProjectDatabasePath,
                        warnings = result.Warnings.ToArray(),
                    }
                );
                Trace(
                    "all-strategies-failed",
                    new
                    {
                        result.Code,
                        result.Message,
                        result.Strategy,
                        result.ActiveProjectPath,
                        result.ActiveProjectFilePath,
                        result.ActiveProjectDatabasePath,
                        warnings = result.Warnings.ToArray(),
                    }
                );
                return result;
            }

            Trace(
                "open-stage-finished",
                new
                {
                    success = true,
                    result.Code,
                    result.Message,
                    result.Strategy,
                    result.ActiveProjectPath,
                    result.ActiveProjectFilePath,
                    result.ActiveProjectDatabasePath,
                }
            );

            result.Success = true;
            if (TryGetActiveProjectIdentity(acePageManAssembly, out var activeProjectIdentity))
            {
                ApplyActiveProjectIdentity(result, activeProjectIdentity);
            }

            if (
                !string.IsNullOrWhiteSpace(result.ActiveProjectPath)
                && !LooksLikeSameAcadeProjectPath(result.ActiveProjectPath, wdpPath)
            )
            {
                result.Success = false;
                result.Code = "ACADE_PROJECT_OPEN_FAILED";
                result.Message =
                    $"ACADE reported active project '{result.ActiveProjectPath}', which does not match the requested '{wdpPath}'.";
                result.Warnings.Add(result.Message);
            }

            Trace(
                "invoke-return",
                new
                {
                    result.Success,
                    result.Code,
                    result.Message,
                    result.Strategy,
                    result.ActiveProjectPath,
                    result.ActiveProjectFilePath,
                    result.ActiveProjectDatabasePath,
                    result.SwitchAttempted,
                    result.SwitchBlockedReason,
                    result.InvocationAttempts,
                    warningCount = result.Warnings.Count,
                }
            );

            return result;
        }

        private static void ApplyActiveProjectIdentity(
            AcadeProjectOpenInvocationResult result,
            AcadeProjectIdentity identity
        )
        {
            if (result == null || identity == null)
            {
                return;
            }

            result.ActiveProjectPath = NormalizeText(identity.PreferredPath);
            result.ActiveProjectFilePath = NormalizeText(identity.ProjectFilePath);
            result.ActiveProjectDatabasePath = NormalizeText(identity.DatabasePath);
            result.ActiveProjectDisplayName = NormalizeText(identity.DisplayName);
        }

        private static AcadeProjectSwitchEligibility EvaluateAcadeProjectSwitchEligibility(
            AcadeWorkingDocumentContext context
        )
        {
            var activeCommandNames = NormalizeActiveCommandNamesForSwitchEligibility(
                ResolveActiveCommandNames()
            );
            var databaseModified = ResolveDatabaseModifiedState();
            var trackerIsCreating = false;
            try
            {
                trackerIsCreating =
                    SuiteCadTrackerOperationStateStore.TryReadState(out var trackerState)
                    && trackerState.IsCreating;
            }
            catch
            {
                trackerIsCreating = false;
            }

            var temporaryDocumentPending =
                context != null
                && context.TemporaryDocumentCreated
                && !context.TemporaryDocumentClosed;

            var eligibility = EvaluateAcadeProjectSwitchEligibilityCore(
                activeCommandNames,
                databaseModified,
                trackerIsCreating,
                temporaryDocumentPending
            );
            eligibility.ActiveCommandNames = activeCommandNames;
            eligibility.DatabaseModified = databaseModified;
            eligibility.TrackerIsCreating = trackerIsCreating;
            eligibility.TemporaryDocumentPending = temporaryDocumentPending;
            return eligibility;
        }

        internal static AcadeProjectSwitchEligibility EvaluateAcadeProjectSwitchEligibilityCore(
            string activeCommandNames,
            int databaseModified,
            bool trackerIsCreating,
            bool temporaryDocumentPending
        )
        {
            var eligibility = new AcadeProjectSwitchEligibility
            {
                Eligible = false,
                ActiveCommandNames = NormalizeText(activeCommandNames),
                DatabaseModified = databaseModified,
                TrackerIsCreating = trackerIsCreating,
                TemporaryDocumentPending = temporaryDocumentPending,
            };

            if (!string.IsNullOrWhiteSpace(eligibility.ActiveCommandNames))
            {
                eligibility.BlockedReason =
                    $"ACADE cannot switch projects while commands are active: {eligibility.ActiveCommandNames}.";
                return eligibility;
            }

            if (trackerIsCreating)
            {
                eligibility.BlockedReason =
                    "ACADE cannot switch projects while another Suite create/open operation is still active.";
                return eligibility;
            }

            if (temporaryDocumentPending)
            {
                eligibility.BlockedReason =
                    "ACADE cannot switch projects while a temporary scratch drawing is still pending cleanup.";
                return eligibility;
            }

            if (databaseModified != 0)
            {
                eligibility.BlockedReason =
                    $"ACADE cannot switch projects because the active drawing has unsaved changes (DBMOD={databaseModified}).";
                return eligibility;
            }

            eligibility.Eligible = true;
            return eligibility;
        }

        private static string NormalizeActiveCommandNamesForSwitchEligibility(string commandNames)
        {
            var normalized = NormalizeText(commandNames);
            if (string.Equals(normalized, "SUITEACADEDEBUGSTATUS", StringComparison.OrdinalIgnoreCase))
            {
                return string.Empty;
            }

            return normalized;
        }

        private static int ResolveDatabaseModifiedState()
        {
            return SuiteCadPipeHost.InvokeOnApplicationThread(
                () =>
                {
                    try
                    {
                        return Convert.ToInt32(Application.GetSystemVariable("DBMOD"));
                    }
                    catch
                    {
                        return -1;
                    }
                }
            );
        }

        private static bool TryCloseCurrentProject(
            Assembly assembly,
            AcadeProjectIdentity currentActiveProjectIdentity,
            AcadeProjectOpenInvocationResult result,
            Action<string, object?, Exception?> trace
        )
        {
            bool TryCloseStrategy(string strategyName, Func<bool> callback)
            {
                var warningStartIndex = result.Warnings.Count;
                trace(
                    "close-strategy-start",
                    new
                    {
                        strategyName,
                        result.ActiveProjectPath,
                        result.ActiveProjectFilePath,
                        result.ActiveProjectDatabasePath,
                    },
                    null
                );
                var success = callback();
                var newWarnings = result.Warnings.Skip(warningStartIndex).ToArray();
                trace(
                    "close-strategy-finished",
                    new
                    {
                        strategyName,
                        success,
                        result.Code,
                        result.Message,
                        result.Strategy,
                        result.ActiveProjectPath,
                        result.ActiveProjectFilePath,
                        result.ActiveProjectDatabasePath,
                        warnings = newWarnings,
                    },
                    null
                );
                return success;
            }

            return TryCloseStrategy(
                    "ace_pm_wdp_filer",
                    () => TryCloseProjectViaAcePmWdpFiler(assembly, currentActiveProjectIdentity, result)
                )
                || TryCloseStrategy(
                    "gblpm_close_project",
                    () => TryCloseProjectViaGlobalProjectLispInvoke(assembly, currentActiveProjectIdentity, result)
                )
                || TryCloseStrategy(
                    "pmcloseproject_invoke",
                    () => TryCloseProjectViaLispInvoke(assembly, currentActiveProjectIdentity, result)
                );
        }

        private static bool TryOpenProjectViaWdLoadProjectLispInvoke(
            Assembly assembly,
            string wdpPath,
            AcadeProjectOpenInvocationResult result
        )
        {
            TryWarmAcadeProjectFunctionsViaLisp(result);

            var normalizedWdpPath = NormalizeLispPathArgument(wdpPath);
            var arguments = new[] { new TypedValue((int)LispDataType.Text, normalizedWdpPath) };
            foreach (var functionName in new[] { "c:wd_load_project", "wd_load_project" })
            {
                if (
                    !TryInvokeLispFunction(
                        functionName,
                        arguments,
                        result,
                        out var lispResult,
                        out var returnedTruthy
                    )
                )
                {
                    continue;
                }

                using (lispResult)
                {
                    var resultSummary = DescribeLispResult(lispResult);
                    if (!returnedTruthy && resultSummary.Length > 0)
                    {
                        result.Warnings.Add(
                            $"Application.Invoke({functionName}) returned {resultSummary} while opening '{wdpPath}'."
                        );
                    }

                    if (TryWaitForActiveProjectPath(assembly, wdpPath, out var activeProjectPath))
                    {
                        result.ActiveProjectPath = NormalizeText(activeProjectPath);
                        result.Strategy = $"Application.Invoke({functionName})";
                        result.Message = "ACADE project open command completed.";
                        return true;
                    }

                    if (!string.IsNullOrWhiteSpace(activeProjectPath))
                    {
                        result.ActiveProjectPath = NormalizeText(activeProjectPath);
                        result.Warnings.Add(
                            $"Application.Invoke({functionName}) left ACADE on '{activeProjectPath}' instead of '{wdpPath}'."
                        );
                    }
                }
            }

            return false;
        }

        private static bool TryCloseProjectViaAcePmWdpFiler(
            Assembly assembly,
            AcadeProjectIdentity currentActiveProjectIdentity,
            AcadeProjectOpenInvocationResult result
        )
        {
            foreach (var closeTarget in EnumerateCloseProjectTargets(currentActiveProjectIdentity))
            {
                if (TryCloseProjectViaAcePmWdpFiler(assembly, closeTarget, result))
                {
                    return true;
                }
            }

            return TryCloseProjectViaAcePmWdpFiler(assembly, string.Empty, result);
        }

        private static bool TryCloseProjectViaAcePmWdpFiler(
            Assembly assembly,
            string currentActiveProjectPath,
            AcadeProjectOpenInvocationResult result
        )
        {
            var candidateTypes = GetProjectOperationCandidateTypes(assembly);
            var methodNames = new[]
            {
                "closeActiveProject",
                "closeCurrentProject",
                "closeProject",
                "deactivateProject",
            };

            foreach (var type in candidateTypes)
            {
                var methods = type
                    .GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance)
                    .Where(
                        method => methodNames.Any(
                            methodName =>
                                string.Equals(method.Name, methodName, StringComparison.OrdinalIgnoreCase)
                        )
                    )
                    .OrderBy(method => method.GetParameters().Length)
                    .ToList();

                foreach (var method in methods)
                {
                    object instance = null;
                    if (
                        !method.IsStatic
                        && !TryResolveProjectOperationTargetInstance(
                            assembly,
                            type,
                            result,
                            out instance
                        )
                    )
                    {
                        continue;
                    }

                    var attemptedSignature = false;
                    foreach (var args in BuildCloseProjectArgumentSets(method, currentActiveProjectPath))
                    {
                        attemptedSignature = true;
                        result.InvocationAttempts += 1;
                        try
                        {
                            var returnValue = method.Invoke(instance, args);
                            var accepted = returnValue is bool boolValue ? boolValue : true;
                            if (!accepted)
                            {
                                result.Warnings.Add(
                                    $"{FormatMethodSignature(type, method)} returned false while closing '{currentActiveProjectPath}'."
                                );
                                continue;
                            }

                            if (
                                TryWaitForProjectClose(
                                    assembly,
                                    currentActiveProjectPath,
                                    out var remainingProjectPath
                                )
                            )
                            {
                                result.Strategy = $"{type.FullName}.{method.Name}";
                                return true;
                            }

                            if (!string.IsNullOrWhiteSpace(remainingProjectPath))
                            {
                                result.Warnings.Add(
                                    $"{FormatMethodSignature(type, method)} left ACADE on '{remainingProjectPath}' instead of closing '{currentActiveProjectPath}'."
                                );
                            }
                        }
                        catch (TargetInvocationException ex)
                        {
                            var detail = ex.InnerException?.Message ?? ex.Message;
                            result.Warnings.Add($"{FormatMethodSignature(type, method)} failed: {detail}");
                        }
                        catch (Exception ex)
                        {
                            result.Warnings.Add($"{FormatMethodSignature(type, method)} failed: {ex.Message}");
                        }
                    }

                    if (!attemptedSignature)
                    {
                        result.Warnings.Add(
                            $"{FormatMethodSignature(type, method)} skipped because Suite could not build a compatible argument list."
                        );
                    }
                }
            }

            return false;
        }

        private static bool TryCloseProjectViaGlobalProjectLispInvoke(
            Assembly assembly,
            AcadeProjectIdentity currentActiveProjectIdentity,
            AcadeProjectOpenInvocationResult result
        )
        {
            foreach (var closeTarget in EnumerateCloseProjectTargets(currentActiveProjectIdentity))
            {
                if (TryCloseProjectViaGlobalProjectLispInvoke(assembly, closeTarget, result))
                {
                    return true;
                }
            }

            return TryCloseProjectViaGlobalProjectLispInvoke(assembly, string.Empty, result);
        }

        private static bool TryCloseProjectViaGlobalProjectLispInvoke(
            Assembly assembly,
            string currentActiveProjectPath,
            AcadeProjectOpenInvocationResult result
        )
        {
            TryPrimeAcadeProjectManager(assembly, result);
            TryWarmAcadeProjectFunctionsViaLisp(result);

            var normalizedPath = NormalizeLispPathArgument(currentActiveProjectPath);
            var argumentSets = new IReadOnlyList<TypedValue>[]
            {
                new[] { new TypedValue((int)LispDataType.Text, normalizedPath) },
                Array.Empty<TypedValue>(),
            };

            foreach (var functionName in new[] { "GblPm_Close_Project" })
            {
                foreach (var args in argumentSets)
                {
                    if (
                        !TryInvokeLispFunction(
                            functionName,
                            args,
                            result,
                            out var lispResult,
                            out var returnedTruthy
                        )
                    )
                    {
                        continue;
                    }

                    using (lispResult)
                    {
                        var resultSummary = DescribeLispResult(lispResult);
                        if (!returnedTruthy && resultSummary.Length > 0)
                        {
                            result.Warnings.Add(
                                $"Application.Invoke({functionName}) returned {resultSummary} while closing '{currentActiveProjectPath}'."
                            );
                        }

                        if (
                            TryWaitForProjectClose(
                                assembly,
                                currentActiveProjectPath,
                                out var remainingProjectPath
                            )
                        )
                        {
                            result.Strategy = $"Application.Invoke({functionName})";
                            return true;
                        }

                        if (!string.IsNullOrWhiteSpace(remainingProjectPath))
                        {
                            result.Warnings.Add(
                                $"Application.Invoke({functionName}) left ACADE on '{remainingProjectPath}' instead of closing '{currentActiveProjectPath}'."
                            );
                        }
                    }
                }
            }

            return false;
        }

        private static bool TryCloseProjectViaLispInvoke(
            Assembly assembly,
            AcadeProjectIdentity currentActiveProjectIdentity,
            AcadeProjectOpenInvocationResult result
        )
        {
            foreach (var closeTarget in EnumerateCloseProjectTargets(currentActiveProjectIdentity))
            {
                if (TryCloseProjectViaLispInvoke(assembly, closeTarget, result))
                {
                    return true;
                }
            }

            return TryCloseProjectViaLispInvoke(assembly, string.Empty, result);
        }

        private static bool TryCloseProjectViaLispInvoke(
            Assembly assembly,
            string currentActiveProjectPath,
            AcadeProjectOpenInvocationResult result
        )
        {
            TryWarmAcadeProjectFunctionsViaLisp(result);
            foreach (var functionName in new[] { "PmCloseProject", "c:PmCloseProject" })
            {
                if (
                    !TryInvokeLispFunction(
                        functionName,
                        Array.Empty<TypedValue>(),
                        result,
                        out var lispResult,
                        out var returnedTruthy
                    )
                )
                {
                    continue;
                }

                using (lispResult)
                {
                    var resultSummary = DescribeLispResult(lispResult);
                    if (!returnedTruthy && resultSummary.Length > 0)
                    {
                        result.Warnings.Add(
                            $"Application.Invoke({functionName}) returned {resultSummary} while closing '{currentActiveProjectPath}'."
                        );
                    }

                    if (
                        TryWaitForProjectClose(
                            assembly,
                            currentActiveProjectPath,
                            out var remainingProjectPath
                        )
                    )
                    {
                        result.Strategy = $"Application.Invoke({functionName})";
                        return true;
                    }

                    if (!string.IsNullOrWhiteSpace(remainingProjectPath))
                    {
                        result.Warnings.Add(
                            $"Application.Invoke({functionName}) left ACADE on '{remainingProjectPath}' instead of closing '{currentActiveProjectPath}'."
                        );
                    }
                }
            }

            return false;
        }

        private static bool TryCloseProjectViaSendStringToExecute(
            Assembly assembly,
            string currentActiveProjectPath,
            AcadeProjectOpenInvocationResult result
        )
        {
            var document = GetCurrentAcadeDocument();
            if (document == null)
            {
                result.Warnings.Add(
                    "Skipped SendStringToExecute close-project fallback because no active AutoCAD document is available."
                );
                return false;
            }

            foreach (var expression in BuildSendStringCloseProjectExpressions())
            {
                result.InvocationAttempts += 1;
                if (
                    !TryExecuteInPreferredCommandContext(
                        () =>
                        {
                            document.SendStringToExecute(
                                expression,
                                activate: true,
                                wrapUpInactiveDoc: false,
                                echoCommand: false
                            );
                            return true;
                        },
                        result,
                        "SendStringToExecute(PmCloseProject)",
                        out bool queued
                    )
                    || !queued
                )
                {
                    continue;
                }

                if (
                    TryWaitForProjectClose(
                        assembly,
                        currentActiveProjectPath,
                        out var remainingProjectPath
                    )
                )
                {
                    result.Strategy = "SendStringToExecute(PmCloseProject)";
                    return true;
                }

                if (!string.IsNullOrWhiteSpace(remainingProjectPath))
                {
                    result.Warnings.Add(
                        $"SendStringToExecute(PmCloseProject) left ACADE on '{remainingProjectPath}' instead of closing '{currentActiveProjectPath}'."
                    );
                }
            }

            return false;
        }

        private static bool TryOpenProjectViaGlobalProjectLispInvoke(
            Assembly assembly,
            string wdpPath,
            AcadeProjectOpenInvocationResult result
        )
        {
            TryPrimeAcadeProjectManager(assembly, result);
            TryWarmAcadeProjectFunctionsViaLisp(result);

            var normalizedWdpPath = NormalizeLispPathArgument(wdpPath);
            var arguments = new[] { new TypedValue((int)LispDataType.Text, normalizedWdpPath) };
            foreach (var functionName in new[] { "GblPm_Open_Project" })
            {
                if (
                    !TryInvokeLispFunction(
                        functionName,
                        arguments,
                        result,
                        out var lispResult,
                        out var returnedTruthy
                    )
                )
                {
                    continue;
                }

                using (lispResult)
                {
                    var resultSummary = DescribeLispResult(lispResult);
                    if (!returnedTruthy && resultSummary.Length > 0)
                    {
                        result.Warnings.Add(
                            $"Application.Invoke({functionName}) returned {resultSummary} while opening '{wdpPath}'."
                        );
                    }

                    if (
                        TryEnsureRequestedProjectIsActiveViaLisp(
                            assembly,
                            wdpPath,
                            result,
                            functionName
                        )
                    )
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        private static bool TryOpenProjectViaLispInvoke(
            Assembly assembly,
            string wdpPath,
            AcadeProjectOpenInvocationResult result
        )
        {
            TryWarmAcadeProjectFunctionsViaLisp(result);
            var normalizedWdpPath = NormalizeLispPathArgument(wdpPath);
            foreach (var functionName in new[] { "PmOpenProject", "c:PmOpenProject" })
            {
                foreach (var args in BuildLispOpenProjectArgumentSets(normalizedWdpPath))
                {
                    if (
                        !TryInvokeLispFunction(
                            functionName,
                            args,
                            result,
                            out var lispResult,
                            out var returnedTruthy
                        )
                    )
                    {
                        continue;
                    }

                    using (lispResult)
                    {
                        var resultSummary = DescribeLispResult(lispResult);
                        if (!returnedTruthy && resultSummary.Length > 0)
                        {
                            result.Warnings.Add(
                                $"Application.Invoke({functionName}) returned {resultSummary} while opening '{wdpPath}'."
                            );
                        }

                        if (TryWaitForActiveProjectPath(assembly, wdpPath, out var activeProjectPath))
                        {
                            result.ActiveProjectPath = NormalizeText(activeProjectPath);
                            result.Strategy = $"Application.Invoke({functionName})";
                            result.Message = "ACADE project open command completed.";
                            return true;
                        }

                        if (!string.IsNullOrWhiteSpace(activeProjectPath))
                        {
                            result.ActiveProjectPath = NormalizeText(activeProjectPath);
                            result.Warnings.Add(
                                $"Application.Invoke({functionName}) left ACADE on '{activeProjectPath}' instead of '{wdpPath}'."
                            );
                        }
                    }
                }
            }

            return false;
        }

        private static bool TryEnsureRequestedProjectIsActiveViaLisp(
            Assembly assembly,
            string wdpPath,
            AcadeProjectOpenInvocationResult result,
            string strategyName
        )
        {
            if (TryWaitForActiveProjectPath(assembly, wdpPath, out var activeProjectPath))
            {
                result.ActiveProjectPath = NormalizeText(activeProjectPath);
                result.Strategy = $"Application.Invoke({strategyName})";
                result.Message = "ACADE project open command completed.";
                return true;
            }

            if (!string.IsNullOrWhiteSpace(activeProjectPath))
            {
                result.ActiveProjectPath = NormalizeText(activeProjectPath);
            }

            if (
                TrySetCurrentProjectViaLisp(assembly, wdpPath, result, strategyName)
                && TryWaitForActiveProjectPath(assembly, wdpPath, out activeProjectPath)
            )
            {
                result.ActiveProjectPath = NormalizeText(activeProjectPath);
                result.Strategy = $"Application.Invoke({strategyName}) + SetCurrent";
                result.Message = "ACADE project open command completed.";
                return true;
            }

            if (!string.IsNullOrWhiteSpace(activeProjectPath))
            {
                result.ActiveProjectPath = NormalizeText(activeProjectPath);
                result.Warnings.Add(
                    $"Application.Invoke({strategyName}) left ACADE on '{activeProjectPath}' instead of '{wdpPath}'."
                );
            }

            return false;
        }

        private static bool TrySetCurrentProjectViaLisp(
            Assembly assembly,
            string wdpPath,
            AcadeProjectOpenInvocationResult result,
            string parentStrategyName
        )
        {
            var normalizedWdpPath = NormalizeLispPathArgument(wdpPath);
            var arguments = new[] { new TypedValue((int)LispDataType.Text, normalizedWdpPath) };
            foreach (var functionName in new[] { "GblPm_SetCurrent_Project", "PmSetActive" })
            {
                if (
                    !TryInvokeLispFunction(
                        functionName,
                        arguments,
                        result,
                        out var lispResult,
                        out var returnedTruthy
                    )
                )
                {
                    continue;
                }

                using (lispResult)
                {
                    var resultSummary = DescribeLispResult(lispResult);
                    if (!returnedTruthy && resultSummary.Length > 0)
                    {
                        result.Warnings.Add(
                            $"Application.Invoke({functionName}) returned {resultSummary} after {parentStrategyName} for '{wdpPath}'."
                        );
                    }

                    if (TryWaitForActiveProjectPath(assembly, wdpPath, out _))
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        private static bool TryOpenProjectViaSendStringToExecute(
            Assembly assembly,
            string wdpPath,
            AcadeProjectOpenInvocationResult result
        )
        {
            var document = GetCurrentAcadeDocument();
            if (document == null)
            {
                result.Warnings.Add(
                    "Skipped SendStringToExecute project-open fallback because no active AutoCAD document is available."
                );
                return false;
            }

            foreach (var expression in BuildSendStringOpenProjectExpressions(wdpPath))
            {
                result.InvocationAttempts += 1;
                if (
                    !TryExecuteInPreferredCommandContext(
                        () =>
                        {
                            document.SendStringToExecute(
                                expression,
                                activate: true,
                                wrapUpInactiveDoc: false,
                                echoCommand: false
                            );
                            return true;
                        },
                        result,
                        "SendStringToExecute(PmOpenProject)",
                        out bool queued
                    )
                    || !queued
                )
                {
                    continue;
                }

                if (TryWaitForActiveProjectPath(assembly, wdpPath, out var activeProjectPath))
                {
                    result.ActiveProjectPath = NormalizeText(activeProjectPath);
                    result.Strategy = "SendStringToExecute(PmOpenProject)";
                    result.Message = "ACADE project open command completed.";
                    return true;
                }

                if (!string.IsNullOrWhiteSpace(activeProjectPath))
                {
                    result.ActiveProjectPath = NormalizeText(activeProjectPath);
                    result.Warnings.Add(
                        $"SendStringToExecute(PmOpenProject) left ACADE on '{activeProjectPath}' instead of '{wdpPath}'."
                    );
                }
            }

            return false;
        }

        private static bool TryInvokeLispFunction(
            string functionName,
            IReadOnlyList<TypedValue> arguments,
            AcadeProjectOpenInvocationResult result,
            out ResultBuffer lispResult,
            out bool returnedTruthy,
            bool countAsInvocation = true
        )
        {
            lispResult = null;
            returnedTruthy = false;

            var invokeArguments = new List<TypedValue>
            {
                new TypedValue((int)LispDataType.Text, NormalizeText(functionName)),
            };
            if (arguments != null)
            {
                invokeArguments.AddRange(arguments);
            }

            if (countAsInvocation)
            {
                result.InvocationAttempts += 1;
            }

            if (
                !TryExecuteInPreferredCommandContext(
                    () =>
                    {
                        using var invokeBuffer = new ResultBuffer(invokeArguments.ToArray());
                        return CoreApplication.Invoke(invokeBuffer);
                    },
                    result,
                    $"Application.Invoke({NormalizeText(functionName)})",
                    out ResultBuffer invocationResult
                )
            )
            {
                return false;
            }

            lispResult = invocationResult;
            returnedTruthy = IsLispResultTruthy(invocationResult);
            return true;
        }

        private static bool TryExecuteInPreferredCommandContext<TResult>(
            Func<TResult> callback,
            AcadeProjectOpenInvocationResult result,
            string operationName,
            out TResult value
        )
        {
            bool ExecuteCore(out TResult coreValue)
            {
                coreValue = default;
                var documentManager = Application.DocumentManager;
                if (documentManager == null || documentManager.MdiActiveDocument == null)
                {
                    result.Warnings.Add(
                        $"{operationName} skipped because AutoCAD does not have an active drawing document."
                    );
                    return false;
                }

                if (!documentManager.IsApplicationContext)
                {
                    try
                    {
                        coreValue = callback();
                        return true;
                    }
                    catch (Exception ex)
                    {
                        result.Warnings.Add($"{operationName} failed: {ex.Message}");
                        return false;
                    }
                }

                Exception callbackFailure = null;
                TResult callbackValue = default;
                try
                {
                    var execution = documentManager.ExecuteInCommandContextAsync(
                        _ =>
                        {
                            try
                            {
                                callbackValue = callback();
                            }
                            catch (Exception ex)
                            {
                                callbackFailure = ex;
                            }

                            return Task.CompletedTask;
                        },
                        null
                    );
                    execution.GetResult();
                }
                catch (Exception ex)
                {
                    callbackFailure ??= ex;
                }

                if (callbackFailure != null)
                {
                    result.Warnings.Add($"{operationName} failed: {callbackFailure.Message}");
                    return false;
                }

                coreValue = callbackValue;
                return true;
            }

            if (!SuiteCadPipeHost.IsOnApplicationThread)
            {
                TResult marshaledValue = default;
                var marshaledSuccess = SuiteCadPipeHost.InvokeOnApplicationThread(
                    () => ExecuteCore(out marshaledValue)
                );
                value = marshaledValue;
                return marshaledSuccess;
            }

            return ExecuteCore(out value);
        }

        private static bool TryExecuteInPreferredCommandContextQuiet<TResult>(
            Func<TResult> callback,
            out TResult value,
            out string failureMessage
        )
        {
            bool ExecuteCore(out TResult coreValue, out string coreFailureMessage)
            {
                coreValue = default;
                coreFailureMessage = string.Empty;

                var documentManager = Application.DocumentManager;
                if (documentManager == null || documentManager.MdiActiveDocument == null)
                {
                    coreFailureMessage =
                        "AutoCAD does not have an active drawing document for command-context execution.";
                    return false;
                }

                if (!documentManager.IsApplicationContext)
                {
                    try
                    {
                        coreValue = callback();
                        return true;
                    }
                    catch (Exception ex)
                    {
                        coreFailureMessage = ex.Message;
                        return false;
                    }
                }

                Exception callbackFailure = null;
                TResult callbackValue = default;
                try
                {
                    var execution = documentManager.ExecuteInCommandContextAsync(
                        _ =>
                        {
                            try
                            {
                                callbackValue = callback();
                            }
                            catch (Exception ex)
                            {
                                callbackFailure = ex;
                            }

                            return Task.CompletedTask;
                        },
                        null
                    );
                    execution.GetResult();
                }
                catch (Exception ex)
                {
                    callbackFailure ??= ex;
                }

                if (callbackFailure != null)
                {
                    coreFailureMessage = callbackFailure.Message;
                    return false;
                }

                coreValue = callbackValue;
                return true;
            }

            if (!SuiteCadPipeHost.IsOnApplicationThread)
            {
                TResult marshaledValue = default;
                string marshaledFailure = string.Empty;
                var marshaledSuccess = SuiteCadPipeHost.InvokeOnApplicationThread(
                    () => ExecuteCore(out marshaledValue, out marshaledFailure)
                );
                value = marshaledValue;
                failureMessage = marshaledFailure;
                return marshaledSuccess;
            }

            return ExecuteCore(out value, out failureMessage);
        }

        private static void AppendAcadeRuntimeReadinessMeta(
            IDictionary<string, object> meta,
            AcadeRuntimeReadinessData readiness
        )
        {
            if (meta == null || readiness == null)
            {
                return;
            }

            meta["idlePulseCount"] = readiness.IdlePulseCount;
            meta["wdLoadReady"] = readiness.WdLoadReady;
            meta["wdLoadArxReady"] = readiness.WdLoadArxReady;

            if (!string.IsNullOrWhiteSpace(readiness.ActiveCommandNames))
            {
                meta["activeCommandNames"] = readiness.ActiveCommandNames;
            }
        }

        private static bool TryEnsureAcadeProjectRuntimeReady(
            AcadeWorkingDocumentContext context,
            List<string> warnings,
            out AcadeRuntimeReadinessData readiness
        )
        {
            readiness = new AcadeRuntimeReadinessData();
            var deadlineUtc = DateTime.UtcNow.AddSeconds(12);
            var lastProbeFailure = string.Empty;

            while (DateTime.UtcNow <= deadlineUtc)
            {
                var document = context.Document ?? GetCurrentAcadeDocument();
                if (document == null)
                {
                    readiness.Message = "AutoCAD documents collection is unavailable.";
                    Thread.Sleep(150);
                    continue;
                }

                context.Document = document;

                var commandNames = ResolveActiveCommandNames();
                readiness.ActiveCommandNames = commandNames;
                if (!string.IsNullOrWhiteSpace(commandNames))
                {
                    readiness.IdlePulseCount = 0;
                    Thread.Sleep(200);
                    continue;
                }

                Thread.Sleep(200);

                commandNames = ResolveActiveCommandNames();
                readiness.ActiveCommandNames = commandNames;
                if (!string.IsNullOrWhiteSpace(commandNames))
                {
                    readiness.IdlePulseCount = 0;
                    continue;
                }

                readiness.IdlePulseCount += 1;
                if (readiness.IdlePulseCount < 2)
                {
                    continue;
                }

                TryWarmAcadeProjectFunctionsViaLispQuiet(
                    out var wdLoadReady,
                    out var wdLoadArxReady,
                    out var probeFailure
                );
                readiness.WdLoadReady |= wdLoadReady;
                readiness.WdLoadArxReady |= wdLoadArxReady;

                if (readiness.WdLoadReady)
                {
                    readiness.Ready = true;
                    readiness.Message = "ACADE project runtime is ready.";
                    return true;
                }

                if (!string.IsNullOrWhiteSpace(probeFailure))
                {
                    lastProbeFailure = probeFailure;
                }

                Thread.Sleep(200);
            }

            readiness.Message = "AutoCAD Electrical project runtime is not ready yet.";
            if (!string.IsNullOrWhiteSpace(lastProbeFailure))
            {
                warnings.Add(lastProbeFailure);
            }
            else if (!string.IsNullOrWhiteSpace(readiness.ActiveCommandNames))
            {
                warnings.Add(
                    $"ACADE command queue remained busy: {readiness.ActiveCommandNames}"
                );
            }
            else
            {
                warnings.Add(
                    "Suite waited for AutoCAD Electrical to finish initializing, but wd_load never became available."
                );
            }

            return false;
        }

        private static string ResolveActiveCommandNames()
        {
            return SuiteCadPipeHost.InvokeOnApplicationThread(() =>
            {
                try
                {
                    return Convert.ToString(Application.GetSystemVariable("CMDNAMES"))?.Trim()
                        ?? string.Empty;
                }
                catch
                {
                    return string.Empty;
                }
            });
        }

        private static bool TryWarmAcadeProjectFunctionsViaLispQuiet(
            out bool wdLoadReady,
            out bool wdLoadArxReady,
            out string failureMessage
        )
        {
            wdLoadReady = false;
            wdLoadArxReady = false;
            failureMessage = string.Empty;

            foreach (var functionName in new[] { "wd_load_arx", "c:wd_load_arx" })
            {
                if (
                    TryInvokeLispFunctionQuiet(
                        functionName,
                        Array.Empty<TypedValue>(),
                        out var lispResult,
                        out var returnedTruthy,
                        out var invokeFailure
                    )
                )
                {
                    using (lispResult)
                    {
                        var resultSummary = DescribeLispResult(lispResult);
                        if (
                            returnedTruthy
                            || string.Equals(resultSummary, "empty", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(resultSummary, "null", StringComparison.OrdinalIgnoreCase)
                            || !resultSummary.Contains("error", StringComparison.OrdinalIgnoreCase)
                        )
                        {
                            wdLoadArxReady = true;
                            break;
                        }
                    }
                }
                else if (failureMessage.Length == 0 && invokeFailure.Length > 0)
                {
                    failureMessage =
                        $"Suite could not quietly invoke {functionName} while waiting for the ACADE runtime: {invokeFailure}";
                }
            }

            foreach (var functionName in new[] { "wd_load", "c:wd_load" })
            {
                if (
                    TryInvokeLispFunctionQuiet(
                        functionName,
                        Array.Empty<TypedValue>(),
                        out var lispResult,
                        out var returnedTruthy,
                        out var invokeFailure
                    )
                )
                {
                    using (lispResult)
                    {
                        var resultSummary = DescribeLispResult(lispResult);
                        if (
                            returnedTruthy
                            || string.Equals(resultSummary, "empty", StringComparison.OrdinalIgnoreCase)
                            || string.Equals(resultSummary, "null", StringComparison.OrdinalIgnoreCase)
                            || !resultSummary.Contains("error", StringComparison.OrdinalIgnoreCase)
                        )
                        {
                            wdLoadReady = true;
                            break;
                        }
                    }
                }
                else if (failureMessage.Length == 0 && invokeFailure.Length > 0)
                {
                    failureMessage =
                        $"Suite could not quietly invoke {functionName} while waiting for the ACADE runtime: {invokeFailure}";
                }
            }

            return wdLoadReady || wdLoadArxReady;
        }

        private static bool TryInvokeLispFunctionQuiet(
            string functionName,
            IReadOnlyList<TypedValue> arguments,
            out ResultBuffer lispResult,
            out bool returnedTruthy,
            out string failureMessage
        )
        {
            lispResult = null;
            returnedTruthy = false;
            failureMessage = string.Empty;

            var invokeArguments = new List<TypedValue>
            {
                new TypedValue((int)LispDataType.Text, NormalizeText(functionName)),
            };
            if (arguments != null)
            {
                invokeArguments.AddRange(arguments);
            }

            if (
                !TryExecuteInPreferredCommandContextQuiet(
                    () =>
                    {
                        using var invokeBuffer = new ResultBuffer(invokeArguments.ToArray());
                        return CoreApplication.Invoke(invokeBuffer);
                    },
                    out ResultBuffer invocationResult,
                    out failureMessage
                )
            )
            {
                return false;
            }

            lispResult = invocationResult;
            returnedTruthy = IsLispResultTruthy(invocationResult);
            return true;
        }

        private static void TryWarmAcadeProjectFunctionsViaLisp(
            AcadeProjectOpenInvocationResult result
        )
        {
            _ = TryWarmAcadeProjectFunctionsViaLispQuiet(
                out _,
                out _,
                out _
            );
        }

        private static void TryPrimeAcadeProjectManager(
            Assembly assembly,
            AcadeProjectOpenInvocationResult result
        )
        {
            SuiteCadPipeHost.InvokeOnApplicationThread(() =>
            {
                try
                {
                    var projectManagerType = EnumerateAcadeProjectAssemblies(assembly)
                        .SelectMany(GetLoadableTypes)
                        .FirstOrDefault(
                            type =>
                                string.Equals(
                                    type.FullName,
                                    "Autodesk.Electrical.Project.ProjectManager",
                                    StringComparison.Ordinal
                                )
                                || string.Equals(type.Name, "ProjectManager", StringComparison.Ordinal)
                        );
                    var getInstanceMethod = projectManagerType?.GetMethod(
                        "GetInstance",
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
                        binder: null,
                        types: Type.EmptyTypes,
                        modifiers: null
                    );
                    _ = getInstanceMethod?.Invoke(null, null);
                }
                catch (Exception ex)
                {
                    result.Warnings.Add($"Suite could not prime the ACADE project manager: {ex.Message}");
                }

                try
                {
                    _ = TryGetActiveProjectIdentityViaNamedAccessors(assembly, out _);
                }
                catch
                {
                    // Best effort priming only.
                }

                return true;
            });
        }

        private static IReadOnlyList<IReadOnlyList<TypedValue>> BuildLispOpenProjectArgumentSets(
            string wdpPath
        )
        {
            var falseValue = CreateLispBoolean(false);
            var trueValue = CreateLispBoolean(true);
            return new List<IReadOnlyList<TypedValue>>
            {
                new[]
                {
                    new TypedValue((int)LispDataType.Text, wdpPath),
                    falseValue,
                    falseValue,
                },
                new[]
                {
                    new TypedValue((int)LispDataType.Text, wdpPath),
                    trueValue,
                    falseValue,
                },
            };
        }

        private static TypedValue CreateLispBoolean(bool value)
        {
            return value
                ? new TypedValue((int)LispDataType.T_atom, true)
                : new TypedValue((int)LispDataType.Nil);
        }

        private static string NormalizeLispPathArgument(string path)
        {
            try
            {
                path = Path.GetFullPath(path);
            }
            catch
            {
                // Preserve the original string when normalization fails.
            }

            return NormalizeText(path).Replace('\\', '/');
        }

        private static bool IsLispResultTruthy(ResultBuffer resultBuffer)
        {
            if (resultBuffer == null)
            {
                return false;
            }

            TypedValue[] values;
            try
            {
                values = resultBuffer.AsArray() ?? Array.Empty<TypedValue>();
            }
            catch
            {
                return false;
            }

            if (values.Length == 0)
            {
                return true;
            }

            var hasTruthyValue = false;
            foreach (var typedValue in values)
            {
                if (typedValue.TypeCode == (int)LispDataType.T_atom)
                {
                    return true;
                }

                if (typedValue.TypeCode == (int)LispDataType.Nil)
                {
                    continue;
                }

                var rawValue = typedValue.Value;
                if (rawValue is bool boolValue)
                {
                    hasTruthyValue |= boolValue;
                    continue;
                }

                if (rawValue is short shortValue)
                {
                    hasTruthyValue |= shortValue != 0;
                    continue;
                }

                if (rawValue is int intValue)
                {
                    hasTruthyValue |= intValue != 0;
                    continue;
                }

                var textValue = NormalizeText(Convert.ToString(rawValue));
                if (string.Equals(textValue, "T", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }

                if (
                    textValue.StartsWith("; error:", StringComparison.OrdinalIgnoreCase)
                    || textValue.StartsWith("error:", StringComparison.OrdinalIgnoreCase)
                )
                {
                    return false;
                }

                if (textValue.Length > 0)
                {
                    hasTruthyValue = true;
                }
            }

            return hasTruthyValue;
        }

        private static string DescribeLispResult(ResultBuffer resultBuffer)
        {
            if (resultBuffer == null)
            {
                return "null";
            }

            try
            {
                var values = resultBuffer.AsArray() ?? Array.Empty<TypedValue>();
                if (values.Length == 0)
                {
                    return "empty";
                }

                return string.Join(
                    ", ",
                    values.Take(4)
                        .Select(
                            value =>
                                $"{value.TypeCode}:{NormalizeText(Convert.ToString(value.Value))}"
                        )
                ) + (values.Length > 4 ? ", ..." : "");
            }
            catch (Exception ex)
            {
                return ex.Message;
            }
        }

        private static Assembly LoadAcePageManAssembly(out string assemblyPath)
        {
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    if (string.Equals(
                        Path.GetFileName(assembly.Location),
                        "AcePageManMgd.dll",
                        StringComparison.OrdinalIgnoreCase
                    ))
                    {
                        assemblyPath = assembly.Location;
                        return assembly;
                    }
                }
                catch
                {
                    // Skip dynamic assemblies without a stable location.
                }
            }

            var currentProcessPath = Process.GetCurrentProcess().MainModule?.FileName ?? "";
            var installRoot = Path.GetDirectoryName(currentProcessPath) ?? "";
            var candidates = new[]
            {
                Path.Combine(installRoot, "Acade", "AcePageManMgd.dll"),
                Path.Combine(installRoot, "AcePageManMgd.dll"),
            };
            foreach (var candidate in candidates)
            {
                if (!File.Exists(candidate))
                {
                    continue;
                }

                assemblyPath = candidate;
                return Assembly.LoadFrom(candidate);
            }

            throw new FileNotFoundException("AcePageManMgd.dll was not found under the running AutoCAD install.");
        }

        private static IReadOnlyList<Assembly> EnumerateAcadeProjectAssemblies(Assembly primaryAssembly)
        {
            var assemblies = new List<Assembly>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            void TryAddAssembly(Assembly? assembly)
            {
                if (assembly == null)
                {
                    return;
                }

                var key = NormalizeText(assembly.FullName);
                try
                {
                    var location = NormalizeText(assembly.Location);
                    if (location.Length > 0)
                    {
                        key = location;
                    }
                }
                catch
                {
                    // Dynamic assemblies may not expose a location.
                }

                if (key.Length == 0 || !seen.Add(key))
                {
                    return;
                }

                assemblies.Add(assembly);
            }

            var interestingAssemblyNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "AcePageManMgd.dll",
                "AcePmUtils.dll",
                "AceProject.dll",
                "AcePlatformMgd.dll",
                "AceMgdCommon.dll",
                "AceMgdUtils.dll",
            };

            TryAddAssembly(primaryAssembly);
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    var fileName = Path.GetFileName(assembly.Location);
                    if (interestingAssemblyNames.Contains(fileName))
                    {
                        TryAddAssembly(assembly);
                    }
                }
                catch
                {
                    // Skip dynamic assemblies without stable locations.
                }
            }

            try
            {
                var installRoot = Path.GetDirectoryName(primaryAssembly.Location) ?? "";
                foreach (var fileName in interestingAssemblyNames)
                {
                    var candidatePath = Path.Combine(installRoot, fileName);
                    if (!File.Exists(candidatePath))
                    {
                        continue;
                    }

                    TryAddAssembly(Assembly.LoadFrom(candidatePath));
                }
            }
            catch
            {
                // Best effort only; current-domain assemblies remain the primary discovery path.
            }

            return assemblies;
        }

        private static bool TryOpenProjectViaAcePmWdpFiler(
            Assembly assembly,
            string wdpPath,
            AcadeProjectOpenInvocationResult result
        )
        {
            var candidateTypes = GetProjectOperationCandidateTypes(assembly);
            if (candidateTypes.Count == 0)
            {
                result.Warnings.Add(
                    "Suite did not find any loaded ACADE project manager or WDP filer types."
                );
                return false;
            }
            var methodNames = new[]
            {
                "openProject",
                "activateProject",
                "setActiveProject",
                "loadProject",
            };

            foreach (var type in candidateTypes)
            {
                var methods = type
                    .GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance)
                    .Where(
                        method => methodNames.Any(
                            methodName =>
                                string.Equals(method.Name, methodName, StringComparison.OrdinalIgnoreCase)
                        )
                    )
                    .OrderBy(method => method.GetParameters().Length)
                    .ToList();

                foreach (var method in methods)
                {
                    object instance = null;
                    if (
                        !method.IsStatic
                        && !TryResolveProjectOperationTargetInstance(
                            assembly,
                            type,
                            result,
                            out instance
                        )
                    )
                    {
                        continue;
                    }

                    var attemptedSignature = false;
                    foreach (var args in BuildOpenProjectArgumentSets(method, wdpPath))
                    {
                        attemptedSignature = true;
                        result.InvocationAttempts += 1;
                        try
                        {
                            var returnValue = method.Invoke(instance, args);
                            var accepted = returnValue is bool boolValue ? boolValue : true;
                            if (!accepted)
                            {
                                result.Warnings.Add(
                                    $"{FormatMethodSignature(type, method)} returned false for '{wdpPath}'."
                                );
                                continue;
                            }

                            if (TryWaitForActiveProjectPath(assembly, wdpPath, out var activeProjectPath))
                            {
                                result.ActiveProjectPath = NormalizeText(activeProjectPath);
                                result.Strategy = $"{type.FullName}.{method.Name}";
                                result.Message = "ACADE project open command completed.";
                                return true;
                            }

                            if (!string.IsNullOrWhiteSpace(activeProjectPath))
                            {
                                result.ActiveProjectPath = NormalizeText(activeProjectPath);
                                result.Warnings.Add(
                                    $"{FormatMethodSignature(type, method)} left ACADE on '{activeProjectPath}' instead of '{wdpPath}'."
                                );
                                continue;
                            }

                            result.Strategy = $"{type.FullName}.{method.Name}";
                            result.Message = "ACADE project open command completed.";
                            return true;
                        }
                        catch (TargetInvocationException ex)
                        {
                            var detail = ex.InnerException?.Message ?? ex.Message;
                            result.Warnings.Add($"{FormatMethodSignature(type, method)} failed: {detail}");
                            result.Code = "ACADE_PROJECT_OPEN_FAILED";
                            result.Message = detail;
                        }
                        catch (Exception ex)
                        {
                            result.Warnings.Add($"{FormatMethodSignature(type, method)} failed: {ex.Message}");
                            result.Code = "ACADE_PROJECT_OPEN_FAILED";
                            result.Message = ex.Message;
                        }
                    }

                    if (!attemptedSignature)
                    {
                        result.Warnings.Add(
                            $"{FormatMethodSignature(type, method)} skipped because Suite could not build a compatible argument list."
                        );
                    }
                }
            }

            return false;
        }

        private static List<Type> GetProjectOperationCandidateTypes(Assembly assembly)
        {
            return EnumerateAcadeProjectAssemblies(assembly)
                .SelectMany(GetLoadableTypes)
                .Where(
                    type =>
                        string.Equals(type.FullName, "Autodesk.Electrical.Project.ProjectManager", StringComparison.Ordinal)
                        || string.Equals(type.Name, "ProjectManager", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(type.Name, "AcePrmProjectManager", StringComparison.OrdinalIgnoreCase)
                        || type.Name.IndexOf("ProjectManager", StringComparison.OrdinalIgnoreCase) >= 0
                        || string.Equals(type.Name, "AcePmUtilsWDPFiler", StringComparison.OrdinalIgnoreCase)
                        || type.Name.IndexOf("PmUtilsWDPFiler", StringComparison.OrdinalIgnoreCase) >= 0
                        || string.Equals(type.Name, "AcePrmWDPFiler", StringComparison.OrdinalIgnoreCase)
                        || type.Name.IndexOf("PrmWDPFiler", StringComparison.OrdinalIgnoreCase) >= 0
                        || type.Name.IndexOf("WDPFiler", StringComparison.OrdinalIgnoreCase) >= 0
                        || string.Equals(type.FullName, "Autodesk.Electrical.Project", StringComparison.Ordinal)
                        || string.Equals(type.Name, "AcePrmProject", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(type.Name, "Project", StringComparison.OrdinalIgnoreCase)
                )
                .OrderBy(GetProjectOperationCandidateRank)
                .ThenBy(type => type.FullName, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private static int GetProjectOperationCandidateRank(Type type)
        {
            if (string.Equals(type.FullName, "Autodesk.Electrical.Project.ProjectManager", StringComparison.Ordinal))
            {
                return 0;
            }

            if (string.Equals(type.Name, "ProjectManager", StringComparison.OrdinalIgnoreCase))
            {
                return 1;
            }

            if (string.Equals(type.Name, "AcePrmProjectManager", StringComparison.OrdinalIgnoreCase))
            {
                return 2;
            }

            if (type.Name.IndexOf("ProjectManager", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return 3;
            }

            if (string.Equals(type.Name, "AcePmUtilsWDPFiler", StringComparison.OrdinalIgnoreCase))
            {
                return 4;
            }

            if (type.Name.IndexOf("WDPFiler", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return 5;
            }

            if (string.Equals(type.FullName, "Autodesk.Electrical.Project", StringComparison.Ordinal))
            {
                return 6;
            }

            if (string.Equals(type.Name, "AcePrmProject", StringComparison.OrdinalIgnoreCase))
            {
                return 7;
            }

            return 8;
        }

        private static bool TryResolveProjectOperationTargetInstance(
            Assembly assembly,
            Type type,
            AcadeProjectOpenInvocationResult result,
            out object instance
        )
        {
            instance = null;

            if (TryResolveProjectOperationSingleton(assembly, type, out instance))
            {
                return true;
            }

            foreach (var candidateArgs in BuildProjectOperationConstructorArgumentSets(type))
            {
                try
                {
                    instance = Activator.CreateInstance(
                        type,
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance,
                        binder: null,
                        args: candidateArgs,
                        culture: null
                    );
                    if (instance != null)
                    {
                        return true;
                    }
                }
                catch (MissingMethodException)
                {
                    // Try the next constructor signature.
                }
                catch (TargetInvocationException ex)
                {
                    result.Warnings.Add(
                        $"Skipped {type.FullName}: {ex.InnerException?.Message ?? ex.Message}"
                    );
                    return false;
                }
                catch (Exception ex)
                {
                    result.Warnings.Add($"Skipped {type.FullName}: {ex.GetType().Name} {ex.Message}");
                    return false;
                }
            }

            result.Warnings.Add(
                $"Skipped {type.FullName}: no project-operation singleton or compatible constructor was available."
            );
            return false;
        }

        private static bool TryResolveProjectOperationSingleton(
            Assembly assembly,
            Type type,
            out object instance
        )
        {
            instance = null;
            assembly = type.Assembly;

            foreach (
                var factoryName in new[] { "GetInstance", "Instance", "GetProjectManager", "GetManager" }
            )
            {
                var staticMethod = type.GetMethods(
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static
                    )
                    .FirstOrDefault(
                        method =>
                            string.Equals(method.Name, factoryName, StringComparison.OrdinalIgnoreCase)
                            && method.GetParameters().Length == 0
                            && type.IsAssignableFrom(method.ReturnType)
                    );
                if (staticMethod is not null)
                {
                    try
                    {
                        instance = staticMethod.Invoke(null, null);
                        if (instance != null)
                        {
                            return true;
                        }
                    }
                    catch
                    {
                        // Keep searching for a working singleton/provider.
                    }
                }
            }

            foreach (var propertyName in new[] { "Instance", "Current", "ProjectManager" })
            {
                var staticProperty = type.GetProperty(
                    propertyName,
                    BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static
                );
                if (staticProperty is null || !type.IsAssignableFrom(staticProperty.PropertyType))
                {
                    continue;
                }

                try
                {
                    instance = staticProperty.GetValue(null, null);
                    if (instance != null)
                    {
                        return true;
                    }
                }
                catch
                {
                    // Keep searching for a working singleton/provider.
                }
            }

            try
            {
                var globalFactory = assembly
                    .ManifestModule.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)
                    .FirstOrDefault(
                        method =>
                            string.Equals(
                                method.Name,
                                "GetProjectManager",
                                StringComparison.OrdinalIgnoreCase
                            )
                            && method.GetParameters().Length == 0
                            && type.IsAssignableFrom(method.ReturnType)
                    );
                if (globalFactory is not null)
                {
                    instance = globalFactory.Invoke(null, null);
                    if (instance != null)
                    {
                        return true;
                    }
                }
            }
            catch
            {
                // Best-effort only; keep falling back.
            }

            foreach (var candidateType in GetLoadableTypes(assembly))
            {
                foreach (
                    var method in candidateType.GetMethods(
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static
                    )
                )
                {
                    if (
                        !string.Equals(
                            method.Name,
                            "GetProjectManager",
                            StringComparison.OrdinalIgnoreCase
                        )
                        || method.GetParameters().Length != 0
                        || !type.IsAssignableFrom(method.ReturnType)
                    )
                    {
                        continue;
                    }

                    try
                    {
                        instance = method.Invoke(null, null);
                        if (instance != null)
                        {
                            return true;
                        }
                    }
                    catch
                    {
                        // Keep searching for a working singleton/provider.
                    }
                }
            }

            return false;
        }

        private static IEnumerable<object[]> BuildProjectOperationConstructorArgumentSets(Type type)
        {
            var constructors = type
                .GetConstructors(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
                .OrderBy(constructor => constructor.GetParameters().Length)
                .ToList();
            if (constructors.Count == 0)
            {
                yield return Array.Empty<object>();
                yield break;
            }

            foreach (var constructor in constructors)
            {
                var parameters = constructor.GetParameters();
                var args = new object[parameters.Length];
                var boolIndexes = new List<int>();
                var supported = true;

                for (var index = 0; index < parameters.Length; index++)
                {
                    var parameter = parameters[index];
                    var parameterType = parameter.ParameterType;
                    if (parameterType.IsByRef || parameter.IsOut)
                    {
                        supported = false;
                        break;
                    }

                    if (parameterType == typeof(bool))
                    {
                        args[index] = false;
                        boolIndexes.Add(index);
                        continue;
                    }

                    if (parameterType == typeof(string))
                    {
                        args[index] = string.Empty;
                        continue;
                    }

                    if (
                        parameterType == typeof(int)
                        || parameterType == typeof(short)
                        || parameterType == typeof(long)
                        || parameterType == typeof(double)
                        || parameterType == typeof(float)
                        || parameterType == typeof(decimal)
                    )
                    {
                        args[index] = Convert.ChangeType(0, parameterType);
                        continue;
                    }

                    if (parameterType.IsEnum)
                    {
                        var values = Enum.GetValues(parameterType);
                        args[index] = values.Length > 0
                            ? values.GetValue(0)
                            : Activator.CreateInstance(parameterType);
                        continue;
                    }

                    if (parameter.HasDefaultValue)
                    {
                        args[index] = parameter.DefaultValue;
                        continue;
                    }

                    args[index] = parameterType.IsValueType
                        ? Activator.CreateInstance(parameterType)
                        : null;
                }

                if (!supported)
                {
                    continue;
                }

                if (boolIndexes.Count == 0)
                {
                    yield return args;
                    continue;
                }

                var maxMask = boolIndexes.Count <= 4 ? 1 << boolIndexes.Count : 2;
                for (var mask = 0; mask < maxMask; mask++)
                {
                    var candidate = (object[])args.Clone();
                    if (boolIndexes.Count <= 4)
                    {
                        for (var bit = 0; bit < boolIndexes.Count; bit++)
                        {
                            candidate[boolIndexes[bit]] = (mask & (1 << bit)) != 0;
                        }
                    }
                    else if (mask == 1)
                    {
                        foreach (var boolIndex in boolIndexes)
                        {
                            candidate[boolIndex] = true;
                        }
                    }

                    yield return candidate;
                }
            }
        }

        private static bool TryOpenProjectViaEditorCommand(
            Assembly assembly,
            string wdpPath,
            AcadeProjectOpenInvocationResult result
        )
        {
            var document = Application.DocumentManager.MdiActiveDocument;
            var editor = document?.Editor;
            if (editor == null)
            {
                result.Warnings.Add("Skipped Editor.Command fallback because no active editor is available.");
                return false;
            }

            var commandMethod = editor
                .GetType()
                .GetMethod(
                    "Command",
                    BindingFlags.Public | BindingFlags.Instance,
                    binder: null,
                    types: new[] { typeof(object[]) },
                    modifiers: null
                );
            var commandAsyncMethod = editor
                .GetType()
                .GetMethod(
                    "CommandAsync",
                    BindingFlags.Public | BindingFlags.Instance,
                    binder: null,
                    types: new[] { typeof(object[]) },
                    modifiers: null
                );
            if (commandMethod == null && commandAsyncMethod == null)
            {
                result.Warnings.Add(
                    "Skipped Editor.Command fallback because neither Editor.Command nor Editor.CommandAsync is available."
                );
                return false;
            }

            var commandVariants = new[]
            {
                new object[] { "_.AEPROJECT", wdpPath },
                new object[] { "_.AEPROJECT", wdpPath, "" },
                new object[] { "_.PAEPROJECT", wdpPath },
                new object[] { "_.PAEPROJECT", wdpPath, "" },
            };

            foreach (var commandVariant in commandVariants)
            {
                result.InvocationAttempts += 1;
                var commandLabel =
                    $"Editor.Command({NormalizeText(Convert.ToString(commandVariant[0]))})";
                if (
                    !TryExecuteInPreferredCommandContext(
                        () =>
                        {
                            if (commandAsyncMethod != null)
                            {
                                var commandResult = commandAsyncMethod.Invoke(
                                    editor,
                                    new object[] { commandVariant }
                                );
                                commandResult?
                                    .GetType()
                                    .GetMethod(
                                        "GetResult",
                                        BindingFlags.Public | BindingFlags.Instance
                                    )
                                    ?.Invoke(commandResult, null);
                                return true;
                            }

                            commandMethod!.Invoke(editor, new object[] { commandVariant });
                            return true;
                        },
                        result,
                        commandLabel,
                        out bool commandExecuted
                    )
                    || !commandExecuted
                )
                {
                    continue;
                }

                if (TryWaitForActiveProjectPath(assembly, wdpPath, out var activeProjectPath))
                {
                    result.ActiveProjectPath = NormalizeText(activeProjectPath);
                    result.Strategy = commandLabel;
                    result.Message = "ACADE project open command completed.";
                    return true;
                }

                if (!string.IsNullOrWhiteSpace(activeProjectPath))
                {
                    result.Warnings.Add(
                        $"{commandLabel} left ACADE on '{activeProjectPath}' instead of '{wdpPath}'."
                    );
                    result.ActiveProjectPath = NormalizeText(activeProjectPath);
                }
            }

            return false;
        }

        private static bool TryGetActiveProjectPath(Assembly assembly, out string activeProjectPath)
        {
            if (TryGetActiveProjectIdentity(assembly, out var activeProjectIdentity))
            {
                activeProjectPath = NormalizeText(activeProjectIdentity.PreferredPath);
                return activeProjectPath.Length > 0;
            }

            activeProjectPath = string.Empty;
            return false;
        }

        private static bool TryGetActiveProjectIdentity(
            Assembly assembly,
            out AcadeProjectIdentity activeProjectIdentity
        )
        {
            AcadeProjectIdentity resolvedActiveProjectIdentity = null;
            var found = SuiteCadPipeHost.InvokeOnApplicationThread(
                () =>
                    TryGetActiveProjectIdentityOnApplicationThread(
                        assembly,
                        out resolvedActiveProjectIdentity
                    )
            );
            activeProjectIdentity = found ? resolvedActiveProjectIdentity : null;
            return activeProjectIdentity != null && activeProjectIdentity.PreferredPath.Length > 0;
        }

        private static bool TryGetActiveProjectIdentityOnApplicationThread(
            Assembly assembly,
            out AcadeProjectIdentity activeProjectIdentity
        )
        {
            activeProjectIdentity = null;
            var projectManagerType = EnumerateAcadeProjectAssemblies(assembly)
                .SelectMany(GetLoadableTypes)
                .FirstOrDefault(
                    type =>
                        string.Equals(
                            type.FullName,
                            "Autodesk.Electrical.Project.ProjectManager",
                            StringComparison.Ordinal
                        )
                        || string.Equals(type.Name, "ProjectManager", StringComparison.Ordinal)
                );
            if (projectManagerType != null)
            {
                object projectManager = null;
                var getInstanceMethod = projectManagerType.GetMethods(
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static
                    )
                    .FirstOrDefault(
                        candidate =>
                            string.Equals(candidate.Name, "GetInstance", StringComparison.OrdinalIgnoreCase)
                            && candidate.GetParameters().Length == 0
                    );
                if (getInstanceMethod != null)
                {
                    try
                    {
                        projectManager = getInstanceMethod.Invoke(null, null);
                    }
                    catch
                    {
                        projectManager = null;
                    }
                }

                var getActiveProjectMethod = projectManagerType.GetMethods(
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static
                    )
                    .FirstOrDefault(
                        candidate =>
                            string.Equals(
                                candidate.Name,
                                "GetActiveProject",
                                StringComparison.OrdinalIgnoreCase
                            )
                            && candidate.GetParameters().Length == 0
                    );
                if (getActiveProjectMethod != null)
                {
                    try
                    {
                        var activeProject = getActiveProjectMethod.IsStatic
                            ? getActiveProjectMethod.Invoke(null, null)
                            : projectManager == null
                                ? null
                                : getActiveProjectMethod.Invoke(projectManager, null);
                        if (TryReadAcadeProjectIdentity(activeProject, out activeProjectIdentity))
                        {
                            return true;
                        }
                    }
                    catch
                    {
                        // Fall through to legacy discovery for older installs.
                    }
                }
            }

            if (TryGetActiveProjectIdentityViaNamedAccessors(assembly, out activeProjectIdentity))
            {
                return true;
            }

            var legacyProjectType = EnumerateAcadeProjectAssemblies(assembly)
                .SelectMany(GetLoadableTypes)
                .FirstOrDefault(
                    type =>
                        string.Equals(type.FullName, "Autodesk.Electrical.Project", StringComparison.Ordinal)
                        || string.Equals(type.Name, "Project", StringComparison.Ordinal)
                );
            if (legacyProjectType == null)
            {
                return false;
            }

            var legacyGetActiveProject = legacyProjectType.GetMethods(
                    BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static
                )
                .FirstOrDefault(
                    candidate =>
                        string.Equals(candidate.Name, "GetActiveProject", StringComparison.OrdinalIgnoreCase)
                        && candidate.GetParameters().Length == 0
                );
            if (legacyGetActiveProject == null)
            {
                return false;
            }

            try
            {
                return TryReadAcadeProjectIdentity(
                    legacyGetActiveProject.Invoke(null, null),
                    out activeProjectIdentity
                );
            }
            catch
            {
                return TryGetActiveProjectIdentityViaNamedAccessors(
                    assembly,
                    out activeProjectIdentity
                );
            }
        }

        private static Document? GetCurrentAcadeDocument()
        {
            return SuiteCadPipeHost.InvokeOnApplicationThread(
                () => Application.DocumentManager?.MdiActiveDocument
            );
        }

        private static bool TryGetActiveProjectIdentityViaNamedAccessors(
            Assembly assembly,
            out AcadeProjectIdentity activeProjectIdentity
        )
        {
            activeProjectIdentity = null;
            var candidatePaths = new List<string>();
            var seenCandidatePaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            string displayName = string.Empty;

            void AddCandidatePath(string value)
            {
                var normalizedValue = NormalizeText(value);
                if (normalizedValue.Length > 0 && seenCandidatePaths.Add(normalizedValue))
                {
                    candidatePaths.Add(normalizedValue);
                }
            }

            void AddDisplayName(string value)
            {
                if (displayName.Length == 0)
                {
                    displayName = NormalizeText(value);
                }
            }

            bool TryReadAccessorValue(Type type, object instance, string memberName, bool isProperty)
            {
                try
                {
                    if (isProperty)
                    {
                        var property = type.GetProperty(
                            memberName,
                            BindingFlags.Public
                                | BindingFlags.NonPublic
                                | BindingFlags.Static
                                | BindingFlags.Instance
                        );
                        if (property == null || property.GetIndexParameters().Length != 0)
                        {
                            return false;
                        }

                        AddCandidatePath(Convert.ToString(property.GetValue(instance, null)));
                        return true;
                    }

                    var method = type.GetMethod(
                        memberName,
                        BindingFlags.Public
                            | BindingFlags.NonPublic
                            | BindingFlags.Static
                            | BindingFlags.Instance,
                        binder: null,
                        types: Type.EmptyTypes,
                        modifiers: null
                    );
                    if (method == null)
                    {
                        return false;
                    }

                    AddCandidatePath(Convert.ToString(method.Invoke(instance, null)));
                    return true;
                }
                catch
                {
                    return false;
                }
            }

            foreach (
                var assemblyCandidate in EnumerateAcadeProjectAssemblies(assembly).Concat(AppDomain.CurrentDomain.GetAssemblies())
            )
            {
                Type projectUtilType = null;
                try
                {
                    projectUtilType = assemblyCandidate.GetType("AceMgdUtils.ProjectUtil", throwOnError: false);
                }
                catch
                {
                    projectUtilType = null;
                }

                if (projectUtilType == null)
                {
                    continue;
                }

                foreach (
                    var methodName in new[]
                    {
                        "GetActiveProjectFileName",
                        "GetProjectFile",
                        "GetProjectFullPath",
                        "GetActiveProjectPath",
                        "GetDbFullPath",
                    }
                )
                {
                    _ = TryReadAccessorValue(projectUtilType, null, methodName, isProperty: false);
                }

                foreach (
                    var propertyName in new[]
                    {
                        "ActiveProjectFileName",
                        "ProjectFile",
                        "ProjectFilePath",
                        "ActiveProjectPath",
                        "DbFullPath",
                        "DatabasePath",
                    }
                )
                {
                    _ = TryReadAccessorValue(projectUtilType, null, propertyName, isProperty: true);
                }

                foreach (var nameMethod in new[] { "GetActiveProjectName", "GetProjectName" })
                {
                    try
                    {
                        var method = projectUtilType.GetMethod(
                            nameMethod,
                            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
                            binder: null,
                            types: Type.EmptyTypes,
                            modifiers: null
                        );
                        AddDisplayName(Convert.ToString(method?.Invoke(null, null)));
                    }
                    catch
                    {
                        // Best effort only.
                    }
                }
            }

            foreach (var type in EnumerateAcadeProjectAssemblies(assembly).SelectMany(GetLoadableTypes))
            {
                object instance = null;
                var resolvedInstance = false;

                foreach (
                    var methodName in new[]
                    {
                        "GetActiveProjectFileName",
                        "GetProjectFile",
                        "GetProjectFullPath",
                        "GetActiveProjectPath",
                        "GetFilePath",
                        "GetFullName",
                        "GetDbFullPath",
                    }
                )
                {
                    var method = type.GetMethod(
                        methodName,
                        BindingFlags.Public
                            | BindingFlags.NonPublic
                            | BindingFlags.Static
                            | BindingFlags.Instance,
                        binder: null,
                        types: Type.EmptyTypes,
                        modifiers: null
                    );
                    if (method == null)
                    {
                        continue;
                    }

                    if (!method.IsStatic)
                    {
                        if (
                            !resolvedInstance
                            && !TryResolveProjectOperationTargetInstance(
                                assembly,
                                type,
                                new AcadeProjectOpenInvocationResult(),
                                out instance
                            )
                        )
                        {
                            resolvedInstance = true;
                            continue;
                        }

                        resolvedInstance = true;
                    }

                    try
                    {
                        AddCandidatePath(Convert.ToString(method.Invoke(instance, null)));
                    }
                    catch
                    {
                        // Best effort only.
                    }
                }

                foreach (
                    var propertyName in new[]
                    {
                        "WdpPath",
                        "ProjectFile",
                        "ProjectFilePath",
                        "ActiveProjectFileName",
                        "ActiveProjectPath",
                        "DbFullPath",
                        "DatabasePath",
                        "Path",
                        "FullName",
                        "FileName",
                    }
                )
                {
                    var property = type.GetProperty(
                        propertyName,
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance
                    );
                    if (property == null || property.GetIndexParameters().Length != 0)
                    {
                        continue;
                    }

                    if (!property.GetMethod?.IsStatic ?? false)
                    {
                        if (
                            !resolvedInstance
                            && !TryResolveProjectOperationTargetInstance(
                                assembly,
                                type,
                                new AcadeProjectOpenInvocationResult(),
                                out instance
                            )
                        )
                        {
                            resolvedInstance = true;
                            continue;
                        }

                        resolvedInstance = true;
                    }

                    try
                    {
                        AddCandidatePath(Convert.ToString(property.GetValue(instance, null)));
                    }
                    catch
                    {
                        // Best effort only.
                    }
                }

                foreach (var nameProperty in new[] { "DisplayName", "ProjectName", "Name", "Title" })
                {
                    var property = type.GetProperty(
                        nameProperty,
                        BindingFlags.Public
                            | BindingFlags.NonPublic
                            | BindingFlags.Static
                            | BindingFlags.Instance
                    );
                    if (property == null || property.GetIndexParameters().Length != 0)
                    {
                        continue;
                    }

                    if (!property.GetMethod?.IsStatic ?? false)
                    {
                        if (
                            !resolvedInstance
                            && !TryResolveProjectOperationTargetInstance(
                                assembly,
                                type,
                                new AcadeProjectOpenInvocationResult(),
                                out instance
                            )
                        )
                        {
                            resolvedInstance = true;
                            continue;
                        }

                        resolvedInstance = true;
                    }

                    try
                    {
                        AddDisplayName(Convert.ToString(property.GetValue(instance, null)));
                    }
                    catch
                    {
                        // Best effort only.
                    }
                }
            }

            activeProjectIdentity = BuildAcadeProjectIdentity(candidatePaths, displayName);
            return activeProjectIdentity.PreferredPath.Length > 0;
        }

        private static bool TryReadAcadeProjectIdentity(
            object activeProject,
            out AcadeProjectIdentity activeProjectIdentity
        )
        {
            activeProjectIdentity = null;
            if (activeProject == null)
            {
                return false;
            }

            var candidatePaths = new List<string>();
            var seenCandidatePaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            string displayName = string.Empty;

            void AddCandidatePath(string value)
            {
                var normalizedValue = NormalizeText(value);
                if (normalizedValue.Length > 0 && seenCandidatePaths.Add(normalizedValue))
                {
                    candidatePaths.Add(normalizedValue);
                }
            }

            foreach (
                var methodName in new[]
                {
                    "GetProjectFile",
                    "GetProjectFullPath",
                    "GetActiveProjectFileName",
                    "GetFilePath",
                    "GetFullName",
                    "GetDbFullPath",
                }
            )
            {
                try
                {
                    var method = activeProject
                        .GetType()
                        .GetMethod(
                            methodName,
                            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance,
                            null,
                            Type.EmptyTypes,
                            null
                        );
                    AddCandidatePath(Convert.ToString(method?.Invoke(activeProject, null)));
                }
                catch
                {
                    // Best effort metadata inspection.
                }
            }

            foreach (
                var propertyName in new[]
                {
                    "WdpPath",
                    "ProjectFile",
                    "ProjectFilePath",
                    "ActiveProjectFileName",
                    "FilePath",
                    "Path",
                    "FullName",
                    "FileName",
                    "DbFullPath",
                    "DatabasePath",
                }
            )
            {
                try
                {
                    var property = activeProject
                        .GetType()
                        .GetProperty(
                            propertyName,
                            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance
                        );
                    AddCandidatePath(Convert.ToString(property?.GetValue(activeProject, null)));
                }
                catch
                {
                    // Best effort metadata inspection.
                }
            }

            foreach (var propertyName in new[] { "DisplayName", "ProjectName", "Name", "Title" })
            {
                try
                {
                    var property = activeProject
                        .GetType()
                        .GetProperty(
                            propertyName,
                            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance
                        );
                    var value = NormalizeText(Convert.ToString(property?.GetValue(activeProject, null)));
                    if (value.Length > 0)
                    {
                        displayName = value;
                        break;
                    }
                }
                catch
                {
                    // Best effort metadata inspection.
                }
            }

            if (candidatePaths.Count == 0)
            {
                AddCandidatePath(activeProject.ToString());
            }

            activeProjectIdentity = BuildAcadeProjectIdentity(candidatePaths, displayName);
            return activeProjectIdentity.PreferredPath.Length > 0;
        }

        internal static AcadeProjectIdentity BuildAcadeProjectIdentity(
            IEnumerable<string> candidatePaths,
            string fallbackDisplayName
        )
        {
            var candidatePathList = candidatePaths?.ToArray() ?? Array.Empty<string>();
            var identity = new AcadeProjectIdentity
            {
                DisplayName = NormalizeText(fallbackDisplayName),
            };

            foreach (var candidatePath in candidatePathList)
            {
                var normalizedCandidatePath = NormalizeText(candidatePath);
                if (normalizedCandidatePath.Length == 0)
                {
                    continue;
                }

                string extension;
                try
                {
                    extension = NormalizeText(Path.GetExtension(normalizedCandidatePath));
                }
                catch
                {
                    extension = string.Empty;
                }

                if (
                    identity.ProjectFilePath.Length == 0
                    && string.Equals(extension, ".wdp", StringComparison.OrdinalIgnoreCase)
                )
                {
                    identity.ProjectFilePath = normalizedCandidatePath;
                    continue;
                }

                if (
                    identity.DatabasePath.Length == 0
                    && string.Equals(extension, ".mdb", StringComparison.OrdinalIgnoreCase)
                )
                {
                    identity.DatabasePath = normalizedCandidatePath;
                }
            }

            if (identity.ProjectFilePath.Length == 0)
            {
                identity.ProjectFilePath = TryResolveDerivedAcadeProjectFilePath(
                    candidatePathList,
                    identity.DisplayName
                );
            }

            if (identity.DisplayName.Length == 0)
            {
                var displaySource = identity.ProjectFilePath.Length > 0
                    ? identity.ProjectFilePath
                    : identity.DatabasePath;
                if (displaySource.Length > 0)
                {
                    try
                    {
                        identity.DisplayName = NormalizeText(
                            Path.GetFileNameWithoutExtension(displaySource)
                        );
                    }
                    catch
                    {
                        identity.DisplayName = NormalizeText(displaySource);
                    }
                }
            }

            return identity;
        }

        internal static string TryResolveDerivedAcadeProjectFilePath(
            IEnumerable<string> candidatePaths,
            string fallbackDisplayName,
            IEnumerable<string>? searchRoots = null
        )
        {
            var candidatePathList = candidatePaths?.ToArray() ?? Array.Empty<string>();
            var candidateNames = new List<string>();
            var seenNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            void AddCandidateName(string? value)
            {
                var normalizedValue = NormalizeText(value);
                if (normalizedValue.Length == 0)
                {
                    return;
                }

                try
                {
                    normalizedValue = NormalizeText(Path.GetFileNameWithoutExtension(normalizedValue));
                }
                catch
                {
                    // Fall back to the raw normalized value.
                }

                if (normalizedValue.Length > 0 && seenNames.Add(normalizedValue))
                {
                    candidateNames.Add(normalizedValue);
                }
            }

            AddCandidateName(fallbackDisplayName);
            foreach (var candidatePath in candidatePathList)
            {
                AddCandidateName(candidatePath);
            }

            if (candidateNames.Count == 0)
            {
                return string.Empty;
            }

            var explicitRoots = searchRoots?.Where(path => NormalizeText(path).Length > 0).ToArray();
            if (explicitRoots != null && explicitRoots.Length > 0)
            {
                return TryResolveDerivedAcadeProjectFilePathFromRoots(candidateNames, explicitRoots);
            }

            foreach (var candidateName in candidateNames)
            {
                var cacheKey = NormalizeProjectNameKey(candidateName);
                if (
                    cacheKey.Length > 0
                    && DerivedAcadeProjectFilePathCache.TryGetValue(cacheKey, out var cachedPath)
                )
                {
                    return NormalizeText(cachedPath);
                }
            }

            var resolvedPath = TryResolveDerivedAcadeProjectFilePathFromRoots(
                candidateNames,
                EnumerateKnownAcadeProjectRoots()
            );
            if (resolvedPath.Length > 0)
            {
                foreach (var candidateName in candidateNames)
                {
                    var cacheKey = NormalizeProjectNameKey(candidateName);
                    if (cacheKey.Length > 0)
                    {
                        DerivedAcadeProjectFilePathCache[cacheKey] = resolvedPath;
                    }
                }
            }

            return resolvedPath;
        }

        private static string TryResolveDerivedAcadeProjectFilePathFromRoots(
            IEnumerable<string> candidateNames,
            IEnumerable<string> searchRoots
        )
        {
            var normalizedCandidateNames = candidateNames
                .Select(NormalizeText)
                .Where(name => name.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
            var normalizedCandidateKeys = normalizedCandidateNames
                .Select(NormalizeProjectNameKey)
                .Where(key => key.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

            if (normalizedCandidateKeys.Length == 0)
            {
                return string.Empty;
            }

            foreach (var searchRoot in searchRoots ?? Array.Empty<string>())
            {
                var normalizedRoot = NormalizeText(searchRoot);
                if (normalizedRoot.Length == 0 || !Directory.Exists(normalizedRoot))
                {
                    continue;
                }

                foreach (var candidateName in normalizedCandidateNames)
                {
                    foreach (
                        var directPath in new[]
                        {
                            Path.Combine(normalizedRoot, candidateName + ".wdp"),
                            Path.Combine(normalizedRoot, candidateName, candidateName + ".wdp"),
                        }
                    )
                    {
                        if (File.Exists(directPath))
                        {
                            return NormalizeText(directPath);
                        }
                    }
                }

                try
                {
                    foreach (
                        var candidatePath in Directory.EnumerateFiles(
                            normalizedRoot,
                            "*.wdp",
                            SearchOption.AllDirectories
                        )
                    )
                    {
                        var candidateFileName = string.Empty;
                        try
                        {
                            candidateFileName = Path.GetFileNameWithoutExtension(candidatePath);
                        }
                        catch
                        {
                            candidateFileName = string.Empty;
                        }

                        if (
                            candidateFileName.Length > 0
                            && normalizedCandidateKeys.Contains(
                                NormalizeProjectNameKey(candidateFileName),
                                StringComparer.OrdinalIgnoreCase
                            )
                        )
                        {
                            return NormalizeText(candidatePath);
                        }
                    }
                }
                catch
                {
                    // Best effort only.
                }
            }

            return string.Empty;
        }

        private static IEnumerable<string> EnumerateKnownAcadeProjectRoots()
        {
            var seenRoots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var baseRoots = new[]
            {
                Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "Documents"
                ),
                Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "My Documents"
                ),
            };
            var subpaths = new[]
            {
                Path.Combine("AcadE 2026", "AeData", "proj"),
                Path.Combine("AcadE 2026", "AeData", "Proj"),
                Path.Combine("Acade 2026", "AeData", "proj"),
                Path.Combine("Acade 2026", "AeData", "Proj"),
                Path.Combine("Autodesk", "Acade 2026", "AeData", "Proj"),
                Path.Combine("Autodesk", "AcadE 2026", "AeData", "proj"),
            };

            foreach (var baseRoot in baseRoots)
            {
                var normalizedBaseRoot = NormalizeText(baseRoot);
                if (normalizedBaseRoot.Length == 0)
                {
                    continue;
                }

                foreach (var subpath in subpaths)
                {
                    var normalizedRoot = NormalizeText(Path.Combine(normalizedBaseRoot, subpath));
                    if (normalizedRoot.Length > 0 && seenRoots.Add(normalizedRoot))
                    {
                        yield return normalizedRoot;
                    }
                }
            }
        }

        private static string NormalizeProjectNameKey(string value)
        {
            var normalizedValue = NormalizeText(value);
            if (normalizedValue.Length == 0)
            {
                return string.Empty;
            }

            return new string(
                normalizedValue
                    .Where(ch => !char.IsWhiteSpace(ch) && ch != '_' && ch != '-')
                    .Select(char.ToUpperInvariant)
                    .ToArray()
            );
        }

        private static IEnumerable<string> EnumerateCloseProjectTargets(
            AcadeProjectIdentity? currentActiveProjectIdentity
        )
        {
            var targets = new List<string>();
            var seenTargets = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            void AddTarget(string? value)
            {
                var normalizedValue = NormalizeText(value);
                if (normalizedValue.Length > 0 && seenTargets.Add(normalizedValue))
                {
                    targets.Add(normalizedValue);
                }
            }

            if (currentActiveProjectIdentity == null)
            {
                return targets;
            }

            AddTarget(currentActiveProjectIdentity.ProjectFilePath);
            AddTarget(currentActiveProjectIdentity.DisplayName);

            if (!string.IsNullOrWhiteSpace(currentActiveProjectIdentity.DatabasePath))
            {
                try
                {
                    AddTarget(
                        Path.GetFileNameWithoutExtension(currentActiveProjectIdentity.DatabasePath)
                    );
                }
                catch
                {
                    // Best effort only.
                }
            }

            AddTarget(currentActiveProjectIdentity.DatabasePath);
            return targets;
        }

        internal static bool LooksLikeSameAcadeProject(
            AcadeProjectIdentity activeProjectIdentity,
            string requestedWdpPath
        )
        {
            if (activeProjectIdentity == null || string.IsNullOrWhiteSpace(requestedWdpPath))
            {
                return false;
            }

            if (
                !string.IsNullOrWhiteSpace(activeProjectIdentity.ProjectFilePath)
                && LooksLikeSameAcadeProjectPath(
                    activeProjectIdentity.ProjectFilePath,
                    requestedWdpPath
                )
            )
            {
                return true;
            }

            if (
                !string.IsNullOrWhiteSpace(activeProjectIdentity.DatabasePath)
                && LooksLikeSameAcadeProjectPath(
                    activeProjectIdentity.DatabasePath,
                    requestedWdpPath
                )
            )
            {
                return true;
            }

            if (!string.IsNullOrWhiteSpace(activeProjectIdentity.DisplayName))
            {
                try
                {
                    return string.Equals(
                        activeProjectIdentity.DisplayName,
                        Path.GetFileNameWithoutExtension(requestedWdpPath),
                        StringComparison.OrdinalIgnoreCase
                    );
                }
                catch
                {
                    return false;
                }
            }

            return false;
        }

        private static bool TryReadAcadeProjectPath(object activeProject, out string activeProjectPath)
        {
            if (TryReadAcadeProjectIdentity(activeProject, out var activeProjectIdentity))
            {
                activeProjectPath = NormalizeText(activeProjectIdentity.PreferredPath);
                return activeProjectPath.Length > 0;
            }

            activeProjectPath = string.Empty;
            return false;
        }

        private static IEnumerable<Type> GetLoadableTypes(Assembly assembly)
        {
            try
            {
                return assembly.GetTypes();
            }
            catch (ReflectionTypeLoadException ex)
            {
                return ex.Types.Where(type => type != null);
            }
        }

        private static IEnumerable<object[]> BuildOpenProjectArgumentSets(
            MethodInfo method,
            string wdpPath
        )
        {
            var parameters = method.GetParameters();
            var args = new object[parameters.Length];
            var assignedPath = false;
            var boolIndexes = new List<int>();

            for (var index = 0; index < parameters.Length; index++)
            {
                var parameter = parameters[index];
                var parameterType = parameter.ParameterType;
                var effectiveType = parameterType.IsByRef
                    ? parameterType.GetElementType() ?? parameterType
                    : parameterType;

                if (effectiveType == typeof(string))
                {
                    if (!assignedPath)
                    {
                        args[index] = wdpPath;
                        assignedPath = true;
                    }
                    else if (parameter.HasDefaultValue)
                    {
                        args[index] = parameter.DefaultValue;
                    }
                    else
                    {
                        args[index] = string.Empty;
                    }
                    continue;
                }

                if (effectiveType == typeof(bool))
                {
                    args[index] = false;
                    boolIndexes.Add(index);
                    continue;
                }

                if (
                    effectiveType == typeof(int)
                    || effectiveType == typeof(short)
                    || effectiveType == typeof(long)
                    || effectiveType == typeof(double)
                    || effectiveType == typeof(float)
                    || effectiveType == typeof(decimal)
                )
                {
                    args[index] = Convert.ChangeType(0, effectiveType);
                    continue;
                }

                if (effectiveType.IsEnum)
                {
                    var values = Enum.GetValues(effectiveType);
                    args[index] = values.Length > 0
                        ? values.GetValue(0)
                        : Activator.CreateInstance(effectiveType);
                    continue;
                }

                if (parameter.HasDefaultValue)
                {
                    args[index] = parameter.DefaultValue;
                    continue;
                }

                if (effectiveType == typeof(object))
                {
                    args[index] = null;
                    continue;
                }

                if (parameter.IsOut && !effectiveType.IsValueType)
                {
                    args[index] = null;
                    continue;
                }

                args[index] = effectiveType.IsValueType
                    ? Activator.CreateInstance(effectiveType)
                    : null;
            }

            if (!assignedPath)
            {
                yield break;
            }

            if (boolIndexes.Count == 0)
            {
                yield return (object[])args.Clone();
                yield break;
            }

            if (boolIndexes.Count <= 4)
            {
                var limit = 1 << boolIndexes.Count;
                for (var mask = 0; mask < limit; mask++)
                {
                    var candidate = (object[])args.Clone();
                    for (var bit = 0; bit < boolIndexes.Count; bit++)
                    {
                        candidate[boolIndexes[bit]] = (mask & (1 << bit)) != 0;
                    }

                    yield return candidate;
                }

                yield break;
            }

            yield return (object[])args.Clone();
            var allTrueArgs = (object[])args.Clone();
            foreach (var boolIndex in boolIndexes)
            {
                allTrueArgs[boolIndex] = true;
            }
            yield return allTrueArgs;
        }

        private static IEnumerable<object[]> BuildCloseProjectArgumentSets(
            MethodInfo method,
            string currentActiveProjectPath
        )
        {
            var parameters = method.GetParameters();
            var args = new object[parameters.Length];
            var boolIndexes = new List<int>();

            for (var index = 0; index < parameters.Length; index++)
            {
                var parameter = parameters[index];
                var parameterType = parameter.ParameterType;
                var effectiveType = parameterType.IsByRef
                    ? parameterType.GetElementType() ?? parameterType
                    : parameterType;

                if (effectiveType == typeof(string))
                {
                    args[index] = currentActiveProjectPath;
                    continue;
                }

                if (effectiveType == typeof(bool))
                {
                    args[index] = false;
                    boolIndexes.Add(index);
                    continue;
                }

                if (
                    effectiveType == typeof(int)
                    || effectiveType == typeof(short)
                    || effectiveType == typeof(long)
                    || effectiveType == typeof(double)
                    || effectiveType == typeof(float)
                    || effectiveType == typeof(decimal)
                )
                {
                    args[index] = Convert.ChangeType(0, effectiveType);
                    continue;
                }

                if (effectiveType.IsEnum)
                {
                    var values = Enum.GetValues(effectiveType);
                    args[index] = values.Length > 0
                        ? values.GetValue(0)
                        : Activator.CreateInstance(effectiveType);
                    continue;
                }

                if (parameter.HasDefaultValue)
                {
                    args[index] = parameter.DefaultValue;
                    continue;
                }

                if (effectiveType == typeof(object))
                {
                    args[index] = null;
                    continue;
                }

                if (parameter.IsOut && !effectiveType.IsValueType)
                {
                    args[index] = null;
                    continue;
                }

                args[index] = effectiveType.IsValueType
                    ? Activator.CreateInstance(effectiveType)
                    : null;
            }

            if (boolIndexes.Count == 0)
            {
                yield return (object[])args.Clone();
                yield break;
            }

            if (boolIndexes.Count <= 4)
            {
                var limit = 1 << boolIndexes.Count;
                for (var mask = 0; mask < limit; mask++)
                {
                    var candidate = (object[])args.Clone();
                    for (var bit = 0; bit < boolIndexes.Count; bit++)
                    {
                        candidate[boolIndexes[bit]] = (mask & (1 << bit)) != 0;
                    }

                    yield return candidate;
                }

                yield break;
            }

            yield return (object[])args.Clone();
        }

        private static bool TryWaitForProjectClose(
            Assembly assembly,
            string previousActiveProjectPath,
            out string activeProjectPath
        )
        {
            var deadlineUtc = DateTime.UtcNow.AddSeconds(4);
            activeProjectPath = string.Empty;

            while (DateTime.UtcNow <= deadlineUtc)
            {
                if (!TryGetActiveProjectIdentity(assembly, out var currentActiveProjectIdentity))
                {
                    return true;
                }

                activeProjectPath = NormalizeText(currentActiveProjectIdentity.PreferredPath);
                if (!LooksLikeSameAcadeProject(currentActiveProjectIdentity, previousActiveProjectPath))
                {
                    return true;
                }

                System.Threading.Thread.Sleep(150);
            }

            return false;
        }

        private static bool TryWaitForActiveProjectPath(
            Assembly assembly,
            string requestedWdpPath,
            out string activeProjectPath
        )
        {
            var deadlineUtc = DateTime.UtcNow.AddSeconds(6);
            activeProjectPath = string.Empty;

            while (DateTime.UtcNow <= deadlineUtc)
            {
                if (TryGetActiveProjectIdentity(assembly, out var currentActiveProjectIdentity))
                {
                    activeProjectPath = NormalizeText(currentActiveProjectIdentity.PreferredPath);
                    if (LooksLikeSameAcadeProject(currentActiveProjectIdentity, requestedWdpPath))
                    {
                        return true;
                    }
                }

                System.Threading.Thread.Sleep(150);
            }

            return false;
        }

        private static IReadOnlyList<string> BuildSendStringCloseProjectExpressions()
        {
            return new[]
            {
                "(PmCloseProject)\n",
                "(c:PmCloseProject)\n",
            };
        }

        private static IReadOnlyList<string> BuildSendStringOpenProjectExpressions(string wdpPath)
        {
            var normalizedPath = NormalizeLispPathArgument(wdpPath).Replace("\"", "\\\"");
            return new[]
            {
                $"(PmOpenProject \"{normalizedPath}\" nil nil)\n",
                $"(PmOpenProject \"{normalizedPath}\" T nil)\n",
                $"(PmOpenProject \"{normalizedPath}\" nil T)\n",
                $"(PmOpenProject \"{normalizedPath}\" T T)\n",
                $"(c:PmOpenProject \"{normalizedPath}\" nil nil)\n",
                $"(c:PmOpenProject \"{normalizedPath}\" T nil)\n",
                $"(c:PmOpenProject \"{normalizedPath}\" nil T)\n",
                $"(c:PmOpenProject \"{normalizedPath}\" T T)\n",
            };
        }

        private static bool TryEnsureAcadeWorkingDocument(
            List<string> warnings,
            out AcadeWorkingDocumentContext context
        )
        {
            AcadeWorkingDocumentContext resolvedContext = new AcadeWorkingDocumentContext();
            var success = SuiteCadPipeHost.InvokeOnApplicationThread(() =>
            {
                var documentManager = Application.DocumentManager;
                if (documentManager == null)
                {
                    warnings.Add("AutoCAD document manager is unavailable.");
                    return false;
                }

                var activeDocument = documentManager.MdiActiveDocument;
                if (activeDocument != null)
                {
                    resolvedContext.Document = activeDocument;
                    return true;
                }

                try
                {
                    activeDocument = documentManager.Add(string.Empty);
                    resolvedContext.Document = activeDocument;
                    resolvedContext.TemporaryDocumentCreated = activeDocument != null;
                    return activeDocument != null;
                }
                catch (Exception ex)
                {
                    warnings.Add($"Suite could not create a temporary AutoCAD drawing context: {ex.Message}");
                    return false;
                }
            });

            context = resolvedContext;
            return success;
        }

        private static void TryCloseTemporaryAcadeDocument(
            AcadeWorkingDocumentContext context,
            List<string> warnings
        )
        {
            if (!context.TemporaryDocumentCreated || context.TemporaryDocumentClosed || context.Document == null)
            {
                return;
            }

            SuiteCadPipeHost.InvokeOnApplicationThread(() =>
            {
                try
                {
                    var documentManager = Application.DocumentManager;
                    var openDocumentCount = 0;
                    if (documentManager != null)
                    {
                        foreach (Document _ in documentManager)
                        {
                            openDocumentCount += 1;
                        }
                    }

                    var filename = NormalizeText(context.Document.Database?.Filename);
                    var documentName = NormalizeText(context.Document.Name);
                    var isScratchDocument =
                        filename.Length == 0
                        && documentName.StartsWith("Drawing", StringComparison.OrdinalIgnoreCase);
                    if (!isScratchDocument || openDocumentCount <= 1)
                    {
                        return false;
                    }

                    context.Document.CloseAndDiscard();
                    context.TemporaryDocumentClosed = true;
                    return true;
                }
                catch (Exception ex)
                {
                    warnings.Add($"Suite could not close the temporary AutoCAD drawing: {ex.Message}");
                    return false;
                }
            });
        }

        private static AcadeProjectObservation CaptureAcadeProjectObservation(
            string wdpPath,
            List<string> warnings
        )
        {
            var observation = new AcadeProjectObservation();
            var aepxPath = Path.ChangeExtension(wdpPath, ".aepx");
            try
            {
                observation.AepxExists = File.Exists(aepxPath);
                observation.AepxLastWriteUtc = observation.AepxExists
                    ? File.GetLastWriteTimeUtc(aepxPath)
                    : null;
            }
            catch (Exception ex)
            {
                warnings.Add($"Suite could not read '{aepxPath}' before project activation: {ex.Message}");
            }

            try
            {
                var lastProjObservation = ObserveAcadeLastProjTarget(wdpPath);
                observation.LastProjObserved = lastProjObservation.ContainsTarget;
                observation.LastProjLastWriteUtc = lastProjObservation.LastWriteUtc;
            }
            catch (Exception ex)
            {
                warnings.Add($"Suite could not read LastProj.fil before project activation: {ex.Message}");
            }

            return observation;
        }

        private static AcadeProjectVerificationData VerifyAcadeProjectSideEffects(
            string wdpPath,
            AcadeProjectObservation previousObservation,
            string activeProjectPathHint,
            List<string> warnings
        )
        {
            var verification = new AcadeProjectVerificationData
            {
                CommandCompleted = true,
            };
            var aepxPath = Path.ChangeExtension(wdpPath, ".aepx");
            var deadlineUtc = DateTime.UtcNow.AddSeconds(6);
            var activeAssembly = default(Assembly);
            try
            {
                activeAssembly = LoadAcePageManAssembly(out _);
            }
            catch
            {
                activeAssembly = null;
            }

            while (DateTime.UtcNow <= deadlineUtc)
            {
                if (!verification.AepxObserved)
                {
                    try
                    {
                        if (File.Exists(aepxPath))
                        {
                            if (!previousObservation.AepxExists)
                            {
                                verification.AepxObserved = true;
                            }
                            else
                            {
                                var currentWriteUtc = File.GetLastWriteTimeUtc(aepxPath);
                                if (
                                    !previousObservation.AepxLastWriteUtc.HasValue
                                    || currentWriteUtc > previousObservation.AepxLastWriteUtc.Value
                                )
                                {
                                    verification.AepxObserved = true;
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        warnings.Add($"Suite could not verify '{aepxPath}': {ex.Message}");
                    }
                }

                if (!verification.LastProjObserved)
                {
                    try
                    {
                        var lastProjObservation = ObserveAcadeLastProjTarget(wdpPath);
                        if (lastProjObservation.ContainsTarget)
                        {
                            verification.LastProjObserved =
                                !previousObservation.LastProjObserved
                                || !previousObservation.LastProjLastWriteUtc.HasValue
                                || (
                                    lastProjObservation.LastWriteUtc.HasValue
                                    && lastProjObservation.LastWriteUtc.Value
                                        > previousObservation.LastProjLastWriteUtc.Value
                                );
                        }
                    }
                    catch (Exception ex)
                    {
                        warnings.Add($"Suite could not verify LastProj.fil: {ex.Message}");
                    }
                }

                if (verification.ActiveProjectPath.Length == 0)
                {
                    var candidatePath = NormalizeText(activeProjectPathHint);
                    if (candidatePath.Length > 0)
                    {
                        verification.ActiveProjectPath = candidatePath;
                        verification.ActiveProjectObserved = LooksLikeSameAcadeProjectPath(
                            candidatePath,
                            wdpPath
                        );
                    }
                }

                if (
                    !verification.ActiveProjectObserved
                    && activeAssembly != null
                    && TryGetActiveProjectIdentity(activeAssembly, out var activeProjectIdentity)
                )
                {
                    verification.ActiveProjectPath = NormalizeText(activeProjectIdentity.PreferredPath);
                    verification.ActiveProjectFilePath = NormalizeText(
                        activeProjectIdentity.ProjectFilePath
                    );
                    verification.ActiveProjectDatabasePath = NormalizeText(
                        activeProjectIdentity.DatabasePath
                    );
                    verification.ActiveProjectObserved = LooksLikeSameAcadeProject(
                        activeProjectIdentity,
                        wdpPath
                    );
                }

                if (
                    verification.AepxObserved
                    || verification.LastProjObserved
                    || verification.ActiveProjectObserved
                )
                {
                    break;
                }

                Thread.Sleep(300);
            }

            return verification;
        }

        private sealed class AcadeLastProjObservation
        {
            public bool ContainsTarget { get; set; }
            public DateTime? LastWriteUtc { get; set; }
        }

        private static AcadeLastProjObservation ObserveAcadeLastProjTarget(string wdpPath)
        {
            var normalizedTarget = NormalizePathToken(wdpPath);
            var observation = new AcadeLastProjObservation();
            foreach (var candidate in EnumerateAcadeLastProjFileCandidates())
            {
                string content;
                try
                {
                    content = File.ReadAllText(candidate);
                }
                catch
                {
                    continue;
                }

                var normalizedContent = content.Replace('\\', '/').Trim().ToUpperInvariant();
                if (!normalizedContent.Contains(normalizedTarget, StringComparison.Ordinal))
                {
                    continue;
                }

                observation.ContainsTarget = true;
                try
                {
                    var lastWriteUtc = File.GetLastWriteTimeUtc(candidate);
                    if (!observation.LastWriteUtc.HasValue || lastWriteUtc > observation.LastWriteUtc.Value)
                    {
                        observation.LastWriteUtc = lastWriteUtc;
                    }
                }
                catch
                {
                    // Best effort timestamp capture only.
                }
            }

            return observation;
        }

        private static IEnumerable<string> EnumerateAcadeLastProjFileCandidates()
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var root in new[]
            {
                Environment.GetEnvironmentVariable("APPDATA"),
                Environment.GetEnvironmentVariable("USERPROFILE") is string userProfile
                    ? Path.Combine(userProfile, "AppData", "Roaming")
                    : string.Empty,
            })
            {
                if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
                {
                    continue;
                }

                IEnumerable<string> candidates;
                try
                {
                    candidates = Directory.EnumerateFiles(
                        root,
                        "LastProj.fil",
                        SearchOption.AllDirectories
                    );
                }
                catch
                {
                    continue;
                }

                foreach (var candidate in candidates)
                {
                    if (seen.Add(candidate))
                    {
                        yield return candidate;
                    }
                }
            }
        }

        private static string FormatMethodSignature(Type type, MethodInfo method)
        {
            return $"{type.FullName}.{method.Name}({method.GetParameters().Length})";
        }

        private static string NormalizePathToken(string path)
        {
            try
            {
                path = Path.GetFullPath(path);
            }
            catch
            {
                // Keep the original token when normalization fails.
            }

            return NormalizeText(path).Replace('\\', '/').ToUpperInvariant();
        }

        internal static bool LooksLikeSameAcadeProjectPath(string leftPath, string rightPath)
        {
            var normalizedLeft = NormalizePathToken(leftPath);
            var normalizedRight = NormalizePathToken(rightPath);
            if (string.Equals(normalizedLeft, normalizedRight, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            try
            {
                var leftExtension = Path.GetExtension(leftPath ?? "").Trim();
                var rightExtension = Path.GetExtension(rightPath ?? "").Trim();
                if (
                    (string.Equals(leftExtension, ".mdb", StringComparison.OrdinalIgnoreCase)
                    && string.Equals(rightExtension, ".wdp", StringComparison.OrdinalIgnoreCase))
                    || (
                        string.Equals(leftExtension, ".wdp", StringComparison.OrdinalIgnoreCase)
                        && string.Equals(rightExtension, ".mdb", StringComparison.OrdinalIgnoreCase)
                    )
                )
                {
                    return string.Equals(
                        Path.GetFileNameWithoutExtension(leftPath ?? ""),
                        Path.GetFileNameWithoutExtension(rightPath ?? ""),
                        StringComparison.OrdinalIgnoreCase
                    );
                }
            }
            catch
            {
                // Best effort path comparison only.
            }

            return false;
        }
    }
}
