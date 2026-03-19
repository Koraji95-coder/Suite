using System.Text.Json.Nodes;
using Xunit;

public sealed class AutoDraftExecuteDimensionTextTests
{
    [Fact]
    public void Dimension_preview_is_ready_when_execute_target_metadata_is_present()
    {
        PipeRouter.Configure(null);

        var response = PipeRouter.Handle(
            BuildRequestJson(
                id: "bridge-req-dimension-1",
                action: "autodraft_execute",
                payload: new JsonObject
                {
                    ["requestId"] = "req-autodraft-dimension-ready",
                    ["dry_run"] = true,
                    ["actions"] = new JsonArray
                    {
                        new JsonObject
                        {
                            ["id"] = "action-dimension-1",
                            ["rule_id"] = "dimension-text-blue",
                            ["category"] = "DIMENSION",
                            ["action"] = "Update dimension text to 12'-0\"",
                            ["confidence"] = 0.93,
                            ["status"] = "proposed",
                            ["execute_target"] = new JsonObject
                            {
                                ["kind"] = "dimension_text_override",
                                ["target_entity_id"] = "D1A2",
                                ["target_value"] = "12'-0\"",
                                ["current_value"] = "10'-0\"",
                                ["entity_type_hint"] = "dimension",
                            },
                        },
                    },
                }
            )
        );

        Assert.True(response["ok"]?.GetValue<bool>() ?? false);
        var result = Assert.IsType<JsonObject>(response["result"]);
        var data = Assert.IsType<JsonObject>(result["data"]);
        Assert.Equal(1, data["previewReady"]?.GetValue<int>() ?? -1);
        var meta = Assert.IsType<JsonObject>(result["meta"]);
        Assert.Equal("req-autodraft-dimension-ready", meta["requestId"]?.GetValue<string>());
    }

    [Fact]
    public void Dimension_preview_remains_reviewable_when_execute_target_metadata_is_missing()
    {
        PipeRouter.Configure(null);

        var response = PipeRouter.Handle(
            BuildRequestJson(
                id: "bridge-req-dimension-2",
                action: "autodraft_execute",
                payload: new JsonObject
                {
                    ["requestId"] = "req-autodraft-dimension-missing-target",
                    ["dry_run"] = true,
                    ["actions"] = new JsonArray
                    {
                        new JsonObject
                        {
                            ["id"] = "action-dimension-2",
                            ["rule_id"] = "dimension-text-blue",
                            ["category"] = "DIMENSION",
                            ["action"] = "Update dimension text to 12'-0\"",
                            ["confidence"] = 0.93,
                            ["status"] = "proposed",
                        },
                    },
                }
            )
        );

        Assert.True(response["ok"]?.GetValue<bool>() ?? false);
        var result = Assert.IsType<JsonObject>(response["result"]);
        var data = Assert.IsType<JsonObject>(result["data"]);
        Assert.Equal(1, data["previewReady"]?.GetValue<int>() ?? -1);
        var meta = Assert.IsType<JsonObject>(result["meta"]);
        Assert.Equal("req-autodraft-dimension-missing-target", meta["requestId"]?.GetValue<string>());
    }

    private static string BuildRequestJson(
        string id,
        string action,
        JsonObject payload,
        string? token = null
    )
    {
        var root = new JsonObject
        {
            ["id"] = id,
            ["action"] = action,
            ["payload"] = payload,
            ["token"] = token,
        };
        return root.ToJsonString();
    }
}
