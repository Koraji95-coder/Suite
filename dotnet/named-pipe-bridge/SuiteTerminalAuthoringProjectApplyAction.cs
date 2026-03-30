using System.Text.Json.Nodes;

static class SuiteTerminalAuthoringProjectApplyAction
{
    public static JsonObject Handle(JsonObject payload)
    {
        return ConduitRouteStubHandlers.HandleSuiteTerminalAuthoringProjectApply(payload);
    }
}
