using System.Diagnostics;
using System.Globalization;
using System.Text.Json.Nodes;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Suite.RuntimeControl;

internal sealed class RuntimeShellForm : Form
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
    };
    private static readonly TimeZoneInfo DisplayTimeZone = ResolveDisplayTimeZone();
    private static readonly Regex StructuredLogRegex = new(
        @"^\[(?<timestamp>[^\]]+)\](?:\s\[(?<tag>[A-Z]+)\])?\s(?<message>.*)$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly HashSet<string> KnownLogSourceIds = new(StringComparer.OrdinalIgnoreCase)
    {
        "transcript",
        "bootstrap",
        "runtime-launcher",
        "runtime-shell",
        "frontend",
        "backend",
        "office-broker",
        "filesystem-collector",
        "autocad-collector",
        "docker",
    };

    private readonly AppOptions _options;
    private readonly RuntimeShellInstanceCoordinator _instanceCoordinator;
    private readonly WebView2 _webView;
    private readonly System.Windows.Forms.Timer _pollTimer;
    private readonly string _repoRoot;
    private readonly string _assetsDirectory;
    private readonly string _statusScriptPath;
    private readonly string _controlScriptPath;
    private readonly string _companionControlScriptPath;
    private readonly string _bootstrapScriptPath;
    private readonly string _stopScriptPath;
    private readonly string _supportBundleScriptPath;
    private readonly string _workstationDoctorScriptPath;
    private readonly string _workstationProfileScriptPath;
    private readonly string _runtimeCatalogPath;
    private readonly string _developerToolsManifestPath;
    private readonly string _runtimeStatusDirectory;
    private readonly string _runtimeLogPath;
    private readonly string _frontendLogPath;
    private readonly string _backendLogPath;
    private readonly string _runtimeLauncherLogPath;
    private readonly string _runtimeShellLogPath;
    private readonly string _officeBrokerLogPath;
    private readonly string _filesystemCollectorLogDir;
    private readonly string _autocadCollectorLogDir;
    private readonly string _shellWindowStatePath;
    private readonly string _autodeskProjectFlowReferencePath;
    private readonly RuntimeCatalog _runtimeCatalog;
    private readonly string _runtimeCatalogJson;
    private readonly List<string> _queuedMessages = new();
    private readonly object _queueLock = new();
    private readonly OfficeBrokerClient _officeBrokerClient = new();
    private WorkstationFolderPickerBridge? _workstationFolderPickerBridge;

    private bool _isClosing;
    private bool _uiReady;
    private bool _snapshotInFlight;
    private bool _snapshotRefreshPending;
    private bool _officeSnapshotInFlight;
    private bool _officeSnapshotRefreshPending;
    private bool _actionBusy;
    private bool _pendingExternalAutoBootstrap;
    private string? _activeAction;
    private string? _activeServiceId;
    private long _runtimeLogOffset;
    private string _selectedLogSourceId = "transcript";
    private string _selectedLogSourcePath = string.Empty;
    private string _selectedUtilityTab = "context";
    private int _utilityPaneWidth = RuntimeShellDisplaySettings.DefaultUtilityPaneWidth;
    private bool _utilityPaneCollapsed = true;
    private int _contentScalePercent = RuntimeShellDisplaySettings.DefaultContentScalePercent;
    private string? _lastOfficeSnapshotJson;
    private DateTimeOffset _lastOfficeSnapshotPublishedAt = DateTimeOffset.MinValue;
    private DateTimeOffset _lastOfficeBrokerLaunchAttemptAt = DateTimeOffset.MinValue;
    private JsonObject? _lastWorkstationContextNode;
    private DateTimeOffset _lastWorkstationContextPublishedAt = DateTimeOffset.MinValue;
    private string? _lastSnapshotJson;
    private string? _lastSnapshotFailureSignature;
    private string? _lastRuntimeLogReadFailureSignature;
    private string _lastSupabaseStudioUrl = "http://127.0.0.1:54323";
    private JsonDocument? _lastSnapshotDocument;

    internal int ExitCode { get; private set; } = RuntimeShellExitCodes.Success;

    public RuntimeShellForm(AppOptions options, RuntimeShellInstanceCoordinator instanceCoordinator)
    {
        RuntimeShellLogger.Log("runtime-shell-form-constructor-start");
        _options = options;
        _instanceCoordinator = instanceCoordinator;
        _repoRoot = options.RepoRoot;
        _assetsDirectory = Path.Combine(AppContext.BaseDirectory, "Assets");
        _statusScriptPath = Path.Combine(_repoRoot, "scripts", "get-suite-runtime-status.ps1");
        _controlScriptPath = Path.Combine(_repoRoot, "scripts", "control-suite-runtime-service.ps1");
        _companionControlScriptPath = Path.Combine(_repoRoot, "scripts", "control-suite-companion-app.ps1");
        _bootstrapScriptPath = Path.Combine(_repoRoot, "scripts", "run-suite-runtime-startup.ps1");
        _stopScriptPath = Path.Combine(_repoRoot, "scripts", "stop-suite-runtime.ps1");
        _supportBundleScriptPath = Path.Combine(_repoRoot, "scripts", "export-suite-support-bundle.ps1");
        _workstationDoctorScriptPath = Path.Combine(_repoRoot, "scripts", "workstation-doctor.ps1");
        _workstationProfileScriptPath = Path.Combine(_repoRoot, "scripts", "sync-suite-workstation-profile.ps1");
        _runtimeCatalogPath = Path.Combine(_assetsDirectory, "runtimeCatalog.json");
        _developerToolsManifestPath = Path.Combine(_repoRoot, "src", "routes", "developerToolsManifest.data.json");
        _runtimeStatusDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Suite",
            "runtime-bootstrap");
        _runtimeLogPath = Path.Combine(_runtimeStatusDirectory, "bootstrap.log");
        _frontendLogPath = Path.Combine(_runtimeStatusDirectory, "frontend.log");
        _backendLogPath = Path.Combine(_runtimeStatusDirectory, "backend.log");
        _runtimeLauncherLogPath = Path.Combine(_runtimeStatusDirectory, "runtime-launcher.log");
        _runtimeShellLogPath = Path.Combine(_runtimeStatusDirectory, "runtime-shell.log");
        _officeBrokerLogPath = Path.Combine(_runtimeStatusDirectory, "office-broker.log");
        _filesystemCollectorLogDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Suite",
            "watchdog-collector",
            "logs");
        _autocadCollectorLogDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Suite",
            "watchdog-autocad-collector",
            "logs");
        _shellWindowStatePath = Path.Combine(_runtimeStatusDirectory, "shell-window-state.json");
        _autodeskProjectFlowReferencePath = Path.Combine(
            _repoRoot,
            "docs",
            "development",
            "autocad-electrical-2026-project-flow-reference.md");
        _runtimeCatalog = RuntimeCatalog.LoadFromFile(_runtimeCatalogPath, JsonOptions, out _runtimeCatalogJson);
        RuntimeShellLogger.Log("runtime-shell-form-runtime-catalog-loaded");

        Directory.CreateDirectory(_runtimeStatusDirectory);
        RuntimeShellLogger.Log("runtime-shell-form-status-dir-ready");

        Text = "Suite Operator Shell";
        AutoScaleMode = AutoScaleMode.None;
        StartPosition = FormStartPosition.Manual;
        MinimumSize = new System.Drawing.Size(960, 700);
        FormBorderStyle = FormBorderStyle.Sizable;
        MinimizeBox = true;
        MaximizeBox = true;
        BackColor = System.Drawing.ColorTranslator.FromHtml("#08131b");
        UpdateWebViewInset();
        RuntimeShellLogger.Log("runtime-shell-form-window-configured");
        RuntimeShellLogger.Log("runtime-shell-webview-create-start");
        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = System.Drawing.ColorTranslator.FromHtml("#08131b"),
        };
        Controls.Add(_webView);
        RuntimeShellLogger.Log("runtime-shell-webview-create-complete");

        _pollTimer = new System.Windows.Forms.Timer
        {
            Interval = 2500,
        };
        _pollTimer.Tick += async (_, _) => await OnPollTickAsync();
        RuntimeShellLogger.Log("runtime-shell-form-poll-timer-ready");
        DpiChanged += (_, _) =>
        {
            UpdateWebViewInset();
            ApplyWebViewDpiZoom();
        };

        Shown += async (_, _) =>
        {
            EnsureVisibleOnDesktop();
            _instanceCoordinator.ReportPhase(
                RuntimeShellPhases.Shown,
                activatable: IsHandleCreated,
                statusMessage: "Shell window shown.");
            PersistShellWindowState();
            RuntimeShellLogger.Log("runtime-shell-shown");
            await OnShownAsync();
        };
        ResizeEnd += (_, _) => PersistShellWindowState();
        SizeChanged += (_, _) =>
        {
            if (!_isClosing && (WindowState == FormWindowState.Maximized || WindowState == FormWindowState.Normal))
            {
                PersistShellWindowState();
            }
        };
        FormClosing += OnFormClosing;
        FormClosed += OnFormClosed;

        RuntimeShellLogger.Log("runtime-shell-form-window-state-apply-start");
        ApplyInitialShellWindowState();
        RuntimeShellLogger.Log("runtime-shell-form-window-state-apply-complete");
        PersistShellWindowState();
        RuntimeShellLogger.Log("runtime-shell-form-window-state-persisted");
        RuntimeShellLogger.Log("runtime-shell-form-constructor-complete");
    }

    private async Task OnShownAsync()
    {
        if (_uiReady || _isClosing)
        {
            return;
        }

        try
        {
            await InitializeWebViewAsync();
            StartWorkstationFolderPickerBridge();
            _pollTimer.Start();
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-init", exception);
            _instanceCoordinator.ReportPhase(
                RuntimeShellPhases.Closing,
                activatable: false,
                statusMessage: $"Shell initialization failed. {exception.Message}");
            ExitCode = RuntimeShellExitCodes.InitializationFailed;
            MessageBox.Show(
                this,
                "The HTML runtime shell could not start. Close this window and relaunch Runtime Control after checking the shell log.",
                "Suite Runtime Control",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
    }

    private async Task InitializeWebViewAsync()
    {
        if (!Directory.Exists(_assetsDirectory))
        {
            throw new DirectoryNotFoundException($"Assets directory was not found: {_assetsDirectory}");
        }

        await _webView.EnsureCoreWebView2Async();

        var core = _webView.CoreWebView2;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.IsPinchZoomEnabled = false;
        core.WebMessageReceived += async (_, eventArgs) => await OnWebMessageReceivedAsync(eventArgs);
        core.NavigationCompleted += async (_, eventArgs) => await OnNavigationCompletedAsync(eventArgs);
        core.SetVirtualHostNameToFolderMapping(
            "suite-runtime.local",
            _assetsDirectory,
            CoreWebView2HostResourceAccessKind.Allow);
        ApplyWebViewDpiZoom();

        _webView.Source = new Uri("https://suite-runtime.local/index.html");
    }

    private void StartWorkstationFolderPickerBridge()
    {
        if (_workstationFolderPickerBridge is not null)
        {
            return;
        }

        try
        {
            var projectSetupActionHandler = new ProjectSetupActionHandler(
                _repoRoot,
                ShowFolderPickerOnUiAsync,
                message => RuntimeShellLogger.Log(message),
                (scope, exception) => RuntimeShellLogger.LogException(scope, exception));
            var projectStandardsActionHandler = new ProjectStandardsActionHandler(
                _repoRoot,
                message => RuntimeShellLogger.Log(message),
                (scope, exception) => RuntimeShellLogger.LogException(scope, exception));
            _workstationFolderPickerBridge = new WorkstationFolderPickerBridge(
                ShowFolderPickerOnUiAsync,
                message => RuntimeShellLogger.Log(message),
                (scope, exception) => RuntimeShellLogger.LogException(scope, exception),
                projectSetupActionHandler,
                projectStandardsActionHandler);
            _workstationFolderPickerBridge.Start();
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-workstation-folder-picker-start", exception);
        }
    }

    private Task<string?> ShowFolderPickerOnUiAsync(
        string? initialPath,
        string? title,
        CancellationToken cancellationToken)
    {
        if (_isClosing || IsDisposed)
        {
            return Task.FromException<string?>(
                new InvalidOperationException("Runtime Control is closing."));
        }

        var taskCompletionSource = new TaskCompletionSource<string?>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        CancellationTokenRegistration cancellationRegistration = default;

        if (cancellationToken.CanBeCanceled)
        {
            cancellationRegistration = cancellationToken.Register(
                static state =>
                {
                    var source = (TaskCompletionSource<string?>)state!;
                    source.TrySetCanceled();
                },
                taskCompletionSource);
        }

        void ShowDialogOnUiThread()
        {
            if (cancellationToken.IsCancellationRequested)
            {
                cancellationRegistration.Dispose();
                return;
            }

            try
            {
                using var dialog = new FolderBrowserDialog
                {
                    AutoUpgradeEnabled = true,
                    Description = string.IsNullOrWhiteSpace(title)
                        ? "Select Watchdog Root Folder"
                        : title.Trim(),
                    ShowNewFolderButton = false,
                    UseDescriptionForTitle = true,
                };

                var candidateInitialPath = string.IsNullOrWhiteSpace(initialPath)
                    ? Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)
                    : initialPath.Trim();
                if (!string.IsNullOrWhiteSpace(candidateInitialPath) &&
                    Directory.Exists(candidateInitialPath))
                {
                    dialog.SelectedPath = candidateInitialPath;
                }

                var dialogResult = IsHandleCreated
                    ? dialog.ShowDialog(this)
                    : dialog.ShowDialog();
                var selectedPath = dialogResult == DialogResult.OK &&
                    !string.IsNullOrWhiteSpace(dialog.SelectedPath)
                    ? Path.GetFullPath(dialog.SelectedPath.Trim())
                    : null;

                cancellationRegistration.Dispose();
                taskCompletionSource.TrySetResult(selectedPath);
            }
            catch (Exception exception)
            {
                cancellationRegistration.Dispose();
                taskCompletionSource.TrySetException(exception);
            }
        }

        try
        {
            if (InvokeRequired)
            {
                BeginInvoke((MethodInvoker)ShowDialogOnUiThread);
            }
            else
            {
                ShowDialogOnUiThread();
            }
        }
        catch (Exception exception)
        {
            cancellationRegistration.Dispose();
            taskCompletionSource.TrySetException(exception);
        }

        return taskCompletionSource.Task;
    }

    private async Task OnNavigationCompletedAsync(CoreWebView2NavigationCompletedEventArgs eventArgs)
    {
        if (!eventArgs.IsSuccess)
        {
            throw new InvalidOperationException($"Runtime shell navigation failed with status {eventArgs.WebErrorStatus}.");
        }

        RuntimeShellLogger.Log($"runtime-shell-navigation-complete: autoBootstrap={_options.AutoBootstrap}");
        _uiReady = true;
        _instanceCoordinator.ReportPhase(
            RuntimeShellPhases.UiReady,
            activatable: true,
            statusMessage: "Shell UI ready.");
        EnsureVisibleOnDesktop();
        FlushQueuedMessages();
        PublishRuntimeCatalog();
        PublishDeveloperToolsManifest();
        PersistShellWindowState();
        PublishShellWindowState();
        PublishLogSources();
        SendLog("SYS", "Runtime shell ready.", "sys");
        EmitInitialRuntimeLogTail();
        _runtimeLogOffset = GetCurrentLogLength();

        if (_options.AutoBootstrap)
        {
            RuntimeShellLogger.Log("runtime-shell-auto-bootstrap-prime");
            PrimeAutoBootstrapUiState();
            RuntimeShellLogger.Log("runtime-shell-auto-bootstrap-queue");
            _ = RunBootstrapAllAsync(autoTriggered: true);
            _ = PublishSnapshotAsync();
            return;
        }

        if (_pendingExternalAutoBootstrap)
        {
            _pendingExternalAutoBootstrap = false;
            RuntimeShellLogger.Log("runtime-shell-external-auto-bootstrap-prime");
            PrimeAutoBootstrapUiState();
            RuntimeShellLogger.Log("runtime-shell-external-auto-bootstrap-queue");
            _ = RunBootstrapAllAsync(autoTriggered: true);
            _ = PublishSnapshotAsync();
            return;
        }

        await PublishSnapshotAsync();
        await PublishSelectedLogSourceAsync(force: true);
    }

    internal void HandleExternalActivationRequest(RuntimeShellActivationRequest request)
    {
        if (_isClosing || IsDisposed)
        {
            return;
        }

        void ActivateExistingShell()
        {
            EnsureVisibleOnDesktop();
            _instanceCoordinator.ReportHeartbeat(
                activatable: true,
                statusMessage: request.AutoBootstrap
                    ? "Activated existing shell after external bootstrap request."
                    : "Activated existing shell.");
            SendLog("SYS", "Focused the existing Suite Operator Shell instance.", "sys");
            _ = PublishSnapshotAsync(force: true);
            _ = PublishSelectedLogSourceAsync(force: true);

            if (!request.AutoBootstrap)
            {
                return;
            }

            if (!_uiReady)
            {
                _pendingExternalAutoBootstrap = true;
                RuntimeShellLogger.Log("runtime-shell-external-auto-bootstrap-pending");
                return;
            }

            if (_actionBusy)
            {
                SendLog("INFO", "Auto-bootstrap was requested on the existing shell, but another runtime action is already running.", "info");
                return;
            }

            RuntimeShellLogger.Log("runtime-shell-external-auto-bootstrap-start");
            PrimeAutoBootstrapUiState();
            _ = RunBootstrapAllAsync(autoTriggered: true);
        }

        try
        {
            if (IsHandleCreated)
            {
                BeginInvoke((MethodInvoker)ActivateExistingShell);
            }
            else
            {
                _pendingExternalAutoBootstrap = _pendingExternalAutoBootstrap || request.AutoBootstrap;
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-external-activation", exception);
        }
    }

    private async Task OnWebMessageReceivedAsync(CoreWebView2WebMessageReceivedEventArgs eventArgs)
    {
        if (_isClosing)
        {
            return;
        }

        try
        {
            using var document = JsonDocument.Parse(eventArgs.WebMessageAsJson);
            var root = document.RootElement;
            var messageType = GetStringProperty(root, "type");
            switch (messageType)
            {
                case "runtime.bootstrap_all":
                    await RunBootstrapAllAsync(autoTriggered: false);
                    break;
                case "runtime.start_all":
                    await RunStartAllAsync();
                    break;
                case "runtime.stop_all":
                    await RunStopAllAsync();
                    break;
                case "runtime.reset_all":
                    await RunResetAllAsync();
                    break;
                case "runtime.refresh":
                    await PublishSnapshotAsync(force: true);
                    break;
                case "office.refresh":
                case "office.state.refresh":
                    await PublishOfficeSnapshotAsync(force: true);
                    break;
                case "office.broker.start":
                    await RunOfficeBrokerLifecycleAsync(restart: false);
                    break;
                case "office.broker.restart":
                    await RunOfficeBrokerLifecycleAsync(restart: true);
                    break;
                case "office.chat.send":
                case "office.chat.set_route":
                case "office.chat.list_threads":
                case "office.study.start":
                case "office.study.generate_practice":
                case "office.study.score_practice":
                case "office.study.generate_defense":
                case "office.study.score_defense":
                case "office.study.save_reflection":
                case "office.research.run":
                case "office.research.save":
                case "office.watchlist.run":
                case "office.inbox.list":
                case "office.inbox.resolve":
                case "office.inbox.queue":
                case "office.history.reset":
                case "office.workspace.reset":
                case "office.library.import":
                    await HandleOfficeBrokerMessageAsync(messageType!, GetPayload(root));
                    break;
                case "runtime.clear_log":
                    PostEvent("runtime.log", new { reset = true });
                    SendLog("SYS", "Log view cleared.", "sys");
                    if (_selectedLogSourceId.Equals("transcript", StringComparison.OrdinalIgnoreCase))
                    {
                        await PublishSelectedLogSourceAsync(force: true);
                    }
                    break;
                case "runtime.service.start":
                    await RunServiceActionAsync(GetPayloadServiceId(root), "start");
                    break;
                case "runtime.service.stop":
                    await RunServiceActionAsync(GetPayloadServiceId(root), "stop");
                    break;
                case "runtime.service.restart":
                    await RunServiceActionAsync(GetPayloadServiceId(root), "restart");
                    break;
                case "runtime.service.open_logs":
                    await OpenLogsAsync(GetPayloadServiceId(root));
                    break;
                case "runtime.logs.select_source":
                case "shell.logs.select_source":
                    await SelectLogSourceAsync(GetPayloadString(root, "sourceId"), fromServiceAction: false);
                    break;
                case "runtime.logs.open_external":
                    await OpenSelectedLogSourceExternallyAsync(GetPayloadString(root, "sourceId"));
                    break;
                case "shell.window_state.update":
                case "shell.ui_state.update":
                    UpdateShellPreferences(GetPayload(root));
                    break;
                case "shell.copy_text":
                    CopyTextToClipboard(GetPayloadString(root, "text"));
                    break;
                case "suite.route.open":
                    await OpenSuiteRouteAsync(
                        GetPayloadRouteId(root),
                        GetPayloadRoutePath(root),
                        GetPayloadRouteTitle(root));
                    break;
                case "suite.support.open-bootstrap-log":
                    await OpenBootstrapLogAsync();
                    break;
                case "suite.support.open-status-dir":
                    await OpenStatusDirectoryAsync();
                    break;
                case "suite.support.copy-summary":
                    CopySupportSummaryToClipboard();
                    break;
                case "suite.support.apply-workstation-profile":
                    await ApplyWorkstationProfileAsync();
                    break;
                case "suite.support.export-bundle":
                    await ExportSupportBundleAsync();
                    break;
                case "suite.companion.launch":
                    await RunCompanionActionAsync(GetPayloadCompanionAppId(root), "launch");
                    break;
                case "suite.companion.relaunch":
                    await RunCompanionActionAsync(GetPayloadCompanionAppId(root), "relaunch");
                    break;
                case "suite.companion.open-folder":
                    await RunCompanionActionAsync(GetPayloadCompanionAppId(root), "open-folder");
                    break;
                case "shell.open_path":
                    await OpenShellPathAsync(GetPayloadPath(root));
                    break;
                case "shell.open_external":
                    await OpenExternalTargetAsync(GetPayloadString(root, "target"));
                    break;
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-message", exception);
            SendError("Runtime shell command failed.", exception.Message);
        }
    }

    private void EnsureVisibleOnDesktop()
    {
        if (_isClosing || IsDisposed)
        {
            return;
        }

        void ActivateShell()
        {
            if (_isClosing || IsDisposed)
            {
                return;
            }

            try
            {
                if (WindowState == FormWindowState.Minimized)
                {
                    WindowState = FormWindowState.Normal;
                }

                ShowInTaskbar = true;
                BringToFront();
                Activate();
                Focus();
                TopMost = true;
                TopMost = false;
                _instanceCoordinator.ReportHeartbeat(
                    activatable: true,
                    statusMessage: _uiReady ? "Shell window activated." : "Shell window is visible.");
            }
            catch (Exception exception)
            {
                RuntimeShellLogger.LogException("runtime-shell-activate", exception);
            }
        }

        try
        {
            if (IsHandleCreated)
            {
                BeginInvoke((MethodInvoker)ActivateShell);
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-activate-schedule", exception);
        }
    }

    private async Task OnPollTickAsync()
    {
        if (_isClosing)
        {
            return;
        }

        try
        {
            PumpRuntimeLog();
            await PublishSnapshotAsync();
            await PublishSelectedLogSourceAsync();
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-poll", exception);
            SendError("Status refresh failed.", exception.Message);
        }
    }

    private async Task RunBootstrapAllAsync(bool autoTriggered)
    {
        if (!TryBeginAction("bootstrap_all", null))
        {
            RuntimeShellLogger.Log($"runtime-shell-bootstrap-skipped: autoTriggered={autoTriggered}; actionBusy={_actionBusy}");
            return;
        }

        try
        {
            RuntimeShellLogger.Log($"runtime-shell-bootstrap-run: autoTriggered={autoTriggered}");
            _runtimeLogOffset = GetCurrentLogLength();
            SendLog(
                "START",
                autoTriggered
                    ? "Auto-bootstrap started after Windows sign-in."
                    : "Bootstrapping local Suite runtime.",
                "hi");
            SendProgress(visible: true, percent: 6, step: "Checking Docker and local runtime prerequisites.");

            var result = await ProcessRunner.RunPowerShellFileAsync(
                _bootstrapScriptPath,
                _repoRoot,
                new[] { "-RepoRoot", _repoRoot, "-Json" });
            RuntimeShellLogger.Log($"runtime-shell-bootstrap-result: autoTriggered={autoTriggered}; succeeded={result.Succeeded}; outputLength={result.CombinedOutput.Length}");

            PumpRuntimeLog();
            await PublishSnapshotAsync(force: true);
            PublishProgressFromSnapshot();

            var summary = TryGetSummaryFromJson(result.CombinedOutput) ??
                (result.Succeeded ? "Runtime bootstrap completed." : "Runtime bootstrap needs attention.");
            if (result.Succeeded)
            {
                SendLog("OK", summary, "ok hi");
            }
            else
            {
                SendLog("ERR", summary, "err");
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-bootstrap", exception);
            SendError("Runtime bootstrap failed.", exception.Message);
        }
        finally
        {
            EndAction();
        }
    }

    private async Task RunStartAllAsync()
    {
        if (!TryBeginAction("start_all", null))
        {
            return;
        }

        try
        {
            SendLog("START", "Starting all runtime services.", "hi");
            await PublishSnapshotAsync(force: true);

            foreach (var serviceId in _runtimeCatalog.ServiceOrder)
            {
                var service = FindService(serviceId);
                if (service is null)
                {
                    continue;
                }

                var serviceName = GetServiceName(service.Value, serviceId) ?? serviceId;
                if (ServiceIsReady(service.Value))
                {
                    continue;
                }

                if (ServiceIsActive(service.Value))
                {
                    SendLog("INFO", $"Waiting for {serviceName} to finish starting.", "info");
                    SendProgress(true, ComputeStartProgressPercent(serviceId), $"Waiting for {serviceName} to finish starting.");
                    var alreadyStartingReady = await WaitForServiceConditionAsync(serviceId, ServiceIsReady, TimeSpan.FromSeconds(40));
                    await PublishSnapshotAsync(force: true);
                    PublishProgressFromSnapshot();
                    if (!alreadyStartingReady)
                    {
                        SendLog("ERR", $"{serviceName} did not reach a ready state.", "err");
                        return;
                    }

                    SendLog("OK", $"{serviceName} is ready.", "ok");
                    continue;
                }

                SendLog("INFO", $"Starting {serviceName}.", "info");
                SendProgress(true, ComputeStartProgressPercent(serviceId), $"Starting {serviceName}.");

                var result = await RunControlActionAsync(serviceId, "start");
                var ready = await WaitForServiceConditionAsync(serviceId, ServiceIsReady, TimeSpan.FromSeconds(40));
                await PublishSnapshotAsync(force: true);
                PublishProgressFromSnapshot();

                var refreshedService = FindService(serviceId);
                var refreshedSummary = refreshedService.HasValue ? GetStringProperty(refreshedService.Value, "summary") : null;
                var refreshedDetails = refreshedService.HasValue ? GetStringProperty(refreshedService.Value, "details") : null;

                if (!ready)
                {
                    SendLog("ERR", refreshedSummary ?? result.Summary ?? $"Failed to start {serviceName}.", "err");
                    if (!string.IsNullOrWhiteSpace(refreshedDetails))
                    {
                        SendLog("WARN", refreshedDetails, "warn");
                    }
                    else if (!string.IsNullOrWhiteSpace(result.Details))
                    {
                        SendLog("WARN", result.Details, "warn");
                    }
                    return;
                }

                SendLog("OK", refreshedSummary ?? result.Summary ?? $"{serviceName} started.", "ok");
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-start-all", exception);
            SendError("Start all failed.", exception.Message);
        }
        finally
        {
            EndAction();
        }
    }

    private async Task RunStopAllAsync()
    {
        if (!TryBeginAction("stop_all", null))
        {
            return;
        }

        try
        {
            _runtimeLogOffset = GetCurrentLogLength();
            SendLog("START", "Stopping all runtime services.", "hi");
            SendProgress(visible: true, percent: 12, step: "Stopping local services.");

            var result = await ProcessRunner.RunPowerShellFileAsync(
                _stopScriptPath,
                _repoRoot,
                new[] { "-RepoRoot", _repoRoot, "-IncludeFrontend", "-Json" });

            PumpRuntimeLog();
            await PublishSnapshotAsync(force: true);
            PublishProgressFromSnapshot();

            var summary = TryGetSummaryFromJson(result.CombinedOutput) ??
                (result.Succeeded ? "Runtime services stopped." : "Runtime stop needs attention.");
            var warnings = TryGetStringArrayFromJson(result.CombinedOutput, "warnings");
            if (result.Succeeded)
            {
                SendLog("OK", summary, "ok");
            }
            else
            {
                SendLog("ERR", summary, "err");
            }

            foreach (var warning in warnings)
            {
                if (!string.IsNullOrWhiteSpace(warning))
                {
                    SendLog("WARN", warning, "warn");
                }
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-stop-all", exception);
            SendError("Stop all failed.", exception.Message);
        }
        finally
        {
            EndAction();
        }
    }

    private async Task RunServiceActionAsync(string? serviceId, string action)
    {
        if (string.IsNullOrWhiteSpace(serviceId))
        {
            SendError("Service action failed.", "No service id was provided.");
            return;
        }

        if (!TryBeginAction($"service.{action}", serviceId))
        {
            return;
        }

        try
        {
            var existingService = FindService(serviceId);
            var serviceName = existingService.HasValue ? GetServiceName(existingService.Value, serviceId) : null;
            serviceName ??= serviceId;
            SendLog("START", $"{ToPresentTense(action)} {serviceName}.", "hi");
            SendProgress(visible: true, percent: 35, step: $"{ToPresentTense(action)} {serviceName}.");

            var result = await RunControlActionAsync(serviceId, action);
            var actionSettled = action switch
            {
                "start" or "restart" => await WaitForServiceConditionAsync(serviceId, ServiceIsReady, TimeSpan.FromSeconds(40)),
                "stop" => await WaitForServiceConditionAsync(serviceId, ServiceSatisfiesStop, TimeSpan.FromSeconds(20)),
                _ => result.Ok,
            };
            await PublishSnapshotAsync(force: true);
            PublishProgressFromSnapshot();

            var refreshedService = FindService(serviceId);
            var refreshedSummary = refreshedService.HasValue ? GetStringProperty(refreshedService.Value, "summary") : null;
            var refreshedDetails = refreshedService.HasValue ? GetStringProperty(refreshedService.Value, "details") : null;

            if (result.SkippedForSafety)
            {
                SendLog("WARN", refreshedSummary ?? result.Summary ?? $"{serviceName} {action} skipped for safety.", "warn");
                if (!string.IsNullOrWhiteSpace(refreshedDetails))
                {
                    SendLog("INFO", refreshedDetails, "info");
                }
                else if (!string.IsNullOrWhiteSpace(result.Details))
                {
                    SendLog("INFO", result.Details, "info");
                }
            }
            else if (actionSettled)
            {
                SendLog("OK", refreshedSummary ?? result.Summary ?? $"{serviceName} {action} completed.", "ok");
                if (!string.IsNullOrWhiteSpace(refreshedDetails))
                {
                    SendLog("INFO", refreshedDetails, "info");
                }
                else if (!string.IsNullOrWhiteSpace(result.Details))
                {
                    SendLog("INFO", result.Details, "info");
                }
            }
            else
            {
                SendLog("ERR", refreshedSummary ?? result.Summary ?? $"{serviceName} {action} failed.", "err");
                if (!string.IsNullOrWhiteSpace(refreshedDetails))
                {
                    SendLog("WARN", refreshedDetails, "warn");
                }
                else if (!string.IsNullOrWhiteSpace(result.Details))
                {
                    SendLog("WARN", result.Details, "warn");
                }
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException($"runtime-shell-service-{action}", exception);
            SendError($"Service {action} failed.", exception.Message);
        }
        finally
        {
            EndAction();
        }
    }

    private async Task OpenLogsAsync(string? serviceId)
    {
        if (string.IsNullOrWhiteSpace(serviceId))
        {
            SendError("Open logs failed.", "No service id was provided.");
            return;
        }

        try
        {
            var result = await RunControlActionAsync(serviceId, "logs");
            if (!result.HasLogTarget)
            {
                SendError("Open logs failed.", result.Summary ?? "No log target is available.");
                return;
            }
            await FocusLogSourceAsync(serviceId, result.LogTargetTarget);
            SendLog("SYS", $"Focused logs for {serviceId}.", "sys");
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-open-logs", exception);
            SendError("Open logs failed.", exception.Message);
        }
    }

    private Task OpenSuiteRouteAsync(string? routeId, string? routePath, string? routeTitle)
    {
        if (string.IsNullOrWhiteSpace(routeId) && string.IsNullOrWhiteSpace(routePath))
        {
            SendError("Open route failed.", "No Suite route was provided.");
            return Task.CompletedTask;
        }

        var resolvedRoutePath = routePath;
        if (string.IsNullOrWhiteSpace(resolvedRoutePath))
        {
            if (string.IsNullOrWhiteSpace(routeId) || !_runtimeCatalog.TryResolveRoutePath(routeId, out resolvedRoutePath))
            {
                SendError("Open route failed.", $"Route '{routeId}' is not supported.");
                return Task.CompletedTask;
            }
        }

        try
        {
            var baseUrl = ResolveSuiteFrontendBaseUrl();
            var targetUri = BuildSuiteRouteUri(baseUrl, resolvedRoutePath);
            Process.Start(new ProcessStartInfo
            {
                FileName = targetUri.ToString(),
                UseShellExecute = true,
            });

            var routeLabel = !string.IsNullOrWhiteSpace(routeTitle) ? routeTitle : resolvedRoutePath;
            SendLog("SYS", $"Opened {routeLabel} in browser.", "sys");
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-open-route", exception);
            SendError("Open route failed.", exception.Message);
        }

        return Task.CompletedTask;
    }

    private Task OpenShellPathAsync(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            SendError("Open path failed.", "No local path was provided.");
            return Task.CompletedTask;
        }

        var resolvedPath = path.Equals("autodesk-project-flow-reference", StringComparison.OrdinalIgnoreCase)
            ? _autodeskProjectFlowReferencePath
            : path;

        try
        {
            if (resolvedPath.StartsWith("shell:", StringComparison.OrdinalIgnoreCase))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = resolvedPath,
                    UseShellExecute = true,
                });
                SendLog("SYS", $"Opened {resolvedPath}.", "sys");
                return Task.CompletedTask;
            }

            if (Directory.Exists(resolvedPath))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = $"\"{resolvedPath}\"",
                    UseShellExecute = true,
                });
                SendLog("SYS", $"Opened {resolvedPath}.", "sys");
                return Task.CompletedTask;
            }

            if (File.Exists(resolvedPath))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = resolvedPath,
                    UseShellExecute = true,
                });
                SendLog("SYS", $"Opened {resolvedPath}.", "sys");
                return Task.CompletedTask;
            }

            if (Uri.TryCreate(resolvedPath, UriKind.Absolute, out var uri) &&
                (uri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) ||
                 uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = resolvedPath,
                    UseShellExecute = true,
                });
                SendLog("SYS", $"Opened {resolvedPath}.", "sys");
                return Task.CompletedTask;
            }

            SendError("Open path failed.", $"The path was not found: {resolvedPath}");
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-open-path", exception);
            SendError("Open path failed.", exception.Message);
        }

        return Task.CompletedTask;
    }

    private Task OpenExternalTargetAsync(string? target)
    {
        if (string.IsNullOrWhiteSpace(target))
        {
            SendError("Open external target failed.", "No external target was provided.");
            return Task.CompletedTask;
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = target,
                UseShellExecute = true,
            });
            SendLog("SYS", $"Opened {target}.", "sys");
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-open-external", exception);
            SendError("Open external target failed.", exception.Message);
        }

        return Task.CompletedTask;
    }

    private void PublishRuntimeCatalog()
    {
        try
        {
            PostRawEvent("runtime.catalog", _runtimeCatalogJson);
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-runtime-catalog", exception);
            PostEvent("runtime.catalog", _runtimeCatalog);
            SendError("Runtime catalog failed to load.", exception.Message);
        }
    }

    private void PublishDeveloperToolsManifest()
    {
        try
        {
            if (!File.Exists(_developerToolsManifestPath))
            {
                PostRawEvent("developer.manifest", "{\"groups\":[],\"tools\":[]}");
                SendLog("WARN", $"Developer tools manifest is missing: {_developerToolsManifestPath}", "warn");
                return;
            }

            var manifestJson = File.ReadAllText(_developerToolsManifestPath);
            using var _ = JsonDocument.Parse(manifestJson);
            PostRawEvent("developer.manifest", manifestJson);
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-developer-manifest", exception);
            PostRawEvent("developer.manifest", "{\"groups\":[],\"tools\":[]}");
            SendError("Developer tools manifest failed to load.", exception.Message);
        }
    }

    private Task OpenBootstrapLogAsync()
    {
        try
        {
            return SelectLogSourceAsync("bootstrap", fromServiceAction: true);
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-open-bootstrap-log", exception);
            SendError("Open bootstrap log failed.", exception.Message);
        }

        return Task.CompletedTask;
    }

    private Task OpenStatusDirectoryAsync()
    {
        try
        {
            Directory.CreateDirectory(_runtimeStatusDirectory);
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = $"\"{_runtimeStatusDirectory}\"",
                UseShellExecute = true,
            });

            SendLog("SYS", "Opened runtime status directory.", "sys");
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-open-status-dir", exception);
            SendError("Open status directory failed.", exception.Message);
        }

        return Task.CompletedTask;
    }

    private void CopySupportSummaryToClipboard()
    {
        try
        {
            var summary = BuildSupportSummary();
            Clipboard.SetText(summary);
            SendLog("SYS", "Copied support summary to clipboard.", "sys");
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-copy-support-summary", exception);
            SendError("Copy support summary failed.", exception.Message);
        }
    }

    private async Task ApplyWorkstationProfileAsync()
    {
        if (!TryBeginAction("support.apply-workstation-profile", null))
        {
            return;
        }

        try
        {
            SendLog("START", "Applying workstation profile.", "hi");
            var result = await ProcessRunner.RunPowerShellFileAsync(
                _workstationProfileScriptPath,
                _repoRoot,
                new[] { "-RepoRoot", _repoRoot, "-Json" });

            string? summary = null;
            string? details = null;
            var ok = result.Succeeded;
            if (TryExtractJsonObject(result.CombinedOutput, out var payloadJson))
            {
                using var document = JsonDocument.Parse(payloadJson);
                var root = document.RootElement;
                ok = root.TryGetProperty("ok", out var okElement) && okElement.ValueKind is JsonValueKind.True;
                var workstationId = GetStringProperty(root, "workstationId");
                var workstationLabel = GetStringProperty(root, "workstationLabel");
                var workstationRole = GetStringProperty(root, "workstationRole");
                summary = ok
                    ? "Applied the workstation profile."
                    : "Workstation profile apply failed.";
                details = string.Join(
                    " | ",
                    new[] { workstationId, workstationLabel, workstationRole }
                        .Where(static part => !string.IsNullOrWhiteSpace(part)));
            }
            else
            {
                details = result.CombinedOutput;
            }

            await PublishSnapshotAsync(force: true);

            if (ok)
            {
                SendLog("OK", summary ?? "Applied the workstation profile.", "ok");
                if (!string.IsNullOrWhiteSpace(details))
                {
                    SendLog("INFO", details, "info");
                }
                SendLog("INFO", "Restart Codex if you need MCP/workstation env changes to reload immediately.", "info");
                return;
            }

            SendLog("ERR", summary ?? "Workstation profile apply failed.", "err");
            if (!string.IsNullOrWhiteSpace(details))
            {
                SendLog("WARN", details, "warn");
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-apply-workstation-profile", exception);
            SendError("Apply workstation profile failed.", exception.Message);
        }
        finally
        {
            EndAction();
        }
    }

    private async Task ExportSupportBundleAsync()
    {
        try
        {
            SendLog("START", "Exporting support bundle.", "hi");
            var result = await ProcessRunner.RunPowerShellFileAsync(
                _supportBundleScriptPath,
                _repoRoot,
                new[] { "-RepoRoot", _repoRoot, "-Json" });

            if (!TryExtractJsonObject(result.CombinedOutput, out var payloadJson))
            {
                SendError("Support bundle export failed.", "The export script did not return JSON.");
                return;
            }

            using var document = JsonDocument.Parse(payloadJson);
            var root = document.RootElement;
            var ok = root.TryGetProperty("ok", out var okElement) && okElement.ValueKind is JsonValueKind.True;
            var summary = GetStringProperty(root, "summary") ?? (ok ? "Support bundle exported." : "Support bundle export completed with warnings.");
            var archivePath = GetStringProperty(root, "archivePath");
            var bundleDir = GetStringProperty(root, "bundleDir");
            var warningCount = root.TryGetProperty("warningCount", out var warningCountElement) &&
                warningCountElement.TryGetInt32(out var warningCountValue)
                    ? warningCountValue
                    : 0;

            if (ok)
            {
                SendLog("OK", summary, "ok");
            }
            else
            {
                SendLog("WARN", summary, "warn");
            }

            if (warningCount > 0)
            {
                SendLog("WARN", $"{warningCount} support bundle warning{(warningCount == 1 ? string.Empty : "s")} were recorded. Review the generated manifest for detail.", "warn");
            }

            if (!string.IsNullOrWhiteSpace(archivePath) && File.Exists(archivePath))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = $"/select,\"{archivePath}\"",
                    UseShellExecute = true,
                });
                SendLog("SYS", $"Opened support bundle location: {archivePath}", "sys");
                return;
            }

            if (!string.IsNullOrWhiteSpace(bundleDir) && Directory.Exists(bundleDir))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = $"\"{bundleDir}\"",
                    UseShellExecute = true,
                });
                SendLog("SYS", $"Opened support bundle directory: {bundleDir}", "sys");
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-export-support-bundle", exception);
            SendError("Support bundle export failed.", exception.Message);
        }
    }

    private async Task RunCompanionActionAsync(string? companionAppId, string action)
    {
        if (string.IsNullOrWhiteSpace(companionAppId))
        {
            SendError("Companion action failed.", "No companion app id was provided.");
            return;
        }

        if (!TryBeginAction($"companion.{action}", companionAppId))
        {
            return;
        }

        try
        {
            SendLog("START", $"{ToPresentTense(action)} {companionAppId}.", "hi");

            var result = await ProcessRunner.RunPowerShellFileAsync(
                _companionControlScriptPath,
                _repoRoot,
                new[] { "-CompanionAppId", companionAppId, "-Action", action, "-RepoRoot", _repoRoot, "-LaunchSource", "runtime-control", "-Json" });

            string? summary = null;
            string? details = null;
            var ok = result.Succeeded;
            if (TryExtractJsonObject(result.CombinedOutput, out var payloadJson))
            {
                using var document = JsonDocument.Parse(payloadJson);
                var root = document.RootElement;
                ok = root.TryGetProperty("ok", out var okElement) && okElement.ValueKind is JsonValueKind.True;
                summary = GetStringProperty(root, "summary");
                details = GetStringProperty(root, "details");
            }
            else
            {
                details = result.CombinedOutput;
            }

            await PublishSnapshotAsync(force: true);

            if (ok)
            {
                SendLog("OK", summary ?? $"{companionAppId} {action} completed.", "ok");
                if (!string.IsNullOrWhiteSpace(details))
                {
                    SendLog("INFO", details, "info");
                }
                return;
            }

            SendLog("ERR", summary ?? $"{companionAppId} {action} failed.", "err");
            if (!string.IsNullOrWhiteSpace(details))
            {
                SendLog("WARN", details, "warn");
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException($"runtime-shell-companion-{action}", exception);
            SendError("Companion action failed.", exception.Message);
        }
        finally
        {
            EndAction();
        }
    }

    private string BuildSupportSummary()
    {
        if (_lastSnapshotDocument is not null)
        {
            var root = _lastSnapshotDocument.RootElement;
            if (root.TryGetProperty("support", out var support))
            {
                var sharedText = GetStringProperty(support, "text");
                if (!string.IsNullOrWhiteSpace(sharedText))
                {
                    return sharedText;
                }

                if (support.TryGetProperty("lines", out var sharedLinesElement) && sharedLinesElement.ValueKind == JsonValueKind.Array)
                {
                    var sharedLines = sharedLinesElement
                        .EnumerateArray()
                        .Where(element => element.ValueKind == JsonValueKind.String)
                        .Select(element => element.GetString())
                        .Where(line => !string.IsNullOrWhiteSpace(line))
                        .ToArray();
                    if (sharedLines.Length > 0)
                    {
                        return string.Join(Environment.NewLine, sharedLines!);
                    }
                }
            }
        }

        var lines = new List<string>
        {
            "Suite Runtime Control Support Summary",
            $"Generated: {FormatSupportSummaryTimestamp(DateTimeOffset.Now)}",
            $"Repo: {_repoRoot}",
            $"Bootstrap log: {_runtimeLogPath}",
            $"Status directory: {_runtimeStatusDirectory}",
        };

        if (_lastSnapshotDocument is null)
        {
            lines.Add("Runtime snapshot: unavailable");
            return string.Join(Environment.NewLine, lines);
        }

        var snapshotRoot = _lastSnapshotDocument.RootElement;
        var overallState = TryGetNestedStringProperty(snapshotRoot, "overall", "state") ?? "unknown";
        var overallText = TryGetNestedStringProperty(snapshotRoot, "overall", "text") ?? "Unknown";
        lines.Add($"Overall: {overallText} ({overallState})");

        if (snapshotRoot.TryGetProperty("doctor", out var doctor))
        {
            var doctorState = GetStringProperty(doctor, "overallState") ?? "unknown";
            var actionableIssueCount = doctor.TryGetProperty("actionableIssueCount", out var actionableCountElement) &&
                actionableCountElement.TryGetInt32(out var actionableIssueCountValue)
                    ? actionableIssueCountValue
                    : 0;
            lines.Add($"Suite doctor: {doctorState}; actionable issues {actionableIssueCount}");

            if (doctor.TryGetProperty("recommendations", out var recommendations) && recommendations.ValueKind == JsonValueKind.Array)
            {
                foreach (var recommendation in recommendations.EnumerateArray().Take(2))
                {
                    if (recommendation.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(recommendation.GetString()))
                    {
                        lines.Add($"Recommendation: {recommendation.GetString()}");
                    }
                }
            }
        }

        if (snapshotRoot.TryGetProperty("runtime", out var runtime))
        {
            var bootstrapSummary = TryGetNestedStringProperty(runtime, "lastBootstrap", "summary");
            if (!string.IsNullOrWhiteSpace(bootstrapSummary))
            {
                lines.Add($"Last bootstrap: {bootstrapSummary}");
            }
        }

        if (snapshotRoot.TryGetProperty("services", out var services) && services.ValueKind == JsonValueKind.Array)
        {
            lines.Add("Services:");
            foreach (var serviceId in _runtimeCatalog.ServiceOrder)
            {
                if (!TryFindService(snapshotRoot, serviceId, out var service))
                {
                    continue;
                }

                var serviceName = GetServiceName(service, serviceId) ?? serviceId;
                var serviceState = GetStringProperty(service, "state") ?? "unknown";
                var serviceSummary = GetStringProperty(service, "summary") ?? "No summary reported.";
                lines.Add($"- {serviceName}: {serviceState} — {serviceSummary}");
            }
        }

        return string.Join(Environment.NewLine, lines);
    }

    private string ResolveSuiteFrontendBaseUrl()
    {
        const string fallbackBaseUrl = "http://127.0.0.1:5173";
        if (_lastSnapshotDocument is null)
        {
            return fallbackBaseUrl;
        }

        if (!TryFindService(_lastSnapshotDocument.RootElement, "frontend", out var frontendService))
        {
            return fallbackBaseUrl;
        }

        var localUrl = TryGetServiceNoteValue(frontendService, "Local URL");
        if (!string.IsNullOrWhiteSpace(localUrl) && Uri.TryCreate(localUrl, UriKind.Absolute, out var parsedLocalUrl))
        {
            return parsedLocalUrl.GetLeftPart(UriPartial.Authority);
        }

        var logTargetKind = TryGetNestedStringProperty(frontendService, "logTarget", "kind");
        var logTargetTarget = TryGetNestedStringProperty(frontendService, "logTarget", "target");
        if (
            string.Equals(logTargetKind, "url", StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(logTargetTarget) &&
            Uri.TryCreate(logTargetTarget, UriKind.Absolute, out var parsedLogTarget))
        {
            return parsedLogTarget.GetLeftPart(UriPartial.Authority);
        }

        return fallbackBaseUrl;
    }

    private static Uri BuildSuiteRouteUri(string baseUrl, string routePath)
    {
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var parsedBaseUri))
        {
            parsedBaseUri = new Uri("http://127.0.0.1:5173/", UriKind.Absolute);
        }

        var rootUri = new Uri($"{parsedBaseUri.GetLeftPart(UriPartial.Authority)}/", UriKind.Absolute);
        var normalizedRoute = string.IsNullOrWhiteSpace(routePath) ? "/app/home" : routePath.Trim();
        if (!normalizedRoute.StartsWith('/'))
        {
            normalizedRoute = "/" + normalizedRoute;
        }

        return new Uri(rootUri, normalizedRoute);
    }

    private bool TryBeginAction(string action, string? serviceId)
    {
        if (_isClosing)
        {
            return false;
        }

        if (_actionBusy)
        {
            SendError("Another runtime action is already in progress.", "Wait for the current action to finish.");
            return false;
        }

        _actionBusy = true;
        _activeAction = action;
        _activeServiceId = serviceId;
        PostEvent("runtime.action_state", new { busy = true, action, serviceId });
        return true;
    }

    private void EndAction()
    {
        _actionBusy = false;
        _activeAction = null;
        _activeServiceId = null;
        PostEvent("runtime.action_state", new { busy = false, action = (string?)null, serviceId = (string?)null });
        SendProgress(visible: false, percent: 0, step: string.Empty);
    }

    private async Task PublishSnapshotAsync(bool force = false)
    {
        if (_isClosing || (!_uiReady && !force))
        {
            return;
        }

        if (_snapshotInFlight)
        {
            _snapshotRefreshPending = true;
            return;
        }

        _snapshotInFlight = true;
        try
        {
            do
            {
                _snapshotRefreshPending = false;
                var result = await ProcessRunner.RunPowerShellFileAsync(
                    _statusScriptPath,
                    _repoRoot,
                    new[] { "-RepoRoot", _repoRoot, "-Json" });

                var noiseLines = CollectSnapshotNoiseLines(result);
                foreach (var noiseLine in noiseLines)
                {
                    EmitLogLine(noiseLine);
                }

                if (!TryExtractStructuredJson(result, out var payloadJson, out var parseError))
                {
                    PublishStaleSnapshot(parseError ?? "The status script did not return JSON.");
                    await PublishOfficeSnapshotAsync(force);
                    continue;
                }

                var payloadNode = JsonNode.Parse(payloadJson) as JsonObject;
                if (payloadNode is null)
                {
                    PublishStaleSnapshot("The runtime snapshot payload was not a JSON object.");
                    await PublishOfficeSnapshotAsync(force);
                    continue;
                }

                await EnrichRuntimeSnapshotAsync(payloadNode, force);
                var finalJson = payloadNode.ToJsonString(JsonOptions);

                _lastSnapshotJson = finalJson;
                _lastSnapshotFailureSignature = null;
                _lastSnapshotDocument?.Dispose();
                _lastSnapshotDocument = JsonDocument.Parse(finalJson);
                PostRawEvent("runtime.snapshot", finalJson);
                PublishLogSources();
                PublishBootstrapStateFromSnapshot();
                PublishShellWindowState();
                await PublishSelectedLogSourceAsync(force: true);
                await PublishOfficeSnapshotAsync(force);

                if (_actionBusy)
                {
                    PublishProgressFromSnapshot();
                }
            }
            while (_snapshotRefreshPending && !_isClosing);
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-snapshot", exception);
            SendError("Runtime snapshot failed.", exception.Message);
        }
        finally
        {
            _snapshotInFlight = false;
        }
    }

    private async Task RunResetAllAsync()
    {
        if (!TryBeginAction("reset_all", null))
        {
            return;
        }

        try
        {
            _runtimeLogOffset = GetCurrentLogLength();
            SendLog("START", "Resetting local runtime services without clearing local data.", "hi");
            SendProgress(visible: true, percent: 8, step: "Stopping local services before reset.");

            var stopResult = await ProcessRunner.RunPowerShellFileAsync(
                _stopScriptPath,
                _repoRoot,
                new[] { "-RepoRoot", _repoRoot, "-IncludeFrontend", "-Json" });

            PumpRuntimeLog();
            await PublishSnapshotAsync(force: true);
            PublishProgressFromSnapshot();

            var stopSummary = TryGetSummaryFromJson(stopResult.CombinedOutput) ??
                (stopResult.Succeeded ? "Runtime services stopped." : "Runtime stop needs attention.");
            if (stopResult.Succeeded)
            {
                SendLog("OK", stopSummary, "ok");
            }
            else
            {
                SendLog("ERR", stopSummary, "err");
            }

            foreach (var warning in TryGetStringArrayFromJson(stopResult.CombinedOutput, "warnings"))
            {
                if (!string.IsNullOrWhiteSpace(warning))
                {
                    SendLog("WARN", warning, "warn");
                }
            }

            if (!stopResult.Succeeded)
            {
                return;
            }

            SendProgress(visible: true, percent: 48, step: "Bootstrapping runtime services after reset.");

            var bootstrapResult = await ProcessRunner.RunPowerShellFileAsync(
                _bootstrapScriptPath,
                _repoRoot,
                new[] { "-RepoRoot", _repoRoot, "-Json" });

            PumpRuntimeLog();
            await PublishSnapshotAsync(force: true);
            PublishProgressFromSnapshot();

            var bootstrapSummary = TryGetSummaryFromJson(bootstrapResult.CombinedOutput) ??
                (bootstrapResult.Succeeded ? "Runtime reset completed." : "Runtime reset needs attention.");
            if (bootstrapResult.Succeeded)
            {
                SendLog("OK", bootstrapSummary, "ok hi");
            }
            else
            {
                SendLog("ERR", bootstrapSummary, "err");
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-reset-all", exception);
            SendError("Reset all failed.", exception.Message);
        }
        finally
        {
            EndAction();
        }
    }

    private void ApplyInitialShellWindowState()
    {
        var shellState = LoadShellWindowState();

        _utilityPaneWidth = RuntimeShellDisplaySettings.NormalizeUtilityPaneWidth(shellState?.UtilityPaneWidth);
        _utilityPaneCollapsed = shellState?.UtilityPaneCollapsed ?? true;
        _selectedUtilityTab = NormalizeUtilityTab(shellState?.UtilityPaneTab);
        _selectedLogSourceId = ResolveValidLogSourceId(shellState?.ActiveLogSourceId);
        _contentScalePercent = RuntimeShellDisplaySettings.NormalizeContentScalePercent(shellState?.ContentScalePercent);

        var workingArea = GetPreferredWorkingArea(shellState);
        var initialBounds = ResolveInitialShellBounds(shellState, workingArea, MinimumSize);

        StartPosition = FormStartPosition.Manual;
        Bounds = initialBounds;
        WindowState = shellState is not null &&
            shellState.WindowState.Equals("Maximized", StringComparison.OrdinalIgnoreCase)
                ? FormWindowState.Maximized
                : FormWindowState.Normal;
    }

    private static System.Drawing.Rectangle GetPreferredWorkingArea(RuntimeShellWindowState? shellState)
    {
        if (shellState is not null && shellState.Width > 0 && shellState.Height > 0)
        {
            var center = new System.Drawing.Point(
                shellState.Left + Math.Max(shellState.Width / 2, 0),
                shellState.Top + Math.Max(shellState.Height / 2, 0));
            return Screen.FromPoint(center).WorkingArea;
        }

        return Screen.FromPoint(Cursor.Position).WorkingArea;
    }

    private static System.Drawing.Rectangle ResolveInitialShellBounds(
        RuntimeShellWindowState? shellState,
        System.Drawing.Rectangle workingArea,
        System.Drawing.Size minimumSize)
    {
        var defaultSize = new System.Drawing.Size(
            Math.Max(1600, (int)Math.Round(workingArea.Width * 0.9d)),
            Math.Max(980, (int)Math.Round(workingArea.Height * 0.9d)));
        var desiredBounds = shellState is not null && shellState.Width > 0 && shellState.Height > 0
            ? new System.Drawing.Rectangle(shellState.Left, shellState.Top, shellState.Width, shellState.Height)
            : CenterShellBoundsInWorkingArea(workingArea, defaultSize, minimumSize);

        return ClampShellBoundsToWorkingArea(desiredBounds, workingArea, minimumSize);
    }

    private static System.Drawing.Rectangle CenterShellBoundsInWorkingArea(
        System.Drawing.Rectangle workingArea,
        System.Drawing.Size desiredSize,
        System.Drawing.Size minimumSize)
    {
        var width = ClampShellDimension(desiredSize.Width, workingArea.Width, minimumSize.Width);
        var height = ClampShellDimension(desiredSize.Height, workingArea.Height, minimumSize.Height);
        var left = workingArea.Left + Math.Max((workingArea.Width - width) / 2, 0);
        var top = workingArea.Top + Math.Max((workingArea.Height - height) / 2, 0);
        return new System.Drawing.Rectangle(left, top, width, height);
    }

    private static System.Drawing.Rectangle ClampShellBoundsToWorkingArea(
        System.Drawing.Rectangle bounds,
        System.Drawing.Rectangle workingArea,
        System.Drawing.Size minimumSize)
    {
        var width = ClampShellDimension(bounds.Width, workingArea.Width, minimumSize.Width);
        var height = ClampShellDimension(bounds.Height, workingArea.Height, minimumSize.Height);
        var maxLeft = Math.Max(workingArea.Left, workingArea.Right - width);
        var maxTop = Math.Max(workingArea.Top, workingArea.Bottom - height);
        var left = Math.Clamp(bounds.Left, workingArea.Left, maxLeft);
        var top = Math.Clamp(bounds.Top, workingArea.Top, maxTop);
        return new System.Drawing.Rectangle(left, top, width, height);
    }

    private static int ClampShellDimension(int desired, int available, int minimum)
    {
        if (available <= 0)
        {
            return Math.Max(desired, minimum);
        }

        if (desired <= 0)
        {
            desired = Math.Min(available, Math.Max(minimum, 1));
        }

        if (available < minimum)
        {
            return available;
        }

        return Math.Clamp(desired, minimum, available);
    }

    private RuntimeShellWindowState? LoadShellWindowState()
    {
        try
        {
            if (!File.Exists(_shellWindowStatePath))
            {
                return null;
            }

            var payload = File.ReadAllText(_shellWindowStatePath);
            return JsonSerializer.Deserialize<RuntimeShellWindowState>(payload, JsonOptions);
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-window-state-load", exception);
            return null;
        }
    }

    private void PersistShellWindowState()
    {
        try
        {
            Directory.CreateDirectory(_runtimeStatusDirectory);
            var bounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
            if (bounds.Width <= 0 || bounds.Height <= 0)
            {
                return;
            }

            var payload = new RuntimeShellWindowState
            {
                Left = bounds.Left,
                Top = bounds.Top,
                Width = bounds.Width,
                Height = bounds.Height,
                WindowState = WindowState == FormWindowState.Maximized ? "Maximized" : "Normal",
                UtilityPaneWidth = RuntimeShellDisplaySettings.NormalizeUtilityPaneWidth(_utilityPaneWidth),
                UtilityPaneCollapsed = _utilityPaneCollapsed,
                UtilityPaneTab = NormalizeUtilityTab(_selectedUtilityTab),
                ActiveLogSourceId = ResolveValidLogSourceId(_selectedLogSourceId),
                ContentScalePercent = RuntimeShellDisplaySettings.NormalizeContentScalePercent(_contentScalePercent),
            };

            File.WriteAllText(
                _shellWindowStatePath,
                JsonSerializer.Serialize(payload, JsonOptions));
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-window-state-save", exception);
        }
    }

    private void ApplyWebViewDpiZoom()
    {
        try
        {
            var zoomFactor = RuntimeShellDisplaySettings.ComputeWebViewZoomFactor(
                DeviceDpi,
                _contentScalePercent);
            if (Math.Abs(_webView.ZoomFactor - zoomFactor) > 0.001d)
            {
                _webView.ZoomFactor = zoomFactor;
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-webview-dpi-zoom", exception);
        }
    }

    private void UpdateWebViewInset()
    {
        try
        {
            var topInset = Math.Max(SystemInformation.CaptionHeight, 24);
            if (Padding.Top != topInset || Padding.Left != 0 || Padding.Right != 0 || Padding.Bottom != 0)
            {
                Padding = new Padding(0, topInset, 0, 0);
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-webview-inset", exception);
        }
    }

    private async Task PublishOfficeSnapshotAsync(bool force = false)
    {
        if (_isClosing || (!_uiReady && !force))
        {
            return;
        }

        if (_officeSnapshotInFlight)
        {
            _officeSnapshotRefreshPending = true;
            return;
        }

        if (!force &&
            !string.IsNullOrWhiteSpace(_lastOfficeSnapshotJson) &&
            (DateTimeOffset.UtcNow - _lastOfficeSnapshotPublishedAt) < TimeSpan.FromSeconds(30))
        {
            PostRawEvent("office.snapshot", _lastOfficeSnapshotJson);
            return;
        }

        _officeSnapshotInFlight = true;
        try
        {
            do
            {
                _officeSnapshotRefreshPending = false;
                _lastOfficeSnapshotJson = await BuildOfficeSnapshotPayloadJsonAsync();
                _lastOfficeSnapshotPublishedAt = DateTimeOffset.UtcNow;
                PostRawEvent("office.snapshot", _lastOfficeSnapshotJson);
            }
            while (_officeSnapshotRefreshPending && !_isClosing);
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-office-snapshot", exception);
            SendError("Office snapshot failed.", exception.Message);
        }
        finally
        {
            _officeSnapshotInFlight = false;
        }
    }

    private static IReadOnlyList<string> CollectSnapshotNoiseLines(ProcessRunResult result)
    {
        var lines = new List<string>();
        AddNoiseFromText(lines, result.StandardError);

        if (!TryExtractJsonRegion(result.StandardOutput, out _, out var outputPrefix, out var outputSuffix))
        {
            AddNoiseFromText(lines, result.StandardOutput);
        }
        else
        {
            AddNoiseFromText(lines, outputPrefix);
            AddNoiseFromText(lines, outputSuffix);
        }

        return lines
            .Where(static line => !string.IsNullOrWhiteSpace(line))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
    }

    private static bool TryExtractStructuredJson(
        ProcessRunResult result,
        out string payloadJson,
        out string? parseError)
    {
        payloadJson = string.Empty;
        parseError = null;

        if (TryExtractJsonRegion(result.StandardOutput, out payloadJson, out _, out _))
        {
            return true;
        }

        if (TryExtractJsonRegion(result.StandardError, out payloadJson, out _, out _))
        {
            return true;
        }

        if (TryExtractJsonRegion(result.CombinedOutput, out payloadJson, out _, out _))
        {
            return true;
        }

        parseError = !string.IsNullOrWhiteSpace(result.StandardError)
            ? result.StandardError
            : "The status script did not return JSON.";
        return false;
    }

    private void PublishStaleSnapshot(string errorText)
    {
        var signature = errorText.Trim();
        if (!string.IsNullOrWhiteSpace(_lastSnapshotJson))
        {
            var snapshotNode = JsonNode.Parse(_lastSnapshotJson) as JsonObject;
            if (snapshotNode is not null)
            {
                snapshotNode["snapshotStale"] = true;
                snapshotNode["snapshotError"] = TruncateMessage(errorText, 360);
                snapshotNode["snapshotCheckedAt"] = DateTimeOffset.Now.ToString("o");
                PostRawEvent("runtime.snapshot", snapshotNode.ToJsonString(JsonOptions));
            }
        }

        if (!string.Equals(signature, _lastSnapshotFailureSignature, StringComparison.Ordinal))
        {
            _lastSnapshotFailureSignature = signature;
            SendError("Runtime snapshot failed.", TruncateMessage(errorText, 360));
        }
    }

    private async Task EnrichRuntimeSnapshotAsync(JsonObject payloadNode, bool force)
    {
        payloadNode["snapshotStale"] = false;
        payloadNode["snapshotError"] = null;
        payloadNode["snapshotCheckedAt"] = DateTimeOffset.Now.ToString("o");
        _lastSupabaseStudioUrl = ResolveSupabaseStudioUrl(payloadNode);
        payloadNode["dockerSummary"] = JsonSerializer.SerializeToNode(await BuildDockerSummaryAsync(payloadNode), JsonOptions);
        payloadNode["logSources"] = JsonSerializer.SerializeToNode(BuildLogSources(), JsonOptions);
        payloadNode["toolingSummary"] = JsonSerializer.SerializeToNode(BuildToolingSummary(), JsonOptions);
        if (await BuildWorkstationContextNodeAsync(force) is JsonObject workstationContextNode)
        {
            payloadNode["workstationContext"] = workstationContextNode;
        }

        if (payloadNode["runtime"] is JsonObject runtimeNode)
        {
            runtimeNode["backendLogPath"] = _backendLogPath;
            runtimeNode["frontendLogPath"] = _frontendLogPath;
            runtimeNode["runtimeLauncherLogPath"] = _runtimeLauncherLogPath;
            runtimeNode["runtimeShellLogPath"] = _runtimeShellLogPath;
            runtimeNode["officeBrokerLogPath"] = _officeBrokerLogPath;
            runtimeNode["filesystemCollectorLogDir"] = _filesystemCollectorLogDir;
            runtimeNode["autocadCollectorLogDir"] = _autocadCollectorLogDir;
        }

        if (payloadNode["support"] is JsonObject supportNode)
        {
            ApplySupportOverrides(supportNode);
        }
    }

    private void ApplySupportOverrides(JsonObject supportNode)
    {
        if (supportNode["config"] is not JsonObject configNode)
        {
            return;
        }

        var officeConfig = ReadOfficeCompanionConfig();
        configNode["stableSuiteRoot"] = _repoRoot;

        var dailyRoot = TryGetJsonString(officeConfig, "dailyRoot")
            ?? TryGetJsonString(officeConfig, "rootDirectory");
        var officeExecutablePath = TryGetJsonString(officeConfig, "executablePath")
            ?? TryGetJsonString(officeConfig, "officeExecutablePath");

        if (!string.IsNullOrWhiteSpace(dailyRoot))
        {
            configNode["dailyRoot"] = dailyRoot;
        }

        if (!string.IsNullOrWhiteSpace(officeExecutablePath))
        {
            configNode["officeExecutablePath"] = officeExecutablePath;
        }

        if (supportNode["paths"] is JsonObject pathsNode)
        {
            pathsNode["backendLogPath"] = _backendLogPath;
            pathsNode["runtimeLauncherLogPath"] = _runtimeLauncherLogPath;
            pathsNode["runtimeShellLogPath"] = _runtimeShellLogPath;
            pathsNode["officeBrokerLogPath"] = _officeBrokerLogPath;
            pathsNode["filesystemCollectorLogDir"] = _filesystemCollectorLogDir;
            pathsNode["autocadCollectorLogDir"] = _autocadCollectorLogDir;
        }

        if (supportNode["lines"] is JsonArray linesNode)
        {
            ReplaceSupportLine(linesNode, "Stable Suite root:", _repoRoot);
            if (!string.IsNullOrWhiteSpace(dailyRoot))
            {
                ReplaceSupportLine(linesNode, "Daily root:", dailyRoot);
            }

            if (!string.IsNullOrWhiteSpace(officeExecutablePath))
            {
                ReplaceSupportLine(linesNode, "Office executable:", officeExecutablePath);
            }
        }
    }

    private JsonObject? ReadOfficeCompanionConfig()
    {
        try
        {
            var companionConfigPath = Path.Combine(_runtimeStatusDirectory, "companion-config", "office.json");
            if (!File.Exists(companionConfigPath))
            {
                return null;
            }

            return JsonNode.Parse(File.ReadAllText(companionConfigPath)) as JsonObject;
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-office-companion-read", exception);
            return null;
        }
    }

    private async Task<JsonObject?> BuildWorkstationContextNodeAsync(bool force)
    {
        if (!force &&
            _lastWorkstationContextNode is not null &&
            (DateTimeOffset.Now - _lastWorkstationContextPublishedAt) < TimeSpan.FromSeconds(30))
        {
            return (JsonObject?)_lastWorkstationContextNode.DeepClone();
        }

        try
        {
            var result = await ProcessRunner.RunPowerShellFileAsync(
                _workstationDoctorScriptPath,
                _repoRoot,
                new[] { "-RepoRoot", _repoRoot, "-SkipRuntimeStatus", "-Json" });

            if (!TryExtractStructuredJson(result, out var payloadJson, out _))
            {
                return _lastWorkstationContextNode is null
                    ? null
                    : (JsonObject?)_lastWorkstationContextNode.DeepClone();
            }

            if (JsonNode.Parse(payloadJson) is not JsonObject payloadNode)
            {
                return _lastWorkstationContextNode is null
                    ? null
                    : (JsonObject?)_lastWorkstationContextNode.DeepClone();
            }

            var contextNode = new JsonObject
            {
                ["generatedAt"] = payloadNode["generatedAt"]?.DeepClone(),
                ["workstation"] = payloadNode["workstation"]?.DeepClone(),
                ["repoRoots"] = payloadNode["repoRoots"]?.DeepClone(),
                ["shell"] = payloadNode["shell"]?.DeepClone(),
                ["startupOwner"] = payloadNode["startupOwner"]?.DeepClone(),
                ["dropbox"] = payloadNode["dropbox"]?.DeepClone(),
                ["codex"] = payloadNode["codex"]?.DeepClone(),
                ["envDrift"] = payloadNode["envDrift"]?.DeepClone(),
                ["adminContinuity"] = payloadNode["adminContinuity"]?.DeepClone(),
                ["runtimeCore"] = payloadNode["runtimeCore"]?.DeepClone(),
            };

            _lastWorkstationContextNode = (JsonObject?)contextNode.DeepClone();
            _lastWorkstationContextPublishedAt = DateTimeOffset.Now;
            return contextNode;
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-workstation-context", exception);
            return _lastWorkstationContextNode is null
                ? null
                : (JsonObject?)_lastWorkstationContextNode.DeepClone();
        }
    }

    private async Task<DockerObservabilitySummary> BuildDockerSummaryAsync(JsonObject payloadNode)
    {
        _lastSupabaseStudioUrl = ResolveSupabaseStudioUrl(payloadNode);
        var containersTask = TryReadDockerContainersAsync();
        var importantVolumesTask = TryReadDockerVolumesAsync();
        await Task.WhenAll(containersTask, importantVolumesTask);
        var containers = await containersTask;
        var importantVolumes = await importantVolumesTask;
        return new DockerObservabilitySummary
        {
            Available = true,
            DockerDesktopHint = "Docker Desktop",
            DockerDesktopPath = "shell:AppsFolder\\Docker.DockerDesktop",
            SupabaseStudioUrl = _lastSupabaseStudioUrl,
            Containers = containers,
            ImportantVolumes = importantVolumes,
        };
    }

    private async Task<IReadOnlyList<DockerContainerSummary>> TryReadDockerContainersAsync()
    {
        try
        {
            using var cancellationSource = new CancellationTokenSource(TimeSpan.FromSeconds(4));
            var result = await ProcessRunner.RunAsync(
                "docker",
                _repoRoot,
                new[] { "ps", "-a", "--format", "{{json .}}" },
                cancellationSource.Token);
            if (!result.Succeeded && string.IsNullOrWhiteSpace(result.StandardOutput))
            {
                return Array.Empty<DockerContainerSummary>();
            }

            return result.StandardOutput
                .Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries)
                .Select(static line =>
                {
                    try
                    {
                        using var document = JsonDocument.Parse(line);
                        var root = document.RootElement;
                        return new DockerContainerSummary
                        {
                            Name = GetStringProperty(root, "Names") ?? "container",
                            Image = GetStringProperty(root, "Image") ?? string.Empty,
                            State = GetStringProperty(root, "State") ?? string.Empty,
                            Status = GetStringProperty(root, "Status") ?? string.Empty,
                            Ports = GetStringProperty(root, "Ports") ?? string.Empty,
                            Health = InferContainerHealth(GetStringProperty(root, "Status")),
                        };
                    }
                    catch
                    {
                        return null;
                    }
                })
                .Where(static item => item is not null)
                .Cast<DockerContainerSummary>()
                .OrderBy(item => item.Name)
                .ToArray();
        }
        catch
        {
            return Array.Empty<DockerContainerSummary>();
        }
    }

    private async Task<IReadOnlyList<string>> TryReadDockerVolumesAsync()
    {
        try
        {
            using var cancellationSource = new CancellationTokenSource(TimeSpan.FromSeconds(4));
            var result = await ProcessRunner.RunAsync(
                "docker",
                _repoRoot,
                new[] { "volume", "ls", "--format", "{{.Name}}" },
                cancellationSource.Token);
            return result.StandardOutput
                .Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries)
                .Where(static line =>
                    line.Contains("supabase", StringComparison.OrdinalIgnoreCase)
                    || line.Contains("suite", StringComparison.OrdinalIgnoreCase))
                .OrderBy(static item => item)
                .ToArray();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private string ResolveSupabaseStudioUrl(JsonObject payloadNode)
    {
        try
        {
            if (payloadNode["services"] is not JsonArray servicesNode)
            {
                return "http://127.0.0.1:54323";
            }

            foreach (var serviceNode in servicesNode)
            {
                if (serviceNode is not JsonObject service
                    || !string.Equals(service["id"]?.GetValue<string>(), "supabase", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var portValue = TryGetServiceNoteValue(service, "Studio")
                    ?? TryGetServiceNoteValue(service, "Port")
                    ?? "54323";
                var studioPort = new string(portValue.Where(char.IsDigit).ToArray());
                return string.IsNullOrWhiteSpace(studioPort)
                    ? "http://127.0.0.1:54323"
                    : $"http://127.0.0.1:{studioPort}";
            }
        }
        catch
        {
        }

        return "http://127.0.0.1:54323";
    }

    private ToolingSummary BuildToolingSummary()
    {
        return new ToolingSummary
        {
            ActiveMcpServers = LoadCodexMcpServerIds(),
            RecommendedSkills =
            [
                "playwright-interactive",
                "pdf",
                "doc",
                "slides",
                "spreadsheet",
                "transcribe",
            ],
        };
    }

    private IReadOnlyList<string> LoadCodexMcpServerIds()
    {
        try
        {
            var configPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".codex",
                "config.toml");
            if (!File.Exists(configPath))
            {
                return Array.Empty<string>();
            }

            return File.ReadLines(configPath)
                .Select(static line => line.Trim())
                .Where(static line => line.StartsWith("[mcp_servers.", StringComparison.Ordinal))
                .Select(static line => line.Replace("[mcp_servers.", string.Empty).TrimEnd(']'))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(static item => item)
                .ToArray();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private static string InferContainerHealth(string? statusText)
    {
        if (string.IsNullOrWhiteSpace(statusText))
        {
            return "unknown";
        }

        if (statusText.Contains("Restarting", StringComparison.OrdinalIgnoreCase))
        {
            return "restarting";
        }

        if (statusText.Contains("healthy", StringComparison.OrdinalIgnoreCase))
        {
            return "healthy";
        }

        if (statusText.Contains("unhealthy", StringComparison.OrdinalIgnoreCase))
        {
            return "unhealthy";
        }

        if (statusText.Contains("Up", StringComparison.OrdinalIgnoreCase))
        {
            return "running";
        }

        return "stopped";
    }

    private static void ReplaceSupportLine(JsonArray linesNode, string prefix, string newValue)
    {
        for (var index = 0; index < linesNode.Count; index += 1)
        {
            if (linesNode[index]?.GetValue<string>()?.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) == true)
            {
                linesNode[index] = $"{prefix} {newValue}";
            }
        }
    }

    private static void AddNoiseFromText(ICollection<string> lines, string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        foreach (var line in text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries))
        {
            lines.Add(line.Trim());
        }
    }

    private static bool TryExtractJsonRegion(
        string? text,
        out string json,
        out string prefix,
        out string suffix)
    {
        json = string.Empty;
        prefix = string.Empty;
        suffix = string.Empty;
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            return false;
        }

        json = text[start..(end + 1)].Trim();
        prefix = text[..start].Trim();
        suffix = text[(end + 1)..].Trim();
        return true;
    }

    private static string? TryGetJsonString(JsonObject? node, string propertyName)
    {
        return node?[propertyName]?.GetValue<string>();
    }

    private static string TruncateMessage(string value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length <= maxLength)
        {
            return value;
        }

        return $"{value[..maxLength].Trim()}...";
    }

    private async Task<string> BuildOfficeSnapshotPayloadJsonAsync()
    {
        var fallbackSnapshot = await OfficeWorkspaceSnapshotBuilder.BuildAsync(_repoRoot);
        var payloadNode = JsonSerializer.SerializeToNode(fallbackSnapshot, JsonOptions) as JsonObject ?? new JsonObject();
        payloadNode["schemaVersion"] = "suite.operator-shell.office.v2";
        payloadNode["generatedAt"] = DateTimeOffset.Now.ToString("o");

        var brokerConfiguration = OfficeBrokerConfigResolver.Resolve(_repoRoot);
        var healthResult = await _officeBrokerClient.GetHealthAsync(brokerConfiguration);
        var stateResult = await _officeBrokerClient.GetStateAsync(brokerConfiguration);
        if (brokerConfiguration.Enabled && !stateResult.Success)
        {
            var started = await EnsureOfficeBrokerRunningAsync(brokerConfiguration, restart: false, forceLaunch: false);
            if (started)
            {
                await Task.Delay(900);
                healthResult = await _officeBrokerClient.GetHealthAsync(brokerConfiguration);
                stateResult = await _officeBrokerClient.GetStateAsync(brokerConfiguration);
            }
        }
        var brokerNode = BuildBrokerSnapshotNode(brokerConfiguration, healthResult, stateResult);
        payloadNode["broker"] = brokerNode;
        payloadNode["source"] = stateResult.Success ? "broker" : "snapshot";
        payloadNode["liveState"] = null;

        if (!stateResult.Success || string.IsNullOrWhiteSpace(stateResult.ResponseJson))
        {
            return payloadNode.ToJsonString(JsonOptions);
        }

        try
        {
            var liveStateNode = JsonNode.Parse(stateResult.ResponseJson);
            payloadNode["liveState"] = liveStateNode;
            if (liveStateNode is JsonObject liveStateObject)
            {
                MergeLiveOfficeSections(payloadNode, liveStateObject);
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-office-state-parse", exception);
            payloadNode["source"] = "snapshot";
            payloadNode["liveState"] = null;
            payloadNode["broker"] = BuildBrokerSnapshotNode(
                brokerConfiguration,
                healthResult,
                OfficeBrokerRequestResult.HttpFailure(
                    statusCode: stateResult.StatusCode,
                    requestUri: stateResult.RequestUri,
                    error: "Office broker state payload could not be parsed."));
        }

        return payloadNode.ToJsonString(JsonOptions);
    }

    private static JsonObject BuildBrokerSnapshotNode(
        OfficeBrokerConfiguration configuration,
        OfficeBrokerRequestResult health,
        OfficeBrokerRequestResult state)
    {
        var errorMessage = state.Error ?? health.Error;
        return new JsonObject
        {
            ["enabled"] = configuration.Enabled,
            ["configExists"] = configuration.ConfigExists,
            ["configPath"] = configuration.ConfigPath,
            ["baseUrl"] = configuration.BaseUrl,
            ["healthPath"] = configuration.HealthPath,
            ["statePath"] = configuration.StatePath,
            ["publishPath"] = configuration.PublishPath,
            ["healthy"] = health.Success,
            ["reachable"] = health.BrokerReachable || state.BrokerReachable,
            ["stateAvailable"] = state.Success,
            ["lastCheckedAt"] = DateTimeOffset.Now.ToString("o"),
            ["requestUri"] = state.RequestUri ?? health.RequestUri,
            ["statusCode"] = state.StatusCode ?? health.StatusCode,
            ["lastError"] = string.IsNullOrWhiteSpace(errorMessage) ? null : errorMessage,
        };
    }

    private static void MergeLiveOfficeSections(JsonObject target, JsonObject source)
    {
        foreach (var key in new[] { "provider", "suite", "chat", "study", "library", "growth", "inbox", "research", "suiteContext", "suggestedMoves", "context" })
        {
            if (source.TryGetPropertyValue(key, out var value) && value is not null)
            {
                target[key] = value.DeepClone();
            }
        }

        if (source.TryGetPropertyValue("workspaceTitle", out var workspaceTitle) && workspaceTitle is not null)
        {
            target["title"] = workspaceTitle.DeepClone();
        }
    }

    private async Task HandleOfficeBrokerMessageAsync(string messageType, JsonElement? payload)
    {
        try
        {
            var brokerConfiguration = OfficeBrokerConfigResolver.Resolve(_repoRoot);
            if (brokerConfiguration.Enabled)
            {
                var health = await _officeBrokerClient.GetHealthAsync(brokerConfiguration);
                if (!health.Success)
                {
                    var started = await EnsureOfficeBrokerRunningAsync(brokerConfiguration, restart: false, forceLaunch: false);
                    if (started)
                    {
                        await Task.Delay(900);
                    }
                }
            }
            var result = await _officeBrokerClient.SendMessageAsync(
                brokerConfiguration,
                messageType,
                payload);

            if (result.Success)
            {
                SendLog("OK", $"Office broker action completed: {messageType}.", "ok");
                PostEvent("office.action.result", new
                {
                    messageType,
                    ok = true,
                    statusCode = result.StatusCode,
                    brokerReachable = result.BrokerReachable,
                    details = (string?)null,
                });
                await PublishOfficeSnapshotAsync(force: true);
                return;
            }

            var details = result.Error ?? "Office broker action was not completed.";
            if (result.Unsupported)
            {
                SendLog("WARN", details, "warn");
            }
            else if (!result.BrokerReachable)
            {
                SendLog("WARN", $"Office broker is unavailable. Falling back to snapshot-only mode. {details}".Trim(), "warn");
            }
            else
            {
                SendLog("WARN", $"Office broker action failed: {messageType}. {details}".Trim(), "warn");
            }

            PostEvent("office.action.result", new
            {
                messageType,
                ok = false,
                statusCode = result.StatusCode,
                brokerReachable = result.BrokerReachable,
                details,
            });
            await PublishOfficeSnapshotAsync(force: true);
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-office-broker-action", exception);
            SendError("Office broker action failed.", exception.Message);
        }
    }

    private async Task RunOfficeBrokerLifecycleAsync(bool restart)
    {
        var actionName = restart ? "office.broker.restart" : "office.broker.start";
        if (!TryBeginAction(actionName, null))
        {
            return;
        }

        try
        {
            var configuration = OfficeBrokerConfigResolver.Resolve(_repoRoot);
            if (!configuration.Enabled)
            {
                SendLog("WARN", "Office broker is disabled in local companion config.", "warn");
                return;
            }

            var started = await EnsureOfficeBrokerRunningAsync(configuration, restart, forceLaunch: true);
            await Task.Delay(started ? 900 : 200);
            await PublishOfficeSnapshotAsync(force: true);

            var health = await _officeBrokerClient.GetHealthAsync(configuration);
            if (health.Success)
            {
                SendLog("OK", restart ? "Office broker restarted." : "Office broker is available.", "ok");
                return;
            }

            var warningText = !string.IsNullOrWhiteSpace(health.Error)
                ? health.Error
                : restart
                    ? "Office broker restart was requested, but health is still not green."
                    : "Office broker start was requested, but health is still not green.";
            SendLog(
                "WARN",
                warningText,
                "warn");
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-office-broker-lifecycle", exception);
            SendError(restart ? "Office broker restart failed." : "Office broker start failed.", exception.Message);
        }
        finally
        {
            EndAction();
        }
    }

    private async Task<bool> EnsureOfficeBrokerRunningAsync(
        OfficeBrokerConfiguration configuration,
        bool restart,
        bool forceLaunch)
    {
        if (!configuration.Enabled)
        {
            return false;
        }

        if (!forceLaunch &&
            !restart &&
            (DateTimeOffset.UtcNow - _lastOfficeBrokerLaunchAttemptAt) < TimeSpan.FromSeconds(12))
        {
            return false;
        }

        var executablePath = ResolveOfficeBrokerExecutablePath(configuration);
        if (string.IsNullOrWhiteSpace(executablePath))
        {
            return false;
        }

        if (restart)
        {
            StopOfficeBrokerProcesses(executablePath);
        }
        else if (IsOfficeBrokerRunning(executablePath))
        {
            return false;
        }

        _lastOfficeBrokerLaunchAttemptAt = DateTimeOffset.UtcNow;
        StartOfficeBrokerProcess(executablePath);
        await Task.CompletedTask;
        return true;
    }

    private static string? ResolveOfficeBrokerExecutablePath(OfficeBrokerConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(configuration.PublishPath))
        {
            return null;
        }

        if (File.Exists(configuration.PublishPath))
        {
            return configuration.PublishPath;
        }

        if (!Directory.Exists(configuration.PublishPath))
        {
            return null;
        }

        var candidates = new[]
        {
            Path.Combine(configuration.PublishPath, "DailyDesk.Broker.exe"),
            Path.Combine(configuration.PublishPath, "DailyDesk.Broker.dll"),
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    private static bool IsOfficeBrokerRunning(string executablePath)
    {
        var expectedPath = Path.GetFullPath(executablePath);
        var processName = Path.GetFileNameWithoutExtension(expectedPath);
        foreach (var process in Process.GetProcessesByName(processName))
        {
            try
            {
                if (string.Equals(process.MainModule?.FileName, expectedPath, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            catch
            {
                // Ignore inaccessible process metadata and continue checking other candidates.
            }
            finally
            {
                process.Dispose();
            }
        }

        return false;
    }

    private static void StopOfficeBrokerProcesses(string executablePath)
    {
        var expectedPath = Path.GetFullPath(executablePath);
        var processName = Path.GetFileNameWithoutExtension(expectedPath);
        foreach (var process in Process.GetProcessesByName(processName))
        {
            try
            {
                if (!string.Equals(process.MainModule?.FileName, expectedPath, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                process.Kill(entireProcessTree: true);
                process.WaitForExit(4000);
            }
            catch
            {
                // Ignore stop failures here; a fresh launch attempt still happens after this.
            }
            finally
            {
                process.Dispose();
            }
        }
    }

    private void StartOfficeBrokerProcess(string executablePath)
    {
        var fullPath = Path.GetFullPath(executablePath);
        var workingDirectory = Path.GetDirectoryName(fullPath) ?? _repoRoot;
        Directory.CreateDirectory(_runtimeStatusDirectory);
        var redirectTarget = "'" + _officeBrokerLogPath.Replace("'", "''") + "'";
        ProcessStartInfo startInfo;

        if (fullPath.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
        {
            var launchCommand = $"& dotnet '{fullPath.Replace("'", "''")}' *>> {redirectTarget}";
            startInfo = new ProcessStartInfo
            {
                FileName = "PowerShell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command \"{launchCommand}\"",
                WorkingDirectory = workingDirectory,
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
        }
        else
        {
            var launchCommand = $"& '{fullPath.Replace("'", "''")}' *>> {redirectTarget}";
            startInfo = new ProcessStartInfo
            {
                FileName = "PowerShell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command \"{launchCommand}\"",
                WorkingDirectory = workingDirectory,
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
        }

        Process.Start(startInfo);
        SendLog("INFO", $"Office broker start requested from {workingDirectory}.", "info");
    }

    private void PublishProgressFromSnapshot()
    {
        if (!_actionBusy || _lastSnapshotDocument is null)
        {
            return;
        }

        var root = _lastSnapshotDocument.RootElement;
        switch (_activeAction)
        {
            case "start_all":
            {
                var completed = 0;
                var step = "Starting services.";
                foreach (var serviceId in _runtimeCatalog.ServiceOrder)
                {
                    if (!TryFindService(root, serviceId, out var service))
                    {
                        continue;
                    }

                    if (ServiceIsReady(service))
                    {
                        completed += 1;
                        continue;
                    }

                    step = ServiceIsActive(service)
                        ? $"Waiting for {GetServiceName(service, serviceId) ?? serviceId} to finish starting."
                        : $"{(_activeAction == "bootstrap_all" ? "Bootstrapping" : "Starting")} {GetServiceName(service, serviceId) ?? serviceId}.";
                    break;
                }

                if (completed >= _runtimeCatalog.ServiceOrder.Length)
                {
                    step = _activeAction == "bootstrap_all" ? "Runtime ready." : "All services started.";
                }

                var percent = completed == 0
                    ? 8
                    : Math.Clamp((int)Math.Round((completed * 100.0) / _runtimeCatalog.ServiceOrder.Length), 8, 100);
                SendProgress(true, percent, step);
                break;
            }
            case "stop_all":
            {
                var stopped = 0;
                foreach (var serviceId in _runtimeCatalog.ServiceOrder)
                {
                    if (!TryFindService(root, serviceId, out var service))
                    {
                        continue;
                    }

                    if (ServiceSatisfiesStop(service))
                    {
                        stopped += 1;
                    }
                }

                var percent = stopped == 0
                    ? 10
                    : Math.Clamp((int)Math.Round((stopped * 100.0) / _runtimeCatalog.ServiceOrder.Length), 10, 100);
                var step = stopped >= _runtimeCatalog.ServiceOrder.Length ? "All services stopped." : "Stopping local services.";
                SendProgress(true, percent, step);
                break;
            }
            case "service.start":
            case "service.restart":
            {
                if (TryGetActiveService(root, out var service))
                {
                    var ready = ServiceIsReady(service);
                    var percent = ready ? 100 : 70;
                    var step = ready
                        ? $"{GetServiceName(service, _activeServiceId) ?? _activeServiceId} is ready."
                        : ServiceIsActive(service)
                            ? $"Waiting for {GetServiceName(service, _activeServiceId) ?? _activeServiceId} to finish starting."
                            : $"Starting {GetServiceName(service, _activeServiceId) ?? _activeServiceId}.";
                    SendProgress(true, percent, step);
                }
                break;
            }
            case "service.stop":
            {
                if (TryGetActiveService(root, out var service))
                {
                    var stopped = ServiceSatisfiesStop(service);
                    var percent = stopped ? 100 : 40;
                    var step = stopped
                        ? $"{GetServiceName(service, _activeServiceId) ?? _activeServiceId} is stopped."
                        : $"Stopping {GetServiceName(service, _activeServiceId) ?? _activeServiceId}.";
                    SendProgress(true, percent, step);
                }
                break;
            }
        }
    }

    private void PrimeAutoBootstrapUiState()
    {
        PostEvent("runtime.action_state", new
        {
            busy = true,
            action = "bootstrap_all",
            serviceId = (string?)null,
        });
        PostEvent("runtime.progress", new
        {
            visible = true,
            percent = 2,
            step = "Preparing automatic runtime bootstrap.",
            action = "bootstrap_all",
            serviceId = (string?)null,
        });
    }

    private void PublishBootstrapStateFromSnapshot()
    {
        var viewModel = BootstrapProgressReducer.TryParseFromSnapshot(_lastSnapshotDocument!.RootElement, out var bootstrapState)
            ? BootstrapProgressReducer.Reduce(bootstrapState)
            : BootstrapProgressReducer.Reduce(null);
        PostEvent("runtime.bootstrap_state", viewModel);
    }

    private async Task<ControlActionResult> RunControlActionAsync(string serviceId, string action)
    {
        var result = await ProcessRunner.RunPowerShellFileAsync(
            _controlScriptPath,
            _repoRoot,
            new[] { "-Service", serviceId, "-Action", action, "-RepoRoot", _repoRoot, "-Json" });

        if (!TryExtractJsonObject(result.CombinedOutput, out var payloadJson))
        {
            return new ControlActionResult(
                Ok: false,
                Summary: $"{serviceId} {action} did not return JSON.",
                Details: result.CombinedOutput,
                SkippedForSafety: false,
                LogTargetKind: null,
                LogTargetTarget: null);
        }

        using var document = JsonDocument.Parse(payloadJson);
        var root = document.RootElement;
        return new ControlActionResult(
            Ok: root.TryGetProperty("ok", out var okElement) && okElement.ValueKind is JsonValueKind.True,
            Summary: GetStringProperty(root, "summary"),
            Details: GetStringProperty(root, "details") ?? GetStringProperty(root, "outputTail"),
            SkippedForSafety: root.TryGetProperty("skippedForSafety", out var skippedElement) && skippedElement.ValueKind is JsonValueKind.True,
            LogTargetKind: TryGetNestedStringProperty(root, "logTarget", "kind"),
            LogTargetTarget: TryGetNestedStringProperty(root, "logTarget", "target"));
    }

    private async Task FocusLogSourceAsync(string serviceId, string? explicitTarget)
    {
        var sourceId = ResolveLogSourceId(serviceId, explicitTarget);
        await SelectLogSourceAsync(sourceId, fromServiceAction: true);
    }

    private async Task SelectLogSourceAsync(string? sourceId, bool fromServiceAction)
    {
        _selectedLogSourceId = ResolveValidLogSourceId(sourceId);
        _selectedUtilityTab = "logs";
        _utilityPaneCollapsed = false;
        PersistShellWindowState();
        PublishShellWindowState();
        await PublishSelectedLogSourceAsync(force: true);

        if (fromServiceAction)
        {
            PostEvent("runtime.log_focus", new
            {
                sourceId = _selectedLogSourceId,
                utilityTab = _selectedUtilityTab,
            });
        }
    }

    private async Task PublishSelectedLogSourceAsync(bool force = false)
    {
        if (_isClosing || !_uiReady)
        {
            return;
        }

        var sources = BuildLogSources();
        var source = sources.FirstOrDefault(item =>
            item.Id.Equals(_selectedLogSourceId, StringComparison.OrdinalIgnoreCase))
            ?? sources.First();

        _selectedLogSourceId = source.Id;
        _selectedLogSourcePath = source.Path ?? string.Empty;
        PublishLogSources();

        if (string.Equals(source.Id, "transcript", StringComparison.OrdinalIgnoreCase))
        {
            PublishLogView(source, Array.Empty<string>(), force, stale: false);
            return;
        }

        if (string.Equals(source.Kind, "url", StringComparison.OrdinalIgnoreCase))
        {
            PublishLogView(
                source,
                new[]
                {
                    $"External surface: {source.Path}",
                    "Use Open external to launch the linked UI outside the operator shell.",
                },
                force,
                stale: false);
            return;
        }

        var lines = await Task.Run(() => ReadLogTail(source.Path, 320));
        PublishLogView(source, lines, force, stale: false);
    }

    private async Task OpenSelectedLogSourceExternallyAsync(string? sourceId)
    {
        var source = BuildLogSources().FirstOrDefault(item =>
            item.Id.Equals(ResolveValidLogSourceId(sourceId), StringComparison.OrdinalIgnoreCase));
        if (source is null)
        {
            SendError("Open logs failed.", "Requested log source was not found.");
            return;
        }

        if (string.Equals(source.Kind, "virtual", StringComparison.OrdinalIgnoreCase))
        {
            SendLog("WARN", "The shell transcript lives inside the operator shell and has no external file target.", "warn");
            return;
        }

        if (string.Equals(source.Kind, "url", StringComparison.OrdinalIgnoreCase))
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = source.Path!,
                UseShellExecute = true,
            });
            SendLog("SYS", $"Opened {source.Label}.", "sys");
            return;
        }

        if (string.IsNullOrWhiteSpace(source.Path))
        {
            SendError("Open logs failed.", $"No external path is available for {source.Label}.");
            return;
        }

        if (File.Exists(source.Path))
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "notepad.exe",
                Arguments = $"\"{source.Path}\"",
                UseShellExecute = true,
            });
            SendLog("SYS", $"Opened {source.Label}.", "sys");
            return;
        }

        if (Directory.Exists(source.Path))
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = $"\"{source.Path}\"",
                UseShellExecute = true,
            });
            SendLog("SYS", $"Opened {source.Label}.", "sys");
            return;
        }

        SendError("Open logs failed.", $"The selected log source path is missing: {source.Path}");
    }

    private void PublishShellWindowState()
    {
        var payload = new
        {
            utilityPaneWidth = RuntimeShellDisplaySettings.NormalizeUtilityPaneWidth(_utilityPaneWidth),
            utilityPaneCollapsed = _utilityPaneCollapsed,
            activeUtilityTab = NormalizeUtilityTab(_selectedUtilityTab),
            utilityPaneTab = NormalizeUtilityTab(_selectedUtilityTab),
            activeLogSourceId = ResolveValidLogSourceId(_selectedLogSourceId),
            contentScalePercent = RuntimeShellDisplaySettings.NormalizeContentScalePercent(_contentScalePercent),
        };
        PostEvent("shell.window_state", payload);
        PostEvent("shell.preferences", payload);
    }

    private void UpdateShellPreferences(JsonElement? payload)
    {
        if (!payload.HasValue || payload.Value.ValueKind != JsonValueKind.Object)
        {
            return;
        }

        if (payload.Value.TryGetProperty("utilityPaneWidth", out var widthElement)
            && widthElement.ValueKind == JsonValueKind.Number
            && widthElement.TryGetInt32(out var utilityPaneWidth))
        {
            _utilityPaneWidth = RuntimeShellDisplaySettings.NormalizeUtilityPaneWidth(utilityPaneWidth);
        }

        if (payload.Value.TryGetProperty("utilityPaneCollapsed", out var collapsedElement)
            && (collapsedElement.ValueKind == JsonValueKind.True || collapsedElement.ValueKind == JsonValueKind.False))
        {
            _utilityPaneCollapsed = collapsedElement.GetBoolean();
        }

        if (payload.Value.TryGetProperty("utilityPaneTab", out var tabElement)
            && tabElement.ValueKind == JsonValueKind.String)
        {
            _selectedUtilityTab = NormalizeUtilityTab(tabElement.GetString());
        }
        else if (payload.Value.TryGetProperty("activeUtilityTab", out var activeTabElement)
            && activeTabElement.ValueKind == JsonValueKind.String)
        {
            _selectedUtilityTab = NormalizeUtilityTab(activeTabElement.GetString());
        }

        if (payload.Value.TryGetProperty("activeLogSourceId", out var activeLogSourceElement)
            && activeLogSourceElement.ValueKind == JsonValueKind.String)
        {
            _selectedLogSourceId = ResolveValidLogSourceId(activeLogSourceElement.GetString());
        }

        if (payload.Value.TryGetProperty("contentScalePercent", out var contentScaleElement)
            && contentScaleElement.ValueKind == JsonValueKind.Number
            && contentScaleElement.TryGetInt32(out var contentScalePercent))
        {
            _contentScalePercent = RuntimeShellDisplaySettings.NormalizeContentScalePercent(contentScalePercent);
            ApplyWebViewDpiZoom();
        }

        PersistShellWindowState();
        PublishShellWindowState();
        _ = PublishSelectedLogSourceAsync(force: true);
    }

    private void CopyTextToClipboard(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        try
        {
            Clipboard.SetText(text);
            SendLog("SYS", "Copied selection to clipboard.", "sys");
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-copy-text", exception);
            SendError("Clipboard copy failed.", exception.Message);
        }
    }

    private string ResolveValidLogSourceId(string? sourceId)
    {
        var normalized = string.IsNullOrWhiteSpace(sourceId) ? "transcript" : sourceId.Trim();
        return KnownLogSourceIds.Contains(normalized)
            ? normalized
            : "transcript";
    }

    private string ResolveLogSourceId(string serviceId, string? explicitTarget)
    {
        if (!string.IsNullOrWhiteSpace(explicitTarget))
        {
            var exactMatch = BuildLogSources().FirstOrDefault(item =>
                string.Equals(item.Path, explicitTarget, StringComparison.OrdinalIgnoreCase));
            if (exactMatch is not null)
            {
                return exactMatch.Id;
            }
        }

        return serviceId switch
        {
            "supabase" => "docker",
            "frontend" => "frontend",
            "backend" => "backend",
            "watchdog-filesystem" => "filesystem-collector",
            "watchdog-autocad" => "autocad-collector",
            _ => "transcript",
        };
    }

    private void PublishLogSources()
    {
        PostEvent("runtime.log_sources", new
        {
            sources = BuildLogSources(),
        });
    }

    private void PublishLogView(
        RuntimeLogSourceDescriptor source,
        IReadOnlyList<string> lines,
        bool force,
        bool stale)
    {
        var body = lines.Count == 0 ? string.Empty : string.Join(Environment.NewLine, lines);
        var payload = new
        {
            sourceId = source.Id,
            id = source.Id,
            label = source.Label,
            kind = source.Kind,
            path = source.Path,
            target = source.Path,
            exists = source.Exists,
            updatedAt = DateTimeOffset.Now.ToString("o"),
            lines,
            body,
            text = body,
            forced = force,
            stale,
        };
        PostEvent("runtime.log_view", payload);
        PostEvent("runtime.log_source", payload);
    }

    private IReadOnlyList<RuntimeLogSourceDescriptor> BuildLogSources()
    {
        var sources = new List<RuntimeLogSourceDescriptor>
        {
            new()
            {
                Id = "transcript",
                Label = "Shell Transcript",
                Kind = "virtual",
                Description = "Action and status events emitted inside the operator shell.",
                Exists = true,
            },
            BuildFileLogSource("bootstrap", "Bootstrap Runtime", _runtimeLogPath, "Bootstrap and runtime startup transcript."),
            BuildFileLogSource("runtime-launcher", "Runtime Launcher", _runtimeLauncherLogPath, "Runtime launcher and staging decisions."),
            BuildFileLogSource("runtime-shell", "Runtime Shell", _runtimeShellLogPath, "Desktop host and WebView bridge log."),
            BuildFileLogSource("frontend", "Suite Frontend", _frontendLogPath, "Frontend dev shell output."),
            BuildFileLogSource("backend", "Watchdog Backend", _backendLogPath, "Backend API and runtime jobs."),
            BuildFileLogSource("office-broker", "Office Broker", _officeBrokerLogPath, "Live Office broker process output."),
            BuildFileLogSource("filesystem-collector", "Filesystem Collector", ResolveNewestLogFile(_filesystemCollectorLogDir), "Filesystem collector daemon log."),
            BuildFileLogSource("autocad-collector", "AutoCAD Collector", ResolveNewestLogFile(_autocadCollectorLogDir), "AutoCAD collector daemon log."),
        };

        if (!string.IsNullOrWhiteSpace(_lastSupabaseStudioUrl))
        {
            sources.Add(new RuntimeLogSourceDescriptor
            {
                Id = "docker",
                Label = "Supabase Studio",
                Kind = "url",
                Path = _lastSupabaseStudioUrl,
                Description = "Read-only jump to local Supabase Studio.",
                Exists = true,
            });
        }

        return sources;
    }

    private static RuntimeLogSourceDescriptor BuildFileLogSource(
        string id,
        string label,
        string? path,
        string description)
    {
        var exists = !string.IsNullOrWhiteSpace(path) && (File.Exists(path) || Directory.Exists(path));
        return new RuntimeLogSourceDescriptor
        {
            Id = id,
            Label = label,
            Kind = "file",
            Path = path,
            Description = description,
            Exists = exists,
        };
    }

    private static string ResolveNewestLogFile(string directoryPath)
    {
        if (string.IsNullOrWhiteSpace(directoryPath) || !Directory.Exists(directoryPath))
        {
            return directoryPath;
        }

        var newest = new DirectoryInfo(directoryPath)
            .EnumerateFiles("*.log", SearchOption.TopDirectoryOnly)
            .OrderByDescending(file => file.LastWriteTimeUtc)
            .FirstOrDefault();
        return newest?.FullName ?? directoryPath;
    }

    private static string[] ReadLogTail(string? path, int lineLimit)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return ["No log path reported yet."];
            }

            if (Directory.Exists(path))
            {
                return new[] { $"Directory: {path}" }
                    .Concat(new DirectoryInfo(path)
                        .EnumerateFiles("*.log", SearchOption.TopDirectoryOnly)
                        .OrderByDescending(file => file.LastWriteTimeUtc)
                        .Take(12)
                        .Select(file => $"{file.LastWriteTime:yyyy-MM-dd HH:mm:ss} | {file.Name}"))
                    .ToArray();
            }

            if (!File.Exists(path))
            {
                return [$"Log path is not available yet: {path}"];
            }

            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
            return reader
                .ReadToEnd()
                .Split(new[] { "\r\n", "\n" }, StringSplitOptions.None)
                .TakeLast(Math.Max(40, lineLimit))
                .ToArray();
        }
        catch (IOException exception)
        {
            var label = string.IsNullOrWhiteSpace(path) ? "log source" : Path.GetFileName(path);
            return
            [
                $"Log source is currently busy: {label}",
                exception.Message,
            ];
        }
        catch (Exception exception)
        {
            return
            [
                $"Log source could not be read: {path}",
                exception.Message,
            ];
        }
    }

    private void EmitInitialRuntimeLogTail()
    {
        try
        {
            if (!File.Exists(_runtimeLogPath))
            {
                return;
            }

            var lines = File.ReadLines(_runtimeLogPath).TakeLast(36);
            foreach (var line in lines)
            {
                if (!string.IsNullOrWhiteSpace(line))
                {
                    EmitLogLine(line);
                }
            }
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-log-tail", exception);
        }
    }

    private void PumpRuntimeLog()
    {
        if (_isClosing || !File.Exists(_runtimeLogPath))
        {
            return;
        }

        try
        {
            var currentLength = GetCurrentLogLength();
            if (currentLength < _runtimeLogOffset)
            {
                _runtimeLogOffset = 0;
            }

            if (currentLength <= _runtimeLogOffset)
            {
                return;
            }

            using var stream = new FileStream(
                _runtimeLogPath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.ReadWrite | FileShare.Delete);
            stream.Seek(_runtimeLogOffset, SeekOrigin.Begin);
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
            var text = reader.ReadToEnd();
            _runtimeLogOffset = currentLength;
            _lastRuntimeLogReadFailureSignature = null;

            foreach (var line in text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None))
            {
                if (!string.IsNullOrWhiteSpace(line))
                {
                    EmitLogLine(line);
                }
            }
        }
        catch (IOException exception)
        {
            var signature = exception.Message.Trim();
            if (!string.Equals(signature, _lastRuntimeLogReadFailureSignature, StringComparison.Ordinal))
            {
                _lastRuntimeLogReadFailureSignature = signature;
                RuntimeShellLogger.Log($"runtime-shell-pump-log-busy: {signature}");
            }
        }
        catch (Exception exception)
        {
            _lastRuntimeLogReadFailureSignature = null;
            RuntimeShellLogger.LogException("runtime-shell-pump-log", exception);
        }
    }

    private void SendProgress(bool visible, int percent, string step)
    {
        PostEvent("runtime.progress", new
        {
            visible,
            percent = Math.Clamp(percent, 0, 100),
            step,
            action = _activeAction,
            serviceId = _activeServiceId,
        });
    }

    private void SendLog(string tag, string message, string tone)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return;
        }

        PostEvent("runtime.log", new
        {
            reset = false,
            timestamp = FormatDisplayTimestamp(DateTimeOffset.Now),
            tag,
            tone,
            message,
        });
    }

    private void EmitLogLine(string line)
    {
        if (TryParseStructuredLogLine(line, out var timestamp, out var tag, out var tone, out var message))
        {
            PostEvent("runtime.log", new
            {
                reset = false,
                timestamp,
                tag,
                tone,
                message,
            });
            return;
        }

        SendLog("SYS", line.Trim(), "sys");
    }

    private void SendError(string message, string details)
    {
        PostEvent("runtime.error", new { message, details });
        SendLog("ERR", $"{message} {details}".Trim(), "err");
    }

    private void PostEvent(string type, object payload)
    {
        QueueMessage(JsonSerializer.Serialize(new { type, payload }, JsonOptions));
    }

    private void PostRawEvent(string type, string rawPayloadJson)
    {
        var envelope = $"{{\"type\":{JsonSerializer.Serialize(type, JsonOptions)},\"payload\":{rawPayloadJson}}}";
        QueueMessage(envelope);
    }

    private void QueueMessage(string messageJson)
    {
        if (_isClosing)
        {
            return;
        }

        if (!_uiReady || _webView.IsDisposed || _webView.CoreWebView2 is null)
        {
            lock (_queueLock)
            {
                _queuedMessages.Add(messageJson);
            }
            return;
        }

        _webView.CoreWebView2.PostWebMessageAsJson(messageJson);
    }

    private void FlushQueuedMessages()
    {
        if (!_uiReady || _webView.IsDisposed || _webView.CoreWebView2 is null)
        {
            return;
        }

        List<string> queued;
        lock (_queueLock)
        {
            queued = new List<string>(_queuedMessages);
            _queuedMessages.Clear();
        }

        foreach (var message in queued)
        {
            _webView.CoreWebView2.PostWebMessageAsJson(message);
        }
    }

    private long GetCurrentLogLength()
    {
        try
        {
            return File.Exists(_runtimeLogPath) ? new FileInfo(_runtimeLogPath).Length : 0L;
        }
        catch
        {
            return 0L;
        }
    }

    private static bool TryExtractJsonObject(string text, out string json)
    {
        json = string.Empty;
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            return false;
        }

        json = text[start..(end + 1)];
        return true;
    }

    private static string? TryGetSummaryFromJson(string text)
    {
        if (!TryExtractJsonObject(text, out var payloadJson))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            return GetStringProperty(document.RootElement, "summary");
        }
        catch
        {
            return null;
        }
    }

    private static string[] TryGetStringArrayFromJson(string text, string propertyName)
    {
        if (!TryExtractJsonObject(text, out var payloadJson))
        {
            return Array.Empty<string>();
        }

        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            return GetStringArrayProperty(document.RootElement, propertyName);
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private static string? GetStringProperty(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;
    }

    private static string[] GetStringArrayProperty(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        return property
            .EnumerateArray()
            .Where(static item => item.ValueKind == JsonValueKind.String)
            .Select(static item => item.GetString())
            .Where(static item => !string.IsNullOrWhiteSpace(item))
            .Cast<string>()
            .ToArray();
    }

    private static string? TryGetNestedStringProperty(JsonElement element, string objectName, string propertyName)
    {
        if (!element.TryGetProperty(objectName, out var nested))
        {
            return null;
        }

        return GetStringProperty(nested, propertyName);
    }

    private static string? GetPayloadServiceId(JsonElement root)
    {
        var payload = GetPayload(root);
        if (!payload.HasValue)
        {
            return null;
        }

        return GetStringProperty(payload.Value, "serviceId");
    }

    private static string? GetPayloadRouteId(JsonElement root)
    {
        var payload = GetPayload(root);
        if (!payload.HasValue)
        {
            return null;
        }

        return GetStringProperty(payload.Value, "routeId");
    }

    private static string? GetPayloadRoutePath(JsonElement root)
    {
        var payload = GetPayload(root);
        if (!payload.HasValue)
        {
            return null;
        }

        return GetStringProperty(payload.Value, "routePath");
    }

    private static string? GetPayloadCompanionAppId(JsonElement root)
    {
        var payload = GetPayload(root);
        if (!payload.HasValue || payload.Value.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return GetStringProperty(payload.Value, "companionAppId");
    }

    private static string? GetPayloadPath(JsonElement root)
    {
        var payload = GetPayload(root);
        if (!payload.HasValue || payload.Value.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return GetStringProperty(payload.Value, "path");
    }

    private static string? GetPayloadString(JsonElement root, string propertyName)
    {
        var payload = GetPayload(root);
        if (!payload.HasValue || payload.Value.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return GetStringProperty(payload.Value, propertyName);
    }

    private static string? GetPayloadRouteTitle(JsonElement root)
    {
        var payload = GetPayload(root);
        if (!payload.HasValue)
        {
            return null;
        }

        return GetStringProperty(payload.Value, "routeTitle");
    }

    private static JsonElement? GetPayload(JsonElement root)
    {
        if (!root.TryGetProperty("payload", out var payload))
        {
            return null;
        }

        return payload.Clone();
    }

    private static string? TryGetServiceNoteValue(JsonElement service, string noteLabel)
    {
        if (
            !service.TryGetProperty("notes", out var notes) ||
            notes.ValueKind != JsonValueKind.Array ||
            string.IsNullOrWhiteSpace(noteLabel))
        {
            return null;
        }

        foreach (var note in notes.EnumerateArray())
        {
            if (!string.Equals(GetStringProperty(note, "label"), noteLabel, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var value = GetStringProperty(note, "value");
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private static string? TryGetServiceNoteValue(JsonObject service, string noteLabel)
    {
        if (service["notes"] is not JsonArray notes || string.IsNullOrWhiteSpace(noteLabel))
        {
            return null;
        }

        foreach (var noteNode in notes)
        {
            if (noteNode is not JsonObject note)
            {
                continue;
            }

            var label = note["label"]?.GetValue<string>();
            if (!string.Equals(label, noteLabel, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return note["value"]?.GetValue<string>();
        }

        return null;
    }

    private static string NormalizeUtilityTab(string? utilityTab)
    {
        return utilityTab?.Trim().ToLowerInvariant() switch
        {
            "logs" => "logs",
            "inbox" => "inbox",
            _ => "context",
        };
    }

    private bool TryFindService(JsonElement root, string serviceId, out JsonElement service)
    {
        if (!root.TryGetProperty("services", out var services) || services.ValueKind != JsonValueKind.Array)
        {
            service = default;
            return false;
        }

        foreach (var candidate in services.EnumerateArray())
        {
            if (string.Equals(GetStringProperty(candidate, "id"), serviceId, StringComparison.OrdinalIgnoreCase))
            {
                service = candidate;
                return true;
            }
        }

        service = default;
        return false;
    }

    private JsonElement? FindService(string serviceId)
    {
        if (_lastSnapshotDocument is null)
        {
            return null;
        }

        return TryFindService(_lastSnapshotDocument.RootElement, serviceId, out var service) ? service : null;
    }

    private bool TryGetActiveService(JsonElement root, out JsonElement service)
    {
        if (string.IsNullOrWhiteSpace(_activeServiceId))
        {
            service = default;
            return false;
        }

        return TryFindService(root, _activeServiceId, out service);
    }

    private string? GetServiceName(JsonElement service, string? fallbackServiceId = null)
    {
        var serviceName = GetStringProperty(service, "name");
        if (!string.IsNullOrWhiteSpace(serviceName))
        {
            return serviceName;
        }

        return string.IsNullOrWhiteSpace(fallbackServiceId)
            ? null
            : _runtimeCatalog.GetServiceLabel(fallbackServiceId);
    }

    private static bool ServiceIsActive(JsonElement service)
    {
        return RuntimeServiceState.IsActive(GetStringProperty(service, "state"));
    }

    private static bool ServiceSatisfiesStop(JsonElement service)
    {
        return RuntimeServiceState.IsStopped(GetStringProperty(service, "state"));
    }

    private static bool ServiceIsReady(JsonElement service)
    {
        return RuntimeServiceState.IsReady(GetStringProperty(service, "state"));
    }

    private async Task<bool> WaitForServiceConditionAsync(
        string serviceId,
        Func<JsonElement, bool> predicate,
        TimeSpan timeout,
        int pollIntervalMilliseconds = 1000)
    {
        var deadline = DateTimeOffset.UtcNow.Add(timeout);
        while (!_isClosing && DateTimeOffset.UtcNow < deadline)
        {
            await PublishSnapshotAsync(force: true);
            if (FindService(serviceId) is { } currentService && predicate(currentService))
            {
                return true;
            }

            await Task.Delay(pollIntervalMilliseconds);
        }

        await PublishSnapshotAsync(force: true);
        return FindService(serviceId) is { } finalService && predicate(finalService);
    }

    private int ComputeStartProgressPercent(string serviceId)
    {
        var index = Array.IndexOf(_runtimeCatalog.ServiceOrder, serviceId);
        if (index < 0)
        {
            return 30;
        }

        return Math.Clamp(20 + (index * 18), 20, 90);
    }

    private static string ToPresentTense(string action)
    {
        return action switch
        {
            "start" => "Starting",
            "stop" => "Stopping",
            "restart" => "Restarting",
            "launch" => "Opening",
            "relaunch" => "Relaunching",
            "open-folder" => "Opening",
            _ => action,
        };
    }

    private static bool TryParseStructuredLogLine(
        string line,
        out string timestamp,
        out string tag,
        out string tone,
        out string message)
    {
        timestamp = string.Empty;
        tag = "SYS";
        tone = "sys";
        message = line.Trim();

        if (string.IsNullOrWhiteSpace(message))
        {
            return false;
        }

        var match = StructuredLogRegex.Match(message);
        if (!match.Success)
        {
            return false;
        }

        var rawTimestamp = match.Groups["timestamp"].Value;
        if (DateTimeOffset.TryParse(
            rawTimestamp,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.RoundtripKind,
            out var parsedTimestamp))
        {
            timestamp = FormatDisplayTimestamp(parsedTimestamp);
        }
        else
        {
            timestamp = FormatDisplayTimestamp(DateTimeOffset.Now);
        }

        tag = match.Groups["tag"].Success ? match.Groups["tag"].Value : "SYS";
        tone = tag switch
        {
            "OK" => "ok",
            "INFO" => "info",
            "WARN" => "warn",
            "ERR" => "err",
            "START" => "hi",
            "SYS" => "sys",
            _ => string.Empty,
        };

        message = match.Groups["message"].Value.Trim();
        return !string.IsNullOrWhiteSpace(message);
    }

    private static string FormatDisplayTimestamp(DateTimeOffset value)
    {
        try
        {
            var localized = TimeZoneInfo.ConvertTime(value, DisplayTimeZone);
            return localized.ToString("h:mm:ss tt", CultureInfo.InvariantCulture);
        }
        catch
        {
            return value.ToLocalTime().ToString("h:mm:ss tt", CultureInfo.InvariantCulture);
        }
    }

    private static string FormatSupportSummaryTimestamp(DateTimeOffset value)
    {
        try
        {
            var localized = TimeZoneInfo.ConvertTime(value, DisplayTimeZone);
            return localized.ToString("yyyy-MM-dd h:mm:ss tt", CultureInfo.InvariantCulture);
        }
        catch
        {
            return value.ToLocalTime().ToString("yyyy-MM-dd h:mm:ss tt", CultureInfo.InvariantCulture);
        }
    }

    private static TimeZoneInfo ResolveDisplayTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Central Standard Time");
        }
        catch
        {
            return TimeZoneInfo.Local;
        }
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs eventArgs)
    {
        _isClosing = true;
        _pollTimer.Stop();
        _workstationFolderPickerBridge?.Dispose();
        _workstationFolderPickerBridge = null;
        _instanceCoordinator.ReportPhase(
            RuntimeShellPhases.Closing,
            activatable: false,
            statusMessage: "Shell window is closing.");
        PersistShellWindowState();
    }

    private void OnFormClosed(object? sender, FormClosedEventArgs eventArgs)
    {
        _pollTimer.Dispose();
        _workstationFolderPickerBridge?.Dispose();
        _workstationFolderPickerBridge = null;
        _lastSnapshotDocument?.Dispose();
        RuntimeShellLogger.Log("runtime-shell-closed");
    }

    private sealed record ControlActionResult(
        bool Ok,
        string? Summary,
        string? Details,
        bool SkippedForSafety,
        string? LogTargetKind,
        string? LogTargetTarget)
    {
        public bool HasLogTarget =>
            !string.IsNullOrWhiteSpace(LogTargetKind) &&
            !string.IsNullOrWhiteSpace(LogTargetTarget);
    }
}
