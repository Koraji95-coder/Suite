using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Suite.RuntimeControl;

internal sealed class ProjectSetupPipeClient
{
    private readonly string _pipeName;
    private readonly string _token;

    public ProjectSetupPipeClient(string pipeName, string token)
    {
        _pipeName = string.IsNullOrWhiteSpace(pipeName) ? "SUITE_AUTOCAD_PIPE" : pipeName.Trim();
        _token = token?.Trim() ?? string.Empty;
    }

    public async Task<JsonObject> SendAsync(
        string action,
        JsonObject payload,
        int timeoutMs,
        CancellationToken cancellationToken)
    {
        using var client = new NamedPipeClientStream(
            ".",
            _pipeName,
            PipeDirection.InOut,
            PipeOptions.Asynchronous);
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromMilliseconds(Math.Max(1000, timeoutMs)));
        await client.ConnectAsync(timeoutCts.Token).ConfigureAwait(false);

        var requestId = ReadString(payload, "requestId");
        if (string.IsNullOrWhiteSpace(requestId))
        {
            requestId = $"req-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
        }

        var request = new JsonObject
        {
            ["id"] = requestId,
            ["action"] = action?.Trim(),
            ["payload"] = payload.DeepClone(),
            ["token"] = string.IsNullOrWhiteSpace(_token) ? null : _token,
        };

        var requestJson = JsonSerializer.Serialize(request) + "\n";
        var requestBytes = Encoding.UTF8.GetBytes(requestJson);
        await client.WriteAsync(requestBytes, timeoutCts.Token).ConfigureAwait(false);
        await client.FlushAsync(timeoutCts.Token).ConfigureAwait(false);

        using var reader = new StreamReader(client, Encoding.UTF8, leaveOpen: false);
        var line = await reader.ReadLineAsync(timeoutCts.Token).ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(line))
        {
            throw new InvalidOperationException($"Pipe {_pipeName} returned an empty response.");
        }

        var parsed = JsonNode.Parse(line) as JsonObject;
        if (parsed is null)
        {
            throw new InvalidOperationException($"Pipe {_pipeName} returned an invalid JSON response.");
        }

        return parsed;
    }

    private static string ReadString(JsonObject payload, string propertyName)
    {
        if (payload.TryGetPropertyValue(propertyName, out var valueNode) &&
            valueNode is JsonValue jsonValue &&
            jsonValue.TryGetValue<string>(out var stringValue))
        {
            return stringValue?.Trim() ?? string.Empty;
        }

        return string.Empty;
    }
}
