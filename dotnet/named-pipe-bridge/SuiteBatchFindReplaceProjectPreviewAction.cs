using System.Text.Json.Nodes;

static class SuiteBatchFindReplaceProjectPreviewAction
{
    public static JsonObject Handle(JsonObject payload)
    {
        return ConduitRouteStubHandlers.HandleSuiteBatchFindReplaceProjectPreview(payload);
    }
}
