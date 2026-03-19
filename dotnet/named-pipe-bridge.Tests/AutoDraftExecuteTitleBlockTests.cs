using System.Reflection;
using System.Text.Json.Nodes;
using Xunit;

public sealed class AutoDraftExecuteTitleBlockTests
{
    [Fact]
    public void Dispatches_title_block_preview_with_request_id_and_preview_ready_count()
    {
        PipeRouter.Configure(null);

        var response = PipeRouter.Handle(
            BuildRequestJson(
                id: "bridge-title-block-1",
                action: "autodraft_execute",
                payload: new JsonObject
                {
                    ["requestId"] = "req-title-block-preview",
                    ["dry_run"] = true,
                    ["actions"] = new JsonArray
                    {
                        BuildTitleBlockAction(includeExecuteTarget: true),
                    },
                }
            )
        );

        Assert.True(response["ok"]?.GetValue<bool>() ?? false);
        var result = Assert.IsType<JsonObject>(response["result"]);
        var meta = Assert.IsType<JsonObject>(result["meta"]);
        Assert.Equal("req-title-block-preview", meta["requestId"]?.GetValue<string>());
        Assert.Equal("autodraft_execute", meta["action"]?.GetValue<string>());

        var data = Assert.IsType<JsonObject>(result["data"]);
        Assert.Equal(1, data["previewReady"]?.GetValue<int>());
        Assert.Contains(
            data["status"]?.GetValue<string>() ?? "",
            new[] { "preview-ready", "cad_unavailable", "cad_not_ready" }
        );
    }

    [Fact]
    public void Blocks_title_block_preview_when_execute_target_metadata_is_missing()
    {
        PipeRouter.Configure(null);

        var response = PipeRouter.Handle(
            BuildRequestJson(
                id: "bridge-title-block-2",
                action: "autodraft_execute",
                payload: new JsonObject
                {
                    ["requestId"] = "req-title-block-missing-target",
                    ["dry_run"] = true,
                    ["actions"] = new JsonArray
                    {
                        BuildTitleBlockAction(includeExecuteTarget: false),
                    },
                }
            )
        );

        Assert.True(response["ok"]?.GetValue<bool>() ?? false);
        var result = Assert.IsType<JsonObject>(response["result"]);
        var meta = Assert.IsType<JsonObject>(result["meta"]);
        Assert.Equal("req-title-block-missing-target", meta["requestId"]?.GetValue<string>());

        var data = Assert.IsType<JsonObject>(result["data"]);
        Assert.Equal(0, data["previewReady"]?.GetValue<int>());

        var warnings = Assert.IsType<JsonArray>(result["warnings"]);
        Assert.Contains(
            warnings
                .Select(node => node?.GetValue<string>() ?? string.Empty),
            warning => warning.Contains("execute_target", StringComparison.OrdinalIgnoreCase)
        );
    }

    [Fact]
    public void Commits_title_block_attribute_updates_and_emits_receipt_shape()
    {
        var revisionAttribute = new FakeAttributeReference("REV", "A");
        var titleAttribute = new FakeAttributeReference("TITLE", "PRIMARY ONE-LINE");
        var blockReference = new FakeBlockReference(
            handle: "AB12",
            effectiveName: "SUITE_TITLEBLOCK",
            attributes: [revisionAttribute, titleAttribute]
        );
        var layout = new FakeLayout(
            name: "Layout 1",
            block: new FakeBlockSpace(blockReference)
        );
        var document = new FakeDocument(layout);
        var target = new ConduitRouteStubHandlers.AutoDraftTitleBlockExecuteTarget(
            FieldKey: "revision",
            AttributeTags: new[] { "REV", "REVISION" },
            TargetValue: "B",
            BlockNameHint: "TITLEBLOCK",
            LayoutHint: "Layout 1"
        );
        var warnings = new List<string>();

        var outcome = ConduitRouteStubHandlers.CommitAutoDraftTitleBlockExecuteTarget(
            document,
            target,
            warnings
        );

        Assert.True(outcome.Succeeded, outcome.SkipReason);
        Assert.True(outcome.WroteChanges, outcome.SkipReason);
        Assert.Equal("AB12", outcome.Handle);
        Assert.Equal(1, outcome.Updated);
        Assert.Equal(0, outcome.Failed);
        Assert.Equal(1, outcome.Missing);
        Assert.Equal("B", revisionAttribute.TextString);

        var updateNode = Assert.Single(
            ConduitRouteStubHandlers.AutoDraftTitleBlockUpdatesToJsonArray(outcome.TitleBlockUpdates)
                .OfType<JsonObject>()
        );
        Assert.Equal("revision", updateNode["fieldKey"]?.GetValue<string>());
        Assert.Equal("REV", updateNode["attributeTag"]?.GetValue<string>());
        Assert.Equal("A", updateNode["previousValue"]?.GetValue<string>());
        Assert.Equal("B", updateNode["nextValue"]?.GetValue<string>());
        Assert.Equal("AB12", updateNode["handle"]?.GetValue<string>());
        Assert.Empty(warnings);
    }

