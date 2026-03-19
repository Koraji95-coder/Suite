using System.Reflection;
using System.Text.Json.Nodes;
using Xunit;

public sealed class AutoDraftExecuteTextSwapTests
{
    [Fact]
    public void Dispatches_text_swap_preview_with_request_id_and_preview_ready_count()
    {
        PipeRouter.Configure(null);

        var response = PipeRouter.Handle(
            BuildRequestJson(
                id: "bridge-text-swap-1",
                action: "autodraft_execute",
                payload: new JsonObject
                {
                    ["requestId"] = "req-text-swap-preview",
                    ["dry_run"] = true,
                    ["actions"] = new JsonArray
                    {
                        BuildSwapAction(includeExecuteTarget: true),
                    },
                }
            )
        );

        Assert.True(response["ok"]?.GetValue<bool>() ?? false);
        var result = Assert.IsType<JsonObject>(response["result"]);
        var meta = Assert.IsType<JsonObject>(result["meta"]);
        Assert.Equal("req-text-swap-preview", meta["requestId"]?.GetValue<string>());
        Assert.Equal("autodraft_execute", meta["action"]?.GetValue<string>());

        var data = Assert.IsType<JsonObject>(result["data"]);
        Assert.Equal(1, data["previewReady"]?.GetValue<int>());
        Assert.Contains(
            data["status"]?.GetValue<string>() ?? "",
            new[] { "preview-ready", "cad_unavailable", "cad_not_ready" }
        );
    }

    [Fact]
    public void Commits_text_swap_updates_and_emits_receipt_shape()
    {
        var first = new FakeTextEntity(handle: "SW1", textString: "PANEL A");
        var second = new FakeTextEntity(handle: "SW2", textString: "PANEL B");
        var document = new FakeDocument(first, second);
        var target = new ConduitRouteStubHandlers.AutoDraftTextSwapExecuteTarget(
            FirstTargetEntityId: "SW1",
            FirstCurrentValue: "PANEL A",
            SecondTargetEntityId: "SW2",
            SecondCurrentValue: "PANEL B",
            EntityTypeHint: "text"
        );
        var warnings = new List<string>();

        var outcome = ConduitRouteStubHandlers.CommitAutoDraftTextSwapExecuteTarget(
            document,
            target,
            warnings
        );

        Assert.True(outcome.Succeeded, outcome.SkipReason);
        Assert.True(outcome.WroteChanges, outcome.SkipReason);
        Assert.Equal(new[] { "SW1", "SW2" }, outcome.Handles);
        Assert.Equal("PANEL B", first.TextString);
        Assert.Equal("PANEL A", second.TextString);
        Assert.Equal(1, first.UpdateCalls);
        Assert.Equal(1, second.UpdateCalls);

        var updates = ConduitRouteStubHandlers.AutoDraftTextSwapUpdatesToJsonArray(outcome.Updates)
            .OfType<JsonObject>()
            .ToList();
        Assert.Equal(2, updates.Count);

        Assert.Equal("first", updates[0]["slot"]?.GetValue<string>());
        Assert.Equal("SW1", updates[0]["targetEntityId"]?.GetValue<string>());
        Assert.Equal("PANEL A", updates[0]["previousValue"]?.GetValue<string>());
        Assert.Equal("PANEL B", updates[0]["nextValue"]?.GetValue<string>());
        Assert.Equal("SW1", updates[0]["handle"]?.GetValue<string>());

        Assert.Equal("second", updates[1]["slot"]?.GetValue<string>());
        Assert.Equal("SW2", updates[1]["targetEntityId"]?.GetValue<string>());
        Assert.Equal("PANEL B", updates[1]["previousValue"]?.GetValue<string>());
        Assert.Equal("PANEL A", updates[1]["nextValue"]?.GetValue<string>());
        Assert.Equal("SW2", updates[1]["handle"]?.GetValue<string>());
        Assert.Empty(warnings);
    }

