using System.Text.Json.Nodes;

static class SuiteAcadeProjectOpenAction
{
    public static JsonObject Handle(JsonObject payload)
    {
        return ConduitRouteStubHandlers.HandleSuiteAcadeProjectOpen(payload);
    }
}
