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
