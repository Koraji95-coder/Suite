using System.IO.Pipes;
using System.Text;
using System.Text.Json;

const string DefaultPipeName = "SUITE_AUTOCAD_PIPE";
var pipeName = args.Length > 0 ? args[0] : DefaultPipeName;

Console.WriteLine($"[NamedPipeServer] Starting on \\.\\pipe\\{pipeName}");

while (true)
{
    using var server = new NamedPipeServerStream(
        pipeName,
        PipeDirection.InOut,
        1,
        PipeTransmissionMode.Message,
        PipeOptions.Asynchronous
    );

    await server.WaitForConnectionAsync();

    try
    {
        var requestJson = await ReadLineAsync(server);
        if (string.IsNullOrWhiteSpace(requestJson))
        {
            await WriteJsonAsync(server, new { ok = false, error = "Empty request" });
            continue;
        }

        var request = JsonSerializer.Deserialize<Dictionary<string, object>>(requestJson);
        var response = new Dictionary<string, object?>
        {
            ["id"] = request != null && request.TryGetValue("id", out var id) ? id : null,
            ["ok"] = true,
            ["result"] = new { message = "Stub response from .NET server" },
            ["error"] = null,
        };

        await WriteJsonAsync(server, response);
    }
    catch (Exception ex)
    {
        await WriteJsonAsync(server, new { ok = false, error = ex.Message });
    }
}

static async Task<string> ReadLineAsync(NamedPipeServerStream server)
{
    var buffer = new byte[4096];
    var builder = new StringBuilder();

    while (true)
    {
        var bytesRead = await server.ReadAsync(buffer, 0, buffer.Length);
        if (bytesRead <= 0)
        {
            break;
        }

        builder.Append(Encoding.UTF8.GetString(buffer, 0, bytesRead));
        if (builder.ToString().Contains('\n'))
        {
            break;
        }
    }

    var line = builder.ToString();
    var newlineIndex = line.IndexOf('\n');
    return newlineIndex >= 0 ? line[..newlineIndex] : line;
}

static async Task WriteJsonAsync(NamedPipeServerStream server, object payload)
{
    var json = JsonSerializer.Serialize(payload) + "\n";
    var bytes = Encoding.UTF8.GetBytes(json);
    await server.WriteAsync(bytes, 0, bytes.Length);
    await server.FlushAsync();
}
