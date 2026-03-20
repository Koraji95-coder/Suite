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

    private static readonly string[] ServiceOrder =
    {
        "supabase",
        "backend",
        "gateway",
        "frontend",
        "watchdog-filesystem",
        "watchdog-autocad",
    };

    private readonly AppOptions _options;
    private readonly WebView2 _webView;
    private readonly System.Windows.Forms.Timer _pollTimer;
    private readonly string _repoRoot;
    private readonly string _assetsDirectory;
    private readonly string _statusScriptPath;
    private readonly string _controlScriptPath;
    private readonly string _bootstrapScriptPath;
    private readonly string _stopScriptPath;
    private readonly string _runtimeStatusDirectory;
    private readonly string _runtimeLogPath;
    private readonly List<string> _queuedMessages = new();
    private readonly object _queueLock = new();

    private bool _isClosing;
    private bool _uiReady;
    private bool _snapshotInFlight;
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
        _runtimeStatusDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Suite",
            "runtime-bootstrap");
        _runtimeLogPath = Path.Combine(_runtimeStatusDirectory, "bootstrap.log");

        Directory.CreateDirectory(_runtimeStatusDirectory);

        Text = "Suite Runtime Control";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new System.Drawing.Size(1220, 780);
        Size = new System.Drawing.Size(1460, 900);
        BackColor = System.Drawing.ColorTranslator.FromHtml("#0d0d0b");

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = System.Drawing.ColorTranslator.FromHtml("#0d0d0b"),
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

        _uiReady = true;
        EnsureVisibleOnDesktop();
        FlushQueuedMessages();
        SendLog("SYS", "Runtime shell ready.", "sys");
        EmitInitialRuntimeLogTail();
        _runtimeLogOffset = GetCurrentLogLength();
        await PublishSnapshotAsync();

        if (_options.AutoBootstrap)
        {
            _ = RunBootstrapAllAsync(autoTriggered: true);
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
            return;
        }

        try
        {
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

            foreach (var serviceId in ServiceOrder)
            {
                var service = FindService(serviceId);
                if (service is null || ServiceSatisfiesStart(service.Value))
                {
                    continue;
                }

                var serviceName = GetServiceName(service.Value) ?? serviceId;
                SendLog("INFO", $"Starting {serviceName}.", string.Empty);
                SendProgress(true, ComputeStartProgressPercent(serviceId), $"Starting {serviceName}.");

                var result = await RunControlActionAsync(serviceId, "start");
                await PublishSnapshotAsync(force: true);
                PublishProgressFromSnapshot();

                if (!result.Ok)
                {
                    SendLog("ERR", result.Summary ?? $"Failed to start {serviceName}.", "err");
                    if (!string.IsNullOrWhiteSpace(result.Details))
                    {
                        SendLog("WARN", result.Details, "warn");
                    }
                    return;
                }

                SendLog("OK", result.Summary ?? $"{serviceName} started.", "ok");
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
            if (result.Succeeded)
            {
                SendLog("OK", summary, "ok");
            }
            else
            {
                SendLog("ERR", summary, "err");
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
            var serviceName = existingService.HasValue ? GetServiceName(existingService.Value) : null;
            serviceName ??= serviceId;
            SendLog("START", $"{ToPresentTense(action)} {serviceName}.", "hi");
            SendProgress(visible: true, percent: 35, step: $"{ToPresentTense(action)} {serviceName}.");

            var result = await RunControlActionAsync(serviceId, action);
            await PublishSnapshotAsync(force: true);
            PublishProgressFromSnapshot();

            if (result.Ok)
            {
                SendLog("OK", result.Summary ?? $"{serviceName} {action} completed.", "ok");
                if (!string.IsNullOrWhiteSpace(result.Details))
                {
                    SendLog("INFO", result.Details, string.Empty);
                }
            }
            else
            {
                SendLog("ERR", result.Summary ?? $"{serviceName} {action} failed.", "err");
                if (!string.IsNullOrWhiteSpace(result.Details))
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
            return;
        }

        _snapshotInFlight = true;
        try
        {
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

            if (_actionBusy)
            {
                PublishProgressFromSnapshot();
            }
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
            case "bootstrap_all":
            case "start_all":
            {
                var completed = 0;
                var step = "Starting services.";
                foreach (var serviceId in ServiceOrder)
                {
                    if (!TryFindService(root, serviceId, out var service))
                    {
                        continue;
                    }

                    if (ServiceSatisfiesStart(service))
                    {
                        completed += 1;
                        continue;
                    }

                    step = $"{(_activeAction == "bootstrap_all" ? "Bootstrapping" : "Starting")} {GetServiceName(service) ?? serviceId}.";
                    break;
                }

                if (completed >= ServiceOrder.Length)
                {
                    step = _activeAction == "bootstrap_all" ? "Runtime ready." : "All services started.";
                }

                var percent = completed == 0
                    ? 8
                    : Math.Clamp((int)Math.Round((completed * 100.0) / ServiceOrder.Length), 8, 100);
                SendProgress(true, percent, step);
                break;
            }
            case "stop_all":
            {
                var stopped = 0;
                foreach (var serviceId in ServiceOrder)
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
                    : Math.Clamp((int)Math.Round((stopped * 100.0) / ServiceOrder.Length), 10, 100);
                var step = stopped >= ServiceOrder.Length ? "All services stopped." : "Stopping local services.";
                SendProgress(true, percent, step);
                break;
            }
            case "service.start":
            case "service.restart":
            {
                if (TryGetActiveService(root, out var service))
                {
                    var ready = ServiceSatisfiesStart(service);
                    var percent = ready ? 100 : 40;
                    var step = ready
                        ? $"{GetServiceName(service) ?? _activeServiceId} is ready."
                        : $"Starting {GetServiceName(service) ?? _activeServiceId}.";
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
                        ? $"{GetServiceName(service) ?? _activeServiceId} is stopped."
                        : $"Stopping {GetServiceName(service) ?? _activeServiceId}.";
                    SendProgress(true, percent, step);
                }
                break;
            }
        }
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
                LogTargetKind: null,
                LogTargetTarget: null);
        }

        using var document = JsonDocument.Parse(payloadJson);
        var root = document.RootElement;
        return new ControlActionResult(
            Ok: root.TryGetProperty("ok", out var okElement) && okElement.ValueKind is JsonValueKind.True,
            Summary: GetStringProperty(root, "summary"),
            Details: GetStringProperty(root, "details") ?? GetStringProperty(root, "outputTail"),
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

    private static string? GetStringProperty(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;
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

    private static string? GetServiceName(JsonElement service)
    {
        return GetStringProperty(service, "name");
    }

    private static bool ServiceSatisfiesStart(JsonElement service)
    {
        var state = GetStringProperty(service, "state");
        return string.Equals(state, "running", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(state, "starting", StringComparison.OrdinalIgnoreCase);
    }

    private static bool ServiceSatisfiesStop(JsonElement service)
    {
        var state = GetStringProperty(service, "state");
        return !string.Equals(state, "running", StringComparison.OrdinalIgnoreCase) &&
               !string.Equals(state, "starting", StringComparison.OrdinalIgnoreCase);
    }

    private static int ComputeStartProgressPercent(string serviceId)
    {
        var index = Array.IndexOf(ServiceOrder, serviceId);
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
        string? LogTargetKind,
        string? LogTargetTarget)
    {
        public bool HasLogTarget =>
            !string.IsNullOrWhiteSpace(LogTargetKind) &&
            !string.IsNullOrWhiteSpace(LogTargetTarget);
    }
}
