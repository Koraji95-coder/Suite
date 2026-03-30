using System.Text.Json.Nodes;

static class SuiteMarkupAuthoringProjectPreviewAction
{
    public static JsonObject Handle(JsonObject payload)
    {
        return ConduitRouteStubHandlers.HandleSuiteMarkupAuthoringProjectPreview(payload);
    }
}
