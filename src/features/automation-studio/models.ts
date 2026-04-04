import type { AutoDraftPreviewOperation } from "@/features/autodraft-studio/ui/autodraftService";
import type {
  CadPreviewMatch,
  CadReplaceRule,
} from "@/services/cadBatchFindReplaceService";
import type { ProjectMarkupSnapshotRecord } from "@/services/projectMarkupSnapshotService";
import type { TerminalAuthoringPreviewOperation } from "@/services/projectTerminalAuthoringService";
import type {
  ProjectTerminalConnectionRow,
  ProjectTerminalStripRow,
} from "@/services/projectTerminalScheduleService";

export type AutomationStudioTab =
  | "intake"
  | "review"
  | "plan"
  | "preview"
  | "commit";

export type AutomationWorkbenchMode = "markup" | "wiring" | "cad-utils";

export type AutomationBindingKind =
  | "title-block"
  | "drawing-row"
  | "deliverable-row"
  | "drawing-content"
  | "terminal-wiring"
  | "schedule-row"
  | "note-only";

export type AutomationQueueStatus = "needs-review" | "planned" | "warning";

export interface AutomationStudioContext {
  projectId: string | null;
  projectName: string | null;
  issueSetId: string | null;
  issueSetLabel: string | null;
  registerSnapshotId: string | null;
  drawingId: string | null;
  selectedDrawingPaths: string[];
  drawingRootPath: string | null;
  watchdogRootPath: string | null;
  pdfPackageRootPath: string | null;
}

export interface AutomationQueueItem {
  id: string;
  source: "autodraft" | "autowire" | "cad-utils";
  status: AutomationQueueStatus;
  bindingKind: AutomationBindingKind;
  label: string;
  detail: string;
  suggestedTarget: string | null;
  drawingNumber: string | null;
}

export interface AutoDraftAutomationSnapshot {
  sourceName: string | null;
  requestId: string | null;
  workPackageId?: string | null;
  recipeSnapshotId?: string | null;
  markupSnapshotId?: string | null;
  markupSnapshotIds?: string[];
  drawingPath?: string | null;
  drawingName?: string | null;
  contractVersion?: string | null;
  preparedMarkupCount: number;
  markupReviewCount: number;
  replacementReviewCount: number;
  commitReadyCount?: number;
  commitBlockedCount?: number;
  operationFamilyCounts?: Record<string, number>;
  selectedActionIds?: string[];
  selectedOperationIds?: string[];
  previewOperations?: AutoDraftPreviewOperation[];
  warnings?: string[];
  reviewedRunBundle?: Record<string, unknown> | null;
  publishedSnapshots?: ProjectMarkupSnapshotRecord[];
  warningCount: number;
  readyForPlan: boolean;
  summary: string;
  queueItems: AutomationQueueItem[];
}

export interface AutoWireAutomationSnapshot {
  requestId?: string | null;
  workPackageId?: string | null;
  recipeSnapshotId?: string | null;
  drawingName: string | null;
  terminalCount: number;
  stripCount: number;
  routeCount: number;
  syncedRouteCount: number;
  pendingRouteCount: number;
  failedRouteCount: number;
  diagnosticCount: number;
  scheduleSnapshotId?: string | null;
  scheduleRowCount?: number;
  stripUpdateCount?: number;
  routeUpsertCount?: number;
  changedDrawingCount?: number;
  reportId?: string | null;
  reportFilename?: string | null;
  drawingSummaries?: AutoWireAutomationDrawingSummary[];
  warnings?: string[];
  stripRows?: ProjectTerminalStripRow[];
  connectionRows?: ProjectTerminalConnectionRow[];
  selectedOperationIds?: string[];
  previewOperations?: TerminalAuthoringPreviewOperation[];
  readyForPlan: boolean;
  summary: string;
  queueItems: AutomationQueueItem[];
}

export interface AutoWireAutomationDrawingSummary {
  drawingPath: string;
  drawingName: string;
  relativePath: string | null;
  operationCount: number;
  selectedOperationCount: number;
  stripUpdateCount: number;
  routeUpsertCount: number;
  unresolvedCount: number;
  liveWorkstationIds: string[];
  liveSessionStatus: "live" | "paused" | null;
  lastWorkedAt: string | null;
  warningCount: number;
}

export interface CadUtilityAutomationDrawingSummary {
  drawingPath: string;
  drawingName: string;
  relativePath: string | null;
  matchCount: number;
  selectedMatchCount: number;
  liveWorkstationIds: string[];
  liveSessionStatus: "live" | "paused" | null;
  lastWorkedAt: string | null;
  warningCount: number;
}

export interface CadUtilityAutomationSnapshot {
  requestId: string | null;
  workPackageId?: string | null;
  recipeSnapshotId?: string | null;
  matchCount: number;
  selectedMatchCount: number;
  changedDrawingCount: number;
  changedItemCount: number;
  reportId: string | null;
  reportFilename: string | null;
  readyForPlan: boolean;
  summary: string;
  warnings: string[];
  rules?: CadReplaceRule[];
  selectedPreviewKeys?: string[];
  previewMatches?: CadPreviewMatch[];
  blockNameHint?: string | null;
  drawings: CadUtilityAutomationDrawingSummary[];
  queueItems: AutomationQueueItem[];
}

export interface AutomationPlanSummary {
  totalItems: number;
  approvedItems: number;
  titleBlockCount: number;
  drawingRowCount: number;
  deliverableRowCount: number;
  drawingContentCount: number;
  terminalWiringCount: number;
  scheduleCount: number;
  noteOnlyCount: number;
  affectedDrawingCount: number;
}
