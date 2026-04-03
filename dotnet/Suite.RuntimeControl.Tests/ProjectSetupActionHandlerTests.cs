using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace Suite.RuntimeControl.Tests;

public sealed class ProjectSetupActionHandlerTests : IDisposable
{
    private readonly string _repoRoot;

    public ProjectSetupActionHandlerTests()
    {
        _repoRoot = Path.Combine(Path.GetTempPath(), $"suite-runtime-control-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_repoRoot);
        File.WriteAllText(Path.Combine(_repoRoot, ".env"), "API_KEY=test-secret\n", Encoding.UTF8);
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_repoRoot))
            {
                Directory.Delete(_repoRoot, recursive: true);
            }
        }
        catch
        {
        }
    }

    [Fact]
    public void ValidateTicketForTests_AcceptsMatchingActionAndOrigin()
    {
        var handler = CreateHandler();
        var ticket = BuildTicket(
            action: "scan-root",
            requestId: "req-1",
            origin: "http://127.0.0.1:5173");

        var valid = handler.ValidateTicketForTests(
            ticket,
            "scan-root",
            "http://127.0.0.1:5173",
            out var error);

        Assert.True(valid);
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void ValidateTicketForTests_RejectsOriginMismatch()
    {
        var handler = CreateHandler();
        var ticket = BuildTicket(
            action: "scan-root",
            requestId: "req-2",
            origin: "http://127.0.0.1:5173");

        var valid = handler.ValidateTicketForTests(
            ticket,
            "scan-root",
            "http://localhost:5173",
            out var error);

        Assert.False(valid);
        Assert.Contains("origin", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void BuildArtifactSnapshotForTests_DerivesStarterArtifactsFromProjectRoot()
    {
        var projectRoot = Path.Combine(_repoRoot, "project");
        Directory.CreateDirectory(projectRoot);
        File.WriteAllText(Path.Combine(projectRoot, "R3P-25074-E6-0001 MAIN.dwg"), string.Empty, Encoding.UTF8);
        var handler = CreateHandler();

        var files = handler.ScanProjectFilesForTests(projectRoot);
        var artifacts = handler.BuildArtifactSnapshotForTests(
            projectRoot,
            new JsonObject
            {
                ["projectName"] = "Demo Project",
            });

        Assert.Contains(files, path => path.EndsWith(".dwg", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(
            Path.Combine(projectRoot, "Demo Project.wdp"),
            artifacts["wdpPath"]?.GetValue<string>());
        Assert.Equal(
            Path.Combine(projectRoot, "Demo Project.wdt"),
            artifacts["wdtPath"]?.GetValue<string>());
        Assert.Equal(
            Path.Combine(projectRoot, "Demo Project_wdtitle.wdl"),
            artifacts["wdlPath"]?.GetValue<string>());
        Assert.False(artifacts["wdpExists"]?.GetValue<bool>());
    }

    [Fact]
    public async Task DispatchPipeActionForTestsAsync_DoesNotRetryWhenPrimaryHostRejectsAction()
    {
        var dispatchCount = 0;
        var handler = CreateHandler(
            (_, _, _, _, _, _) =>
            {
                dispatchCount += 1;
                return Task.FromResult(
                    new ProjectSetupActionHandler.PipeDispatchResult(
                        false,
                        "ACTION_NOT_IMPLEMENTED",
                        "Action 'suite_acade_project_open' is not implemented by the in-process ACADE pipe host.",
                        new JsonArray()));
            });

        var result = await handler.DispatchPipeActionForTestsAsync(
            "suite_acade_project_open",
            new JsonObject(),
            "SUITE_ACADE_PIPE",
            CancellationToken.None);

        Assert.Equal(1, dispatchCount);
        Assert.Equal("ACTION_NOT_IMPLEMENTED", result.Code);
        Assert.Contains("in-process ACADE host", result.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("SUITE_ACADE_PIPE", result.Message);
        Assert.Contains("does not fall back", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task DispatchPipeActionForTestsAsync_DoesNotRetryWhenPrimaryPipeIsUnavailable()
    {
        var dispatchCount = 0;
        var handler = CreateHandler(
            (_, _, _, _, _, _) =>
            {
                dispatchCount += 1;
                return Task.FromResult(
                    new ProjectSetupActionHandler.PipeDispatchResult(
                        false,
                        "PIPE_DISPATCH_FAILED",
                        "Unable to dispatch suite_title_block_apply over SUITE_ACADE_PIPE: No process is on the other end of the pipe.",
                        new JsonArray()));
            });

        var result = await handler.DispatchPipeActionForTestsAsync(
            "suite_title_block_apply",
            new JsonObject(),
            "SUITE_ACADE_PIPE",
            CancellationToken.None);

        Assert.Equal(1, dispatchCount);
        Assert.Equal("PIPE_DISPATCH_FAILED", result.Code);
        Assert.Contains("No process is on the other end of the pipe", result.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("legacy named-pipe bridge", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ScanProjectCadDrawingsForTestsAsync_ReturnsSingleProviderWarningWhenCadHostFails()
    {
        var dispatchCount = 0;
        var handler = CreateHandler(
            (_, _, _, _, _, _) =>
            {
                dispatchCount += 1;
                return Task.FromResult(
                    new ProjectSetupActionHandler.PipeDispatchResult(
                        false,
                        "PIPE_DISPATCH_FAILED",
                        "Unable to dispatch suite_drawing_list_scan over SUITE_ACADE_PIPE: No process is on the other end of the pipe.",
                        new JsonArray()));
            });

        var result = await handler.ScanProjectCadDrawingsForTestsAsync(
            new[] { Path.Combine(_repoRoot, "project", "demo.dwg") },
            new JsonObject(),
            "req-scan",
            CancellationToken.None);

        Assert.Equal(1, dispatchCount);
        Assert.Empty(result.Drawings);
        Assert.Single(result.Warnings);
        Assert.Contains(
            "only supported by the in-process ACADE host",
            result.Warnings[0]?.GetValue<string>() ?? string.Empty,
            StringComparison.OrdinalIgnoreCase);
    }

    private ProjectSetupActionHandler CreateHandler(
        Func<string, string, string, JsonObject, int, CancellationToken, Task<ProjectSetupActionHandler.PipeDispatchResult>>? dispatchPipeOverrideAsync = null)
    {
        return new ProjectSetupActionHandler(
            _repoRoot,
            static (_, _, _) => Task.FromResult<string?>(null),
            static _ => { },
            static (_, _) => { },
            dispatchPipeOverrideAsync);
    }

    private static string BuildTicket(
        string action,
        string requestId,
        string origin)
    {
        var payload = JsonSerializer.Serialize(
            new
            {
                userId = "user-1",
                action,
                requestId,
                origin,
                projectId = "project-1",
                issuedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                expiresAt = DateTimeOffset.UtcNow.AddMinutes(5).ToUnixTimeSeconds(),
            });
        var encodedPayload = Base64UrlEncode(Encoding.UTF8.GetBytes(payload));
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes("test-secret"));
        var signature = Convert.ToHexString(
            hmac.ComputeHash(Encoding.UTF8.GetBytes(encodedPayload)))
            .ToLowerInvariant();
        return $"{encodedPayload}.{signature}";
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}
