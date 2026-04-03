using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace Suite.RuntimeControl.Tests;

public sealed class ProjectStandardsActionHandlerTests : IDisposable
{
    private readonly string _repoRoot;

    public ProjectStandardsActionHandlerTests()
    {
        _repoRoot = Path.Combine(Path.GetTempPath(), $"suite-runtime-control-standards-{Guid.NewGuid():N}");
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
            action: "run-review",
            requestId: "req-1",
            origin: "http://127.0.0.1:5173");

        var valid = handler.ValidateTicketForTests(
            ticket,
            "run-review",
            "http://127.0.0.1:5173",
            out var error);

        Assert.True(valid);
        Assert.Equal(string.Empty, error);
    }

    [Fact]
    public void ScanProjectFilesForTests_FindsDwgAndDwsFiles()
    {
        var projectRoot = Path.Combine(_repoRoot, "project");
        Directory.CreateDirectory(projectRoot);
        File.WriteAllText(Path.Combine(projectRoot, "demo-1.dwg"), string.Empty, Encoding.UTF8);
        File.WriteAllText(Path.Combine(projectRoot, "suite-standard.dws"), string.Empty, Encoding.UTF8);
        var handler = CreateHandler();

        var dwgFiles = handler.ScanProjectFilesForTests(projectRoot, ".dwg");
        var dwsFiles = handler.ScanProjectFilesForTests(projectRoot, ".dws");

        Assert.Single(dwgFiles);
        Assert.Single(dwsFiles);
        Assert.EndsWith(".dwg", dwgFiles[0], StringComparison.OrdinalIgnoreCase);
        Assert.EndsWith(".dws", dwsFiles[0], StringComparison.OrdinalIgnoreCase);
    }

    private ProjectStandardsActionHandler CreateHandler()
    {
        return new ProjectStandardsActionHandler(
            _repoRoot,
            static _ => { },
            static (_, _) => { });
    }

    private static string BuildTicket(
        string action,
        string requestId,
        string origin)
    {
        var payload = System.Text.Json.JsonSerializer.Serialize(
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
