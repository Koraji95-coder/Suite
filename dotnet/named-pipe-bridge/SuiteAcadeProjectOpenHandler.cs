using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;

static partial class ConduitRouteStubHandlers
{
    private const string SuiteAcadeProjectOpenPluginCommand = "SUITEACADEPROJECTOPEN";
    private static readonly string[] SuiteAcadeExecutablePathCandidates =
    {
        @"C:\Program Files\Autodesk\AutoCAD Electrical 2026\acad.exe",
        @"C:\Program Files\Autodesk\AutoCAD 2026\acad.exe",
        @"C:\Program Files\Autodesk\AutoCAD Electrical 2025\acad.exe",
        @"C:\Program Files\Autodesk\AutoCAD 2025\acad.exe",
    };

    internal sealed class SuiteAcadeProjectOpenRequest
    {
        public string RequestId { get; init; } = "";
        public string ProjectRootPath { get; init; } = "";
        public string WdpPath { get; init; } = "";
        public bool LaunchIfNeeded { get; init; }
        public string UiMode { get; init; } = "project_manager_only";
    }

    internal sealed class SuiteAcadeProjectOpenSession : IDisposable
    {
        public SuiteAcadeProjectOpenSession(
            object application,
            object document,
            object? modelspace,
            bool acadeLaunched,
            bool temporaryDocumentCreated,
            string executablePath
        )
        {
            Application = application;
            Document = document;
            Modelspace = modelspace;
            AcadeLaunched = acadeLaunched;
            TemporaryDocumentCreated = temporaryDocumentCreated;
            ExecutablePath = executablePath ?? "";
        }

        public object Application { get; }
        public object Document { get; }
        public object? Modelspace { get; }
        public bool AcadeLaunched { get; }
        public bool TemporaryDocumentCreated { get; }
        public string ExecutablePath { get; }

        public void Dispose()
        {
            if (!OperatingSystem.IsWindows())
            {
                return;
            }

            foreach (var comObject in new object?[] { Modelspace, Document, Application })
            {
                if (comObject is null)
                {
                    continue;
                }

                try
                {
                    if (Marshal.IsComObject(comObject))
                    {
                        Marshal.ReleaseComObject(comObject);
                    }
                }
                catch
                {
                    // Best effort cleanup.
                }
            }
        }
    }

    internal sealed class SuiteAcadeProjectOpenPluginInvocation
    {
        public string RequestId { get; init; } = "";
        public string ProjectRootPath { get; init; } = "";
        public string WdpPath { get; init; } = "";
        public string UiMode { get; init; } = "project_manager_only";
        public string PluginDllPath { get; init; } = "";
        public string PayloadPath { get; init; } = "";
        public string ResultPath { get; init; } = "";
    }

    internal sealed class SuiteAcadeProjectOpenPluginExecutionResult
    {
        public bool CommandCompleted { get; init; }
        public bool CommandStateAvailable { get; init; }
        public bool SawActiveCommand { get; init; }
        public int LastCommandMask { get; init; }
        public string PluginDllPath { get; init; } = "";
        public string PayloadPath { get; init; } = "";
        public string ResultPath { get; init; } = "";
        public JsonObject? PluginResult { get; init; }
        public string FailureCode { get; init; } = "";
        public string FailureMessage { get; init; } = "";
    }

    internal sealed class SuiteAcadeProjectOpenCommandExecutionResult
    {
        public bool Attempted { get; init; }
        public bool CommandCompleted { get; init; }
        public bool CommandStateAvailable { get; init; }
        public bool SawActiveCommand { get; init; }
        public int LastCommandMask { get; init; }
        public string Strategy { get; init; } = "";
        public string FailureCode { get; init; } = "";
        public string FailureMessage { get; init; } = "";
    }

    internal sealed class SuiteAcadeProjectOpenVerificationContext
    {
        public string RequestId { get; init; } = "";
        public string WdpPath { get; init; } = "";
        public bool PreviousAepxExists { get; init; }
        public DateTime? PreviousAepxLastWriteUtc { get; init; }
        public bool PreviousLastProjObserved { get; init; }
        public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(15);
    }

    internal readonly record struct SuiteAcadeProjectOpenVerificationResult(
        bool AepxObserved,
        bool LastProjObserved
    );

    private readonly record struct SuiteAcadeProjectOpenObservation(
        bool AepxExists,
        DateTime? AepxLastWriteUtc,
        bool LastProjObserved
    );

    private readonly record struct SuiteAcadeDocumentContext(
        object Documents,
        object Document,
        bool TemporaryDocumentCreated
    );

    internal static Func<
        SuiteAcadeProjectOpenRequest,
        List<string>,
        (SuiteAcadeProjectOpenSession? Session, string FailureCode, string FailureMessage)
    >? SuiteAcadeProjectOpenConnectHook;

    internal static Func<
        SuiteAcadeProjectOpenPluginInvocation,
        SuiteAcadeProjectOpenSession,
        List<string>,
        SuiteAcadeProjectOpenPluginExecutionResult
    >? SuiteAcadeProjectOpenPluginHook;

    internal static Func<
        SuiteAcadeProjectOpenVerificationContext,
        List<string>,
        SuiteAcadeProjectOpenVerificationResult
    >? SuiteAcadeProjectOpenVerifyHook;

    internal static Func<
        SuiteAcadeProjectOpenRequest,
        SuiteAcadeProjectOpenSession,
        List<string>,
        SuiteAcadeProjectOpenCommandExecutionResult
    >? SuiteAcadeProjectOpenBuiltInCommandHook;

    internal static void ResetSuiteAcadeProjectOpenTestHooks()
    {
        SuiteAcadeProjectOpenConnectHook = null;
        SuiteAcadeProjectOpenPluginHook = null;
        SuiteAcadeProjectOpenVerifyHook = null;
        SuiteAcadeProjectOpenBuiltInCommandHook = null;
    }

