using System.Reflection;
using System.Text.Json.Nodes;
using Xunit;

public sealed class AutoDraftExecuteTextReplacementTests
{
    [Fact]
    public void Dispatches_text_replacement_preview_with_request_id_and_preview_ready_count()
    {
        PipeRouter.Configure(null);

        var response = PipeRouter.Handle(
            BuildRequestJson(
                id: "bridge-text-replace-1",
                action: "autodraft_execute",
                payload: new JsonObject
                {
                    ["requestId"] = "req-text-replace-preview",
                    ["dry_run"] = true,
                    ["actions"] = new JsonArray
                    {
                        BuildReplacementAction(includeExecuteTarget: true),
                    },
                }
            )
        );

        Assert.True(response["ok"]?.GetValue<bool>() ?? false);
        var result = Assert.IsType<JsonObject>(response["result"]);
        var meta = Assert.IsType<JsonObject>(result["meta"]);
        Assert.Equal("req-text-replace-preview", meta["requestId"]?.GetValue<string>());
        Assert.Equal("autodraft_execute", meta["action"]?.GetValue<string>());

        var data = Assert.IsType<JsonObject>(result["data"]);
        Assert.Equal(1, data["previewReady"]?.GetValue<int>());
        Assert.Contains(
            data["status"]?.GetValue<string>() ?? "",
            new[] { "preview-ready", "cad_unavailable", "cad_not_ready" }
        );
    }

    [Fact]
    public void Commits_text_replacement_updates_and_emits_receipt_shape()
    {
        var entity = new FakeTextEntity(handle: "1A2B", textString: "OLD PANEL NAME");
        var document = new FakeDocument(entity);
        var target = new ConduitRouteStubHandlers.AutoDraftTextReplacementExecuteTarget(
            TargetEntityId: "1A2B",
            TargetValue: "NEW PANEL NAME",
            CurrentValue: "OLD PANEL NAME",
            EntityTypeHint: "text"
        );
        var warnings = new List<string>();

        var outcome = ConduitRouteStubHandlers.CommitAutoDraftTextReplacementExecuteTarget(
            document,
            target,
            warnings
        );

        Assert.True(outcome.Succeeded, outcome.SkipReason);
        Assert.True(outcome.WroteChanges, outcome.SkipReason);
        Assert.Equal("1A2B", outcome.Handle);
        Assert.Equal("NEW PANEL NAME", entity.TextString);
        Assert.Equal(1, entity.UpdateCalls);

        var updateNode = Assert.Single(
            ConduitRouteStubHandlers.AutoDraftTextReplacementUpdatesToJsonArray(outcome.Updates)
                .OfType<JsonObject>()
        );
        Assert.Equal("1A2B", updateNode["targetEntityId"]?.GetValue<string>());
        Assert.Equal("AcDbText", updateNode["entityType"]?.GetValue<string>());
        Assert.Equal("OLD PANEL NAME", updateNode["previousValue"]?.GetValue<string>());
        Assert.Equal("NEW PANEL NAME", updateNode["nextValue"]?.GetValue<string>());
        Assert.Equal("1A2B", updateNode["handle"]?.GetValue<string>());
        Assert.Empty(warnings);
    }

    [Fact]
    public void Blocks_text_replacement_commit_when_current_value_does_not_match()
    {
        var entity = new FakeTextEntity(handle: "1A2B", textString: "DIFFERENT");
        var document = new FakeDocument(entity);
        var target = new ConduitRouteStubHandlers.AutoDraftTextReplacementExecuteTarget(
            TargetEntityId: "1A2B",
            TargetValue: "NEW PANEL NAME",
            CurrentValue: "OLD PANEL NAME",
            EntityTypeHint: "text"
        );

        var outcome = ConduitRouteStubHandlers.CommitAutoDraftTextReplacementExecuteTarget(
            document,
            target,
            []
        );

        Assert.False(outcome.Succeeded);
        Assert.Contains("did not match expected", outcome.SkipReason, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("DIFFERENT", entity.TextString);
        Assert.Equal(0, entity.UpdateCalls);
    }

    [Fact]
    public void Execute_result_places_text_replacement_updates_under_meta_commit()
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
                    new[] { "replacement updated" },
                    new JsonObject
                    {
                        ["available"] = true,
                        ["drawingName"] = "Demo.dwg",
                    },
                    Array.Empty<string>(),
                    Array.Empty<JsonObject>(),
                    new JsonObject[]
                    {
                        new()
                        {
                            ["targetEntityId"] = "1A2B",
                            ["entityType"] = "AcDbText",
                            ["previousValue"] = "OLD",
                            ["nextValue"] = "NEW",
                            ["handle"] = "1A2B",
                        },
                    },
                }
            )
        );

        var meta = Assert.IsType<JsonObject>(result["meta"]);
        var commit = Assert.IsType<JsonObject>(meta["commit"]);
        var textReplacementUpdates = Assert.IsType<JsonArray>(commit["textReplacementUpdates"]);
        var update = Assert.Single(textReplacementUpdates.OfType<JsonObject>());

        Assert.Equal("1A2B", update["targetEntityId"]?.GetValue<string>());
        Assert.Equal("AcDbText", update["entityType"]?.GetValue<string>());
        Assert.Equal("OLD", update["previousValue"]?.GetValue<string>());
        Assert.Equal("NEW", update["nextValue"]?.GetValue<string>());
        Assert.Equal("1A2B", update["handle"]?.GetValue<string>());
    }

    private static JsonObject BuildReplacementAction(bool includeExecuteTarget)
    {
        var action = new JsonObject
        {
            ["id"] = "action-text-replace-1",
            ["rule_id"] = "add-red-cloud",
            ["category"] = "ADD",
            ["action"] = "Replace existing CAD text with reviewed markup text.",
            ["confidence"] = 0.9,
            ["status"] = "proposed",
            ["markup"] = new JsonObject
            {
                ["type"] = "text",
                ["color"] = "red",
                ["text"] = "NEW PANEL NAME",
                ["bounds"] = new JsonObject
                {
                    ["x"] = 80.0,
                    ["y"] = 24.0,
                    ["width"] = 30.0,
                    ["height"] = 10.0,
                },
            },
        };

        if (includeExecuteTarget)
        {
            action["execute_target"] = new JsonObject
            {
                ["kind"] = "text_replacement",
                ["target_entity_id"] = "1A2B",
                ["target_value"] = "NEW PANEL NAME",
                ["current_value"] = "OLD PANEL NAME",
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