    [Fact]
    public void Execute_result_places_title_block_updates_under_meta_commit()
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
                    new[] { "title block updated" },
                    new JsonObject
                    {
                        ["available"] = true,
                        ["drawingName"] = "Demo.dwg",
                    },
                    Array.Empty<string>(),
                    new JsonObject[]
                    {
                        new()
                        {
                            ["fieldKey"] = "sheet_title",
                            ["attributeTag"] = "SHEET_TITLE",
                            ["previousValue"] = "OLD",
                            ["nextValue"] = "NEW",
                            ["handle"] = "BEEF",
                        },
                    },
                }
            )
        );

        var meta = Assert.IsType<JsonObject>(result["meta"]);
        var commit = Assert.IsType<JsonObject>(meta["commit"]);
        var titleBlockUpdates = Assert.IsType<JsonArray>(commit["titleBlockUpdates"]);
        var update = Assert.Single(titleBlockUpdates.OfType<JsonObject>());

        Assert.Equal("sheet_title", update["fieldKey"]?.GetValue<string>());
        Assert.Equal("SHEET_TITLE", update["attributeTag"]?.GetValue<string>());
        Assert.Equal("OLD", update["previousValue"]?.GetValue<string>());
        Assert.Equal("NEW", update["nextValue"]?.GetValue<string>());
        Assert.Equal("BEEF", update["handle"]?.GetValue<string>());
    }

    private static JsonObject BuildTitleBlockAction(bool includeExecuteTarget)
    {
        var action = new JsonObject
        {
            ["id"] = "action-title-block-1",
            ["rule_id"] = "title-block-rect",
            ["category"] = "TITLE_BLOCK",
            ["action"] = "Extract metadata only; skip geometry conversion",
            ["confidence"] = 0.97,
            ["status"] = "proposed",
        };

        if (includeExecuteTarget)
        {
            action["execute_target"] = new JsonObject
            {
                ["kind"] = "title_block_attribute",
                ["field_key"] = "revision",
                ["attribute_tags"] = new JsonArray("REV", "REVISION"),
                ["target_value"] = "B",
                ["block_name_hint"] = "TITLEBLOCK",
                ["layout_hint"] = "Layout 1",
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
        public FakeDocument(FakeLayout activeLayout)
        {
            ActiveLayout = activeLayout;
            Layouts = new FakeLayouts(activeLayout);
            ModelSpace = new FakeBlockSpace();
            PaperSpace = activeLayout.Block;
        }

        public FakeLayout ActiveLayout { get; }
        public FakeLayouts Layouts { get; }
        public FakeBlockSpace ModelSpace { get; }
        public FakeBlockSpace PaperSpace { get; }
    }

    public sealed class FakeLayouts
    {
        private readonly List<FakeLayout> _items;

        public FakeLayouts(params FakeLayout[] items)
        {
            _items = items.ToList();
        }

        public int Count => _items.Count;

        public object Item(int index) => _items[index];

        public object Item(string name)
        {
            return _items.First(
                layout => string.Equals(layout.Name, name, StringComparison.OrdinalIgnoreCase)
            );
        }
    }

    public sealed class FakeLayout
    {
        public FakeLayout(string name, FakeBlockSpace block)
        {
            Name = name;
            Block = block;
        }

        public string Name { get; }
        public FakeBlockSpace Block { get; }
    }

    public sealed class FakeBlockSpace
    {
        private readonly List<object> _items;

        public FakeBlockSpace(params object[] items)
        {
            _items = items.ToList();
        }

        public int Count => _items.Count;

        public object Item(int index) => _items[index];
    }

    public sealed class FakeBlockReference
    {
        private readonly FakeAttributeReference[] _attributes;

        public FakeBlockReference(
            string handle,
            string effectiveName,
            FakeAttributeReference[] attributes
        )
        {
            Handle = handle;
            EffectiveName = effectiveName;
            Name = effectiveName;
            _attributes = attributes;
        }

        public string ObjectName => "AcDbBlockReference";
        public string Handle { get; }
        public string EffectiveName { get; }
        public string Name { get; }
        public int UpdateCallCount { get; private set; }

        public FakeAttributeReference[] GetAttributes() => _attributes;

        public void Update()
        {
            UpdateCallCount += 1;
        }
    }

    public sealed class FakeAttributeReference
    {
        public FakeAttributeReference(string tagString, string textString)
        {
            TagString = tagString;
            TextString = textString;
        }

        public string TagString { get; }
        public string TextString { get; set; }
        public int UpdateCallCount { get; private set; }

        public void Update()
        {
            UpdateCallCount += 1;
        }
    }
}
