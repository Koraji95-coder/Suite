using System.Reflection;
using System.Text.Json.Nodes;
using Xunit;

public sealed class AutoDraftExecuteTextDeleteTests
{
    [Fact]
    public void Dispatches_text_delete_preview_with_request_id_and_preview_ready_count()
    {
        PipeRouter.Configure(null);

        var response = PipeRouter.Handle(
            BuildRequestJson(
                id: "bridge-text-delete-1",
                action: "autodraft_execute",
                payload: new JsonObject
                {
                    ["requestId"] = "req-text-delete-preview",
                    ["dry_run"] = true,
                    ["actions"] = new JsonArray
                    {
                        BuildDeleteAction(includeExecuteTarget: true),
                    },
                }
            )
        );

        Assert.True(response["ok"]?.GetValue<bool>() ?? false);
        var result = Assert.IsType<JsonObject>(response["result"]);
        var meta = Assert.IsType<JsonObject>(result["meta"]);
        Assert.Equal("req-text-delete-preview", meta["requestId"]?.GetValue<string>());
        Assert.Equal("autodraft_execute", meta["action"]?.GetValue<string>());

        var data = Assert.IsType<JsonObject>(result["data"]);
        Assert.Equal(1, data["previewReady"]?.GetValue<int>());
        Assert.Contains(
            data["status"]?.GetValue<string>() ?? "",
            new[] { "preview-ready", "cad_unavailable", "cad_not_ready" }
        );
    }

    [Fact]
    public void Commits_text_delete_updates_and_emits_receipt_shape()
    {
        var entity = new FakeTextEntity(handle: "AB12", textString: "REMOVE ME");
        var document = new FakeDocument(entity);
        var target = new ConduitRouteStubHandlers.AutoDraftTextDeleteExecuteTarget(
            TargetEntityId: "AB12",
            CurrentValue: "REMOVE ME",
            EntityTypeHint: "text"
        );
        var warnings = new List<string>();

        var outcome = ConduitRouteStubHandlers.CommitAutoDraftTextDeleteExecuteTarget(
            document,
            target,
            warnings
        );

        Assert.True(outcome.Succeeded, outcome.SkipReason);
        Assert.True(outcome.WroteChanges, outcome.SkipReason);
        Assert.Equal("AB12", outcome.Handle);
        Assert.True(entity.Deleted);
        Assert.Equal(1, entity.UpdateCalls);

        var updateNode = Assert.Single(
            ConduitRouteStubHandlers.AutoDraftTextDeleteUpdatesToJsonArray(outcome.Updates)
                .OfType<JsonObject>()
        );
        Assert.Equal("AB12", updateNode["targetEntityId"]?.GetValue<string>());
        Assert.Equal("AcDbText", updateNode["entityType"]?.GetValue<string>());
        Assert.Equal("REMOVE ME", updateNode["previousValue"]?.GetValue<string>());
        Assert.Equal("AB12", updateNode["handle"]?.GetValue<string>());
        Assert.Empty(warnings);
    }

    [Fact]
    public void Blocks_text_delete_commit_when_current_value_does_not_match()
    {
        var entity = new FakeTextEntity(handle: "AB12", textString: "KEEP ME");
        var document = new FakeDocument(entity);
        var target = new ConduitRouteStubHandlers.AutoDraftTextDeleteExecuteTarget(
            TargetEntityId: "AB12",
            CurrentValue: "REMOVE ME",
            EntityTypeHint: "text"
        );

        var outcome = ConduitRouteStubHandlers.CommitAutoDraftTextDeleteExecuteTarget(
            document,
            target,
            []
        );

        Assert.False(outcome.Succeeded);
        Assert.Contains("did not match expected", outcome.SkipReason, StringComparison.OrdinalIgnoreCase);
        Assert.False(entity.Deleted);
        Assert.Equal(0, entity.UpdateCalls);
    }

    [Fact]
    public void Execute_result_places_text_delete_updates_under_meta_commit()
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
                    new[] { "text deleted" },
                    new JsonObject
                    {
                        ["available"] = true,
                        ["drawingName"] = "Demo.dwg",
                    },
                    Array.Empty<string>(),
                    Array.Empty<JsonObject>(),
                    Array.Empty<JsonObject>(),
                    new JsonObject[]
                    {
                        new()
                        {
                            ["targetEntityId"] = "AB12",
                            ["entityType"] = "AcDbText",
                            ["previousValue"] = "REMOVE ME",
                            ["handle"] = "AB12",
                        },
                    },
                    Array.Empty<JsonObject>(),
                    Array.Empty<JsonObject>(),
                }
            )
        );

        var meta = Assert.IsType<JsonObject>(result["meta"]);
        var commit = Assert.IsType<JsonObject>(meta["commit"]);
        var textDeleteUpdates = Assert.IsType<JsonArray>(commit["textDeleteUpdates"]);
        var update = Assert.Single(textDeleteUpdates.OfType<JsonObject>());

        Assert.Equal("AB12", update["targetEntityId"]?.GetValue<string>());
        Assert.Equal("AcDbText", update["entityType"]?.GetValue<string>());
        Assert.Equal("REMOVE ME", update["previousValue"]?.GetValue<string>());
        Assert.Equal("AB12", update["handle"]?.GetValue<string>());
    }

    private static JsonObject BuildDeleteAction(bool includeExecuteTarget)
    {
        var action = new JsonObject
        {
            ["id"] = "action-text-delete-1",
            ["rule_id"] = "delete-red-markup",
            ["category"] = "DELETE",
            ["action"] = "Delete the matched text entity.",
            ["confidence"] = 0.9,
            ["status"] = "proposed",
            ["markup"] = new JsonObject
            {
                ["type"] = "text",
                ["color"] = "red",
                ["text"] = "REMOVE ME",
                ["bounds"] = new JsonObject
                {
                    ["x"] = 40.0,
                    ["y"] = 24.0,
                    ["width"] = 16.0,
                    ["height"] = 8.0,
                },
            },
        };

        if (includeExecuteTarget)
        {
            action["execute_target"] = new JsonObject
            {
                ["kind"] = "text_delete",
                ["target_entity_id"] = "AB12",
                ["current_value"] = "REMOVE ME",
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

        public bool Deleted { get; private set; }

        public int UpdateCalls { get; private set; }

        public void Delete()
        {
            Deleted = true;
        }

        public void Update()
        {
            UpdateCalls += 1;
        }
    }
}
