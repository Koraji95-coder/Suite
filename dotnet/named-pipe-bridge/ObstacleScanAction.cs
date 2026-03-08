using System.Text.Json.Nodes;

static class ObstacleScanAction
{
    public static JsonObject Handle(JsonObject payload)
    {
        return ConduitRouteStubHandlers.HandleObstacleScan(payload);
    }
}
