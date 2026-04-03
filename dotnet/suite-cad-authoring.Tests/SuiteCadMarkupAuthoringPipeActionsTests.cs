using System.Text.Json.Nodes;
using Xunit;

namespace SuiteCadAuthoring.Tests;

public sealed class SuiteCadMarkupAuthoringPipeActionsTests
{
    [Fact]
    public void HandleAction_RoutesMarkupApplyAndValidatesPayload()
    {
        var result = SuiteCadMarkupAuthoringPipeActions.HandleAction(
            "suite_markup_authoring_project_apply",
            new JsonObject());

        Assert.NotNull(result);
        Assert.False(result!["success"]?.GetValue<bool>() ?? true);
        Assert.Equal("INVALID_REQUEST", result["code"]?.GetValue<string>());
        Assert.Equal("suite_markup_authoring_project_apply", result["meta"]?["action"]?.GetValue<string>());
        Assert.Equal("dotnet+inproc", result["meta"]?["providerPath"]?.GetValue<string>());
    }

    [Fact]
    public void HandleAction_RejectsOperationsWithoutDrawingPath()
    {
        var result = SuiteCadMarkupAuthoringPipeActions.HandleAction(
            "suite_markup_authoring_project_apply",
            new JsonObject
            {
                ["requestId"] = "markup-req-1",
                ["projectId"] = "project-1",
                ["issueSetId"] = "issue-1",
                ["operations"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["operationType"] = "delta-note-upsert",
                    },
                },
            });

        Assert.NotNull(result);
        Assert.False(result!["success"]?.GetValue<bool>() ?? true);
        Assert.Equal("INVALID_REQUEST", result["code"]?.GetValue<string>());
        Assert.Equal(
            "operations must contain drawingPath for every approved markup row.",
            result["message"]?.GetValue<string>());
        Assert.Equal("markup-req-1", result["meta"]?["requestId"]?.GetValue<string>());
    }
}
