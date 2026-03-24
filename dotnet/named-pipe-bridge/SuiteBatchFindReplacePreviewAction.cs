using System.Text.Json.Nodes;

static class SuiteBatchFindReplacePreviewAction
{
    public static JsonObject Handle(JsonObject payload)
    {
        return ConduitRouteStubHandlers.HandleSuiteBatchFindReplacePreview(payload);
    }
}
