using System.Text.Json.Nodes;
using Xunit;

namespace SuiteCadAuthoring.Tests;

public sealed class SuiteCadBatchFindReplacePipeActionsTests
{
    [Fact]
    public void HandleAction_RoutesCadApplyAndValidatesPayload()
    {
        var result = SuiteCadBatchFindReplacePipeActions.HandleAction(
            "suite_batch_find_replace_apply",
            new JsonObject()
        );

        Assert.NotNull(result);
        Assert.False(result!["success"]?.GetValue<bool>() ?? true);
        Assert.Equal("INVALID_REQUEST", result["code"]?.GetValue<string>());
        Assert.Equal("suite_batch_find_replace_apply", result["meta"]?["action"]?.GetValue<string>());
        Assert.Equal("dotnet+inproc", result["meta"]?["providerPath"]?.GetValue<string>());
    }

    [Fact]
    public void HandleAction_RoutesProjectApplyAndValidatesPayload()
    {
        var result = SuiteCadBatchFindReplacePipeActions.HandleAction(
            "suite_batch_find_replace_project_apply",
            new JsonObject()
        );

        Assert.NotNull(result);
        Assert.False(result!["success"]?.GetValue<bool>() ?? true);
        Assert.Equal("INVALID_REQUEST", result["code"]?.GetValue<string>());
        Assert.Equal(
            "suite_batch_find_replace_project_apply",
            result["meta"]?["action"]?.GetValue<string>()
        );
        Assert.Equal("dotnet+inproc", result["meta"]?["providerPath"]?.GetValue<string>());
    }

    [Fact]
    public void HandleAction_ProjectApplyRequiresDrawingPathRows()
    {
        var result = SuiteCadBatchFindReplacePipeActions.HandleAction(
            "suite_batch_find_replace_project_apply",
            new JsonObject
            {
                ["requestId"] = "batch-project-req-1",
                ["matches"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["ruleId"] = "rule-1",
                        ["handle"] = "ABCD",
                        ["entityType"] = "AttributeReference",
                        ["attributeTag"] = "TITLE1",
                        ["currentValue"] = "OLD",
                        ["nextValue"] = "NEW",
                    },
                },
            }
        );

        Assert.NotNull(result);
        Assert.False(result!["success"]?.GetValue<bool>() ?? true);
        Assert.Equal("INVALID_REQUEST", result["code"]?.GetValue<string>());
        Assert.Equal(
            "matches must contain at least one preview row with drawingPath.",
            result["message"]?.GetValue<string>()
        );
        Assert.Equal("batch-project-req-1", result["meta"]?["requestId"]?.GetValue<string>());
    }
}
