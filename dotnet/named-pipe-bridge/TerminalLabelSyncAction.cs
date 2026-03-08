using System.Text.Json.Nodes;

static class TerminalLabelSyncAction
{
    public static JsonObject Handle(JsonObject payload)
    {
        return ConduitRouteStubHandlers.HandleTerminalLabelsSync(payload);
    }
}
