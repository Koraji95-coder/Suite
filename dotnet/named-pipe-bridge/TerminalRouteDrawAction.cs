using System.Text.Json.Nodes;

static class TerminalRouteDrawAction
{
    public static JsonObject Handle(JsonObject payload)
    {
        return ConduitRouteStubHandlers.HandleTerminalRoutesDraw(payload);
    }
}