    public static JsonObject HandleSuiteAcadeProjectOpen(JsonObject payload)
    {
        var request = ReadSuiteAcadeProjectOpenRequest(payload, out var validationError);
        if (request is null)
        {
            return BuildSuiteInvalidRequestResult(validationError);
        }

        var warnings = new List<string>();
        var preOpenObservation = CaptureSuiteAcadeProjectOpenObservation(request.WdpPath, warnings);

        BridgeLog.Info(
            $"suite_acade_project_open launch-acade start (request_id={request.RequestId}, wdp_path={request.WdpPath}, launch_if_needed={request.LaunchIfNeeded})."
        );

        var connectResult = SuiteAcadeProjectOpenConnectHook is not null
            ? SuiteAcadeProjectOpenConnectHook(request, warnings)
            : AcquireSuiteAcadeProjectOpenSession(request, warnings);
        if (connectResult.Session is null)
        {
            return BuildSuiteAcadeProjectOpenFailure(
                code: string.IsNullOrWhiteSpace(connectResult.FailureCode)
                    ? "AUTOCAD_NOT_AVAILABLE"
                    : connectResult.FailureCode,
                message: string.IsNullOrWhiteSpace(connectResult.FailureMessage)
                    ? "Unable to connect to AutoCAD Electrical."
                    : connectResult.FailureMessage,
                request: request,
                warnings: warnings,
                acadeLaunched: false,
                projectActivated: false,
                commandCompleted: false,
                aepxObserved: false,
                lastProjObserved: false,
                temporaryDocumentCreated: false,
                meta: new JsonObject
                {
                    ["source"] = "dotnet",
                    ["providerPath"] = "dotnet",
                    ["action"] = "suite_acade_project_open",
                    ["stage"] = "launch-acade",
                }
            );
        }

        using var session = connectResult.Session;
        TryActivateSuiteDocument(session.Document);

        BridgeLog.Info(
            $"suite_acade_project_open bridge-open-project start (request_id={request.RequestId}, acade_launched={session.AcadeLaunched}, temporary_document_created={session.TemporaryDocumentCreated})."
        );

        var commandExecution = SuiteAcadeProjectOpenBuiltInCommandHook is not null
            ? SuiteAcadeProjectOpenBuiltInCommandHook(request, session, warnings)
            : ExecuteSuiteAcadeProjectOpenBuiltInCommand(request, session, warnings);

        var commandCompleted = commandExecution.CommandCompleted;
        var projectActivated = false;
        var activationFailed = !string.IsNullOrWhiteSpace(commandExecution.FailureCode);
        var activationFailureCode = (commandExecution.FailureCode ?? "").Trim();
        var activationFailureMessage = (commandExecution.FailureMessage ?? "").Trim();
        var bridgeOpenMeta = BuildSuiteAcadeProjectOpenCommandMeta(
            stage: "bridge-open-project",
            session: session,
            commandExecution: commandExecution
        );

        if (activationFailed)
        {
            warnings.Add(
                $"Built-in ACADE project command failed ({activationFailureCode}); trying the SuiteCadAuthoring fallback."
            );
            var pluginExecution = SuiteAcadeProjectOpenPluginHook is not null
                ? SuiteAcadeProjectOpenPluginHook(
                    new SuiteAcadeProjectOpenPluginInvocation
                    {
                        RequestId = request.RequestId,
                        ProjectRootPath = request.ProjectRootPath,
                        WdpPath = request.WdpPath,
                        UiMode = request.UiMode,
                    },
                    session,
                    warnings
                )
                : ExecuteSuiteAcadeProjectOpenPlugin(payload, request, session, warnings);
            commandCompleted = commandCompleted || pluginExecution.CommandCompleted;
            bridgeOpenMeta["fallbackAttempted"] = true;
            bridgeOpenMeta["fallbackProviderPath"] = string.IsNullOrWhiteSpace(
                pluginExecution.PluginDllPath
            )
                ? "dotnet"
                : "dotnet+plugin";
            bridgeOpenMeta["fallbackCommandCompleted"] = pluginExecution.CommandCompleted;
            bridgeOpenMeta["fallbackCommandStateAvailable"] = pluginExecution.CommandStateAvailable;
            bridgeOpenMeta["fallbackSawActiveCommand"] = pluginExecution.SawActiveCommand;
            bridgeOpenMeta["fallbackLastCommandMask"] = pluginExecution.LastCommandMask;
            bridgeOpenMeta["fallbackPluginDllPath"] = string.IsNullOrWhiteSpace(
                pluginExecution.PluginDllPath
            )
                ? null
                : pluginExecution.PluginDllPath;
            bridgeOpenMeta["fallbackPayloadPath"] = string.IsNullOrWhiteSpace(
                pluginExecution.PayloadPath
            )
                ? null
                : pluginExecution.PayloadPath;
            bridgeOpenMeta["fallbackResultPath"] = string.IsNullOrWhiteSpace(
                pluginExecution.ResultPath
            )
                ? null
                : pluginExecution.ResultPath;

            var pluginResult = pluginExecution.PluginResult;
            if (pluginResult is not null)
            {
                warnings.AddRange(ReadJsonStringArray(pluginResult["warnings"] as JsonArray));
                var pluginMeta = CloneJsonObject(pluginResult["meta"] as JsonObject);
                var pluginData = pluginResult["data"] as JsonObject ?? new JsonObject();
                var fallbackStrategy = ReadStringValue(pluginMeta, "strategy", "");
                if (string.IsNullOrWhiteSpace(fallbackStrategy))
                {
                    fallbackStrategy = ReadStringValue(pluginData, "strategy", "");
                }
                if (!string.IsNullOrWhiteSpace(fallbackStrategy))
                {
                    bridgeOpenMeta["fallbackStrategy"] = fallbackStrategy;
                }

                var pluginSuccess = pluginResult["success"]?.GetValue<bool>() ?? false;
                projectActivated = ReadBool(pluginData, "projectActivated", pluginSuccess);
                activationFailed = !pluginSuccess;
                activationFailureCode = pluginSuccess
                    ? ""
                    : ReadStringValue(pluginResult, "code", "ACADE_PROJECT_OPEN_FAILED");
                activationFailureMessage = pluginSuccess
                    ? ""
                    : ReadStringValue(pluginResult, "message", "ACADE project open failed.");
            }
            else
            {
                activationFailed = true;
                activationFailureCode = string.IsNullOrWhiteSpace(pluginExecution.FailureCode)
                    ? "PLUGIN_RESULT_MISSING"
                    : pluginExecution.FailureCode;
                activationFailureMessage = string.IsNullOrWhiteSpace(
                    pluginExecution.FailureMessage
                )
                    ? "SuiteCadAuthoring did not return a result payload."
                    : pluginExecution.FailureMessage;
            }

            if (activationFailed)
            {
                return BuildSuiteAcadeProjectOpenFailure(
                    code: activationFailureCode,
                    message: activationFailureMessage,
                    request: request,
                    warnings: warnings,
                    acadeLaunched: session.AcadeLaunched,
                    projectActivated: false,
                    commandCompleted: commandCompleted,
                    aepxObserved: false,
                    lastProjObserved: false,
                    temporaryDocumentCreated: session.TemporaryDocumentCreated,
                    meta: bridgeOpenMeta
                );
            }
        }

        BridgeLog.Info(
            $"suite_acade_project_open verify-open-project start (request_id={request.RequestId}, wdp_path={request.WdpPath})."
        );

        var verificationContext = new SuiteAcadeProjectOpenVerificationContext
        {
            RequestId = request.RequestId,
            WdpPath = request.WdpPath,
            PreviousAepxExists = preOpenObservation.AepxExists,
            PreviousAepxLastWriteUtc = preOpenObservation.AepxLastWriteUtc,
            PreviousLastProjObserved = preOpenObservation.LastProjObserved,
            Timeout = TimeSpan.FromSeconds(15),
        };
        var verification = SuiteAcadeProjectOpenVerifyHook is not null
            ? SuiteAcadeProjectOpenVerifyHook(verificationContext, warnings)
            : VerifySuiteAcadeProjectOpen(verificationContext, warnings);
        if (!projectActivated && (verification.AepxObserved || verification.LastProjObserved))
        {
            projectActivated = true;
        }
        bridgeOpenMeta["source"] = "dotnet";
        bridgeOpenMeta["action"] = "suite_acade_project_open";
        bridgeOpenMeta["stage"] = "verify-open-project";

        var resultData = BuildSuiteAcadeProjectOpenData(
            request: request,
            acadeLaunched: session.AcadeLaunched,
            projectActivated: projectActivated,
            commandCompleted: commandCompleted,
            aepxObserved: verification.AepxObserved,
            lastProjObserved: verification.LastProjObserved,
            temporaryDocumentCreated: session.TemporaryDocumentCreated
        );
        if (!projectActivated || !(verification.AepxObserved || verification.LastProjObserved))
        {
            warnings.Add("ACADE did not produce a verified project-open side effect.");
            return new JsonObject
            {
                ["success"] = false,
                ["code"] = "ACADE_PROJECT_NOT_VERIFIED",
                ["message"] = "ACADE project did not produce a verified open-project side effect.",
                ["data"] = resultData,
                ["meta"] = CloneJsonObject(bridgeOpenMeta),
                ["warnings"] = ToJsonArray(warnings.Distinct(StringComparer.OrdinalIgnoreCase)),
            };
        }

        return new JsonObject
        {
            ["success"] = true,
            ["code"] = "",
            ["message"] = "ACADE project open completed.",
            ["data"] = resultData,
            ["meta"] = CloneJsonObject(bridgeOpenMeta),
            ["warnings"] = ToJsonArray(warnings.Distinct(StringComparer.OrdinalIgnoreCase)),
        };
    }

