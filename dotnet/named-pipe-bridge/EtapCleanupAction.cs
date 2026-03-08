using System.Text.Json.Nodes;

static class EtapCleanupAction
{
    public static JsonObject Handle(JsonObject payload)
    {
        return ConduitRouteStubHandlers.HandleEtapCleanupRun(payload);
    }
}
