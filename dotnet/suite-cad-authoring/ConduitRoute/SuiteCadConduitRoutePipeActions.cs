using System.Text.Json.Nodes;

namespace SuiteCadAuthoring
{
    internal static class SuiteCadConduitRoutePipeActions
    {
        internal static JsonObject? HandleAction(string action, JsonObject payload)
        {
            switch (action)
            {
                case "conduit_route_terminal_scan":
                    return SuiteCadPipeHost.InvokeOnApplicationThread(
                        () => SuiteCadAuthoringCommands.ExecuteConduitRouteTerminalScan(
                            payload.DeepClone() as JsonObject ?? new JsonObject()
                        )
                    );
                case "conduit_route_obstacle_scan":
                    return SuiteCadPipeHost.InvokeOnApplicationThread(
                        () => SuiteCadAuthoringCommands.ExecuteConduitRouteObstacleScan(
                            payload.DeepClone() as JsonObject ?? new JsonObject()
                        )
                    );
                case "conduit_route_terminal_routes_draw":
                    return SuiteCadPipeHost.InvokeOnApplicationThread(
                        () => SuiteCadAuthoringCommands.ExecuteConduitRouteTerminalRoutesDraw(
                            payload.DeepClone() as JsonObject ?? new JsonObject()
                        )
                    );
                case "conduit_route_terminal_labels_sync":
                    return SuiteCadPipeHost.InvokeOnApplicationThread(
                        () => SuiteCadAuthoringCommands.ExecuteConduitRouteTerminalLabelsSync(
                            payload.DeepClone() as JsonObject ?? new JsonObject()
                        )
                    );
                default:
                    return null;
            }
        }
    }
}
