using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Suite.RuntimeControl;

internal sealed class WorkstationFolderPickerBridge : IDisposable
{
    internal const int DefaultPort = 57421;
    internal const string HealthPath = "/health";
    internal const string PickFolderPath = "/api/workstation/pick-folder";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };

    private readonly Func<string?, string?, CancellationToken, Task<string?>> _pickFolderAsync;
    private readonly Action<string> _logInfo;
    private readonly Action<string, Exception> _logException;
    private readonly ProjectSetupActionHandler? _projectSetupActionHandler;
    private readonly ProjectStandardsActionHandler? _projectStandardsActionHandler;
    private readonly HttpListener _listener = new();
    private readonly CancellationTokenSource _disposeCts = new();
    private Task? _listenerTask;
    private int _started;

    public WorkstationFolderPickerBridge(
        Func<string?, string?, CancellationToken, Task<string?>> pickFolderAsync,
        Action<string> logInfo,
        Action<string, Exception> logException,
        ProjectSetupActionHandler? projectSetupActionHandler = null,
        ProjectStandardsActionHandler? projectStandardsActionHandler = null)
    {
        _pickFolderAsync = pickFolderAsync;
        _logInfo = logInfo;
        _logException = logException;
        _projectSetupActionHandler = projectSetupActionHandler;
        _projectStandardsActionHandler = projectStandardsActionHandler;
        _listener.Prefixes.Add($"http://127.0.0.1:{DefaultPort}/");
        _listener.Prefixes.Add($"http://localhost:{DefaultPort}/");
    }

    public void Start()
    {
        if (Interlocked.Exchange(ref _started, 1) == 1)
        {
            return;
        }

        _listener.Start();
        _listenerTask = Task.Run(() => ListenAsync(_disposeCts.Token));
        _logInfo($"workstation-folder-picker-bridge-started: http://127.0.0.1:{DefaultPort}{PickFolderPath}");
    }

    public void Dispose()
    {
        _disposeCts.Cancel();

        try
        {
            if (_listener.IsListening)
            {
                _listener.Stop();
            }
        }
        catch
        {
        }

        try
        {
            _listener.Close();
        }
        catch
        {
        }

        try
        {
            _listenerTask?.Wait(TimeSpan.FromSeconds(2));
        }
        catch
        {
        }

        _disposeCts.Dispose();
    }

    internal static bool IsAllowedOrigin(string? origin)
    {
        if (string.IsNullOrWhiteSpace(origin))
        {
            return true;
        }

        if (!Uri.TryCreate(origin, UriKind.Absolute, out var parsedOrigin))
        {
            return false;
        }

        if (!string.Equals(parsedOrigin.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(parsedOrigin.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return parsedOrigin.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
            parsedOrigin.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase);
    }

    private async Task ListenAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            HttpListenerContext? context = null;
            try
            {
                context = await _listener.GetContextAsync().WaitAsync(cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (HttpListenerException exception) when (
                cancellationToken.IsCancellationRequested ||
                exception.ErrorCode == 995)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }
            catch (Exception exception)
            {
                _logException("workstation-folder-picker-bridge-listen", exception);
                try
                {
                    await Task.Delay(250, cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                continue;
            }

            _ = Task.Run(
                () => HandleRequestAsync(context, cancellationToken),
                CancellationToken.None);
        }
    }

    private async Task HandleRequestAsync(
        HttpListenerContext context,
        CancellationToken cancellationToken)
    {
        var request = context.Request;
        var response = context.Response;
        var origin = request.Headers["Origin"];

        try
        {
            if (IsPreflightRequest(request))
            {
                if (!IsAllowedOrigin(origin))
                {
                    response.StatusCode = (int)HttpStatusCode.Forbidden;
                    response.Close();
                    return;
                }

                ApplyCorsHeaders(response, origin, request);
                response.StatusCode = (int)HttpStatusCode.NoContent;
                response.Close();
                return;
            }

            if (!IsAllowedOrigin(origin))
            {
                await WriteJsonAsync(
                    response,
                    origin,
                    request,
                    HttpStatusCode.Forbidden,
                    new ErrorPayload
                    {
                        Ok = false,
                        Error = "Workstation picker origin is not allowed.",
                    },
                    cancellationToken).ConfigureAwait(false);
                return;
            }

            var requestPath = NormalizePath(request.Url?.AbsolutePath);
            if (string.Equals(request.HttpMethod, "GET", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(requestPath, HealthPath, StringComparison.OrdinalIgnoreCase))
            {
                await WriteJsonAsync(
                    response,
                    origin,
                    request,
                    HttpStatusCode.OK,
                    new HealthPayload
                    {
                        Ok = true,
                        Service = "runtime-control-folder-picker",
                        Version = "suite.runtime-control.v1",
                    },
                    cancellationToken).ConfigureAwait(false);
                return;
            }

            if (_projectSetupActionHandler is not null &&
                await _projectSetupActionHandler.TryHandleAsync(
                    context,
                    origin,
                    cancellationToken).ConfigureAwait(false))
            {
                return;
            }

            if (_projectStandardsActionHandler is not null &&
                await _projectStandardsActionHandler.TryHandleAsync(
                    context,
                    origin,
                    cancellationToken).ConfigureAwait(false))
            {
                return;
            }

            if (!string.Equals(request.HttpMethod, "POST", StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(requestPath, PickFolderPath, StringComparison.OrdinalIgnoreCase))
            {
                await WriteJsonAsync(
                    response,
                    origin,
                    request,
                    HttpStatusCode.NotFound,
                    new ErrorPayload
                    {
                        Ok = false,
                        Error = "Workstation picker route was not found.",
                    },
                    cancellationToken).ConfigureAwait(false);
                return;
            }

            PickFolderRequest? payload = null;
            if (request.HasEntityBody)
            {
                payload = await JsonSerializer.DeserializeAsync<PickFolderRequest>(
                    request.InputStream,
                    JsonOptions,
                    cancellationToken).ConfigureAwait(false);
            }

            var selectedPath = await _pickFolderAsync(
                payload?.InitialPath,
                payload?.Title,
                cancellationToken).ConfigureAwait(false);

            var normalizedSelectedPath = string.IsNullOrWhiteSpace(selectedPath)
                ? null
                : Path.GetFullPath(selectedPath.Trim());

            await WriteJsonAsync(
                response,
                origin,
                request,
                HttpStatusCode.OK,
                new PickFolderResponse
                {
                    Ok = true,
                    Cancelled = string.IsNullOrWhiteSpace(normalizedSelectedPath),
                    Path = normalizedSelectedPath,
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (JsonException exception)
        {
            await WriteJsonAsync(
                response,
                origin,
                request,
                HttpStatusCode.BadRequest,
                new ErrorPayload
                {
                    Ok = false,
                    Error = "Workstation picker request payload was invalid.",
                    Message = exception.Message,
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            SafeClose(response);
        }
        catch (Exception exception)
        {
            _logException("workstation-folder-picker-bridge-request", exception);
            await WriteJsonAsync(
                response,
                origin,
                request,
                HttpStatusCode.InternalServerError,
                new ErrorPayload
                {
                    Ok = false,
                    Error = "Folder picker bridge failed.",
                    Message = exception.Message,
                },
                cancellationToken).ConfigureAwait(false);
        }
    }

    private static bool IsPreflightRequest(HttpListenerRequest request)
    {
        return string.Equals(request.HttpMethod, "OPTIONS", StringComparison.OrdinalIgnoreCase);
    }

    internal static string NormalizePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return "/";
        }

        var normalized = path.Trim();
        if (!normalized.StartsWith('/'))
        {
            normalized = "/" + normalized;
        }

        return normalized.Length > 1
            ? normalized.TrimEnd('/')
            : normalized;
    }

    internal static void ApplyCorsHeaders(
        HttpListenerResponse response,
        string? origin,
        HttpListenerRequest request)
    {
        if (!string.IsNullOrWhiteSpace(origin) && IsAllowedOrigin(origin))
        {
            response.Headers["Access-Control-Allow-Origin"] = origin;
            response.Headers["Vary"] = "Origin";
        }

        response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        response.Headers["Access-Control-Allow-Headers"] = "Content-Type";

        if (string.Equals(
            request.Headers["Access-Control-Request-Private-Network"],
            "true",
            StringComparison.OrdinalIgnoreCase))
        {
            response.Headers["Access-Control-Allow-Private-Network"] = "true";
        }
    }

    internal static async Task WriteJsonAsync<TPayload>(
        HttpListenerResponse response,
        string? origin,
        HttpListenerRequest request,
        HttpStatusCode statusCode,
        TPayload payload,
        CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        var bytes = Encoding.UTF8.GetBytes(json);

        response.StatusCode = (int)statusCode;
        response.ContentType = "application/json; charset=utf-8";
        response.ContentEncoding = Encoding.UTF8;
        response.ContentLength64 = bytes.LongLength;
        ApplyCorsHeaders(response, origin, request);

        try
        {
            await response.OutputStream.WriteAsync(bytes, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            SafeClose(response);
        }
    }

    internal static void SafeClose(HttpListenerResponse response)
    {
        try
        {
            response.Close();
        }
        catch
        {
        }
    }

    private sealed class PickFolderRequest
    {
        public string? InitialPath { get; init; }

        public string? Title { get; init; }
    }

    private sealed class PickFolderResponse
    {
        public bool Ok { get; init; }

        public bool Cancelled { get; init; }

        public string? Path { get; init; }
    }

    private sealed class ErrorPayload
    {
        public bool Ok { get; init; }

        public string? Error { get; init; }

        public string? Message { get; init; }
    }

    private sealed class HealthPayload
    {
        public bool Ok { get; init; }

        public string? Service { get; init; }

        public string? Version { get; init; }
    }
}
