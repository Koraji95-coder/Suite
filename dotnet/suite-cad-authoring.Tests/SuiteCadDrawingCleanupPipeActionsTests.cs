using System.IO;
using System.Text.Json.Nodes;
using Xunit;

namespace SuiteCadAuthoring.Tests;

public sealed class SuiteCadDrawingCleanupPipeActionsTests
{
    [Fact]
    public void TryReadDrawingCleanupRequest_RequiresImportSourcePath()
    {
        var ok = SuiteCadAuthoringCommands.TryReadDrawingCleanupRequest(
            new JsonObject
            {
                ["entryMode"] = "import_file",
                ["preset"] = "import_full",
                ["saveDrawing"] = true,
                ["timeoutMs"] = 120000,
            },
            out _,
            out _,
            out _,
            out _,
            out _,
            out var validationError
        );

        Assert.False(ok);
        Assert.Equal(
            "sourcePath is required when entryMode is 'import_file'.",
            validationError
        );
    }

    [Fact]
    public void TryReadDrawingCleanupRequest_RejectsImportPresetOnCurrentDrawing()
    {
        var ok = SuiteCadAuthoringCommands.TryReadDrawingCleanupRequest(
            new JsonObject
            {
                ["entryMode"] = "current_drawing",
                ["preset"] = "import_full",
                ["saveDrawing"] = false,
                ["timeoutMs"] = 120000,
            },
            out _,
            out _,
            out _,
            out _,
            out _,
            out var validationError
        );

        Assert.False(ok);
        Assert.Equal(
            "preset 'import_full' requires entryMode 'import_file'.",
            validationError
        );
    }

    [Fact]
    public void TryReadDrawingCleanupRequest_AcceptsAbsoluteImportFilePath()
    {
        var tempFilePath = Path.Combine(Path.GetTempPath(), $"{Path.GetRandomFileName()}.dxf");
        File.WriteAllText(tempFilePath, "0\nEOF\n");

        try
        {
            var ok = SuiteCadAuthoringCommands.TryReadDrawingCleanupRequest(
                new JsonObject
                {
                    ["entryMode"] = "import_file",
                    ["preset"] = "import_full",
                    ["sourcePath"] = tempFilePath,
                    ["saveDrawing"] = true,
                    ["timeoutMs"] = 120000,
                },
                out var entryMode,
                out var preset,
                out var sourcePath,
                out var saveDrawing,
                out var timeoutMs,
                out var validationError
            );

            Assert.True(ok);
            Assert.Equal(string.Empty, validationError);
            Assert.Equal("import_file", entryMode);
            Assert.Equal("import_full", preset);
            Assert.Equal(tempFilePath, sourcePath);
            Assert.True(saveDrawing);
            Assert.Equal(120000, timeoutMs);
        }
        finally
        {
            File.Delete(tempFilePath);
        }
    }

    [Fact]
    public void BuildDrawingCleanupFailure_UsesExpectedEnvelope()
    {
        var result = SuiteCadAuthoringCommands.BuildDrawingCleanupFailure(
            "suite_drawing_cleanup_preview",
            "INVALID_REQUEST",
            "sourcePath is required when entryMode is 'import_file'.",
            "cleanup-preview-req-1"
        );

        Assert.False(result["success"]?.GetValue<bool>() ?? true);
        Assert.Equal("INVALID_REQUEST", result["code"]?.GetValue<string>());
        Assert.Equal(
            "sourcePath is required when entryMode is 'import_file'.",
            result["message"]?.GetValue<string>()
        );
        Assert.Equal("cleanup-preview-req-1", result["requestId"]?.GetValue<string>());
        Assert.Equal(
            "suite_drawing_cleanup_preview",
            result["meta"]?["action"]?.GetValue<string>()
        );
        Assert.Equal("dotnet+inproc", result["meta"]?["providerPath"]?.GetValue<string>());
    }
}
