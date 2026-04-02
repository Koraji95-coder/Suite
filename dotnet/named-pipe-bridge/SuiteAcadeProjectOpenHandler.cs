using System.Diagnostics;
using System.Runtime.InteropServices.ComTypes;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Win32;

static partial class ConduitRouteStubHandlers
{
    private const string SuiteAcadeProjectOpenPluginCommand = "SUITEACADEPROJECTOPEN";
    private const string SuiteAcadeProjectOpenPluginLispFunction = "SUITEACADEPROJECTOPENRUN";
    private const string SuiteAcadeProfileName = "<<ACADE>>";
    private const string SuiteAcadeProductCode = "ACADE";
    private const string SuiteAcadeLanguageCode = "en-US";
    private static readonly string[] SuiteAcadeExecutablePathCandidates =
    {
        @"C:\Program Files (x86)\Autodesk\AutoCAD 2026\acad.exe",
        @"C:\Program Files\Autodesk\AutoCAD Electrical 2026\acad.exe",
        @"C:\Program Files\Autodesk\AutoCAD 2026\acad.exe",
        @"C:\Program Files (x86)\Autodesk\AutoCAD 2025\acad.exe",
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
            string executablePath,
            string activeProfile = "",
            string profileSource = "",
            string sessionClassification = "",
            string sessionMode = "",
            int processId = 0,
            IntPtr windowHandle = default
        )
        {
            Application = application;
            Document = document;
            Modelspace = modelspace;
            AcadeLaunched = acadeLaunched;
            TemporaryDocumentCreated = temporaryDocumentCreated;
            ExecutablePath = executablePath ?? "";
            ActiveProfile = activeProfile ?? "";
            ProfileSource = profileSource ?? "";
            SessionClassification = sessionClassification ?? "";
            SessionMode = sessionMode ?? "";
            ProcessId = processId;
            WindowHandle = windowHandle;
        }

        public object Application { get; }
        public object Document { get; private set; }
        public object? Modelspace { get; private set; }
        public bool AcadeLaunched { get; }
        public bool TemporaryDocumentCreated { get; private set; }
        public bool TemporaryDocumentClosed { get; private set; }
        public string ExecutablePath { get; }
        public string ActiveProfile { get; }
        public string ProfileSource { get; }
        public string SessionClassification { get; }
        public string SessionMode { get; }
        public int ProcessId { get; }
        public IntPtr WindowHandle { get; }

        public void AdoptDocument(object document, object? modelspace, bool temporaryDocumentCreated)
        {
            if (document is null)
            {
                throw new ArgumentNullException(nameof(document));
            }

            ReleaseSuiteComObjectSafely(Modelspace);
            ReleaseSuiteComObjectSafely(Document);

            Document = document;
            Modelspace = modelspace;
            TemporaryDocumentCreated = TemporaryDocumentCreated || temporaryDocumentCreated;
        }

        public void MarkTemporaryDocumentClosed()
        {
            TemporaryDocumentClosed = true;
        }

