using System.Text.Json.Nodes;

static class SuiteTitleBlockApplyAction
{
    public static JsonObject Handle(JsonObject payload)
    {
        return ConduitRouteStubHandlers.HandleSuiteTitleBlockApply(payload);
    }
}
