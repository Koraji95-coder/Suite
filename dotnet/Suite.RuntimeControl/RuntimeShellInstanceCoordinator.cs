using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Suite.RuntimeControl;

internal sealed class RuntimeShellActivationRequest
{
    public bool AutoBootstrap { get; init; }
}

internal sealed class RuntimeShellInstanceCoordinator : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly string ProcessName = Path.GetFileNameWithoutExtension(Environment.ProcessPath) ?? "Suite.RuntimeControl";

    private readonly string _repoRoot;
    private readonly string _pipeName;
    private readonly string _lockPath;
    private readonly string _primaryStatePath;
    private readonly string _activationRequestPath;
    private readonly object _activationGate = new();
    private readonly CancellationTokenSource _disposeCancellation = new();
    private readonly object _stateGate = new();
    private readonly DateTimeOffset _startedAt = DateTimeOffset.Now;

    private FileStream? _lockHandle;
    private Task? _listenerTask;
    private Task? _fallbackActivationTask;
    private System.Threading.Timer? _heartbeatTimer;
    private Action<RuntimeShellActivationRequest>? _activationRequested;
    private readonly List<RuntimeShellActivationRequest> _pendingActivationRequests = [];
    private string _phase = RuntimeShellPhases.Starting;
    private bool _activatable;
    private string? _statusMessage = "Shell process created.";
    private bool _ownsPrimaryInstance;
    private bool _disposed;

    public RuntimeShellInstanceCoordinator(string repoRoot)
    {
        _repoRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(repoRoot) ? "." : repoRoot);
        var instanceKey = BuildInstanceKey(_repoRoot);
        _pipeName = $@"SuiteRuntimeControl-{instanceKey}";
        var basePath = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(basePath))
        {
            basePath = Path.GetTempPath();
        }

        var lockDirectory = Path.Combine(basePath, "Suite", "runtime-bootstrap", "locks");
        _lockPath = Path.Combine(lockDirectory, $"runtime-shell-{instanceKey}.lock");
        _primaryStatePath = Path.Combine(lockDirectory, $"runtime-shell-{instanceKey}.primary.json");
        _activationRequestPath = Path.Combine(lockDirectory, $"runtime-shell-{instanceKey}.activation.json");
    }

    public event Action<RuntimeShellActivationRequest>? ActivationRequested
    {
        add
        {
            ThrowIfDisposed();
            if (value is null)
            {
                return;
            }

            List<RuntimeShellActivationRequest>? pendingRequests = null;
            lock (_activationGate)
            {
                _activationRequested += value;
                if (_pendingActivationRequests.Count > 0)
                {
                    pendingRequests = [.. _pendingActivationRequests];
                    _pendingActivationRequests.Clear();
                }
            }

            if (pendingRequests is null)
            {
                return;
            }

            foreach (var request in pendingRequests)
            {
                try
                {
                    _activationRequested?.Invoke(request);
                }
                catch (Exception exception)
                {
                    RuntimeShellLogger.LogException("runtime-shell-instance-activation-dispatch", exception);
                }
            }
        }
        remove
        {
            if (value is null)
            {
                return;
            }

            lock (_activationGate)
            {
                _activationRequested -= value;
            }
        }
    }

    public bool TryAcquirePrimaryInstance()
    {
        ThrowIfDisposed();
        if (_lockHandle is not null)
        {
            return _ownsPrimaryInstance;
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_lockPath)!);
            _lockHandle = new FileStream(_lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
            _ownsPrimaryInstance = true;
            WritePrimaryState();
        }
        catch (IOException)
        {
            _ownsPrimaryInstance = false;
        }

        return _ownsPrimaryInstance;
    }

    public void StartListening()
    {
        ThrowIfDisposed();
        if (!_ownsPrimaryInstance)
        {
            return;
        }

        if (_listenerTask is null)
        {
            RuntimeShellLogger.Log($"runtime-shell-instance-listener-start: pid={Environment.ProcessId}; pipe={_pipeName}; lock={_lockPath}");
            _listenerTask = Task.Run(() => ListenLoopAsync(_disposeCancellation.Token));
        }

        if (_fallbackActivationTask is null)
        {
            _fallbackActivationTask = Task.Run(() => PollFallbackActivationLoopAsync(_disposeCancellation.Token));
        }

        if (_heartbeatTimer is null)
        {
            _heartbeatTimer = new System.Threading.Timer(
                static state => ((RuntimeShellInstanceCoordinator)state!).WritePrimaryState(),
                this,
                dueTime: TimeSpan.FromSeconds(1),
                period: TimeSpan.FromSeconds(2));
        }
    }

    public async Task<bool> SignalPrimaryInstanceAsync(RuntimeShellActivationRequest request, CancellationToken cancellationToken = default)
    {
        ThrowIfDisposed();

        try
        {
            using var client = new NamedPipeClientStream(
                ".",
                _pipeName,
                PipeDirection.InOut,
                PipeOptions.Asynchronous);
            using var linkedCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            linkedCancellation.CancelAfter(TimeSpan.FromSeconds(5));
            await client.ConnectAsync(linkedCancellation.Token);
            var payload = JsonSerializer.Serialize(request, JsonOptions);
            await using var writer = new StreamWriter(client, new UTF8Encoding(false), leaveOpen: false);
            await writer.WriteAsync(payload.AsMemory(), linkedCancellation.Token);
            await writer.FlushAsync();
            return true;
        }
        catch (Exception exception) when (exception is IOException or TimeoutException or OperationCanceledException)
        {
            RuntimeShellLogger.LogException("runtime-shell-instance-signal", exception);
            var queuedFallback = PersistFallbackActivationRequest(request);
            var activated = RuntimeShellWindowActivator.TryActivateExistingWindow(ProcessName, _primaryStatePath);
            RuntimeShellLogger.Log($"runtime-shell-instance-activate-fallback: activated={activated}; queuedFallback={queuedFallback}");
            return queuedFallback || activated;
        }
    }

    public static string BuildInstanceKey(string repoRoot)
    {
        var normalizedPath = Path.GetFullPath(string.IsNullOrWhiteSpace(repoRoot) ? "." : repoRoot)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            .Trim()
            .ToLowerInvariant();
        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(normalizedPath));
        return Convert.ToHexString(hashBytes[..8]);
    }

    public void ReportPhase(string phase, bool activatable = false, string? statusMessage = null)
    {
        ThrowIfDisposed();
        if (!_ownsPrimaryInstance)
        {
            return;
        }

        lock (_stateGate)
        {
            if (!string.IsNullOrWhiteSpace(phase))
            {
                _phase = phase;
            }

            _activatable = activatable;
            if (statusMessage is not null)
            {
                _statusMessage = statusMessage;
            }
        }

        WritePrimaryState();
    }

    public void ReportHeartbeat(bool? activatable = null, string? statusMessage = null)
    {
        ThrowIfDisposed();
        if (!_ownsPrimaryInstance)
        {
            return;
        }

        lock (_stateGate)
        {
            if (activatable.HasValue)
            {
                _activatable = activatable.Value;
            }

            if (statusMessage is not null)
            {
                _statusMessage = statusMessage;
            }
        }

        WritePrimaryState();
    }

    private async Task ListenLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await using var server = new NamedPipeServerStream(
                    _pipeName,
                    PipeDirection.InOut,
                    1,
                    PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous);
                await server.WaitForConnectionAsync(cancellationToken);
                using var reader = new StreamReader(server, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: false);
                var payload = await reader.ReadToEndAsync(cancellationToken);
                var request = JsonSerializer.Deserialize<RuntimeShellActivationRequest>(payload, JsonOptions)
                    ?? new RuntimeShellActivationRequest();
                DispatchActivationRequest(request);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception exception)
            {
                RuntimeShellLogger.LogException("runtime-shell-instance-listener", exception);
                await Task.Delay(250, cancellationToken);
            }
        }
    }

    private async Task PollFallbackActivationLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var request = TryConsumeFallbackActivationRequest();
                if (request is not null)
                {
                    DispatchActivationRequest(request);
                }

                await Task.Delay(250, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception exception)
            {
                RuntimeShellLogger.LogException("runtime-shell-instance-fallback-activation", exception);
                await Task.Delay(250, cancellationToken);
            }
        }
    }

    private void DispatchActivationRequest(RuntimeShellActivationRequest request)
    {
        Action<RuntimeShellActivationRequest>? handler;
        lock (_activationGate)
        {
            handler = _activationRequested;
            if (handler is null)
            {
                _pendingActivationRequests.Add(request);
                return;
            }
        }

        try
        {
            handler.Invoke(request);
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-instance-activation-dispatch", exception);
        }
    }

    private void WritePrimaryState()
    {
        if (!_ownsPrimaryInstance)
        {
            return;
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_primaryStatePath)!);
            RuntimeShellPrimaryState state;
            lock (_stateGate)
            {
                var now = DateTimeOffset.Now;
                state = new RuntimeShellPrimaryState
                {
                    ProcessId = Environment.ProcessId,
                    ProcessPath = Environment.ProcessPath,
                    RepoRoot = _repoRoot,
                    Phase = _phase,
                    Activatable = _activatable,
                    StatusMessage = _statusMessage,
                    StartedAt = _startedAt,
                    LastHeartbeat = now,
                    UpdatedAt = now,
                };
            }

            File.WriteAllText(_primaryStatePath, JsonSerializer.Serialize(state, JsonOptions));
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-instance-primary-state-write", exception);
        }
    }

    private bool PersistFallbackActivationRequest(RuntimeShellActivationRequest request)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_activationRequestPath)!);
            var pendingRequest = request;
            if (File.Exists(_activationRequestPath))
            {
                var existingRequest = JsonSerializer.Deserialize<RuntimeShellActivationRequest>(File.ReadAllText(_activationRequestPath), JsonOptions);
                if (existingRequest is not null)
                {
                    pendingRequest = new RuntimeShellActivationRequest
                    {
                        AutoBootstrap = request.AutoBootstrap || existingRequest.AutoBootstrap,
                    };
                }
            }

            File.WriteAllText(_activationRequestPath, JsonSerializer.Serialize(pendingRequest, JsonOptions));
            return true;
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-instance-fallback-queue", exception);
            return false;
        }
    }

    private RuntimeShellActivationRequest? TryConsumeFallbackActivationRequest()
    {
        if (!File.Exists(_activationRequestPath))
        {
            return null;
        }

        try
        {
            var request = JsonSerializer.Deserialize<RuntimeShellActivationRequest>(File.ReadAllText(_activationRequestPath), JsonOptions)
                ?? new RuntimeShellActivationRequest();
            File.Delete(_activationRequestPath);
            return request;
        }
        catch (Exception exception)
        {
            RuntimeShellLogger.LogException("runtime-shell-instance-fallback-consume", exception);
            try
            {
                File.Delete(_activationRequestPath);
            }
            catch
            {
            }

            return null;
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _disposeCancellation.Cancel();
        _heartbeatTimer?.Dispose();
        WaitForTask(_listenerTask);
        WaitForTask(_fallbackActivationTask);

        if (_ownsPrimaryInstance)
        {
            try
            {
                File.Delete(_primaryStatePath);
            }
            catch
            {
            }
        }

        _lockHandle?.Dispose();
        _disposeCancellation.Dispose();
    }

    private static void WaitForTask(Task? task)
    {
        if (task is null)
        {
            return;
        }

        try
        {
            task.Wait(TimeSpan.FromSeconds(1));
        }
        catch
        {
        }
    }

    private void ThrowIfDisposed()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
    }
}