    private static SuiteAcadeProjectOpenRequest? ReadSuiteAcadeProjectOpenRequest(
        JsonObject payload,
        out string validationError
    )
    {
        validationError = "";
        var wdpPath = ReadStringValue(payload, "wdpPath", "").Trim().Trim('"');
        if (string.IsNullOrWhiteSpace(wdpPath))
        {
            validationError = "wdpPath is required.";
            return null;
        }
        if (!Path.IsPathRooted(wdpPath))
        {
            validationError = "wdpPath must be an absolute path.";
            return null;
        }

        try
        {
            wdpPath = Path.GetFullPath(wdpPath);
        }
        catch (Exception ex)
        {
            validationError = $"wdpPath is invalid: {ex.Message}";
            return null;
        }

        if (!File.Exists(wdpPath))
        {
            validationError = $"wdpPath was not found: {wdpPath}";
            return null;
        }

        var projectRootPath = ReadStringValue(payload, "projectRootPath", "").Trim().Trim('"');
        if (string.IsNullOrWhiteSpace(projectRootPath))
        {
            projectRootPath = Path.GetDirectoryName(wdpPath) ?? "";
        }
        else if (!Path.IsPathRooted(projectRootPath))
        {
            validationError = "projectRootPath must be an absolute path when provided.";
            return null;
        }
        else
        {
            try
            {
                projectRootPath = Path.GetFullPath(projectRootPath);
            }
            catch (Exception ex)
            {
                validationError = $"projectRootPath is invalid: {ex.Message}";
                return null;
            }
        }

        return new SuiteAcadeProjectOpenRequest
        {
            RequestId = ReadStringValue(payload, "requestId", "").Trim(),
            ProjectRootPath = projectRootPath,
            WdpPath = wdpPath,
            LaunchIfNeeded = ReadBool(payload, "launchIfNeeded", fallback: true),
            UiMode = ReadStringValue(payload, "uiMode", "project_manager_only").Trim(),
        };
    }

