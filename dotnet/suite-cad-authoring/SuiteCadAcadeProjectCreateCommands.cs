using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using DxfCode = Autodesk.AutoCAD.DatabaseServices.DxfCode;
using Application = Autodesk.AutoCAD.ApplicationServices.Application;
using Exception = System.Exception;

namespace SuiteCadAuthoring
{
    internal sealed class AcadeProjectCreatePayload
    {
        public string RequestId { get; set; }
        public string ProjectRootPath { get; set; }
        public string WdpPath { get; set; }
        public string TemplateWdpPath { get; set; }
        public string UiMode { get; set; }
        public bool LaunchIfNeeded { get; set; }
        public bool AcadeLaunched { get; set; }
    }

    internal sealed class AcadeProjectCreateResultEnvelope
    {
        public bool Success { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
        public AcadeProjectCreateResultData Data { get; set; } = new AcadeProjectCreateResultData();
        public List<string> Warnings { get; set; } = new List<string>();
        public Dictionary<string, object> Meta { get; set; } = new Dictionary<string, object>();
    }

    internal sealed class AcadeProjectCreateResultData
    {
        public string WdpPath { get; set; }
        public string TemplateWdpPath { get; set; }
        public bool AcadeLaunched { get; set; }
        public bool ProjectCreated { get; set; }
        public bool ProjectActivated { get; set; }
        public string ActiveProjectPath { get; set; }
        public bool TemporaryDocumentCreated { get; set; }
        public bool TemporaryDocumentClosed { get; set; }
        public AcadeProjectVerificationData Verification { get; set; } = new AcadeProjectVerificationData();
    }

    public sealed partial class SuiteCadAuthoringCommands
    {
        [LispFunction("SUITEACADEPROJECTCREATERUN")]
        public ResultBuffer CreateAcadeProjectLisp(ResultBuffer arguments)
        {
            var args = arguments?.AsArray() ?? Array.Empty<TypedValue>();
            var payloadPath = args.Length > 0 ? NormalizeText(Convert.ToString(args[0].Value)) : "";
            var resultPath = args.Length > 1 ? NormalizeText(Convert.ToString(args[1].Value)) : "";
            var envelope = ExecuteAcadeProjectCreateAndWriteResult(
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

        [CommandMethod("SUITEACADEPROJECTCREATE", CommandFlags.Session)]
        public void CreateAcadeProject()
        {
            var document = Application.DocumentManager.MdiActiveDocument;
            var editor = document?.Editor;
            if (editor == null)
            {
                return;
            }

            var payloadPrompt = editor.GetString("\nSuite ACADE project-create payload JSON path: ");
            if (payloadPrompt.Status != PromptStatus.OK || string.IsNullOrWhiteSpace(payloadPrompt.StringResult))
            {
                return;
            }

            var resultPrompt = editor.GetString("\nSuite ACADE project-create result JSON path: ");
            if (resultPrompt.Status != PromptStatus.OK || string.IsNullOrWhiteSpace(resultPrompt.StringResult))
            {
                return;
            }

            var envelope = ExecuteAcadeProjectCreateAndWriteResult(
                payloadPrompt.StringResult.Trim(),
                resultPrompt.StringResult.Trim(),
                editor
            );
            editor.WriteMessage($"\n[Suite] {envelope.Message}");
        }

        internal static JsonObject HandlePipeAcadeProjectCreate(JsonObject payload)
        {
            var envelope = ExecuteAcadeProjectCreatePayload(payload);
            return JsonSerializer.SerializeToNode(envelope, JsonOptions) as JsonObject
                ?? new JsonObject
                {
                    ["success"] = false,
                    ["code"] = "PLUGIN_RESULT_INVALID",
                    ["message"] = "Unable to serialize the ACADE project-create result.",
                    ["warnings"] = new JsonArray(),
                    ["meta"] = new JsonObject
                    {
                        ["providerPath"] = "dotnet+inproc",
                    },
                };
        }

        private static AcadeProjectCreateResultEnvelope ExecuteAcadeProjectCreateAndWriteResult(
            string payloadPath,
            string resultPath,
            Editor? editor
        )
        {
            var envelope = ExecuteAcadeProjectCreate(payloadPath, resultPath);
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
                    $"\n[Suite] Failed to write ACADE project-create result file: {ex.Message}"
                );
            }

            return envelope;
        }

