using System.Text.Json.Nodes;

static class SuiteTerminalAuthoringProjectPreviewAction
{
    public static JsonObject Handle(JsonObject payload)
    {
        return ConduitRouteStubHandlers.HandleSuiteTerminalAuthoringProjectPreview(payload);
    }
}