    private static (
        SuiteAcadeProjectOpenSession? Session,
        string FailureCode,
        string FailureMessage
    ) AcquireSuiteAcadeProjectOpenSession(
        SuiteAcadeProjectOpenRequest request,
        List<string> warnings
    )
    {
        if (!OperatingSystem.IsWindows())
        {
            return (
                null,
                "AUTOCAD_NOT_AVAILABLE",
                "AutoCAD project activation is only available on Windows."
            );
        }

        object? application = null;
        var executablePath = "";
        var acadeLaunched = false;
        if (!TryFindRunningAutoCadApplication(out application, out _))
        {
            if (!request.LaunchIfNeeded)
            {
                return (
                    null,
                    "AUTOCAD_NOT_AVAILABLE",
                    "AutoCAD is not running and launchIfNeeded was false."
                );
            }

            executablePath = ResolveSuiteAcadeExecutablePath();
            if (string.IsNullOrWhiteSpace(executablePath))
            {
                return (
                    null,
                    "AUTOCAD_LAUNCH_FAILED",
                    "Unable to locate acad.exe for AutoCAD Electrical."
                );
            }

            try
            {
                var process = Process.Start(
                    new ProcessStartInfo
                    {
                        FileName = executablePath,
                        UseShellExecute = true,
                        WorkingDirectory = Path.GetDirectoryName(executablePath) ?? "",
                    }
                );
                if (process is null)
                {
                    return (
                        null,
                        "AUTOCAD_LAUNCH_FAILED",
                        $"Failed to start AutoCAD from '{executablePath}'."
                    );
                }
            }
            catch (Exception ex)
            {
                return (
                    null,
                    "AUTOCAD_LAUNCH_FAILED",
                    $"Failed to launch AutoCAD from '{executablePath}': {DescribeException(ex)}"
                );
            }

            acadeLaunched = true;
            var launchStopwatch = Stopwatch.StartNew();
            while (launchStopwatch.Elapsed < TimeSpan.FromSeconds(120))
            {
                if (TryFindRunningAutoCadApplication(out application, out _))
                {
                    break;
                }
                Thread.Sleep(1000);
            }

            if (application is null)
            {
                return (
                    null,
                    "AUTOCAD_LAUNCH_TIMEOUT",
                    $"Timed out waiting for AutoCAD to become ready after launching '{executablePath}'."
                );
            }
        }

        if (application is null)
        {
            return (
                null,
                "AUTOCAD_NOT_AVAILABLE",
                "Unable to connect to a running AutoCAD COM instance."
            );
        }

        try
        {
            ReadWithTransientComRetry(
                () =>
                {
                    ((dynamic)application).Visible = true;
                    return true;
                },
                "Application.Visible=true"
            );
        }
        catch (Exception ex)
        {
            warnings.Add($"AutoCAD launched, but Suite could not force the UI visible: {DescribeException(ex)}");
        }

        try
        {
            var documentContext = WaitForSuiteAcadeDocumentContext(
                application,
                acadeLaunched ? TimeSpan.FromSeconds(45) : TimeSpan.FromSeconds(15),
                warnings
            );
            if (documentContext is null)
            {
                return (
                    null,
                    "AUTOCAD_NOT_AVAILABLE",
                    "AutoCAD did not provide a document context for project activation."
                );
            }

            var modelspace = ReadProperty(documentContext.Value.Document, "ModelSpace");
            return (
                new SuiteAcadeProjectOpenSession(
                    application: application,
                    document: documentContext.Value.Document,
                    modelspace: modelspace,
                    acadeLaunched: acadeLaunched,
                    temporaryDocumentCreated: documentContext.Value.TemporaryDocumentCreated,
                    executablePath: executablePath
                ),
                "",
                ""
            );
        }
        catch (Exception ex)
        {
            return (
                null,
                "AUTOCAD_NOT_AVAILABLE",
                $"Failed to establish an AutoCAD document context: {DescribeException(ex)}"
            );
        }
    }