        private static AcadeProjectCreateResultEnvelope ExecuteAcadeProjectCreate(
            string payloadPath,
            string resultPath
        )
        {
            if (!Path.IsPathRooted(payloadPath))
            {
                return BuildAcadeProjectCreateFailure("INVALID_REQUEST", "Payload path must be absolute.");
            }
            if (!File.Exists(payloadPath))
            {
                return BuildAcadeProjectCreateFailure(
                    "INVALID_REQUEST",
                    $"Payload file was not found: {payloadPath}"
                );
            }
            if (!Path.IsPathRooted(resultPath))
            {
                return BuildAcadeProjectCreateFailure("INVALID_REQUEST", "Result path must be absolute.");
            }

            AcadeProjectCreatePayload payload;
            try
            {
                payload = JsonSerializer.Deserialize<AcadeProjectCreatePayload>(
                    File.ReadAllText(payloadPath),
                    JsonOptions
                );
            }
            catch (Exception ex)
            {
                return BuildAcadeProjectCreateFailure(
                    "INVALID_REQUEST",
                    $"Unable to parse payload JSON: {ex.Message}"
                );
            }

            if (payload == null)
            {
                return BuildAcadeProjectCreateFailure("INVALID_REQUEST", "Payload was empty.");
            }

            return ExecuteAcadeProjectCreatePayload(payload);
        }

        private static AcadeProjectCreateResultEnvelope ExecuteAcadeProjectCreatePayload(
            JsonObject payload
        )
        {
            AcadeProjectCreatePayload requestPayload;
            try
            {
                requestPayload = JsonSerializer.Deserialize<AcadeProjectCreatePayload>(
                    payload.ToJsonString(),
                    JsonOptions
                );
            }
            catch (Exception ex)
            {
                return BuildAcadeProjectCreateFailure(
                    "INVALID_REQUEST",
                    $"Unable to parse payload JSON: {ex.Message}"
                );
            }

            if (requestPayload == null)
            {
                return BuildAcadeProjectCreateFailure("INVALID_REQUEST", "Payload was empty.");
            }

            return ExecuteAcadeProjectCreatePayload(requestPayload);
        }