        public void Dispose()
        {
            if (!OperatingSystem.IsWindows())
            {
                return;
            }

            ReleaseSuiteComObjectSafely(Modelspace);
            ReleaseSuiteComObjectSafely(Document);
            ReleaseSuiteComObjectSafely(Application);
        }
    }

    internal sealed class SuiteAcadeProjectOpenConnectResult
    {
        public SuiteAcadeProjectOpenSession? Session { get; init; }
        public string FailureCode { get; init; } = "";
        public string FailureMessage { get; init; } = "";
        public JsonObject Meta { get; init; } = new JsonObject();
    }

    internal readonly record struct SuiteAcadeRunningSessionCandidateSnapshot(
        string RotDisplayName,
        string ExecutablePath,
        string ActiveProfile,
        bool DocumentManagerAvailable,
        string ActiveDocumentPath,
        int ProcessId,
        int WindowHandle,
        string SessionClassification,
        bool ElectricalRuntimeDetected = false
    );

    private sealed class SuiteAcadeRunningSessionCandidate : IDisposable
    {
        private object? _application;

        public SuiteAcadeRunningSessionCandidate(
            object application,
            SuiteAcadeRunningSessionCandidateSnapshot snapshot
        )
        {
            _application = application ?? throw new ArgumentNullException(nameof(application));
            Snapshot = snapshot;
        }

        public SuiteAcadeRunningSessionCandidateSnapshot Snapshot { get; }

        public object? DetachApplication()
        {
            var application = _application;
            _application = null;
            return application;
        }

        public void Dispose()
        {
            if (_application is null)
            {
                return;
            }

            ReleaseSuiteComObjectSafely(_application);
            _application = null;
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
        public DateTime? PreviousLastProjLastWriteUtc { get; init; }
        public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(15);
    }

    internal readonly record struct SuiteAcadeProjectOpenVerificationResult(
        bool AepxObserved,
        bool LastProjObserved,
        bool ActiveProjectObserved = false,
        string ActiveProjectPath = ""
    );

    private readonly record struct SuiteAcadeProjectSwitchRetryCommandCandidate(
        string Strategy,
        string CommandScript
    );

    private readonly record struct SuiteAcadeProjectSwitchRetryResult(
        SuiteAcadeProjectOpenCommandExecutionResult CommandExecution,
        SuiteAcadeProjectOpenVerificationResult Verification,
        bool ProjectActivated
    );

    private readonly record struct SuiteAcadeProjectOpenObservation(
        bool AepxExists,
        DateTime? AepxLastWriteUtc,
        bool LastProjObserved,
        DateTime? LastProjLastWriteUtc
    );

    private readonly record struct SuiteAcadeDocumentContext(
        object Documents,
        object Document,
        bool TemporaryDocumentCreated
    );

    internal static Func<
        SuiteAcadeProjectOpenRequest,
        List<string>,
        SuiteAcadeProjectOpenConnectResult
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

    internal static Func<
        SuiteAcadeProjectOpenSession,
        List<string>,
        SuiteAcadeProjectOpenCommandExecutionResult
    >? SuiteAcadeProjectOpenCloseCurrentProjectHook;

    internal static void ResetSuiteAcadeProjectOpenTestHooks()
    {
        SuiteAcadeProjectOpenConnectHook = null;
        SuiteAcadeProjectOpenPluginHook = null;
        SuiteAcadeProjectOpenVerifyHook = null;
        SuiteAcadeProjectOpenBuiltInCommandHook = null;
        SuiteAcadeProjectOpenCloseCurrentProjectHook = null;
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
            var failureMeta = new JsonObject
            {
                ["source"] = "dotnet",
                ["providerPath"] = "dotnet",
                ["action"] = "suite_acade_project_open",
                ["requestId"] = request.RequestId,
                ["stage"] = "launch-acade",
            };
            MergeSuiteJsonObject(failureMeta, connectResult.Meta, overwrite: false);
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
                activeProjectObserved: false,
                activeProjectPath: "",
                temporaryDocumentCreated: false,
                temporaryDocumentClosed: false,
                meta: failureMeta
            );
        }

        using var session = connectResult.Session;
        TryActivateSuiteDocument(session.Document);
        WarnIfSuiteAcadeProfileLooksWrong(session.Application, warnings);

        BridgeLog.Info(
            $"suite_acade_project_open bridge-open-project start (request_id={request.RequestId}, acade_launched={session.AcadeLaunched}, temporary_document_created={session.TemporaryDocumentCreated})."
        );

        var commandCompleted = false;
        var projectActivated = false;
        var activeProjectObserved = false;
        var activeProjectPath = "";
        var activationFailed = false;
        var activationFailureCode = "";
        var activationFailureMessage = "";
        var verificationContext = new SuiteAcadeProjectOpenVerificationContext
        {
            RequestId = request.RequestId,
            WdpPath = request.WdpPath,
            PreviousAepxExists = preOpenObservation.AepxExists,
            PreviousAepxLastWriteUtc = preOpenObservation.AepxLastWriteUtc,
            PreviousLastProjObserved = preOpenObservation.LastProjObserved,
            PreviousLastProjLastWriteUtc = preOpenObservation.LastProjLastWriteUtc,
            Timeout = TimeSpan.FromSeconds(15),
        };
        var verification = new SuiteAcadeProjectOpenVerificationResult(
            AepxObserved: false,
            LastProjObserved: false
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
        commandCompleted = pluginExecution.CommandCompleted;
        var bridgeOpenMeta = BuildSuiteAcadeProjectOpenMeta(
            stage: "bridge-open-project",
            session: session,
            pluginExecution: pluginExecution,
            requestId: request.RequestId
        );
        MergeSuiteJsonObject(bridgeOpenMeta, connectResult.Meta, overwrite: false);
        bridgeOpenMeta["pluginAttempted"] = true;

        var pluginResult = pluginExecution.PluginResult;
        if (pluginResult is not null)
        {
            warnings.AddRange(ReadJsonStringArray(pluginResult["warnings"] as JsonArray));
            var pluginMeta = CloneJsonObject(pluginResult["meta"] as JsonObject);
            var pluginData = pluginResult["data"] as JsonObject ?? new JsonObject();
            MergeSuiteJsonObject(bridgeOpenMeta, pluginMeta, overwrite: false);

            var pluginStrategy = ReadStringValue(pluginMeta, "strategy", "");
            if (string.IsNullOrWhiteSpace(pluginStrategy))
            {
                pluginStrategy = ReadStringValue(pluginData, "strategy", "");
            }
            if (!string.IsNullOrWhiteSpace(pluginStrategy))
            {
                bridgeOpenMeta["strategy"] = pluginStrategy;
            }

            var pluginSwitchAttempted = ReadBool(pluginMeta, "switchAttempted", false);
            if (!pluginSwitchAttempted)
            {
                pluginSwitchAttempted = ReadBool(pluginData, "switchAttempted", false);
            }
            bridgeOpenMeta["switchAttempted"] = pluginSwitchAttempted;

            var pluginActiveProjectPath = ReadStringValue(pluginMeta, "activeProjectPath", "");
            if (string.IsNullOrWhiteSpace(pluginActiveProjectPath))
            {
                pluginActiveProjectPath = ReadStringValue(pluginData, "activeProjectPath", "");
            }
            if (!string.IsNullOrWhiteSpace(pluginActiveProjectPath))
            {
                activeProjectPath = pluginActiveProjectPath;
                bridgeOpenMeta["activeProjectPath"] = pluginActiveProjectPath;
            }

            activeProjectObserved = LooksLikeSameSuiteAcadeProjectPath(
                pluginActiveProjectPath,
                request.WdpPath
            );
            var pluginSuccess = pluginResult["success"]?.GetValue<bool>() ?? false;
            projectActivated =
                ReadBool(pluginData, "projectActivated", pluginSuccess)
                || activeProjectObserved;
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
            activationFailureMessage = string.IsNullOrWhiteSpace(pluginExecution.FailureMessage)
                ? "SuiteCadAuthoring did not return a result payload."
                : pluginExecution.FailureMessage;
        }

        if (!activationFailed)
        {
            BridgeLog.Info(
                $"suite_acade_project_open verify-open-project start (request_id={request.RequestId}, wdp_path={request.WdpPath}, pass=primary)."
            );

            verification = SuiteAcadeProjectOpenVerifyHook is not null
                ? SuiteAcadeProjectOpenVerifyHook(verificationContext, warnings)
                : VerifySuiteAcadeProjectOpen(verificationContext, warnings);
            if (verification.AepxObserved || verification.LastProjObserved || verification.ActiveProjectObserved)
            {
                projectActivated = true;
                activeProjectObserved = activeProjectObserved || verification.ActiveProjectObserved;
                if (!string.IsNullOrWhiteSpace(verification.ActiveProjectPath))
                {
                    activeProjectPath = verification.ActiveProjectPath;
                }
            }
        }

        var commandExecution = new SuiteAcadeProjectOpenCommandExecutionResult();
        if (activationFailed || !projectActivated)
        {
            warnings.Add(
                activationFailed
                    ? $"SuiteCadAuthoring project open failed ({activationFailureCode}); trying the built-in ACADE command fallback."
                    : "SuiteCadAuthoring completed without a verified project switch; trying the built-in ACADE command fallback."
            );
            bridgeOpenMeta["fallbackAttempted"] = true;
            bridgeOpenMeta["fallbackProviderPath"] = "dotnet+command";

            var fallbackVerified = false;
            if (SuiteAcadeProjectOpenBuiltInCommandHook is not null)
            {
                commandExecution = SuiteAcadeProjectOpenBuiltInCommandHook(request, session, warnings);
            }
            else
            {
                TryWarmSuiteAcadeProjectFunctions(session, warnings);
                var fallbackOpenResult = ExecuteSuiteAcadeProjectOpenCommandCandidates(
                    request,
                    session,
                    verificationContext,
                    warnings,
                    BuildSuiteAcadeProjectOpenCommandCandidates(request.WdpPath)
                );
                commandExecution = fallbackOpenResult.CommandExecution;
                verification = fallbackOpenResult.Verification;
                fallbackVerified = fallbackOpenResult.ProjectActivated;
            }

            commandCompleted = commandCompleted || commandExecution.CommandCompleted;
            bridgeOpenMeta["fallbackCommandCompleted"] = commandExecution.CommandCompleted;
            bridgeOpenMeta["fallbackCommandStateAvailable"] = commandExecution.CommandStateAvailable;
            bridgeOpenMeta["fallbackSawActiveCommand"] = commandExecution.SawActiveCommand;
            bridgeOpenMeta["fallbackLastCommandMask"] = commandExecution.LastCommandMask;
            if (!string.IsNullOrWhiteSpace(commandExecution.Strategy))
            {
                bridgeOpenMeta["fallbackStrategy"] = commandExecution.Strategy;
            }

            activationFailed = !string.IsNullOrWhiteSpace(commandExecution.FailureCode);
            activationFailureCode = (commandExecution.FailureCode ?? "").Trim();
            activationFailureMessage = (commandExecution.FailureMessage ?? "").Trim();
            if (!activationFailed)
            {
                if (!fallbackVerified)
                {
                    BridgeLog.Info(
                        $"suite_acade_project_open verify-open-project start (request_id={request.RequestId}, wdp_path={request.WdpPath}, pass=fallback-primary)."
                    );

                    verification = SuiteAcadeProjectOpenVerifyHook is not null
                        ? SuiteAcadeProjectOpenVerifyHook(verificationContext, warnings)
                        : VerifySuiteAcadeProjectOpen(verificationContext, warnings);
                    fallbackVerified =
                        verification.AepxObserved
                        || verification.LastProjObserved
                        || verification.ActiveProjectObserved;
                }

                if (fallbackVerified)
                {
                    projectActivated = true;
                    activeProjectObserved = activeProjectObserved || verification.ActiveProjectObserved;
                    if (!string.IsNullOrWhiteSpace(verification.ActiveProjectPath))
                    {
                        activeProjectPath = verification.ActiveProjectPath;
                    }
                }
            }

            if (!activationFailed && !projectActivated)
            {
                BridgeLog.Info(
                    $"suite_acade_project_open switch-retry start (request_id={request.RequestId}, wdp_path={request.WdpPath})."
                );
                bridgeOpenMeta["switchRetryAttempted"] = true;

                var switchRetryWarningsBefore = warnings.Count;
                var switchRetryCloseExecution = TryPrepareSuiteAcadeProjectSwitchRetry(session, warnings);
                commandCompleted = commandCompleted || switchRetryCloseExecution.CommandCompleted;
                bridgeOpenMeta["switchRetryCloseStrategy"] = switchRetryCloseExecution.Strategy;
                bridgeOpenMeta["switchRetryCloseCommandCompleted"] = switchRetryCloseExecution.CommandCompleted;
                bridgeOpenMeta["switchRetryCloseCommandStateAvailable"] =
                    switchRetryCloseExecution.CommandStateAvailable;
                bridgeOpenMeta["switchRetryCloseSawActiveCommand"] = switchRetryCloseExecution.SawActiveCommand;
                bridgeOpenMeta["switchRetryCloseLastCommandMask"] = switchRetryCloseExecution.LastCommandMask;

                if (!string.IsNullOrWhiteSpace(switchRetryCloseExecution.FailureCode))
                {
                    bridgeOpenMeta["switchRetryCloseFailureCode"] = switchRetryCloseExecution.FailureCode;
                    bridgeOpenMeta["switchRetryCloseFailureMessage"] =
                        switchRetryCloseExecution.FailureMessage;
                    warnings.Add(
                        $"Close-and-reopen switch retry could not close the current active ACADE project: {switchRetryCloseExecution.FailureMessage}"
                    );
                }
                else
                {
                    var switchRetryOpenExecution = new SuiteAcadeProjectOpenCommandExecutionResult();
                    var switchRetryVerified = false;
                    if (SuiteAcadeProjectOpenBuiltInCommandHook is not null)
                    {
                        switchRetryOpenExecution = SuiteAcadeProjectOpenBuiltInCommandHook(
                            request,
                            session,
                            warnings
                        );
                    }
                    else
                    {
                        var switchRetryResult = ExecuteSuiteAcadeProjectSwitchRetryOpen(
                            request,
                            session,
                            verificationContext,
                            warnings
                        );
                        switchRetryOpenExecution = switchRetryResult.CommandExecution;
                        verification = switchRetryResult.Verification;
                        switchRetryVerified = switchRetryResult.ProjectActivated;
                    }
                    commandExecution = switchRetryOpenExecution;
                    commandCompleted = commandCompleted || switchRetryOpenExecution.CommandCompleted;
                    bridgeOpenMeta["switchRetryOpenStrategy"] = switchRetryOpenExecution.Strategy;
                    bridgeOpenMeta["switchRetryOpenCommandCompleted"] = switchRetryOpenExecution.CommandCompleted;
                    bridgeOpenMeta["switchRetryOpenCommandStateAvailable"] =
                        switchRetryOpenExecution.CommandStateAvailable;
                    bridgeOpenMeta["switchRetryOpenSawActiveCommand"] = switchRetryOpenExecution.SawActiveCommand;
                    bridgeOpenMeta["switchRetryOpenLastCommandMask"] = switchRetryOpenExecution.LastCommandMask;

                    if (!string.IsNullOrWhiteSpace(switchRetryOpenExecution.FailureCode))
                    {
                        bridgeOpenMeta["switchRetryOpenFailureCode"] =
                            switchRetryOpenExecution.FailureCode;
                        bridgeOpenMeta["switchRetryOpenFailureMessage"] =
                            switchRetryOpenExecution.FailureMessage;
                        warnings.Add(
                            $"Close-and-reopen switch retry failed to open the requested ACADE project: {switchRetryOpenExecution.FailureMessage}"
                        );
                    }
                    else
                    {
                        if (!switchRetryVerified)
                        {
                            BridgeLog.Info(
                                $"suite_acade_project_open verify-open-project start (request_id={request.RequestId}, wdp_path={request.WdpPath}, pass=switch-retry)."
                            );

                            verification = SuiteAcadeProjectOpenVerifyHook is not null
                                ? SuiteAcadeProjectOpenVerifyHook(verificationContext, warnings)
                                : VerifySuiteAcadeProjectOpen(verificationContext, warnings);
                            switchRetryVerified =
                                verification.AepxObserved
                                || verification.LastProjObserved
                                || verification.ActiveProjectObserved;
                        }

                        if (switchRetryVerified)
                        {
                            projectActivated = true;
                            activeProjectObserved =
                                activeProjectObserved || verification.ActiveProjectObserved;
                            if (!string.IsNullOrWhiteSpace(verification.ActiveProjectPath))
                            {
                                activeProjectPath = verification.ActiveProjectPath;
                            }
                            bridgeOpenMeta["switchRetrySucceeded"] = true;
                        }
                    }
                }

                if (!projectActivated && warnings.Count == switchRetryWarningsBefore)
                {
                    warnings.Add(
                        "Close-and-reopen switch retry did not produce a verified ACADE project switch."
                    );
                }
            }

            if (projectActivated)
            {
                activationFailed = false;
                activationFailureCode = "";
                activationFailureMessage = "";
                bridgeOpenMeta["providerPath"] = "dotnet+command";
                if (!string.IsNullOrWhiteSpace(commandExecution.Strategy))
                {
                    bridgeOpenMeta["strategy"] = commandExecution.Strategy;
                }
            }
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
                activeProjectObserved: activeProjectObserved,
                activeProjectPath: activeProjectPath,
                temporaryDocumentCreated: session.TemporaryDocumentCreated,
                temporaryDocumentClosed: session.TemporaryDocumentClosed,
                meta: bridgeOpenMeta
            );
        }

        activeProjectObserved = activeProjectObserved || verification.ActiveProjectObserved;
        if (!string.IsNullOrWhiteSpace(verification.ActiveProjectPath))
        {
            activeProjectPath = verification.ActiveProjectPath;
        }
        if (!projectActivated && (verification.AepxObserved || verification.LastProjObserved || activeProjectObserved))
        {
            projectActivated = true;
        }
        if (!string.IsNullOrWhiteSpace(activeProjectPath))
        {
            bridgeOpenMeta["activeProjectPath"] = activeProjectPath;
        }
        bridgeOpenMeta["activeProjectObserved"] = activeProjectObserved;
        bridgeOpenMeta["source"] = "dotnet";
        bridgeOpenMeta["action"] = "suite_acade_project_open";
        bridgeOpenMeta["stage"] = "verify-open-project";

        if (projectActivated)
        {
            TryCloseSuiteAcadeTemporaryDocumentIfSafe(session, warnings);
            _ = TryBringSuiteAcadeWindowToForeground(session);
        }
        bridgeOpenMeta["temporaryDocumentClosed"] = session.TemporaryDocumentClosed;

        var resultData = BuildSuiteAcadeProjectOpenData(
            request: request,
            acadeLaunched: session.AcadeLaunched,
            projectActivated: projectActivated,
            commandCompleted: commandCompleted,
            aepxObserved: verification.AepxObserved,
            lastProjObserved: verification.LastProjObserved,
            activeProjectObserved: activeProjectObserved,
            activeProjectPath: activeProjectPath,
            temporaryDocumentCreated: session.TemporaryDocumentCreated,
            temporaryDocumentClosed: session.TemporaryDocumentClosed
        );
        if (!projectActivated || !(verification.AepxObserved || verification.LastProjObserved || activeProjectObserved))
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

    private static SuiteAcadeProjectOpenConnectResult AcquireSuiteAcadeProjectOpenSession(
        SuiteAcadeProjectOpenRequest request,
        List<string> warnings
    )
    {
        if (!OperatingSystem.IsWindows())
        {
            return new SuiteAcadeProjectOpenConnectResult
            {
                FailureCode = "AUTOCAD_NOT_AVAILABLE",
                FailureMessage = "AutoCAD project activation is only available on Windows.",
            };
        }

        var expectedProfileName = ResolveSuiteAcadeProfileName(out var profileSource);
        var runningCandidates = EnumerateSuiteAcadeRunningSessionCandidates(
            expectedProfileName,
            warnings
        );
        var selectedRunningCandidate = TakeBestSuiteAcadeRunningSessionCandidate(
            runningCandidates,
            request,
            expectedProfileName,
            out var hasElectricalNotReadySession,
            out var hasVanillaSession
        );

        if (selectedRunningCandidate is not null)
        {
            var reusedResult = CreateSuiteAcadeProjectOpenConnectResultFromCandidate(
                request,
                selectedRunningCandidate,
                acadeLaunched: false,
                profileSource: "application",
                warnings: warnings,
                connectMeta: new JsonObject
                {
                    ["expectedProfileName"] = expectedProfileName,
                    ["profileSource"] = profileSource,
                    ["sessionMode"] = "reused-electrical",
                }
            );
            if (
                reusedResult.Session is not null
                || !request.LaunchIfNeeded
                || !string.Equals(
                    reusedResult.FailureCode,
                    "AUTOCAD_ELECTRICAL_NOT_READY",
                    StringComparison.OrdinalIgnoreCase
                )
            )
            {
                return reusedResult;
            }

            warnings.Add(
                "The running AutoCAD Electrical session did not provide a usable drawing context; launching a dedicated ACADe session instead."
            );
        }

        if (!request.LaunchIfNeeded)
        {
            return new SuiteAcadeProjectOpenConnectResult
            {
                FailureCode = hasElectricalNotReadySession
                    ? "AUTOCAD_ELECTRICAL_NOT_READY"
                    : "AUTOCAD_ELECTRICAL_NOT_AVAILABLE",
                FailureMessage = hasElectricalNotReadySession
                    ? $"AutoCAD Electrical is running, but the '{expectedProfileName}' profile is not ready for project activation."
                    : $"AutoCAD Electrical is not running under the '{expectedProfileName}' profile.",
                Meta = new JsonObject
                {
                    ["expectedProfileName"] = expectedProfileName,
                    ["profileSource"] = profileSource,
                    ["sessionMode"] = "reused-electrical",
                    ["sessionClassification"] = hasElectricalNotReadySession
                        ? "electrical-not-ready"
                        : hasVanillaSession
                            ? "vanilla"
                            : "missing",
                },
            };
        }

        var executablePath = ResolveSuiteAcadeExecutablePath();
        var launchTemplatePath = ResolveSuiteAcadeLaunchTemplatePath();
        if (string.IsNullOrWhiteSpace(executablePath))
        {
            return new SuiteAcadeProjectOpenConnectResult
            {
                FailureCode = "AUTOCAD_LAUNCH_FAILED",
                FailureMessage = "Unable to locate acad.exe for AutoCAD Electrical.",
                Meta = new JsonObject
                {
                    ["expectedProfileName"] = expectedProfileName,
                    ["profileSource"] = profileSource,
                    ["sessionMode"] = "launched-dedicated-electrical",
                    ["templatePath"] = string.IsNullOrWhiteSpace(launchTemplatePath)
                        ? null
                        : launchTemplatePath,
                },
            };
        }

        var preLaunchAcadProcessIds = CaptureSuiteAcadProcessIds();
        Process? launchedProcess = null;
        try
        {
            launchedProcess = Process.Start(
                new ProcessStartInfo
                {
                    FileName = executablePath,
                    Arguments = BuildSuiteAcadeLaunchArguments(
                        expectedProfileName,
                        launchTemplatePath
                    ),
                    UseShellExecute = true,
                    WorkingDirectory = Path.GetDirectoryName(executablePath) ?? "",
                }
            );
        }
        catch (Exception ex)
        {
            return new SuiteAcadeProjectOpenConnectResult
            {
                FailureCode = "AUTOCAD_LAUNCH_FAILED",
                FailureMessage =
                    $"Failed to launch AutoCAD from '{executablePath}': {DescribeException(ex)}",
                Meta = new JsonObject
                {
                    ["expectedProfileName"] = expectedProfileName,
                    ["profileSource"] = profileSource,
                    ["sessionMode"] = "launched-dedicated-electrical",
                    ["executablePath"] = executablePath,
                    ["templatePath"] = string.IsNullOrWhiteSpace(launchTemplatePath)
                        ? null
                        : launchTemplatePath,
                },
            };
        }

        if (launchedProcess is null)
        {
            return new SuiteAcadeProjectOpenConnectResult
            {
                FailureCode = "AUTOCAD_LAUNCH_FAILED",
                FailureMessage = $"Failed to start AutoCAD from '{executablePath}'.",
                Meta = new JsonObject
                {
                    ["expectedProfileName"] = expectedProfileName,
                    ["profileSource"] = profileSource,
                    ["sessionMode"] = "launched-dedicated-electrical",
                    ["executablePath"] = executablePath,
                    ["templatePath"] = string.IsNullOrWhiteSpace(launchTemplatePath)
                        ? null
                        : launchTemplatePath,
                },
            };
        }

        var launchedProcessId = launchedProcess.Id;
        var launchMeta = new JsonObject
        {
            ["expectedProfileName"] = expectedProfileName,
            ["profileSource"] = profileSource,
            ["sessionMode"] = "launched-dedicated-electrical",
            ["executablePath"] = executablePath,
            ["templatePath"] = string.IsNullOrWhiteSpace(launchTemplatePath)
                ? null
                : launchTemplatePath,
            ["launchedProcessId"] = launchedProcessId,
        };
        var launchedCandidate = WaitForSuiteAcadeLaunchedSessionCandidate(
            request,
            expectedProfileName,
            preLaunchAcadProcessIds,
            launchedProcessId,
            warnings,
            launchMeta,
            out var launchTimeoutStage
        );

        if (launchedCandidate is null)
        {
            launchMeta["launchTimeoutStage"] = launchTimeoutStage;
            return new SuiteAcadeProjectOpenConnectResult
            {
                FailureCode = "AUTOCAD_LAUNCH_TIMEOUT",
                FailureMessage =
                    $"Timed out waiting for AutoCAD Electrical to become ready after launching '{executablePath}'.",
                Meta = launchMeta,
            };
        }

        return CreateSuiteAcadeProjectOpenConnectResultFromCandidate(
            request,
            launchedCandidate,
            acadeLaunched: true,
            profileSource: profileSource,
            warnings: warnings,
            connectMeta: launchMeta
        );
    }

    private static SuiteAcadeProjectOpenConnectResult CreateSuiteAcadeProjectOpenConnectResultFromCandidate(
        SuiteAcadeProjectOpenRequest request,
        SuiteAcadeRunningSessionCandidate candidate,
        bool acadeLaunched,
        string profileSource,
        List<string> warnings,
        JsonObject connectMeta
    )
    {
        using (candidate)
        {
            connectMeta["electricalRuntimeDetected"] = candidate.Snapshot.ElectricalRuntimeDetected;
            var application = candidate.DetachApplication();
            if (application is null)
            {
                return new SuiteAcadeProjectOpenConnectResult
                {
                    FailureCode = "AUTOCAD_ELECTRICAL_NOT_AVAILABLE",
                    FailureMessage =
                        "Suite selected an AutoCAD Electrical session, but the COM application was unavailable.",
                    Meta = connectMeta,
                };
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
                warnings.Add(
                    $"AutoCAD launched, but Suite could not force the UI visible: {DescribeException(ex)}"
                );
            }

            try
            {
                var documentContextTimeout = acadeLaunched
                    ? TimeSpan.FromSeconds(90)
                    : TimeSpan.FromSeconds(20);
                var documentContext = WaitForSuiteAcadeDocumentContext(
                    application,
                    documentContextTimeout,
                    warnings
                );
                if (
                    documentContext is null
                    && TryReconnectSuiteAcadeDocumentContextViaRot(
                        candidate.Snapshot,
                        ref application,
                        documentContextTimeout,
                        warnings,
                        out var reconnectedDocumentContext
                    )
                )
                {
                    documentContext = reconnectedDocumentContext;
                }
                if (documentContext is null)
                {
                    ReleaseSuiteComObjectSafely(application);
                    return new SuiteAcadeProjectOpenConnectResult
                    {
                        FailureCode = "AUTOCAD_ELECTRICAL_NOT_READY",
                        FailureMessage =
                            "AutoCAD Electrical did not provide a document context for project activation.",
                        Meta = connectMeta,
                    };
                }

                var modelspace = ReadProperty(documentContext.Value.Document, "ModelSpace");
                return new SuiteAcadeProjectOpenConnectResult
                {
                    Session = new SuiteAcadeProjectOpenSession(
                        application: application,
                        document: documentContext.Value.Document,
                        modelspace: modelspace,
                        acadeLaunched: acadeLaunched,
                        temporaryDocumentCreated: documentContext.Value.TemporaryDocumentCreated,
                        executablePath: candidate.Snapshot.ExecutablePath,
                        activeProfile: candidate.Snapshot.ActiveProfile,
                        profileSource: profileSource,
                        sessionClassification: candidate.Snapshot.SessionClassification,
                        sessionMode: acadeLaunched
                            ? "launched-dedicated-electrical"
                            : "reused-electrical",
                        processId: candidate.Snapshot.ProcessId,
                        windowHandle: new IntPtr(candidate.Snapshot.WindowHandle)
                    ),
                    Meta = connectMeta,
                };
            }
            catch (Exception ex)
            {
                ReleaseSuiteComObjectSafely(application);
                return new SuiteAcadeProjectOpenConnectResult
                {
                    FailureCode = "AUTOCAD_ELECTRICAL_NOT_READY",
                    FailureMessage =
                        $"Failed to establish an AutoCAD document context: {DescribeException(ex)}",
                    Meta = connectMeta,
                };
            }
        }
    }

    private static bool TryReconnectSuiteAcadeDocumentContextViaRot(
        SuiteAcadeRunningSessionCandidateSnapshot snapshot,
        ref object application,
        TimeSpan timeout,
        List<string> warnings,
        out SuiteAcadeDocumentContext? documentContext
    )
    {
        documentContext = null;
        if (snapshot.WindowHandle <= 0)
        {
            return false;
        }

        try
        {
            var windowHandle = new IntPtr(snapshot.WindowHandle);
            ShowWindowAsync(windowHandle, SuiteShowWindowRestore);
            SetForegroundWindow(windowHandle);
            Thread.Sleep(750);
        }
        catch
        {
            // Best effort only.
        }

        var candidates = EnumerateSuiteAcadeRunningSessionCandidates(snapshot.ActiveProfile, warnings);
        SuiteAcadeRunningSessionCandidate? matchedCandidate = null;
        foreach (var candidate in candidates)
        {
            if (
                matchedCandidate is null
                && IsSameSuiteAcadeRunningSessionCandidateSnapshot(candidate.Snapshot, snapshot)
            )
            {
                matchedCandidate = candidate;
                continue;
            }

            candidate.Dispose();
        }

        if (matchedCandidate is not null)
        {
            var activeApplication = matchedCandidate.DetachApplication();
            matchedCandidate.Dispose();
            if (activeApplication is not null)
            {
                try
                {
                    var activeProfile = ReadSuiteAcadeActiveProfile(activeApplication);
                    if (IsSuiteAcadeProfileMatch(activeProfile, snapshot.ActiveProfile))
                    {
                        var reconnectedDocumentContext = WaitForSuiteAcadeDocumentContext(
                            activeApplication,
                            timeout,
                            warnings
                        );
                        if (reconnectedDocumentContext is not null)
                        {
                            ReleaseSuiteComObjectSafely(application);
                            application = activeApplication;
                            documentContext = reconnectedDocumentContext;
                            return true;
                        }
                    }
                }
                catch
                {
                    // Fall through to verified active-object recovery.
                }

                ReleaseSuiteComObjectSafely(activeApplication);
            }
        }

        if (
            !TryReconnectSuiteAcadeDocumentContextViaVerifiedActiveObject(
                snapshot,
                timeout,
                warnings,
                out var verifiedApplication,
                out var verifiedDocumentContext
            )
        )
        {
            return false;
        }

        ReleaseSuiteComObjectSafely(application);
        application = verifiedApplication!;
        documentContext = verifiedDocumentContext;
        return true;
    }

    private static bool IsSameSuiteAcadeRunningSessionCandidateSnapshot(
        SuiteAcadeRunningSessionCandidateSnapshot left,
        SuiteAcadeRunningSessionCandidateSnapshot right
    )
    {
        if (left.ProcessId > 0 && right.ProcessId > 0)
        {
            return left.ProcessId == right.ProcessId;
        }

        if (left.WindowHandle > 0 && right.WindowHandle > 0)
        {
            return left.WindowHandle == right.WindowHandle;
        }

        return string.Equals(
            (left.RotDisplayName ?? "").Trim(),
            (right.RotDisplayName ?? "").Trim(),
            StringComparison.OrdinalIgnoreCase
        );
    }

    private static bool TryReconnectSuiteAcadeDocumentContextViaVerifiedActiveObject(
        SuiteAcadeRunningSessionCandidateSnapshot snapshot,
        TimeSpan timeout,
        List<string> warnings,
        out object? application,
        out SuiteAcadeDocumentContext? documentContext
    )
    {
        application = null;
        documentContext = null;
        if (!TryFindRunningAutoCadApplication(out var activeApplication, out _))
        {
            return false;
        }

        if (activeApplication is null)
        {
            return false;
        }

        try
        {
            if (!IsSameSuiteAcadeApplicationIdentity(activeApplication, snapshot))
            {
                return false;
            }

            var activeProfile = ReadSuiteAcadeActiveProfile(activeApplication);
            if (!IsSuiteAcadeProfileMatch(activeProfile, snapshot.ActiveProfile))
            {
                return false;
            }

            var reconnectedDocumentContext = WaitForSuiteAcadeDocumentContext(
                activeApplication,
                timeout,
                warnings
            );
            if (reconnectedDocumentContext is null)
            {
                return false;
            }

            application = activeApplication;
            documentContext = reconnectedDocumentContext;
            activeApplication = null;
            return true;
        }
        finally
        {
            ReleaseSuiteComObjectSafely(activeApplication);
        }
    }

    private static bool IsSameSuiteAcadeApplicationIdentity(
        object application,
        SuiteAcadeRunningSessionCandidateSnapshot snapshot
    )
    {
        try
        {
            var hwnd = SafeInt(ReadProperty(application, "HWND")) ?? 0;
            var processId = hwnd > 0 ? TryGetSuiteCadProcessId(new IntPtr(hwnd)) : 0;
            var candidateSnapshot = new SuiteAcadeRunningSessionCandidateSnapshot(
                RotDisplayName: "",
                ExecutablePath: NormalizeSuiteExecutablePath(
                    Convert.ToString(ReadProperty(application, "FullName")) ?? ""
                ),
                ActiveProfile: ReadSuiteAcadeActiveProfile(application),
                DocumentManagerAvailable: TrySuiteAcadeHasDocumentsCollection(application),
                ActiveDocumentPath: ReadSuiteAcadeActiveDocumentPath(application),
                ProcessId: processId,
                WindowHandle: hwnd,
                SessionClassification: "",
                ElectricalRuntimeDetected: DetectSuiteAcadeRuntime(processId, "")
            );
            return IsSameSuiteAcadeRunningSessionCandidateSnapshot(candidateSnapshot, snapshot);
        }
        catch
        {
            return false;
        }
    }

    private static List<SuiteAcadeRunningSessionCandidate> EnumerateSuiteAcadeRunningSessionCandidates(
        string expectedProfileName,
        List<string> warnings
    )
    {
        var output = new List<SuiteAcadeRunningSessionCandidate>();
        if (!OperatingSystem.IsWindows())
        {
            return output;
        }

        IRunningObjectTable? runningObjectTable = null;
        IEnumMoniker? enumMoniker = null;
        try
        {
            if (GetRunningObjectTable(0, out runningObjectTable) != 0 || runningObjectTable is null)
            {
                return output;
            }

            runningObjectTable.EnumRunning(out enumMoniker);
            if (enumMoniker is null)
            {
                return output;
            }

            var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var monikers = new IMoniker[1];
            while (enumMoniker.Next(1, monikers, IntPtr.Zero) == 0)
            {
                var moniker = monikers[0];
                monikers[0] = null!;
                if (moniker is null)
                {
                    continue;
                }

                IBindCtx? bindContext = null;
                object? application = null;
                try
                {
                    CreateBindCtx(0, out bindContext);
                    string rotDisplayName = "";
                    try
                    {
                        moniker.GetDisplayName(bindContext, null, out rotDisplayName);
                    }
                    catch
                    {
                        rotDisplayName = "";
                    }

                    runningObjectTable.GetObject(moniker, out application);
                    if (application is null)
                    {
                        continue;
                    }

                    if (
                        !TryCreateSuiteAcadeRunningSessionCandidate(
                            application,
                            rotDisplayName,
                            expectedProfileName,
                            out var candidate
                        )
                    )
                    {
                        ReleaseSuiteComObjectSafely(application);
                        application = null;
                        continue;
                    }

                    var snapshot = candidate.Snapshot;
                    var dedupeKey = snapshot.ProcessId > 0
                        ? $"pid:{snapshot.ProcessId}"
                        : snapshot.WindowHandle > 0
                            ? $"hwnd:{snapshot.WindowHandle}"
                            : $"rot:{snapshot.RotDisplayName}";
                    if (!seenKeys.Add(dedupeKey))
                    {
                        candidate.Dispose();
                        continue;
                    }

                    output.Add(candidate);
                    application = null;
                }
                catch (Exception ex)
                {
                    if (warnings.Count < 8)
                    {
                        warnings.Add(
                            $"Suite skipped one running AutoCAD COM object while discovering ACADE sessions: {DescribeException(ex)}"
                        );
                    }
                }
                finally
                {
                    ReleaseSuiteComObjectSafely(application);
                    ReleaseSuiteComObjectSafely(bindContext);
                    ReleaseSuiteComObjectSafely(moniker);
                }
            }
        }
        catch (Exception ex)
        {
            warnings.Add(
                $"Suite could not enumerate running AutoCAD COM sessions from the ROT: {DescribeException(ex)}"
            );
        }
        finally
        {
            ReleaseSuiteComObjectSafely(enumMoniker);
            ReleaseSuiteComObjectSafely(runningObjectTable);
        }

        return output;
    }

    private static bool TryCreateSuiteAcadeRunningSessionCandidate(
        object application,
        string rotDisplayName,
        string expectedProfileName,
        out SuiteAcadeRunningSessionCandidate candidate
    )
    {
        candidate = null!;
        var executablePath = NormalizeSuiteExecutablePath(
            Convert.ToString(ReadProperty(application, "FullName")) ?? ""
        );
        var hwnd = SafeInt(ReadProperty(application, "HWND")) ?? 0;
        var processId = hwnd > 0 ? TryGetSuiteCadProcessId(new IntPtr(hwnd)) : 0;
        if (string.IsNullOrWhiteSpace(executablePath) && processId > 0)
        {
            executablePath = NormalizeSuiteExecutablePath(TryReadSuiteCadProcessPath(processId));
        }

        if (!LooksLikeSuiteAutoCadExecutablePath(executablePath))
        {
            return false;
        }

        var activeProfile = ReadSuiteAcadeActiveProfile(application);
        var activeDocumentPath = ReadSuiteAcadeActiveDocumentPath(application);
        var documentsAvailable = TrySuiteAcadeHasDocumentsCollection(application);
        var electricalRuntimeDetected = DetectSuiteAcadeRuntime(processId, executablePath);
        var sessionClassification = ClassifySuiteAcadeRunningSessionCandidate(
            activeProfile,
            documentsAvailable,
            expectedProfileName
        );
        if (
            string.Equals(
                sessionClassification,
                "electrical-ready",
                StringComparison.OrdinalIgnoreCase
            )
            && !electricalRuntimeDetected
            && !LooksLikeSuiteAcadeInstallPath(executablePath)
        )
        {
            sessionClassification = "electrical-not-ready";
        }

        var snapshot = new SuiteAcadeRunningSessionCandidateSnapshot(
            RotDisplayName: rotDisplayName ?? "",
            ExecutablePath: executablePath,
            ActiveProfile: activeProfile,
            DocumentManagerAvailable: documentsAvailable,
            ActiveDocumentPath: activeDocumentPath,
            ProcessId: processId,
            WindowHandle: hwnd,
            SessionClassification: sessionClassification,
            ElectricalRuntimeDetected: electricalRuntimeDetected
        );
        candidate = new SuiteAcadeRunningSessionCandidate(application, snapshot);
        return true;
    }

    internal static string ClassifySuiteAcadeRunningSessionCandidate(
        string activeProfile,
        bool documentManagerAvailable,
        string expectedProfileName
    )
    {
        if (!IsSuiteAcadeProfileMatch(activeProfile, expectedProfileName))
        {
            return "vanilla";
        }

        return documentManagerAvailable ? "electrical-ready" : "electrical-not-ready";
    }

    internal static SuiteAcadeRunningSessionCandidateSnapshot? SelectBestSuiteAcadeRunningSessionCandidate(
        IEnumerable<SuiteAcadeRunningSessionCandidateSnapshot> candidates,
        SuiteAcadeProjectOpenRequest request,
        string expectedProfileName
    )
    {
        var orderedCandidates = candidates
            .Where(
                candidate =>
                    string.Equals(
                        candidate.SessionClassification,
                        "electrical-ready",
                        StringComparison.OrdinalIgnoreCase
                    )
                    && IsSuiteAcadeProfileMatch(candidate.ActiveProfile, expectedProfileName)
            )
            .OrderBy(candidate => GetSuiteAcadeRunningSessionCandidatePreference(candidate, request))
            .ThenBy(candidate => candidate.ProcessId > 0 ? candidate.ProcessId : int.MaxValue)
            .ToList();
        return orderedCandidates.Count == 0 ? null : orderedCandidates[0];
    }

    private static SuiteAcadeRunningSessionCandidate? TakeBestSuiteAcadeRunningSessionCandidate(
        List<SuiteAcadeRunningSessionCandidate> candidates,
        SuiteAcadeProjectOpenRequest request,
        string expectedProfileName,
        out bool hasElectricalNotReadySession,
        out bool hasVanillaSession
    )
    {
        hasElectricalNotReadySession = candidates.Any(
            candidate =>
                string.Equals(
                    candidate.Snapshot.SessionClassification,
                    "electrical-not-ready",
                    StringComparison.OrdinalIgnoreCase
                )
        );
        hasVanillaSession = candidates.Any(
            candidate =>
                string.Equals(
                    candidate.Snapshot.SessionClassification,
                    "vanilla",
                    StringComparison.OrdinalIgnoreCase
                )
        );

        var selectedSnapshot = SelectBestSuiteAcadeRunningSessionCandidate(
            candidates.Select(candidate => candidate.Snapshot),
            request,
            expectedProfileName
        );
        SuiteAcadeRunningSessionCandidate? selectedCandidate = null;
        foreach (var candidate in candidates)
        {
            if (selectedCandidate is null && selectedSnapshot.HasValue && candidate.Snapshot.Equals(selectedSnapshot.Value))
            {
                selectedCandidate = candidate;
                continue;
            }

            candidate.Dispose();
        }

        return selectedCandidate;
    }

    private static SuiteAcadeRunningSessionCandidate? WaitForSuiteAcadeLaunchedSessionCandidate(
        SuiteAcadeProjectOpenRequest request,
        string expectedProfileName,
        HashSet<int> preLaunchAcadProcessIds,
        int launchedProcessId,
        List<string> warnings,
        JsonObject connectMeta,
        out string launchTimeoutStage
    )
    {
        launchTimeoutStage = "process-start";
        var deadlineUtc = DateTime.UtcNow.AddSeconds(90);
        var targetProcessId = launchedProcessId;

        while (DateTime.UtcNow <= deadlineUtc)
        {
            if (targetProcessId <= 0)
            {
                targetProcessId = FindNewSuiteAcadProcessId(preLaunchAcadProcessIds);
                if (targetProcessId > 0)
                {
                    connectMeta["launchedProcessId"] = targetProcessId;
                }
            }

            if (targetProcessId > 0)
            {
                launchTimeoutStage = "rot-candidate";
            }

            var candidates = EnumerateSuiteAcadeRunningSessionCandidates(expectedProfileName, warnings);
            var targetCandidates = candidates
                .Where(
                    candidate =>
                        candidate.Snapshot.ProcessId == targetProcessId
                        || (
                            targetProcessId <= 0
                            && candidate.Snapshot.ProcessId > 0
                            && !preLaunchAcadProcessIds.Contains(candidate.Snapshot.ProcessId)
                        )
                )
                .ToList();

            if (targetCandidates.Count > 0)
            {
                var selectedCandidate = TakeBestSuiteAcadeRunningSessionCandidate(
                    targetCandidates,
                    request,
                    expectedProfileName,
                    out _,
                    out _
                );
                foreach (var candidate in candidates.Except(targetCandidates))
                {
                    candidate.Dispose();
                }

                if (selectedCandidate is not null)
                {
                    return selectedCandidate;
                }

                launchTimeoutStage = targetCandidates.Any(
                    candidate =>
                        IsSuiteAcadeProfileMatch(
                            candidate.Snapshot.ActiveProfile,
                            expectedProfileName
                        )
                )
                    ? "document-context"
                    : "profile-readiness";

                foreach (var candidate in targetCandidates)
                {
                    candidate.Dispose();
                }
            }
            else
            {
                foreach (var candidate in candidates)
                {
                    candidate.Dispose();
                }
            }

            Thread.Sleep(1000);
        }

        return null;
    }

    private static HashSet<int> CaptureSuiteAcadProcessIds()
    {
        try
        {
            return Process
                .GetProcessesByName("acad")
                .Select(process => process.Id)
                .ToHashSet();
        }
        catch
        {
            return new HashSet<int>();
        }
    }

    private static int FindNewSuiteAcadProcessId(HashSet<int> preLaunchAcadProcessIds)
    {
        try
        {
            return Process
                .GetProcessesByName("acad")
                .OrderByDescending(process => process.StartTime)
                .FirstOrDefault(process => !preLaunchAcadProcessIds.Contains(process.Id))
                ?.Id ?? 0;
        }
        catch
        {
            return 0;
        }
    }

    private static int GetSuiteAcadeRunningSessionCandidatePreference(
        SuiteAcadeRunningSessionCandidateSnapshot candidate,
        SuiteAcadeProjectOpenRequest request
    )
    {
        var basePreference = candidate.ElectricalRuntimeDetected ? 0 : 3;
        if (IsPathWithinRoot(candidate.ActiveDocumentPath, request.ProjectRootPath))
        {
            return basePreference;
        }

        if (string.IsNullOrWhiteSpace(candidate.ActiveDocumentPath))
        {
            return basePreference + 1;
        }

        return basePreference + 2;
    }

    private static bool IsPathWithinRoot(string candidatePath, string rootPath)
    {
        if (string.IsNullOrWhiteSpace(candidatePath) || string.IsNullOrWhiteSpace(rootPath))
        {
            return false;
        }

        try
        {
            var normalizedCandidate = Path.GetFullPath(candidatePath)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            var normalizedRoot = Path.GetFullPath(rootPath)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            return normalizedCandidate.StartsWith(
                normalizedRoot + Path.DirectorySeparatorChar,
                StringComparison.OrdinalIgnoreCase
            ) || string.Equals(normalizedCandidate, normalizedRoot, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static string ResolveSuiteAcadeProfileName(out string profileSource)
    {
        profileSource = "fallback";
        try
        {
            using var root = Registry.CurrentUser.OpenSubKey(@"Software\Autodesk\AutoCAD", writable: false);
            if (root is null)
            {
                return SuiteAcadeProfileName;
            }

            foreach (var majorKeyName in root.GetSubKeyNames().OrderByDescending(value => value, StringComparer.OrdinalIgnoreCase))
            {
                using var majorKey = root.OpenSubKey(majorKeyName, writable: false);
                if (majorKey is null)
                {
                    continue;
                }

                foreach (var flavorKeyName in majorKey.GetSubKeyNames())
                {
                    using var profilesKey = majorKey.OpenSubKey(
                        $"{flavorKeyName}\\Profiles",
                        writable: false
                    );
                    if (profilesKey is null)
                    {
                        continue;
                    }

                    foreach (var profileName in profilesKey.GetSubKeyNames())
                    {
                        if (
                            string.Equals(
                                profileName,
                                SuiteAcadeProfileName,
                                StringComparison.OrdinalIgnoreCase
                            )
                        )
                        {
                            profileSource = "registry";
                            return profileName;
                        }
                    }

                    foreach (var profileName in profilesKey.GetSubKeyNames())
                    {
                        if (profileName.IndexOf("ACADE", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            profileSource = "registry";
                            return profileName;
                        }
                    }
                }
            }
        }
        catch
        {
            // Registry lookup is best effort only; fall back to the default ACADE profile name.
        }

        return SuiteAcadeProfileName;
    }

    private static string ReadSuiteAcadeActiveProfile(object application)
    {
        try
        {
            var preferences = ReadProperty(application, "Preferences");
            var profiles = ReadProperty(preferences, "Profiles");
            return Convert.ToString(ReadProperty(profiles, "ActiveProfile"))?.Trim() ?? "";
        }
        catch
        {
            return "";
        }
    }

    private static string ReadSuiteAcadeActiveDocumentPath(object application)
    {
        try
        {
            var document = ReadProperty(application, "ActiveDocument");
            var fullName = (Convert.ToString(ReadProperty(document, "FullName")) ?? "").Trim().Trim('"');
            if (string.IsNullOrWhiteSpace(fullName) || !Path.IsPathRooted(fullName))
            {
                return "";
            }

            return NormalizeSuiteExecutablePath(fullName);
        }
        catch
        {
            return "";
        }
    }

    private static bool TrySuiteAcadeHasDocumentsCollection(object application)
    {
        try
        {
            return ReadProperty(application, "Documents") is not null;
        }
        catch
        {
            return false;
        }
    }

    private static bool IsSuiteAcadeProfileMatch(string activeProfile, string expectedProfileName)
    {
        var normalizedActiveProfile = (activeProfile ?? "").Trim();
        var normalizedExpectedProfile = (expectedProfileName ?? "").Trim();
        if (
            !string.IsNullOrWhiteSpace(normalizedActiveProfile)
            && !string.IsNullOrWhiteSpace(normalizedExpectedProfile)
            && string.Equals(
                normalizedActiveProfile,
                normalizedExpectedProfile,
                StringComparison.OrdinalIgnoreCase
            )
        )
        {
            return true;
        }

        return
            !string.IsNullOrWhiteSpace(normalizedActiveProfile)
            && string.IsNullOrWhiteSpace(normalizedExpectedProfile)
            && normalizedActiveProfile.IndexOf("ACADE", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    private static bool LooksLikeSuiteAutoCadExecutablePath(string executablePath)
    {
        return string.Equals(
            Path.GetFileName((executablePath ?? "").Trim()),
            "acad.exe",
            StringComparison.OrdinalIgnoreCase
        );
    }

    private static string NormalizeSuiteExecutablePath(string path)
    {
        try
        {
            if (!string.IsNullOrWhiteSpace(path))
            {
                return Path.GetFullPath(path.Trim().Trim('"'));
            }
        }
        catch
        {
            // Keep the original token when normalization fails.
        }

        return (path ?? "").Trim().Trim('"');
    }

    private static string TryReadSuiteCadProcessPath(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);
            return process.MainModule?.FileName ?? "";
        }
        catch
        {
            return "";
        }
    }

    private static bool DetectSuiteAcadeRuntime(int processId, string executablePath)
    {
        if (LooksLikeSuiteAcadeInstallPath(executablePath))
        {
            return true;
        }

        if (processId <= 0)
        {
            return false;
        }

        try
        {
            using var process = Process.GetProcessById(processId);
            foreach (ProcessModule? module in process.Modules)
            {
                var modulePath = NormalizeSuiteExecutablePath(module?.FileName ?? "");
                var moduleName = Path.GetFileName(modulePath);
                if (
                    string.Equals(
                        moduleName,
                        "AcePageManMgd.dll",
                        StringComparison.OrdinalIgnoreCase
                    )
                    || modulePath.IndexOf(
                        $"{Path.DirectorySeparatorChar}Acade{Path.DirectorySeparatorChar}",
                        StringComparison.OrdinalIgnoreCase
                    ) >= 0
                    || modulePath.IndexOf(
                        $"{Path.AltDirectorySeparatorChar}Acade{Path.AltDirectorySeparatorChar}",
                        StringComparison.OrdinalIgnoreCase
                    ) >= 0
                )
                {
                    return true;
                }
            }
        }
        catch
        {
            // Best effort only. Profile checks remain the primary classifier.
        }

        return false;
    }

    private static bool LooksLikeSuiteAcadeInstallPath(string executablePath)
    {
        var normalizedPath = NormalizeSuiteExecutablePath(executablePath);
        return normalizedPath.IndexOf("AutoCAD Electrical", StringComparison.OrdinalIgnoreCase) >= 0
            || normalizedPath.IndexOf(
                $"{Path.DirectorySeparatorChar}Acade{Path.DirectorySeparatorChar}",
                StringComparison.OrdinalIgnoreCase
            ) >= 0
            || normalizedPath.IndexOf(
                $"{Path.AltDirectorySeparatorChar}Acade{Path.AltDirectorySeparatorChar}",
                StringComparison.OrdinalIgnoreCase
            ) >= 0;
    }

    private static int TryGetSuiteCadProcessId(IntPtr windowHandle)
    {
        if (windowHandle == IntPtr.Zero)
        {
            return 0;
        }

        try
        {
            return GetWindowThreadProcessId(windowHandle, out var processId) == 0 ? 0 : (int)processId;
        }
        catch
        {
            return 0;
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
        var templatePath = ResolveSuiteAcadeLaunchTemplatePath();

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
                        object? createdDocument = null;
                        if (!string.IsNullOrWhiteSpace(templatePath))
                        {
                            createdDocument = ReadWithTransientComRetry(
                                () => ((dynamic)documents).Add(templatePath),
                                "Documents.Add(template)"
                            );
                        }

                        if (createdDocument is null)
                        {
                            createdDocument = ReadWithTransientComRetry(
                                () => ((dynamic)documents).Add(),
                                "Documents.Add()"
                            );
                        }

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

    private static string ResolveSuiteAcadeLaunchTemplatePath()
    {
        var explicitTemplatePath = (Environment.GetEnvironmentVariable("AUTOCAD_TEMPLATE_PATH") ?? "")
            .Trim()
            .Trim('"');
        if (!string.IsNullOrWhiteSpace(explicitTemplatePath))
        {
            try
            {
                var normalizedTemplatePath = Path.GetFullPath(explicitTemplatePath);
                if (File.Exists(normalizedTemplatePath))
                {
                    return normalizedTemplatePath;
                }
            }
            catch
            {
                // Ignore invalid explicit template overrides.
            }
        }

        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var candidates = new[]
        {
            Path.Combine(
                localAppData,
                "Autodesk",
                "AutoCAD Electrical 2026",
                "R25.1",
                "enu",
                "Template",
                "ACAD_ELECTRICAL.dwt"
            ),
            Path.Combine(
                localAppData,
                "Autodesk",
                "AutoCAD Electrical 2026",
                "R25.1",
                "enu",
                "Template",
                "acad.dwt"
            ),
            Path.Combine(
                localAppData,
                "Autodesk",
                "AutoCAD Electrical 2025",
                "R24.3",
                "enu",
                "Template",
                "ACAD_ELECTRICAL.dwt"
            ),
            Path.Combine(
                localAppData,
                "Autodesk",
                "AutoCAD Electrical 2025",
                "R24.3",
                "enu",
                "Template",
                "acad.dwt"
            ),
            @"C:\Program Files\Autodesk\AutoCAD 2026\Acade\UserDataCache\en-US\Template\ACAD_ELECTRICAL.dwt",
            @"C:\Program Files\Autodesk\AutoCAD 2026\Acade\UserDataCache\en-US\Template\acad.dwt",
            @"C:\Program Files\Autodesk\AutoCAD 2025\Acade\UserDataCache\en-US\Template\ACAD_ELECTRICAL.dwt",
            @"C:\Program Files\Autodesk\AutoCAD 2025\Acade\UserDataCache\en-US\Template\acad.dwt",
        };

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return "";
    }

    private static string BuildSuiteAcadeLaunchArguments(string profileName, string templatePath)
    {
        var normalizedProfileName = string.IsNullOrWhiteSpace(profileName)
            ? SuiteAcadeProfileName
            : profileName.Trim();
        var baseArguments =
            $"/language \"{SuiteAcadeLanguageCode}\" /product \"{SuiteAcadeProductCode}\" /p \"{normalizedProfileName}\"";
        if (string.IsNullOrWhiteSpace(templatePath))
        {
            return baseArguments;
        }

        return $"{baseArguments} /t \"{templatePath.Trim()}\"";
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
        var lispPayloadPath = EscapeSuiteAcadeAutoLispString(invocation.PayloadPath);
        var lispResultPath = EscapeSuiteAcadeAutoLispString(invocation.ResultPath);
        var commandScript = loadViaNetLoad
            ? BuildSuitePluginLispInvocationScript(
                invocation.PluginDllPath,
                SuiteAcadeProjectOpenPluginLispFunction,
                lispPayloadPath,
                lispResultPath
            )
            : BuildAutoCadLispInvocationScript(
                BuildAutoCadLispExpression(
                    SuiteAcadeProjectOpenPluginLispFunction,
                    lispPayloadPath,
                    lispResultPath
                )
            );

        ReadWithTransientComRetry(
            () =>
            {
                ((dynamic)session.Document).SendCommand(commandScript);
                return true;
            },
            loadViaNetLoad
                ? $"SendCommand(NETLOAD+{SuiteAcadeProjectOpenPluginLispFunction})"
                : $"SendCommand({SuiteAcadeProjectOpenPluginLispFunction})"
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
                    $"Timed out waiting for AutoCAD to finish '{SuiteAcadeProjectOpenPluginLispFunction}'.",
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
        var fallbackCandidate = BuildSuiteAcadeProjectOpenCommandCandidates(request.WdpPath)[0];
        return ExecuteSuiteAcadeCommandScript(
            session,
            fallbackCandidate.CommandScript,
            strategy: fallbackCandidate.Strategy,
            sendOperationLabel: $"SendCommand({fallbackCandidate.Strategy})",
            failureCode: "ACADE_PROJECT_OPEN_FAILED",
            failureMessagePrefix: "ACADE built-in project command failed",
            timeoutMessage:
                $"Timed out waiting for AutoCAD to finish the built-in ACADE project command '{fallbackCandidate.Strategy}'.",
            warnings: warnings
        );
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

    private static SuiteAcadeProjectOpenCommandExecutionResult TryPrepareSuiteAcadeProjectSwitchRetry(
        SuiteAcadeProjectOpenSession session,
        List<string> warnings
    )
    {
        TryEnsureSuiteAcadeScratchDocument(session, warnings);
        TryWarmSuiteAcadeProjectFunctions(session, warnings);
        return SuiteAcadeProjectOpenCloseCurrentProjectHook is not null
            ? SuiteAcadeProjectOpenCloseCurrentProjectHook(session, warnings)
            : ExecuteSuiteAcadeProjectCloseCurrentProjectCommand(session, warnings);
    }

    private static void WarnIfSuiteAcadeProfileLooksWrong(object application, List<string> warnings)
    {
        try
        {
            var preferences = ReadProperty(application, "Preferences");
            var profiles = ReadProperty(preferences, "Profiles");
            var activeProfile = Convert.ToString(ReadProperty(profiles, "ActiveProfile"))?.Trim() ?? "";
            if (
                !string.IsNullOrWhiteSpace(activeProfile)
                && !string.Equals(activeProfile, SuiteAcadeProfileName, StringComparison.OrdinalIgnoreCase)
            )
            {
                warnings.Add(
                    $"AutoCAD is running under profile '{activeProfile}', not '{SuiteAcadeProfileName}'. Electrical project functions may be unavailable until the ACADE profile is loaded."
                );
            }
        }
        catch
        {
            // Best-effort only; missing COM profile properties should not block project activation.
        }
    }

    private static void TryWarmSuiteAcadeProjectFunctions(
        SuiteAcadeProjectOpenSession session,
        List<string> warnings
    )
    {
        var warmupScript = BuildAutoCadCommandScript(
            "(progn (if (not (and (fboundp 'PmOpenProject) (fboundp 'PmCloseProject))) (if (fboundp 'wd_load_arx) (wd_load_arx))) (if (not (and (fboundp 'PmOpenProject) (fboundp 'PmCloseProject))) (if (fboundp 'wd_load) (wd_load))))"
        );

        var warmupResult = ExecuteSuiteAcadeCommandScript(
            session,
            warmupScript,
            strategy: "Electrical function warmup",
            sendOperationLabel: "SendCommand(Electrical function warmup)",
            failureCode: "ACADE_FUNCTION_WARMUP_FAILED",
            failureMessagePrefix: "ACADE Electrical function warmup failed",
            timeoutMessage:
                "Timed out waiting for AutoCAD Electrical function warmup to finish.",
            warnings: warnings
        );

        if (!string.IsNullOrWhiteSpace(warmupResult.FailureCode))
        {
            warnings.Add(
                $"Suite could not warm the AutoCAD Electrical project functions before switching projects: {warmupResult.FailureMessage}"
            );
        }
    }

    private static void TryEnsureSuiteAcadeScratchDocument(
        SuiteAcadeProjectOpenSession session,
        List<string> warnings
    )
    {
        if (session.TemporaryDocumentCreated)
        {
            return;
        }

        try
        {
            var documents = ReadProperty(session.Application, "Documents");
            var createdDocument = ReadWithTransientComRetry(
                () => ((dynamic)documents).Add(),
                "Documents.Add() for switch retry"
            );
            if (createdDocument is null)
            {
                return;
            }

            TryActivateSuiteDocument(createdDocument);
            var modelspace = ReadProperty(createdDocument, "ModelSpace");
            session.AdoptDocument(createdDocument, modelspace, temporaryDocumentCreated: true);
            warnings.Add(
                "Suite created a temporary blank AutoCAD drawing before switching ACADE projects."
            );
        }
        catch (Exception ex)
        {
            warnings.Add(
                $"Suite could not create a temporary AutoCAD drawing before switching projects: {DescribeException(ex)}"
            );
        }
    }

    private static SuiteAcadeProjectOpenCommandExecutionResult ExecuteSuiteAcadeProjectCloseCurrentProjectCommand(
        SuiteAcadeProjectOpenSession session,
        List<string> warnings
    )
    {
        return ExecuteSuiteAcadeCommandScript(
            session,
            BuildAutoCadCommandScript("(PmCloseProject)"),
            strategy: "(PmCloseProject)",
            sendOperationLabel: "SendCommand(PmCloseProject)",
            failureCode: "ACADE_PROJECT_CLOSE_FAILED",
            failureMessagePrefix: "ACADE close-project command failed",
            timeoutMessage:
                "Timed out waiting for AutoCAD to finish the active-project close command.",
            warnings: warnings
        );
    }

    private static SuiteAcadeProjectSwitchRetryResult ExecuteSuiteAcadeProjectSwitchRetryOpen(
        SuiteAcadeProjectOpenRequest request,
        SuiteAcadeProjectOpenSession session,
        SuiteAcadeProjectOpenVerificationContext verificationContext,
        List<string> warnings
    )
    {
        return ExecuteSuiteAcadeProjectOpenCommandCandidates(
            request,
            session,
            verificationContext,
            warnings,
            BuildSuiteAcadeProjectOpenCommandCandidates(request.WdpPath)
        );
    }

    private static SuiteAcadeProjectSwitchRetryResult ExecuteSuiteAcadeProjectOpenCommandCandidates(
        SuiteAcadeProjectOpenRequest request,
        SuiteAcadeProjectOpenSession session,
        SuiteAcadeProjectOpenVerificationContext verificationContext,
        List<string> warnings,
        IReadOnlyList<SuiteAcadeProjectSwitchRetryCommandCandidate> candidates
    )
    {
        var lastCommandExecution = new SuiteAcadeProjectOpenCommandExecutionResult
        {
            Attempted = true,
            CommandCompleted = false,
            FailureCode = "ACADE_PROJECT_OPEN_FAILED",
            FailureMessage = "ACADE switch retry did not produce a verified project switch.",
            Strategy = "(PmOpenProject <wdpPath> nil nil)",
        };
        var lastVerification = new SuiteAcadeProjectOpenVerificationResult(
            AepxObserved: false,
            LastProjObserved: false
        );

        foreach (var candidate in candidates)
        {
            var commandExecution = ExecuteSuiteAcadeCommandScript(
                session,
                candidate.CommandScript,
                strategy: candidate.Strategy,
                sendOperationLabel: $"SendCommand({candidate.Strategy})",
                failureCode: "ACADE_PROJECT_OPEN_FAILED",
                failureMessagePrefix: "ACADE switch-retry project command failed",
                timeoutMessage:
                    $"Timed out waiting for AutoCAD to finish the switch-retry project command '{candidate.Strategy}'.",
                warnings: warnings
            );
            lastCommandExecution = commandExecution;

            if (!string.IsNullOrWhiteSpace(commandExecution.FailureCode))
            {
                continue;
            }

            var verification = VerifySuiteAcadeProjectOpen(verificationContext, warnings);
            lastVerification = verification;
            if (
                verification.AepxObserved
                || verification.LastProjObserved
                || verification.ActiveProjectObserved
            )
            {
                return new SuiteAcadeProjectSwitchRetryResult(
                    CommandExecution: commandExecution,
                    Verification: verification,
                    ProjectActivated: true
                );
            }

            warnings.Add(
                $"{candidate.Strategy} completed without a verified ACADE project switch."
            );
        }

        return new SuiteAcadeProjectSwitchRetryResult(
            CommandExecution: lastCommandExecution,
            Verification: lastVerification,
            ProjectActivated: false
        );
    }

    private static IReadOnlyList<SuiteAcadeProjectSwitchRetryCommandCandidate> BuildSuiteAcadeProjectOpenCommandCandidates(
        string wdpPath
    )
    {
        var lispPath = EscapeSuiteAcadeAutoLispString(wdpPath);
        return new[]
        {
            new SuiteAcadeProjectSwitchRetryCommandCandidate(
                Strategy: "(PmOpenProject <wdpPath> nil nil)",
                CommandScript: BuildAutoCadCommandScript($"(PmOpenProject \"{lispPath}\" nil nil)")
            ),
            new SuiteAcadeProjectSwitchRetryCommandCandidate(
                Strategy: "(PmOpenProject <wdpPath> T nil)",
                CommandScript: BuildAutoCadCommandScript($"(PmOpenProject \"{lispPath}\" T nil)")
            ),
            new SuiteAcadeProjectSwitchRetryCommandCandidate(
                Strategy: "(PmOpenProject <wdpPath> nil T)",
                CommandScript: BuildAutoCadCommandScript($"(PmOpenProject \"{lispPath}\" nil T)")
            ),
            new SuiteAcadeProjectSwitchRetryCommandCandidate(
                Strategy: "(PmOpenProject <wdpPath> T T)",
                CommandScript: BuildAutoCadCommandScript($"(PmOpenProject \"{lispPath}\" T T)")
            ),
        };
    }

    private static string EscapeSuiteAcadeAutoLispString(string value)
    {
        return (value ?? "").Replace("\\", "/").Replace("\"", "\\\"");
    }

    private static SuiteAcadeProjectOpenCommandExecutionResult ExecuteSuiteAcadeCommandScript(
        SuiteAcadeProjectOpenSession session,
        string commandScript,
        string strategy,
        string sendOperationLabel,
        string failureCode,
        string failureMessagePrefix,
        string timeoutMessage,
        List<string> warnings
    )
    {
        try
        {
            TryActivateSuiteDocument(session.Document);
            ReadWithTransientComRetry(
                () =>
                {
                    ((dynamic)session.Document).SendCommand(commandScript);
                    return true;
                },
                sendOperationLabel
            );
        }
        catch (Exception ex)
        {
            return new SuiteAcadeProjectOpenCommandExecutionResult
            {
                Attempted = true,
                FailureCode = failureCode,
                FailureMessage = $"{failureMessagePrefix}: {DescribeException(ex)}",
                Strategy = strategy,
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
                FailureMessage = timeoutMessage,
                Strategy = strategy,
            };
        }

        return new SuiteAcadeProjectOpenCommandExecutionResult
        {
            Attempted = true,
            CommandCompleted = true,
            CommandStateAvailable = commandStateAvailable,
            SawActiveCommand = sawActiveCommand,
            LastCommandMask = lastCommandMask,
            Strategy = strategy,
        };
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
        DateTime? lastProjLastWriteUtc = null;
        try
        {
            var lastProjObservation = ObserveSuiteAcadeLastProjTarget(wdpPath);
            lastProjObserved = lastProjObservation.ContainsTarget;
            lastProjLastWriteUtc = lastProjObservation.LastWriteUtc;
        }
        catch (Exception ex)
        {
            warnings.Add($"Suite could not read LastProj.fil before project activation: {DescribeException(ex)}");
        }

        return new SuiteAcadeProjectOpenObservation(
            AepxExists: aepxExists,
            AepxLastWriteUtc: aepxLastWriteUtc,
            LastProjObserved: lastProjObserved,
            LastProjLastWriteUtc: lastProjLastWriteUtc
        );
    }

    private static SuiteAcadeProjectOpenVerificationResult VerifySuiteAcadeProjectOpen(
        SuiteAcadeProjectOpenVerificationContext context,
        List<string> warnings
    )
    {
        var stopwatch = Stopwatch.StartNew();
        var aepxObserved = false;
        var lastProjObserved = false;
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
                    var lastProjObservation = ObserveSuiteAcadeLastProjTarget(context.WdpPath);
                    if (lastProjObservation.ContainsTarget)
                    {
                        lastProjObserved =
                            !context.PreviousLastProjObserved
                            || !context.PreviousLastProjLastWriteUtc.HasValue
                            || (
                                lastProjObservation.LastWriteUtc.HasValue
                                && lastProjObservation.LastWriteUtc.Value
                                    > context.PreviousLastProjLastWriteUtc.Value
                            );
                    }
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
        bool activeProjectObserved,
        string activeProjectPath,
        bool temporaryDocumentCreated,
        bool temporaryDocumentClosed,
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
                activeProjectObserved: activeProjectObserved,
                activeProjectPath: activeProjectPath,
                temporaryDocumentCreated: temporaryDocumentCreated,
                temporaryDocumentClosed: temporaryDocumentClosed
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
        bool activeProjectObserved,
        string activeProjectPath,
        bool temporaryDocumentCreated,
        bool temporaryDocumentClosed
    )
    {
        return new JsonObject
        {
            ["wdpPath"] = request.WdpPath,
            ["acadeLaunched"] = acadeLaunched,
            ["projectActivated"] = projectActivated,
            ["temporaryDocumentCreated"] = temporaryDocumentCreated,
            ["temporaryDocumentClosed"] = temporaryDocumentClosed,
            ["verification"] = new JsonObject
            {
                ["commandCompleted"] = commandCompleted,
                ["aepxObserved"] = aepxObserved,
                ["lastProjObserved"] = lastProjObserved,
                ["activeProjectObserved"] = activeProjectObserved,
            },
            ["activeProjectPath"] = string.IsNullOrWhiteSpace(activeProjectPath)
                ? null
                : activeProjectPath,
        };
    }

    private static JsonObject BuildSuiteAcadeProjectOpenCommandMeta(
        string stage,
        SuiteAcadeProjectOpenSession session,
        SuiteAcadeProjectOpenCommandExecutionResult commandExecution,
        string requestId
    )
    {
        return new JsonObject
        {
            ["source"] = "dotnet",
            ["providerPath"] = "dotnet+command",
            ["action"] = "suite_acade_project_open",
            ["requestId"] = requestId,
            ["stage"] = stage,
            ["strategy"] = string.IsNullOrWhiteSpace(commandExecution.Strategy)
                ? null
                : commandExecution.Strategy,
            ["executablePath"] = string.IsNullOrWhiteSpace(session.ExecutablePath)
                ? null
                : session.ExecutablePath,
            ["acadeLaunched"] = session.AcadeLaunched,
            ["temporaryDocumentCreated"] = session.TemporaryDocumentCreated,
            ["temporaryDocumentClosed"] = session.TemporaryDocumentClosed,
            ["sessionClassification"] = string.IsNullOrWhiteSpace(session.SessionClassification)
                ? null
                : session.SessionClassification,
            ["sessionMode"] = string.IsNullOrWhiteSpace(session.SessionMode)
                ? null
                : session.SessionMode,
            ["activeProfile"] = string.IsNullOrWhiteSpace(session.ActiveProfile)
                ? null
                : session.ActiveProfile,
            ["profileSource"] = string.IsNullOrWhiteSpace(session.ProfileSource)
                ? null
                : session.ProfileSource,
            ["processId"] = session.ProcessId > 0 ? session.ProcessId : null,
            ["windowHandle"] = session.WindowHandle != IntPtr.Zero
                ? session.WindowHandle.ToInt64()
                : null,
            ["commandStateAvailable"] = commandExecution.CommandStateAvailable,
            ["sawActiveCommand"] = commandExecution.SawActiveCommand,
            ["lastCommandMask"] = commandExecution.LastCommandMask,
        };
    }

    private static JsonObject BuildSuiteAcadeProjectOpenMeta(
        string stage,
        SuiteAcadeProjectOpenSession session,
        SuiteAcadeProjectOpenPluginExecutionResult pluginExecution,
        string requestId
    )
    {
        return new JsonObject
        {
            ["source"] = "dotnet",
            ["providerPath"] = string.IsNullOrWhiteSpace(pluginExecution.PluginDllPath)
                ? "dotnet"
                : "dotnet+plugin",
            ["action"] = "suite_acade_project_open",
            ["requestId"] = requestId,
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
            ["temporaryDocumentClosed"] = session.TemporaryDocumentClosed,
            ["sessionClassification"] = string.IsNullOrWhiteSpace(session.SessionClassification)
                ? null
                : session.SessionClassification,
            ["sessionMode"] = string.IsNullOrWhiteSpace(session.SessionMode)
                ? null
                : session.SessionMode,
            ["activeProfile"] = string.IsNullOrWhiteSpace(session.ActiveProfile)
                ? null
                : session.ActiveProfile,
            ["profileSource"] = string.IsNullOrWhiteSpace(session.ProfileSource)
                ? null
                : session.ProfileSource,
            ["processId"] = session.ProcessId > 0 ? session.ProcessId : null,
            ["windowHandle"] = session.WindowHandle != IntPtr.Zero
                ? session.WindowHandle.ToInt64()
                : null,
            ["commandStateAvailable"] = pluginExecution.CommandStateAvailable,
            ["sawActiveCommand"] = pluginExecution.SawActiveCommand,
            ["lastCommandMask"] = pluginExecution.LastCommandMask,
        };
    }

    private static void MergeSuiteJsonObject(
        JsonObject target,
        JsonObject? source,
        bool overwrite = true
    )
    {
        if (source is null)
        {
            return;
        }

        foreach (var property in source)
        {
            if (!overwrite && target.ContainsKey(property.Key))
            {
                continue;
            }

            target[property.Key] = property.Value?.DeepClone();
        }
    }

    private static void ReleaseSuiteComObjectSafely(object? comObject)
    {
        if (!OperatingSystem.IsWindows() || comObject is null)
        {
            return;
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

    private static bool TryBringSuiteAcadeWindowToForeground(SuiteAcadeProjectOpenSession session)
    {
        if (!OperatingSystem.IsWindows() || session.WindowHandle == IntPtr.Zero)
        {
            return false;
        }

        try
        {
            ShowWindowAsync(session.WindowHandle, SuiteShowWindowRestore);
            return SetForegroundWindow(session.WindowHandle);
        }
        catch
        {
            return false;
        }
    }

    private static void TryCloseSuiteAcadeTemporaryDocumentIfSafe(
        SuiteAcadeProjectOpenSession session,
        List<string> warnings
    )
    {
        if (!session.TemporaryDocumentCreated || session.TemporaryDocumentClosed)
        {
            return;
        }

        try
        {
            var documentFullName = NormalizeSuiteExecutablePath(
                Convert.ToString(ReadProperty(session.Document, "FullName")) ?? ""
            );
            var documentName = (Convert.ToString(ReadProperty(session.Document, "Name")) ?? "")
                .Trim();
            var saved = TryReadBoolLike(ReadProperty(session.Document, "Saved"), fallback: false);
            var isScratchDocument =
                string.IsNullOrWhiteSpace(documentFullName)
                && !string.IsNullOrWhiteSpace(documentName)
                && documentName.StartsWith("Drawing", StringComparison.OrdinalIgnoreCase);
            if (!isScratchDocument)
            {
                return;
            }

            object? documents = null;
            try
            {
                documents = ReadProperty(session.Application, "Documents");
                var documentCount = ReadCount(documents);
                if (documentCount <= 1)
                {
                    return;
                }
            }
            catch
            {
                return;
            }
            finally
            {
                ReleaseSuiteComObjectSafely(documents);
            }

            ReadWithTransientComRetry(
                () =>
                {
                    ((dynamic)session.Document).Close(saved);
                    return true;
                },
                "Document.Close() for Suite scratch document"
            );
            session.MarkTemporaryDocumentClosed();
        }
        catch (Exception ex)
        {
            warnings.Add(
                $"Suite could not close the temporary AutoCAD drawing after project activation: {DescribeException(ex)}"
            );
        }
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

    private readonly record struct SuiteAcadeLastProjObservation(
        bool ContainsTarget,
        DateTime? LastWriteUtc
    );

    private const int SuiteShowWindowRestore = 9;

    [DllImport("ole32.dll")]
    private static extern int GetRunningObjectTable(
        int reserved,
        out IRunningObjectTable? pprot
    );

    [DllImport("ole32.dll")]
    private static extern int CreateBindCtx(int reserved, out IBindCtx? ppbc);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(
        IntPtr windowHandle,
        out uint processId
    );

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShowWindowAsync(IntPtr windowHandle, int nCmdShow);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(IntPtr windowHandle);

    private static SuiteAcadeLastProjObservation ObserveSuiteAcadeLastProjTarget(string wdpPath)
    {
        var normalizedTarget = NormalizeSuiteAcadePathToken(wdpPath);
        var containsTarget = false;
        DateTime? lastWriteUtc = null;
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
                containsTarget = true;
                try
                {
                    var candidateWriteUtc = File.GetLastWriteTimeUtc(candidate);
                    if (!lastWriteUtc.HasValue || candidateWriteUtc > lastWriteUtc.Value)
                    {
                        lastWriteUtc = candidateWriteUtc;
                    }
                }
                catch
                {
                    // Best effort timestamp capture.
                }
            }
        }

        return new SuiteAcadeLastProjObservation(
            ContainsTarget: containsTarget,
            LastWriteUtc: lastWriteUtc
        );
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

    private static bool PathsEqual(string left, string right)
    {
        if (string.IsNullOrWhiteSpace(left) || string.IsNullOrWhiteSpace(right))
        {
            return false;
        }

        return string.Equals(
            NormalizeSuiteAcadePathToken(left),
            NormalizeSuiteAcadePathToken(right),
            StringComparison.OrdinalIgnoreCase
        );
    }

    private static bool LooksLikeSameSuiteAcadeProjectPath(string left, string right)
    {
        if (PathsEqual(left, right))
        {
            return true;
        }

        try
        {
            var leftExtension = Path.GetExtension(left ?? "").Trim();
            var rightExtension = Path.GetExtension(right ?? "").Trim();
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
                    Path.GetFileNameWithoutExtension(left ?? ""),
                    Path.GetFileNameWithoutExtension(right ?? ""),
                    StringComparison.OrdinalIgnoreCase
                );
            }
        }
        catch
        {
            // Best effort only.
        }

        return false;
    }
}
