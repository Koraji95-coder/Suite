// Thin backward-compatibility re-export.
// The implementation has been split into src/services/drawingProgram/.
// All existing imports continue to resolve through this file.
export {
detectWorkbookDrift,
projectDrawingProgramService,
} from "./drawingProgram/index";
export type {
ProjectDrawingProgramChangeType,
ProjectDrawingProgramDeactivateInput,
ProjectDrawingProgramFileAction,
ProjectDrawingProgramFileActionKind,
ProjectDrawingProgramChange,
ProjectDrawingProgramInsertInput,
ProjectDrawingProgramPlan,
ProjectDrawingProgramPlanMode,
ProjectDrawingProgramRecord,
ProjectDrawingProgramRow,
ProjectDrawingProgramRowStatus,
ProjectDrawingProvisionReceipt,
ProjectDrawingProvisionState,
ProjectDrawingRenumberChange,
ProjectDrawingRenumberPlan,
ProjectDrawingStandardCatalogEntry,
ProjectDrawingStandardImportInput,
ProjectDrawingStandardSnapshot,
ProjectDrawingStandardSource,
ProjectDrawingStandardStarterRow,
ProjectDrawingTemplateMapping,
ProjectDrawingWorkbookImportedRow,
ProjectDrawingWorkbookMirror,
ProjectDrawingWorkbookMirrorRow,
ProjectDrawingWorkbookReconcilePreview,
} from "./drawingProgram/types";
