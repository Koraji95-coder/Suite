using System.Text.Json.Nodes;

namespace SuiteCadAuthoring
{
    internal static class SuiteCadProjectSetupPipeActions
    {
        internal static JsonObject? HandleAction(string action, JsonObject payload)
        {
            switch (action)
            {
                case "suite_acade_project_open":
                    return SuiteCadAuthoringCommands.HandlePipeAcadeProjectOpen(payload);
                case "suite_acade_project_create":
                    return SuiteCadAuthoringCommands.HandlePipeAcadeProjectCreate(payload);
                case "suite_drawing_list_scan":
                    return SuiteCadAuthoringCommands.HandlePipeDrawingListScan(payload);
                case "suite_title_block_apply":
                    return SuiteCadAuthoringCommands.HandlePipeTitleBlockApply(payload);
                default:
                    return null;
            }
        }
    }
}
