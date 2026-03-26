using System.Diagnostics;
using System.Globalization;
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

    private readonly AppOptions _options;
    private readonly WebView2 _webView;
    private readonly System.Windows.Forms.Timer _pollTimer;
    private readonly string _repoRoot;
    private readonly string _assetsDirectory;
    private readonly string _statusScriptPath;
    private readonly string _controlScriptPath;
    private readonly string _bootstrapScriptPath;
    private readonly string _stopScriptPath;
    private readonly string _supportBundleScriptPath;
    private readonly string _runtimeCatalogPath;
    private readonly string _developerToolsManifestPath;
    private readonly string _runtimeStatusDirectory;
    private readonly string _runtimeLogPath;
    private readonly RuntimeCatalog _runtimeCatalog;
    private readonly string _runtimeCatalogJson;
    private readonly List<string> _queuedMessages = new();
    private readonly object _queueLock = new();

    private bool _isClosing;
    private bool _uiReady;
    private bool _snapshotInFlight;
    private bool _snapshotRefreshPending;
    private bool _actionBusy;
    private string? _activeAction;
    private string? _activeServiceId;
    private long _runtimeLogOffset;
    private JsonDocument? _lastSnapshotDocument;

    public RuntimeShellForm(AppOptions options)
    {
        _options = options;
        _repoRoot = options.RepoRoot;
        _assetsDirectory = Path.Combine(AppContext.BaseDirectory, "Assets");
        _statusScriptPath = Path.Combine(_repoRoot, "scripts", "get-suite-runtime-status.ps1");
        _controlScriptPath = Path.Combine(_repoRoot, "scripts", "control-suite-runtime-service.ps1");
        _bootstrapScriptPath = Path.Combine(_repoRoot, "scripts", "run-suite-runtime-startup.ps1");
        _stopScriptPath = Path.Combine(_repoRoot, "scripts", "stop-suite-runtime.ps1");
        _supportBundleScriptPath = Path.Combine(_repoRoot, "scripts", "export-suite-support-bundle.ps1");
        _runtimeCatalogPath = Path.Combine(_assetsDirectory, "runtimeCatalog.json");
        _developerToolsManifestPath = Path.Combine(_repoRoot, "src", "routes", "developerToolsManifest.data.json");
        _runtimeStatusDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Suite",
            "runtime-bootstrap");
        _runtimeLogPath = Path.Combine(_runtimeStatusDirectory, "bootstrap.log");
        _runtimeCatalog = RuntimeCatalog.LoadFromFile(_runtimeCatalogPath, JsonOptions, out _runtimeCatalogJson);

        Directory.CreateDirectory(_runtimeStatusDirectory);

        Text = "Suite Runtime Control";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new System.Drawing.Size(1220, 780);
        Size = new System.Drawing.Size(1460, 900);
        BackColor = System.Drawing.ColorTranslator.FromHtml("#08131b");

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = System.Drawing.ColorTranslator.FromHtml("#08131b"),
        };
        Controls.Add(_webView);

        _pollTimer = new System.Windows.Forms.Timer
        {
            Interval = 2500,
        };
        _pollTimer.Tick += async (_, _) => await OnPollTickAsync();

        Shown += async (_, _) =>
        {
            EnsureVisibleOnDesktop();
            await OnShownAsync();
        };
        FormClosing += OnFormClosing;
        FormClosed += OnFormClosed;
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
            _pollTimer.Start();
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-init", exception);
            MessageBox.Show(
                this,
                "The HTML runtime shell could not start. Use the legacy runtime control panel for this workstation.",
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
        core.WebMessageReceived += async (_, eventArgs) => await OnWebMessageReceivedAsync(eventArgs);
        core.NavigationCompleted += async (_, eventArgs) => await OnNavigationCompletedAsync(eventArgs);
        core.SetVirtualHostNameToFolderMapping(
            "suite-runtime.local",
            _assetsDirectory,
            CoreWebView2HostResourceAccessKind.Allow);

        _webView.Source = new Uri("https://suite-runtime.local/index.html");
    }

    private async Task OnNavigationCompletedAsync(CoreWebView2NavigationCompletedEventArgs eventArgs)
    {
        if (!eventArgs.IsSuccess)
        {
            throw new InvalidOperationException($"Runtime shell navigation failed with status {eventArgs.WebErrorStatus}.");
        }

        RuntimeShellLogger.Log($"runtime-shell-navigation-complete: autoBootstrap={_options.AutoBootstrap}");
        _uiReady = true;
        EnsureVisibleOnDesktop();
        FlushQueuedMessages();
        PublishRuntimeCatalog();
        PublishDeveloperToolsManifest();
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

        await PublishSnapshotAsync();
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
                case "runtime.refresh":
                    await PublishSnapshotAsync(force: true);
                    break;
                case "runtime.clear_log":
                    PostEvent("runtime.log", new { reset = true });
                    SendLog("SYS", "Log view cleared.", "sys");
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
                case "suite.support.export-bundle":
                    await ExportSupportBundleAsync();
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

            if (string.Equals(result.LogTargetKind, "url", StringComparison.OrdinalIgnoreCase))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = result.LogTargetTarget!,
                    UseShellExecute = true,
                });
            }
            else
            {
                if (File.Exists(result.LogTargetTarget))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "notepad.exe",
                        Arguments = $"\"{result.LogTargetTarget}\"",
                        UseShellExecute = true,
                    });
                }
                else
                {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = $"\"{result.LogTargetTarget}\"",
                    UseShellExecute = true,
                });
                }
            }

            SendLog("SYS", $"Opened logs for {serviceId}.", "sys");
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
            if (!File.Exists(_runtimeLogPath))
            {
                SendError("Open bootstrap log failed.", $"Bootstrap log not found: {_runtimeLogPath}");
                return Task.CompletedTask;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = _runtimeLogPath,
                UseShellExecute = true,
            });

            SendLog("SYS", "Opened bootstrap log.", "sys");
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
        var normalizedRoute = string.IsNullOrWhiteSpace(routePath) ? "/app/dashboard" : routePath.Trim();
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

                if (!TryExtractJsonObject(result.CombinedOutput, out var payloadJson))
                {
                    SendError("Runtime snapshot failed.", "The status script did not return JSON.");
                    return;
                }

                _lastSnapshotDocument?.Dispose();
                _lastSnapshotDocument = JsonDocument.Parse(payloadJson);
                PostRawEvent("runtime.snapshot", payloadJson);
                PublishBootstrapStateFromSnapshot();

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

            foreach (var line in text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None))
            {
                if (!string.IsNullOrWhiteSpace(line))
                {
                    EmitLogLine(line);
                }
            }
        }
        catch (Exception exception)
        {
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
        if (!root.TryGetProperty("payload", out var payload))
        {
            return null;
        }

        return GetStringProperty(payload, "serviceId");
    }

    private static string? GetPayloadRouteId(JsonElement root)
    {
        if (!root.TryGetProperty("payload", out var payload))
        {
            return null;
        }

        return GetStringProperty(payload, "routeId");
    }

    private static string? GetPayloadRoutePath(JsonElement root)
    {
        if (!root.TryGetProperty("payload", out var payload))
        {
            return null;
        }

        return GetStringProperty(payload, "routePath");
    }

    private static string? GetPayloadRouteTitle(JsonElement root)
    {
        if (!root.TryGetProperty("payload", out var payload))
        {
            return null;
        }

        return GetStringProperty(payload, "routeTitle");
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
    }

    private void OnFormClosed(object? sender, FormClosedEventArgs eventArgs)
    {
        _pollTimer.Dispose();
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