    [Fact]
    public void Blocks_text_swap_commit_when_targets_are_invalid()
    {
        var first = new FakeTextEntity(handle: "SW1", textString: "PANEL A");
        var document = new FakeDocument(first);
        var target = new ConduitRouteStubHandlers.AutoDraftTextSwapExecuteTarget(
            FirstTargetEntityId: "SW1",
            FirstCurrentValue: "PANEL A",
            SecondTargetEntityId: "SW1",
            SecondCurrentValue: "PANEL B",
            EntityTypeHint: "text"
        );

        var outcome = ConduitRouteStubHandlers.CommitAutoDraftTextSwapExecuteTarget(
            document,
            target,
            []
        );

        Assert.False(outcome.Succeeded);
        Assert.Contains("distinct", outcome.SkipReason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Execute_result_places_text_swap_updates_under_meta_commit()
    {
        var buildResultMethod = typeof(ConduitRouteStubHandlers).GetMethod(
            "BuildAutoDraftExecuteResult",
            BindingFlags.NonPublic | BindingFlags.Static
        );
        Assert.NotNull(buildResultMethod);

        var result = Assert.IsType<JsonObject>(
            buildResultMethod!.Invoke(
                null,
                new object[]
                {
                    false,
                    "committed",
                    1,
                    0,
                    1,
                    1,
                    "Commit completed.",
                    new[] { "swap updated" },
                    new JsonObject
                    {
                        ["available"] = true,
                        ["drawingName"] = "Demo.dwg",
                    },
                    Array.Empty<string>(),
                    Array.Empty<JsonObject>(),
                    Array.Empty<JsonObject>(),
                    Array.Empty<JsonObject>(),
                    new JsonObject[]
                    {
                        new()
                        {
                            ["slot"] = "first",
                            ["targetEntityId"] = "SW1",
                            ["entityType"] = "AcDbText",
                            ["previousValue"] = "PANEL A",
                            ["nextValue"] = "PANEL B",
                            ["handle"] = "SW1",
                        },
                        new()
                        {
                            ["slot"] = "second",
                            ["targetEntityId"] = "SW2",
                            ["entityType"] = "AcDbText",
                            ["previousValue"] = "PANEL B",
                            ["nextValue"] = "PANEL A",
                            ["handle"] = "SW2",
                        },
                    },
                    Array.Empty<JsonObject>(),
                }
            )
        );

        var meta = Assert.IsType<JsonObject>(result["meta"]);
        var commit = Assert.IsType<JsonObject>(meta["commit"]);
        var textSwapUpdates = Assert.IsType<JsonArray>(commit["textSwapUpdates"]);
        Assert.Equal(2, textSwapUpdates.OfType<JsonObject>().Count());
    }

    private static JsonObject BuildSwapAction(bool includeExecuteTarget)
    {
        var action = new JsonObject
        {
            ["id"] = "action-text-swap-1",
            ["rule_id"] = "swap-blue-arrows",
            ["category"] = "SWAP",
            ["action"] = "Swap the two resolved text values.",
            ["confidence"] = 0.9,
            ["status"] = "proposed",
            ["markup"] = new JsonObject
            {
                ["type"] = "arrow",
                ["color"] = "blue",
                ["text"] = "swap this with panel b",
            },
        };

        if (includeExecuteTarget)
        {
            action["execute_target"] = new JsonObject
            {
                ["kind"] = "text_swap",
                ["first_target_entity_id"] = "SW1",
                ["first_current_value"] = "PANEL A",
                ["second_target_entity_id"] = "SW2",
                ["second_current_value"] = "PANEL B",
                ["entity_type_hint"] = "text",
            };
        }

        return action;
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

    public sealed class FakeDocument
    {
        private readonly Dictionary<string, object> _entities;

        public FakeDocument(params FakeTextEntity[] entities)
        {
            _entities = entities.ToDictionary(
                item => item.Handle.ToUpperInvariant(),
                item => (object)item,
                StringComparer.OrdinalIgnoreCase
            );
        }

        public object HandleToObject(string handle)
        {
            if (_entities.TryGetValue((handle ?? "").Trim().ToUpperInvariant(), out var entity))
            {
                return entity;
            }

            throw new InvalidOperationException($"Unknown handle '{handle}'.");
        }
    }

    public sealed class FakeTextEntity
    {
        public FakeTextEntity(string handle, string textString)
        {
            Handle = handle;
            TextString = textString;
        }

        public string Handle { get; }

        public string ObjectName => "AcDbText";

        public string TextString { get; set; }

        public int UpdateCalls { get; private set; }

        public void Update()
        {
            UpdateCalls += 1;
        }
    }
}
