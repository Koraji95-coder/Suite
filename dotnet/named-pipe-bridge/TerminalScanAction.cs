using System.Text.Json.Nodes;

static class TerminalScanAction
{
    public static JsonObject Handle(JsonObject payload)
    {
        return ConduitRouteStubHandlers.HandleTerminalScan(payload);
    }
}