    private static SuiteAcadeDocumentContext? WaitForSuiteAcadeDocumentContext(
        object application,
        TimeSpan timeout,
        List<string> warnings
    )
    {
        var stopwatch = Stopwatch.StartNew();
        var lastAddAttemptUtc = DateTime.MinValue;
        Exception? lastDocumentsError = null;
        Exception? lastAddError = null;
        bool warnedWaiting = false;

        while (stopwatch.Elapsed < timeout)
        {
            object? documents = null;
            object? document = null;
            try
            {
                documents = ReadProperty(application, "Documents");
            }
            catch (Exception ex)
            {
                lastDocumentsError = ex;
            }

            try
            {
                document = ReadProperty(application, "ActiveDocument");
            }
            catch
            {
                document = null;
            }

            if (document is null && documents is not null)
            {
                try
                {
                    var count = ReadCount(documents);
                    if (count > 0)
                    {
                        document = ReadItem(documents, 0);
                    }
                }
                catch
                {
                    document = null;
                }
            }

            if (document is not null && documents is not null)
            {
                TryActivateSuiteDocument(document);
                return new SuiteAcadeDocumentContext(
                    Documents: documents,
                    Document: document,
                    TemporaryDocumentCreated: false
                );
            }

            if (documents is not null)
            {
                var nowUtc = DateTime.UtcNow;
                if ((nowUtc - lastAddAttemptUtc) >= TimeSpan.FromSeconds(2))
                {
                    lastAddAttemptUtc = nowUtc;
                    try
                    {
                        var createdDocument = ReadWithTransientComRetry(
                            () => ((dynamic)documents).Add(),
                            "Documents.Add()"
                        );
                        if (createdDocument is not null)
                        {
                            TryActivateSuiteDocument(createdDocument);
                            return new SuiteAcadeDocumentContext(
                                Documents: documents,
                                Document: createdDocument,
                                TemporaryDocumentCreated: true
                            );
                        }
                    }
                    catch (Exception ex)
                    {
                        lastAddError = ex;
                    }
                }
            }

            if (!warnedWaiting && stopwatch.Elapsed >= TimeSpan.FromSeconds(5))
            {
                warnings.Add(
                    "AutoCAD is still initializing its document manager; waiting for a blank drawing context before activating the ACADE project."
                );
                warnedWaiting = true;
            }

            Thread.Sleep(500);
        }

        if (lastAddError is not null)
        {
            warnings.Add(
                $"Suite could not create a temporary AutoCAD drawing while ACADe was on the Start screen: {DescribeException(lastAddError)}"
            );
        }
        if (lastDocumentsError is not null)
        {
            warnings.Add(
                $"Suite could not access the AutoCAD documents collection while waiting for startup to finish: {DescribeException(lastDocumentsError)}"
            );
        }

        return null;
    }

    private static bool TryFindRunningAutoCadApplication(out object? application, out string progId)
    {
        application = null;
        progId = "";
        foreach (var candidateProgId in AutoCadProgIds)
        {
            if (!TryGetActiveComObject(candidateProgId, out var activeObject) || activeObject is null)
            {
                continue;
            }

            application = activeObject;
            progId = candidateProgId;
            BridgeLog.Info($"Connected to AutoCAD COM via ProgID={candidateProgId}");
            return true;
        }

        return false;
    }

    private static string ResolveSuiteAcadeExecutablePath()
    {
        var explicitInstallDir = (Environment.GetEnvironmentVariable("AUTOCAD_INSTALL_DIR") ?? "")
            .Trim()
            .Trim('"');
        if (!string.IsNullOrWhiteSpace(explicitInstallDir))
        {
            try
            {
                var explicitExePath = Path.GetFullPath(Path.Combine(explicitInstallDir, "acad.exe"));
                if (File.Exists(explicitExePath))
                {
                    return explicitExePath;
                }
            }
            catch
            {
                // Ignore invalid AUTOCAD_INSTALL_DIR values.
            }
        }

        foreach (var candidate in SuiteAcadeExecutablePathCandidates)
        {
            if (File.Exists(candidate))
            {
                return Path.GetFullPath(candidate);
            }
        }

        return "";
    }

