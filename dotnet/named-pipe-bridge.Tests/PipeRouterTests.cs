using System.Text.Json.Nodes;
using Xunit;

public sealed class PipeRouterTests
{
    [Fact]
    public void Rejects_invalid_token_with_error_envelope()
    {
        PipeRouter.Configure("expected-token");

        var response = PipeRouter.Handle(
            BuildRequestJson(
                id: "bridge-req-1",
                action: "autodraft_execute",
                payload: new JsonObject
                {
                    ["requestId"] = "req-invalid-token",
                    ["dry_run"] = true,
                    ["actions"] = new JsonArray(),
                },
                token: "wrong-token"
            )
        );

        Assert.False(response["ok"]?.GetValue<bool>() ?? true);
        Assert.Contains("AUTH_INVALID_TOKEN", response["error"]?.GetValue<string>());
    }

    [Fact]
    public void Returns_action_not_implemented_result_with_request_id_meta()
    {
        PipeRouter.Configure(null);

        var response = PipeRouter.Handle(
            BuildRequestJson(
                id: "bridge-req-2",
                action: "unknown_action",
                payload: new JsonObject
                {
                    ["requestId"] = "req-unknown-action",
                }
            )
        );

        Assert.True(response["ok"]?.GetValue<bool>() ?? false);
        var result = Assert.IsType<JsonObject>(response["result"]);
        Assert.False(result["success"]?.GetValue<bool>() ?? true);
        Assert.Equal("ACTION_NOT_IMPLEMENTED", result["code"]?.GetValue<string>());
        var meta = Assert.IsType<JsonObject>(result["meta"]);
        Assert.Equal("req-unknown-action", meta["requestId"]?.GetValue<string>());
        Assert.Equal("unknown_action", meta["action"]?.GetValue<string>());
    }

    [Fact]
    public void Dispatches_autodraft_execute_and_propagates_payload_request_id()
    {
        PipeRouter.Configure(null);

        var response = PipeRouter.Handle(
            BuildRequestJson(
                id: "bridge-req-3",
                action: "autodraft_execute",
                payload: new JsonObject
                {
                    ["requestId"] = "req-autodraft-dispatch",
                    ["dry_run"] = true,
                    ["actions"] = new JsonArray
                    {
                        new JsonObject
                        {
                            ["id"] = "action-1",
                            ["rule_id"] = "semantic-color-blue",
                            ["category"] = "NOTE",
                            ["action"] = "Log as note only; do not modify geometry",
                            ["confidence"] = 0.95,
                            ["status"] = "proposed",
                            ["markup"] = new JsonObject
                            {
                                ["type"] = "text",
                                ["text"] = "Move disconnect label",
                                ["bounds"] = new JsonObject
                                {
                                    ["x"] = 10.0,
                                    ["y"] = 12.0,
                                    ["width"] = 24.0,
                                    ["height"] = 8.0,
                                },
                                ["meta"] = new JsonObject
                                {
                                    ["cad_transform_applied"] = true,
                                    ["cad_position"] = new JsonObject
                                    {
                                        ["x"] = 120.5,
                                        ["y"] = 44.25,
                                    },
                                },
                            },
                        },
                    },
                }
            )
        );

        Assert.True(response["ok"]?.GetValue<bool>() ?? false);
        var result = Assert.IsType<JsonObject>(response["result"]);
        var meta = Assert.IsType<JsonObject>(result["meta"]);
        Assert.Equal("req-autodraft-dispatch", meta["requestId"]?.GetValue<string>());
        Assert.Equal("autodraft_execute", meta["action"]?.GetValue<string>());
        Assert.NotNull(meta["actionMs"]);
        var data = Assert.IsType<JsonObject>(result["data"]);
        var status = data["status"]?.GetValue<string>() ?? "";
        Assert.Contains(
            status,
            new[] { "preview-ready", "preview-review", "cad_unavailable", "cad_not_ready" }
        );
    }

    [Fact]
    public void Title_block_preview_is_ready_when_execute_target_metadata_is_present()
    {
        PipeRouter.Configure(null);

        var response = PipeRouter.Handle(
            BuildRequestJson(
                id: "bridge-req-4",
                action: "autodraft_execute",
                payload: new JsonObject
                {
                    ["requestId"] = "req-autodraft-titleblock-ready",
                    ["dry_run"] = true,
                    ["actions"] = new JsonArray
                    {
                        new JsonObject
                        {
                            ["id"] = "action-title-block-1",
                            ["rule_id"] = "title-block-revision",
                            ["category"] = "TITLE_BLOCK",
                            ["action"] = "Update revision attribute to 2",
                            ["confidence"] = 0.94,
                            ["status"] = "proposed",
                            ["execute_target"] = new JsonObject
                            {
                                ["kind"] = "title_block_attribute",
                                ["field_key"] = "revision",
                                ["attribute_tags"] = new JsonArray("REV", "REVISION"),
                                ["target_value"] = "2",
                                ["block_name_hint"] = "TITLE",
                            },
                        },
                    },
                }
            )
        );

        Assert.True(response["ok"]?.GetValue<bool>() ?? false);
        var result = Assert.IsType<JsonObject>(response["result"]);
        var meta = Assert.IsType<JsonObject>(result["meta"]);
        Assert.Equal("req-autodraft-titleblock-ready", meta["requestId"]?.GetValue<string>());
        Assert.Equal("autodraft_execute", meta["action"]?.GetValue<string>());
        var data = Assert.IsType<JsonObject>(result["data"]);
        Assert.Equal(1, data["previewReady"]?.GetValue<int>() ?? -1);
    }

    [Fact]
    public void Title_block_preview_is_blocked_when_execute_target_metadata_is_missing()
    {
        PipeRouter.Configure(null);

        var response = PipeRouter.Handle(
            BuildRequestJson(
                id: "bridge-req-5",
                action: "autodraft_execute",
                payload: new JsonObject
                {
                    ["requestId"] = "req-autodraft-titleblock-missing-target",
                    ["dry_run"] = true,
                    ["actions"] = new JsonArray
                    {
                        new JsonObject
                        {
                            ["id"] = "action-title-block-2",
                            ["rule_id"] = "title-block-drawing-number",
                            ["category"] = "TITLE_BLOCK",
                            ["action"] = "Update drawing number title block field",
                            ["confidence"] = 0.95,
                            ["status"] = "proposed",
                        },
                    },
                }
            )
        );

        Assert.True(response["ok"]?.GetValue<bool>() ?? false);
        var result = Assert.IsType<JsonObject>(response["result"]);
        var meta = Assert.IsType<JsonObject>(result["meta"]);
        Assert.Equal("req-autodraft-titleblock-missing-target", meta["requestId"]?.GetValue<string>());
        var data = Assert.IsType<JsonObject>(result["data"]);
        Assert.Equal(0, data["previewReady"]?.GetValue<int>() ?? -1);

        var warnings = Assert.IsType<JsonArray>(result["warnings"]);
        Assert.Contains(
            warnings.Select(node => node?.GetValue<string>() ?? ""),
            warning => warning.Contains("missing execute_target metadata", StringComparison.OrdinalIgnoreCase)
        );
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
