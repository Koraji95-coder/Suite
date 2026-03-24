using System.Text.Json.Nodes;

static class SuiteDrawingListScanAction
{
    public static JsonObject Handle(JsonObject payload)
    {
        return ConduitRouteStubHandlers.HandleSuiteDrawingListScan(payload);
    }
}