    private static SuiteAcadeProjectOpenPluginExecutionResult ExecuteSuiteAcadeProjectOpenPlugin(
        JsonObject payload,
        SuiteAcadeProjectOpenRequest request,
        SuiteAcadeProjectOpenSession session,
        List<string> warnings
    )
    {
        var pluginDllPath = ResolveSuiteCadAuthoringPluginDllPath(payload, out var pluginValidationError);
        if (!string.IsNullOrWhiteSpace(pluginValidationError))
        {
            return new SuiteAcadeProjectOpenPluginExecutionResult
            {
                FailureCode = "PLUGIN_NOT_READY",
                FailureMessage = pluginValidationError,
            };
        }

        var tempRoot = Path.Combine(
            Path.GetTempPath(),
            "suite-acade-project-open",
            Guid.NewGuid().ToString("N")
        );
        Directory.CreateDirectory(tempRoot);
        var payloadPath = Path.Combine(tempRoot, "payload.json");
        var resultPath = Path.Combine(tempRoot, "result.json");

        try
        {
            var pluginPayload = new JsonObject
            {
                ["requestId"] = request.RequestId,
                ["projectRootPath"] = request.ProjectRootPath,
                ["wdpPath"] = request.WdpPath,
                ["uiMode"] = request.UiMode,
            };
            File.WriteAllText(
                payloadPath,
                pluginPayload.ToJsonString(new JsonSerializerOptions { WriteIndented = true })
            );

            TryActivateSuiteDocument(session.Document);

            var invocation = new SuiteAcadeProjectOpenPluginInvocation
            {
                RequestId = request.RequestId,
                ProjectRootPath = request.ProjectRootPath,
                WdpPath = request.WdpPath,
                UiMode = request.UiMode,
                PluginDllPath = pluginDllPath,
                PayloadPath = payloadPath,
                ResultPath = resultPath,
            };
            var directExecution = ExecuteSuiteAcadeProjectOpenPluginCommand(
                session,
                invocation,
                loadViaNetLoad: false
            );
            if (directExecution.PluginResult is not null)
            {
                return directExecution;
            }
            if (!string.Equals(directExecution.FailureCode, "PLUGIN_RESULT_MISSING", StringComparison.OrdinalIgnoreCase))
            {
                return directExecution;
            }

            warnings.Add(
                "SuiteCadAuthoring was not yet demand-loaded; retrying ACADE project activation via NETLOAD."
            );
            return ExecuteSuiteAcadeProjectOpenPluginCommand(
                session,
                invocation,
                loadViaNetLoad: true
            );
        }
        catch (Exception ex)
        {
            return new SuiteAcadeProjectOpenPluginExecutionResult
            {
                CommandCompleted = false,
                PluginDllPath = pluginDllPath,
                PayloadPath = payloadPath,
                ResultPath = resultPath,
                FailureCode = "ACADE_PROJECT_OPEN_FAILED",
                FailureMessage = $"ACADE project open failed: {DescribeException(ex)}",
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

    private static SuiteAcadeProjectOpenPluginExecutionResult ExecuteSuiteAcadeProjectOpenPluginCommand(
        SuiteAcadeProjectOpenSession session,
        SuiteAcadeProjectOpenPluginInvocation invocation,
        bool loadViaNetLoad
    )
    {
        var commandScript = loadViaNetLoad
            ? BuildSuitePluginCommandScript(
                invocation.PluginDllPath,
                SuiteAcadeProjectOpenPluginCommand,
                invocation.PayloadPath,
                invocation.ResultPath
            )
            : BuildAutoCadCommandScript(
                $"_.{SuiteAcadeProjectOpenPluginCommand}",
                invocation.PayloadPath,
                invocation.ResultPath
            );

        ReadWithTransientComRetry(
            () =>
            {
                ((dynamic)session.Document).SendCommand(commandScript);
                return true;
            },
            loadViaNetLoad
                ? $"SendCommand(NETLOAD+{SuiteAcadeProjectOpenPluginCommand})"
                : $"SendCommand({SuiteAcadeProjectOpenPluginCommand})"
        );

        var (completed, sawActiveCommand, commandStateAvailable, lastCommandMask) =
            WaitForSuiteAcadeCommandCompletion(session, 180_000);
        if (!completed)
        {
            return new SuiteAcadeProjectOpenPluginExecutionResult
            {
                CommandCompleted = false,
                CommandStateAvailable = commandStateAvailable,
                SawActiveCommand = sawActiveCommand,
                LastCommandMask = lastCommandMask,
                PluginDllPath = invocation.PluginDllPath,
                PayloadPath = invocation.PayloadPath,
                ResultPath = invocation.ResultPath,
                FailureCode = "AUTOCAD_COMMAND_TIMEOUT",
                FailureMessage =
                    $"Timed out waiting for AutoCAD to finish '{SuiteAcadeProjectOpenPluginCommand}'.",
            };
        }

        if (!File.Exists(invocation.ResultPath))
        {
            return new SuiteAcadeProjectOpenPluginExecutionResult
            {
                CommandCompleted = true,
                CommandStateAvailable = commandStateAvailable,
                SawActiveCommand = sawActiveCommand,
                LastCommandMask = lastCommandMask,
                PluginDllPath = invocation.PluginDllPath,
                PayloadPath = invocation.PayloadPath,
                ResultPath = invocation.ResultPath,
                FailureCode = "PLUGIN_RESULT_MISSING",
                FailureMessage = loadViaNetLoad
                    ? $"SuiteCadAuthoring did not produce a result file at '{invocation.ResultPath}' after NETLOAD."
                    : $"SuiteCadAuthoring did not produce a result file at '{invocation.ResultPath}'.",
            };
        }

        var parsed = JsonNode.Parse(File.ReadAllText(invocation.ResultPath)) as JsonObject;
        if (parsed is null)
        {
            return new SuiteAcadeProjectOpenPluginExecutionResult
            {
                CommandCompleted = true,
                CommandStateAvailable = commandStateAvailable,
                SawActiveCommand = sawActiveCommand,
                LastCommandMask = lastCommandMask,
                PluginDllPath = invocation.PluginDllPath,
                PayloadPath = invocation.PayloadPath,
                ResultPath = invocation.ResultPath,
                FailureCode = "PLUGIN_RESULT_INVALID",
                FailureMessage = "SuiteCadAuthoring returned malformed JSON.",
            };
        }

        return new SuiteAcadeProjectOpenPluginExecutionResult
        {
            CommandCompleted = true,
            CommandStateAvailable = commandStateAvailable,
            SawActiveCommand = sawActiveCommand,
            LastCommandMask = lastCommandMask,
            PluginDllPath = invocation.PluginDllPath,
            PayloadPath = invocation.PayloadPath,
            ResultPath = invocation.ResultPath,
            PluginResult = parsed,
        };
    }

    private static SuiteAcadeProjectOpenCommandExecutionResult ExecuteSuiteAcadeProjectOpenBuiltInCommand(
        SuiteAcadeProjectOpenRequest request,
        SuiteAcadeProjectOpenSession session,
        List<string> warnings
    )
    {
        var commandScript = BuildAutoCadCommandScript("_.AEPROJECT", request.WdpPath);
        try
        {
            TryActivateSuiteDocument(session.Document);
            ReadWithTransientComRetry(
                () =>
                {
                    ((dynamic)session.Document).SendCommand(commandScript);
                    return true;
                },
                "SendCommand(AEPROJECT)"
            );
        }
        catch (Exception ex)
        {
            return new SuiteAcadeProjectOpenCommandExecutionResult
            {
                Attempted = true,
                FailureCode = "ACADE_PROJECT_OPEN_FAILED",
                FailureMessage = $"ACADE built-in project command failed: {DescribeException(ex)}",
                Strategy = "_.AEPROJECT <wdpPath>",
            };
        }

        var (completed, sawActiveCommand, commandStateAvailable, lastCommandMask) =
            WaitForSuiteAcadeCommandCompletion(session, 45_000);
        if (!completed)
        {
            TryCancelSuiteAcadeCommand(session, warnings);
            return new SuiteAcadeProjectOpenCommandExecutionResult
            {
                Attempted = true,
                CommandCompleted = false,
                CommandStateAvailable = commandStateAvailable,
                SawActiveCommand = sawActiveCommand,
                LastCommandMask = lastCommandMask,
                FailureCode = "AUTOCAD_COMMAND_TIMEOUT",
                FailureMessage =
                    "Timed out waiting for AutoCAD to finish the built-in ACADE project command.",
                Strategy = "_.AEPROJECT <wdpPath>",
            };
        }

        return new SuiteAcadeProjectOpenCommandExecutionResult
        {
            Attempted = true,
            CommandCompleted = true,
            CommandStateAvailable = commandStateAvailable,
            SawActiveCommand = sawActiveCommand,
            LastCommandMask = lastCommandMask,
            Strategy = "_.AEPROJECT <wdpPath>",
        };
    }

    private static void TryCancelSuiteAcadeCommand(
        SuiteAcadeProjectOpenSession session,
        List<string> warnings
    )
    {
        try
        {
            ReadWithTransientComRetry(
                () =>
                {
                    ((dynamic)session.Document).SendCommand("\u0003\u0003");
                    return true;
                },
                "SendCommand(Cancel)"
            );
        }
        catch (Exception ex)
        {
            warnings.Add($"Suite could not cancel the active AutoCAD command cleanly: {DescribeException(ex)}");
        }
    }

    private static (
        bool Completed,
        bool SawActiveCommand,
        bool CommandStateAvailable,
        int LastCommandMask
    ) WaitForSuiteAcadeCommandCompletion(SuiteAcadeProjectOpenSession session, int timeoutMs)
    {
        var stopwatch = Stopwatch.StartNew();
        var sawActive = false;
        var idleChecks = 0;
        var lastMask = 0;

        while (stopwatch.ElapsedMilliseconds < timeoutMs)
        {
            if (!TryReadSuiteAcadeCommandActiveMask(session, out var commandMask))
            {
                return (true, sawActive, false, lastMask);
            }

            lastMask = commandMask;
            if (commandMask > 0)
            {
                sawActive = true;
                idleChecks = 0;
            }
            else
            {
                idleChecks += 1;
            }

            if (sawActive && idleChecks >= 2)
            {
                return (true, true, true, lastMask);
            }

            if (!sawActive && stopwatch.ElapsedMilliseconds >= 1200 && idleChecks >= 2)
            {
                return (true, false, true, lastMask);
            }

            Thread.Sleep(120);
        }

        return (false, sawActive, true, lastMask);
    }

    private static bool TryReadSuiteAcadeCommandActiveMask(
        SuiteAcadeProjectOpenSession session,
        out int commandMask
    )
    {
        commandMask = 0;
        try
        {
            commandMask = ReadWithTransientComRetry(
                () =>
                {
                    var value = ((dynamic)session.Document).GetVariable("CMDACTIVE");
                    return SafeInt(value) ?? 0;
                },
                "GetVariable(CMDACTIVE)"
            );
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static SuiteAcadeProjectOpenObservation CaptureSuiteAcadeProjectOpenObservation(
        string wdpPath,
        List<string> warnings
    )
    {
        var aepxPath = Path.ChangeExtension(wdpPath, ".aepx");
        bool aepxExists;
        DateTime? aepxLastWriteUtc;
        try
        {
            aepxExists = File.Exists(aepxPath);
            aepxLastWriteUtc = aepxExists ? File.GetLastWriteTimeUtc(aepxPath) : null;
        }
        catch (Exception ex)
        {
            warnings.Add($"Suite could not read '{aepxPath}' before project activation: {DescribeException(ex)}");
            aepxExists = false;
            aepxLastWriteUtc = null;
        }

        var lastProjObserved = false;
        try
        {
            lastProjObserved = SuiteAcadeLastProjContainsTarget(wdpPath);
        }
        catch (Exception ex)
        {
            warnings.Add($"Suite could not read LastProj.fil before project activation: {DescribeException(ex)}");
        }

        return new SuiteAcadeProjectOpenObservation(
            AepxExists: aepxExists,
            AepxLastWriteUtc: aepxLastWriteUtc,
            LastProjObserved: lastProjObserved
        );
    }

    private static SuiteAcadeProjectOpenVerificationResult VerifySuiteAcadeProjectOpen(
        SuiteAcadeProjectOpenVerificationContext context,
        List<string> warnings
    )
    {
        var stopwatch = Stopwatch.StartNew();
        var aepxObserved = false;
        var lastProjObserved = context.PreviousLastProjObserved;
        var aepxPath = Path.ChangeExtension(context.WdpPath, ".aepx");

        while (stopwatch.Elapsed < context.Timeout)
        {
            if (!aepxObserved)
            {
                try
                {
                    if (File.Exists(aepxPath))
                    {
                        if (!context.PreviousAepxExists)
                        {
                            aepxObserved = true;
                        }
                        else
                        {
                            var currentWriteUtc = File.GetLastWriteTimeUtc(aepxPath);
                            if (
                                !context.PreviousAepxLastWriteUtc.HasValue
                                || currentWriteUtc > context.PreviousAepxLastWriteUtc.Value
                            )
                            {
                                aepxObserved = true;
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    warnings.Add($"Suite could not verify '{aepxPath}': {DescribeException(ex)}");
                }
            }

            if (!lastProjObserved)
            {
                try
                {
                    lastProjObserved = SuiteAcadeLastProjContainsTarget(context.WdpPath);
                }
                catch (Exception ex)
                {
                    warnings.Add($"Suite could not verify LastProj.fil: {DescribeException(ex)}");
                }
            }

            if (aepxObserved || lastProjObserved)
            {
                break;
            }

            Thread.Sleep(300);
        }

        return new SuiteAcadeProjectOpenVerificationResult(
            AepxObserved: aepxObserved,
            LastProjObserved: lastProjObserved
        );
    }

    private static JsonObject BuildSuiteAcadeProjectOpenFailure(
        string code,
        string message,
        SuiteAcadeProjectOpenRequest request,
        List<string> warnings,
        bool acadeLaunched,
        bool projectActivated,
        bool commandCompleted,
        bool aepxObserved,
        bool lastProjObserved,
        bool temporaryDocumentCreated,
        JsonObject meta
    )
    {
        return new JsonObject
        {
            ["success"] = false,
            ["code"] = string.IsNullOrWhiteSpace(code) ? "ACADE_PROJECT_OPEN_FAILED" : code,
            ["message"] = string.IsNullOrWhiteSpace(message)
                ? "ACADE project open failed."
                : message,
            ["data"] = BuildSuiteAcadeProjectOpenData(
                request: request,
                acadeLaunched: acadeLaunched,
                projectActivated: projectActivated,
                commandCompleted: commandCompleted,
                aepxObserved: aepxObserved,
                lastProjObserved: lastProjObserved,
                temporaryDocumentCreated: temporaryDocumentCreated
            ),
            ["meta"] = CloneJsonObject(meta),
            ["warnings"] = ToJsonArray(warnings.Distinct(StringComparer.OrdinalIgnoreCase)),
        };
    }

    private static JsonObject BuildSuiteAcadeProjectOpenData(
        SuiteAcadeProjectOpenRequest request,
        bool acadeLaunched,
        bool projectActivated,
        bool commandCompleted,
        bool aepxObserved,
        bool lastProjObserved,
        bool temporaryDocumentCreated
    )
    {
        return new JsonObject
        {
            ["wdpPath"] = request.WdpPath,
            ["acadeLaunched"] = acadeLaunched,
            ["projectActivated"] = projectActivated,
            ["temporaryDocumentCreated"] = temporaryDocumentCreated,
            ["verification"] = new JsonObject
            {
                ["commandCompleted"] = commandCompleted,
                ["aepxObserved"] = aepxObserved,
                ["lastProjObserved"] = lastProjObserved,
            },
        };
    }

    private static JsonObject BuildSuiteAcadeProjectOpenCommandMeta(
        string stage,
        SuiteAcadeProjectOpenSession session,
        SuiteAcadeProjectOpenCommandExecutionResult commandExecution
    )
    {
        return new JsonObject
        {
            ["source"] = "dotnet",
            ["providerPath"] = "dotnet+command",
            ["action"] = "suite_acade_project_open",
            ["stage"] = stage,
            ["strategy"] = string.IsNullOrWhiteSpace(commandExecution.Strategy)
                ? null
                : commandExecution.Strategy,
            ["executablePath"] = string.IsNullOrWhiteSpace(session.ExecutablePath)
                ? null
                : session.ExecutablePath,
            ["acadeLaunched"] = session.AcadeLaunched,
            ["temporaryDocumentCreated"] = session.TemporaryDocumentCreated,
            ["commandStateAvailable"] = commandExecution.CommandStateAvailable,
            ["sawActiveCommand"] = commandExecution.SawActiveCommand,
            ["lastCommandMask"] = commandExecution.LastCommandMask,
        };
    }

    private static JsonObject BuildSuiteAcadeProjectOpenMeta(
        string stage,
        SuiteAcadeProjectOpenSession session,
        SuiteAcadeProjectOpenPluginExecutionResult pluginExecution
    )
    {
        return new JsonObject
        {
            ["source"] = "dotnet",
            ["providerPath"] = string.IsNullOrWhiteSpace(pluginExecution.PluginDllPath)
                ? "dotnet"
                : "dotnet+plugin",
            ["action"] = "suite_acade_project_open",
            ["stage"] = stage,
            ["pluginDllPath"] = string.IsNullOrWhiteSpace(pluginExecution.PluginDllPath)
                ? null
                : pluginExecution.PluginDllPath,
            ["payloadPath"] = string.IsNullOrWhiteSpace(pluginExecution.PayloadPath)
                ? null
                : pluginExecution.PayloadPath,
            ["resultPath"] = string.IsNullOrWhiteSpace(pluginExecution.ResultPath)
                ? null
                : pluginExecution.ResultPath,
            ["executablePath"] = string.IsNullOrWhiteSpace(session.ExecutablePath)
                ? null
                : session.ExecutablePath,
            ["acadeLaunched"] = session.AcadeLaunched,
            ["temporaryDocumentCreated"] = session.TemporaryDocumentCreated,
            ["commandStateAvailable"] = pluginExecution.CommandStateAvailable,
            ["sawActiveCommand"] = pluginExecution.SawActiveCommand,
            ["lastCommandMask"] = pluginExecution.LastCommandMask,
        };
    }

    private static List<string> ReadJsonStringArray(JsonArray? items)
    {
        var output = new List<string>();
        if (items is null)
        {
            return output;
        }

        foreach (var item in items)
        {
            var value = item?.GetValue<string>() ?? "";
            if (!string.IsNullOrWhiteSpace(value))
            {
                output.Add(value.Trim());
            }
        }

        return output;
    }

    private static JsonObject CloneJsonObject(JsonObject? source)
    {
        return source?.DeepClone() as JsonObject ?? new JsonObject();
    }

    private static bool SuiteAcadeLastProjContainsTarget(string wdpPath)
    {
        var normalizedTarget = NormalizeSuiteAcadePathToken(wdpPath);
        foreach (var candidate in EnumerateSuiteAcadeLastProjFileCandidates())
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
            if (normalizedContent.Contains(normalizedTarget, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    private static IEnumerable<string> EnumerateSuiteAcadeLastProjFileCandidates()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var root in new[]
        {
            Environment.GetEnvironmentVariable("APPDATA"),
            Environment.GetEnvironmentVariable("USERPROFILE") is string userProfile
                ? Path.Combine(userProfile, "AppData", "Roaming")
                : "",
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

    private static string NormalizeSuiteAcadePathToken(string path)
    {
        try
        {
            path = Path.GetFullPath(path);
        }
        catch
        {
            // Keep the raw value when Path.GetFullPath fails.
        }

        return path.Replace('\\', '/').Trim().ToUpperInvariant();
    }
}
