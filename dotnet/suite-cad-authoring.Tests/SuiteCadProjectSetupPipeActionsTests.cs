using System.Text.Json.Nodes;
using Xunit;

namespace SuiteCadAuthoring.Tests;

public sealed class SuiteCadProjectSetupPipeActionsTests
{
    [Fact]
    public void HandleAction_RoutesDrawingScanAndValidatesPayload()
    {
        var result = SuiteCadProjectSetupPipeActions.HandleAction(
            "suite_drawing_list_scan",
            new JsonObject());

        Assert.NotNull(result);
        Assert.False(result!["success"]?.GetValue<bool>() ?? true);
        Assert.Equal("INVALID_REQUEST", result["code"]?.GetValue<string>());
        Assert.Equal("suite_drawing_list_scan", result["meta"]?["action"]?.GetValue<string>());
        Assert.Equal("dotnet+inproc", result["meta"]?["providerPath"]?.GetValue<string>());
    }

    [Fact]
    public void HandleAction_RoutesTitleBlockApplyAndValidatesPayload()
    {
        var result = SuiteCadProjectSetupPipeActions.HandleAction(
            "suite_title_block_apply",
            new JsonObject());

        Assert.NotNull(result);
        Assert.False(result!["success"]?.GetValue<bool>() ?? true);
        Assert.Equal("INVALID_REQUEST", result["code"]?.GetValue<string>());
        Assert.Equal("suite_title_block_apply", result["meta"]?["action"]?.GetValue<string>());
        Assert.Equal("dotnet+inproc", result["meta"]?["providerPath"]?.GetValue<string>());
    }

    [Fact]
    public void SelectTitleBlockCandidate_PrefersStableBestMatchAndMarksAmbiguity()
    {
        var selection = SuiteCadAuthoringCommands.SelectTitleBlockCandidateDescriptor(
            new[]
            {
                new SuiteCadAuthoringCommands.TitleBlockCandidateDescriptor(120, "Layout2", "TITLE-B", "B", true),
                new SuiteCadAuthoringCommands.TitleBlockCandidateDescriptor(120, "Layout1", "TITLE-A", "A", true),
                new SuiteCadAuthoringCommands.TitleBlockCandidateDescriptor(90, "Model", "TITLE-C", "C", false),
            });

        Assert.True(selection.Found);
        Assert.True(selection.HasAmbiguousBestMatch);
        Assert.Equal(1, selection.SelectedIndex);
    }

    [Fact]
    public void BuildProjectSetupDrawingScanResponse_UsesInProcessMetaShape()
    {
        var drawings = new JsonArray
        {
            new JsonObject
            {
                ["path"] = @"C:\Projects\Demo\A.dwg",
                ["titleBlockFound"] = true,
            },
        };

        var result = SuiteCadAuthoringCommands.BuildProjectSetupDrawingScanResponse(
            drawings,
            new[] { "warning-1" });

        Assert.True(result["success"]?.GetValue<bool>() ?? false);
        Assert.Equal("suite_drawing_list_scan", result["meta"]?["action"]?.GetValue<string>());
        Assert.Equal("dotnet+inproc", result["meta"]?["providerPath"]?.GetValue<string>());
        Assert.Equal(1, result["meta"]?["drawingCount"]?.GetValue<int>());
        Assert.Single(result["warnings"]?.AsArray() ?? new JsonArray());
    }

    [Fact]
    public void BuildProjectSetupTitleBlockApplySuccessResponse_UsesExpectedEnvelope()
    {
        var files = new JsonArray
        {
            new JsonObject
            {
                ["path"] = @"C:\Projects\Demo\A.dwg",
                ["updated"] = 2,
            },
        };

        var result = SuiteCadAuthoringCommands.BuildProjectSetupTitleBlockApplySuccessResponse(
            files,
            updatedCount: 2,
            acadeUpdateQueued: true,
            acadeUpdateCompleted: true,
            acadeProjectVerified: true,
            acadeUpdateTimeoutMs: 45000,
            warnings: new[] { "warning-1" });

        Assert.True(result["success"]?.GetValue<bool>() ?? false);
        Assert.Equal("suite_title_block_apply", result["meta"]?["action"]?.GetValue<string>());
        Assert.Equal("dotnet+inproc", result["meta"]?["providerPath"]?.GetValue<string>());
        Assert.Equal(1, result["meta"]?["fileCount"]?.GetValue<int>());
        Assert.Equal(2, result["data"]?["updated"]?.GetValue<int>());
        Assert.True(result["data"]?["acadeUpdateCompleted"]?.GetValue<bool>() ?? false);
    }
}