        internal static AcadeProjectCreateResultEnvelope ExecuteAcadeProjectCreatePayload(
            AcadeProjectCreatePayload payload
        )
        {
            var requestId = NormalizeText(payload.RequestId);
            var tracePath = SuiteCadAcadeTraceLog.ResolveTracePath(requestId);
            void Trace(string stage, object? data = null, Exception? exception = null)
            {
                SuiteCadAcadeTraceLog.WriteTrace(requestId, "suite_acade_project_create", stage, data, exception);
            }

            AcadeProjectCreateResultEnvelope Fail(string code, string message)
            {
                var failure = BuildAcadeProjectCreateFailure(code, message);
                failure.Meta["tracePath"] = tracePath;
                return failure;
            }

            var warnings = new List<string>();
            var wdpPath = NormalizeText(payload.WdpPath);
            Trace(
                "entered-handler",
                new
                {
                    payloadRequestId = requestId,
                    payload.ProjectRootPath,
                    payload.WdpPath,
                    payload.TemplateWdpPath,
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

            var templateWdpPath = NormalizeText(payload.TemplateWdpPath);
            if (templateWdpPath.Length == 0)
            {
                Trace("invalid-request", new { reason = "templateWdpPath is required" });
                return Fail("INVALID_REQUEST", "templateWdpPath is required.");
            }
            if (!Path.IsPathRooted(templateWdpPath))
            {
                Trace("invalid-request", new { reason = "templateWdpPath must be absolute", templateWdpPath });
                return Fail("INVALID_REQUEST", "templateWdpPath must be absolute.");
            }

            try
            {
                wdpPath = Path.GetFullPath(wdpPath);
                templateWdpPath = Path.GetFullPath(templateWdpPath);
            }
            catch (Exception ex)
            {
                Trace("invalid-request", new { reason = "project create paths invalid", wdpPath, templateWdpPath }, ex);
                return Fail(
                    "INVALID_REQUEST",
                    $"Project create paths are invalid: {ex.Message}"
                );
            }

            if (!File.Exists(templateWdpPath))
            {
                Trace("invalid-request", new { reason = "templateWdpPath not found", templateWdpPath });
                return Fail(
                    "INVALID_REQUEST",
                    $"templateWdpPath was not found: {templateWdpPath}"
                );
            }
            if (File.Exists(wdpPath))
            {
                Trace("invalid-request", new { reason = "wdpPath already exists", wdpPath });
                return Fail(
                    "INVALID_REQUEST",
                    $"wdpPath already exists: {wdpPath}"
                );
            }

            var activeProfile = SuiteCadPipeHost.ResolveCurrentProfileName();
            Trace("profile-resolved", new { activeProfile, wdpPath, templateWdpPath });
            if (!SuiteCadPipeHost.IsAcadeProfileName(activeProfile))
            {
                var profileFailure = Fail(
                    "AUTOCAD_PROFILE_MISMATCH",
                    $"Active AutoCAD profile '{activeProfile}' is not the required '<<ACADE>>' profile."
                );
                profileFailure.Meta["providerPath"] = "dotnet+inproc";
                profileFailure.Meta["activeProfile"] = activeProfile;
                Trace("profile-mismatch", new { activeProfile, wdpPath, templateWdpPath });
                return profileFailure;
            }

            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(wdpPath) ?? string.Empty);
            }
            catch (Exception ex)
            {
                Trace("invalid-request", new { reason = "unable to create project directory", wdpPath }, ex);
                return Fail(
                    "INVALID_REQUEST",
                    $"Unable to prepare the project directory for '{wdpPath}': {ex.Message}"
                );
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

            var previousObservation = CaptureAcadeProjectObservation(wdpPath, warnings);
            Trace(
                "pre-verification-observation",
                new
                {
                    wdpPath,
                    previousObservation.AepxExists,
                    previousObservation.AepxLastWriteUtc,
                    previousObservation.LastProjObserved,
                    previousObservation.LastProjLastWriteUtc,
                }
            );
            var invocation = new AcadeProjectOpenInvocationResult();
            var activeProjectPath = string.Empty;
            AcadeProjectVerificationData verification;

            try
            {
                SuiteCadTrackerOperationStateStore.SetCreating(payload.RequestId, wdpPath);
                Trace("native-create-start", new { wdpPath, templateWdpPath });
                invocation = TryInvokeAcadeProjectCreate(
                    workingDocumentContext.Document,
                    requestId,
                    wdpPath,
                    templateWdpPath
                );
                Trace(
                    "native-create-finished",
                    new
                    {
                        invocation.Success,
                        invocation.Code,
                        invocation.Message,
                        invocation.Strategy,
                        invocation.ActiveProjectPath,
                        invocation.InvocationAttempts,
                        warningCount = invocation.Warnings.Count,
                    }
                );
                if (!File.Exists(wdpPath))
                {
                    if (EnsureStarterAcadeProjectFiles(wdpPath, templateWdpPath, warnings))
                    {
                        invocation.Warnings.Add(
                            "Suite created a starter ACADE project scaffold from the template because the native create function did not materialize the target .wdp."
                        );
                        invocation.Strategy = NormalizeText(invocation.Strategy).Length > 0
                            ? $"{NormalizeText(invocation.Strategy)} -> starter-template"
                            : "starter-template";
                        Trace("starter-template-fallback", new { wdpPath, templateWdpPath });
                    }
                }

                if (File.Exists(wdpPath))
                {
                    Trace("post-create-open-start", new { wdpPath });
                    var openInvocation = TryInvokeAcadeProjectOpen(
                        requestId,
                        wdpPath,
                        workingDocumentContext
                    );
                    invocation.Warnings.AddRange(openInvocation.Warnings);
                    if (
                        openInvocation.Success
                        || NormalizeText(openInvocation.ActiveProjectPath).Length > 0
                    )
                    {
                        invocation.Success = true;
                        invocation.ActiveProjectPath = NormalizeText(
                            openInvocation.ActiveProjectPath
                        );
                        invocation.Strategy = NormalizeText(invocation.Strategy).Length > 0
                            ? $"{NormalizeText(invocation.Strategy)} -> {NormalizeText(openInvocation.Strategy)}"
                            : NormalizeText(openInvocation.Strategy);
                        invocation.Message = NormalizeText(openInvocation.Message).Length > 0
                            ? NormalizeText(openInvocation.Message)
                            : invocation.Message;
                    }
                    Trace(
                        "post-create-open-finished",
                        new
                        {
                            openInvocation.Success,
                            openInvocation.Code,
                            openInvocation.Message,
                            openInvocation.Strategy,
                            openInvocation.ActiveProjectPath,
                            openInvocation.InvocationAttempts,
                        }
                    );
                }

                verification = VerifyAcadeProjectCreateResult(
                    wdpPath,
                    previousObservation,
                    invocation.ActiveProjectPath,
                    warnings
                );
                activeProjectPath = verification.ActiveProjectPath;
            }
            finally
            {
                try
                {
                    SuiteCadTrackerOperationStateStore.ClearCreating();
                }
                catch (Exception ex)
                {
                    warnings.Add($"Suite could not clear tracker create state: {ex.Message}");
                }
            }

            var projectCreated = File.Exists(wdpPath);
            var projectActivated =
                verification.ActiveProjectObserved
                || verification.AepxObserved
                || verification.LastProjObserved;
            verification.CommandCompleted = invocation.Success;

            if (projectActivated)
            {
                TryCloseTemporaryAcadeDocument(workingDocumentContext, warnings);
            }

            Trace(
                "verification-completed",
                new
                {
                    projectCreated,
                    projectActivated,
                    verification.CommandCompleted,
                    verification.AepxObserved,
                    verification.LastProjObserved,
                    verification.ActiveProjectObserved,
                    verification.ActiveProjectPath,
                    workingDocumentContext.TemporaryDocumentCreated,
                    workingDocumentContext.TemporaryDocumentClosed,
                    warnings,
                }
            );

            var envelope = new AcadeProjectCreateResultEnvelope
            {
                Success = invocation.Success && projectCreated && projectActivated,
                Code = invocation.Success && projectCreated && projectActivated
                    ? string.Empty
                    : "ACADE_PROJECT_CREATE_FAILED",
                Message = invocation.Success && projectCreated && projectActivated
                    ? "ACADE project create command completed."
                    : (
                        NormalizeText(invocation.Message).Length > 0
                            ? NormalizeText(invocation.Message)
                            : "ACADE project did not produce a verified create-project side effect."
                    ),
                Data = new AcadeProjectCreateResultData
                {
                    WdpPath = wdpPath,
                    TemplateWdpPath = templateWdpPath,
                    AcadeLaunched = payload.AcadeLaunched,
                    ProjectCreated = projectCreated,
                    ProjectActivated = projectActivated,
                    ActiveProjectPath = activeProjectPath,
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
                    ["temporaryDocumentCreated"] = workingDocumentContext.TemporaryDocumentCreated,
                    ["temporaryDocumentClosed"] = workingDocumentContext.TemporaryDocumentClosed,
                    ["templateWdpPath"] = templateWdpPath,
                    ["strategy"] = NormalizeText(invocation.Strategy),
                    ["tracePath"] = tracePath,
                },
            };
            AppendAcadeRuntimeReadinessMeta(envelope.Meta, readiness);
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

        private static AcadeProjectCreateResultEnvelope BuildAcadeProjectCreateFailure(
            string code,
            string message
        )
        {
            return new AcadeProjectCreateResultEnvelope
            {
                Success = false,
                Code = code,
                Message = message,
                Meta = new Dictionary<string, object>
                {
                    ["providerPath"] = "dotnet+inproc",
                },
            };
        }

        private static AcadeProjectOpenInvocationResult TryInvokeAcadeProjectCreate(
            Document document,
            string requestId,
            string wdpPath,
            string templateWdpPath
        )
        {
            var result = new AcadeProjectOpenInvocationResult();
            void Trace(string stage, object? data = null, Exception? exception = null)
            {
                SuiteCadAcadeTraceLog.WriteTrace(requestId, "suite_acade_project_create", stage, data, exception);
            }

            Trace(
                "create-invoke-start",
                new
                {
                    documentName = NormalizeText(document?.Name),
                    wdpPath,
                    templateWdpPath,
                }
            );
            TryWarmAcadeProjectFunctionsViaLisp(result);

            var normalizedWdpPath = NormalizeLispPathArgument(wdpPath);
            var normalizedTemplatePath = NormalizeLispPathArgument(templateWdpPath);
            var invocationArguments = new[]
            {
                new TypedValue((int)LispDataType.Text, normalizedWdpPath),
                new TypedValue((int)LispDataType.Text, normalizedTemplatePath),
                new TypedValue((int)DxfCode.Int16, 1),
            };

            foreach (var functionName in new[] { "c:wd_create_proj", "wd_create_proj" })
            {
                Trace("create-strategy-start", new { functionName, wdpPath, templateWdpPath });
                if (
                    !TryInvokeLispFunction(
                        functionName,
                        invocationArguments,
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
                            $"Application.Invoke({functionName}) returned {resultSummary} while creating '{wdpPath}'."
                        );
                    }

                    result.Success =
                        returnedTruthy
                        || string.Equals(resultSummary, "empty", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(resultSummary, "null", StringComparison.OrdinalIgnoreCase)
                        || !resultSummary.Contains("error", StringComparison.OrdinalIgnoreCase);
                    if (!result.Success)
                    {
                        continue;
                    }

                    result.Strategy = $"Application.Invoke({functionName})";
                    result.Message = "ACADE project create command completed.";
                    Trace(
                        "create-strategy-finished",
                        new
                        {
                            functionName,
                            result.Success,
                            result.Code,
                            result.Message,
                            result.Strategy,
                            result.InvocationAttempts,
                            warningCount = result.Warnings.Count,
                        }
                    );
                    return result;
                }
            }

            result.Code = "ACADE_PROJECT_CREATE_FAILED";
            result.Message =
                "ACADE did not accept the native create-project request through Application.Invoke.";
            result.Warnings.Add(
                "Suite skipped the SendStringToExecute create-project fallback because queued UI-thread commands cannot be verified synchronously inside the in-process ACADE pipe host."
            );
            Trace(
                "create-all-strategies-failed",
                new
                {
                    result.Code,
                    result.Message,
                    result.InvocationAttempts,
                    warningCount = result.Warnings.Count,
                }
            );
            return result;
        }

        private static AcadeProjectVerificationData VerifyAcadeProjectCreateResult(
            string wdpPath,
            AcadeProjectObservation previousObservation,
            string activeProjectPathHint,
            List<string> warnings
        )
        {
            var deadlineUtc = DateTime.UtcNow.AddSeconds(20);
            while (DateTime.UtcNow <= deadlineUtc)
            {
                if (File.Exists(wdpPath))
                {
                    break;
                }
                Thread.Sleep(300);
            }
            return VerifyAcadeProjectSideEffects(
                wdpPath,
                previousObservation,
                activeProjectPathHint,
                warnings
            );
        }

        private static bool EnsureStarterAcadeProjectFiles(
            string wdpPath,
            string templateWdpPath,
            List<string> warnings
        )
        {
            try
            {
                var wdpDirectory = Path.GetDirectoryName(wdpPath);
                if (!string.IsNullOrWhiteSpace(wdpDirectory))
                {
                    Directory.CreateDirectory(wdpDirectory);
                }

                if (!File.Exists(wdpPath))
                {
                    File.WriteAllText(wdpPath, BuildStarterWdpText(wdpPath, templateWdpPath));
                }

                var templateWdtPath = Path.ChangeExtension(templateWdpPath, ".wdt");
                var targetWdtPath = Path.ChangeExtension(wdpPath, ".wdt");
                TryCopyTemplateFile(templateWdtPath, targetWdtPath, warnings);

                foreach (var templateWdlPath in EnumerateTemplateWdlCandidates(templateWdpPath))
                {
                    var targetStem = Path.GetFileNameWithoutExtension(wdpPath);
                    if (templateWdlPath.EndsWith("_wdtitle.wdl", StringComparison.OrdinalIgnoreCase))
                    {
                        var targetWdlTitlePath = Path.Combine(
                            Path.GetDirectoryName(wdpPath) ?? string.Empty,
                            $"{targetStem}_wdtitle.wdl"
                        );
                        TryCopyTemplateFile(templateWdlPath, targetWdlTitlePath, warnings);
                    }

                    var targetWdlPath = Path.ChangeExtension(wdpPath, ".wdl");
                    TryCopyTemplateFile(templateWdlPath, targetWdlPath, warnings);
                }

                return File.Exists(wdpPath);
            }
            catch (Exception ex)
            {
                warnings.Add($"Suite could not build a starter ACADE project from the template: {ex.Message}");
                return false;
            }
        }

        private static string BuildStarterWdpText(string wdpPath, string templateWdpPath)
        {
            var projectName = Path.GetFileNameWithoutExtension(wdpPath);
            var templateLines = File.ReadAllLines(templateWdpPath);
            var headerLines = new List<string> { $"*[1]{NormalizeText(projectName)}" };

            foreach (var line in templateLines.Skip(1))
            {
                var trimmed = NormalizeText(line);
                if (trimmed.Length == 0)
                {
                    continue;
                }

                if (trimmed.StartsWith("+[", StringComparison.Ordinal))
                {
                    headerLines.Add(line);
                    continue;
                }

                if (trimmed.StartsWith("*[", StringComparison.Ordinal))
                {
                    headerLines.Add(line);
                    continue;
                }

                break;
            }

            return string.Join(Environment.NewLine, headerLines) + Environment.NewLine;
        }

        private static IEnumerable<string> EnumerateTemplateWdlCandidates(string templateWdpPath)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var templateDirectory = Path.GetDirectoryName(templateWdpPath) ?? string.Empty;
            var templateStem = Path.GetFileNameWithoutExtension(templateWdpPath);
            foreach (var candidate in new[]
            {
                Path.ChangeExtension(templateWdpPath, ".wdl"),
                Path.Combine(templateDirectory, $"{templateStem}_wdtitle.wdl"),
            })
            {
                if (!string.IsNullOrWhiteSpace(candidate) && File.Exists(candidate) && seen.Add(candidate))
                {
                    yield return candidate;
                }
            }
        }

        private static void TryCopyTemplateFile(
            string sourcePath,
            string targetPath,
            List<string> warnings
        )
        {
            if (
                string.IsNullOrWhiteSpace(sourcePath)
                || string.IsNullOrWhiteSpace(targetPath)
                || !File.Exists(sourcePath)
            )
            {
                return;
            }

            try
            {
                var targetDirectory = Path.GetDirectoryName(targetPath);
                if (!string.IsNullOrWhiteSpace(targetDirectory))
                {
                    Directory.CreateDirectory(targetDirectory);
                }

                if (!File.Exists(targetPath))
                {
                    File.Copy(sourcePath, targetPath, overwrite: false);
                }
            }
            catch (Exception ex)
            {
                warnings.Add(
                    $"Suite could not copy the template companion file '{sourcePath}' to '{targetPath}': {ex.Message}"
                );
            }
        }
    }
}
