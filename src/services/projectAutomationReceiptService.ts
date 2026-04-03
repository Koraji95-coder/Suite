import { logger } from "@/lib/logger";
import { loadSetting, saveSetting } from "@/settings/userSettings";
import type { AutomationWorkbenchMode } from "@/features/automation-studio";
import {
  createProjectScopedFetchCache,
  getLocalStorageApi,
} from "@/services/projectWorkflowClientSupport";

export interface ProjectAutomationReceiptRecord {
  id: string;
  projectId: string;
  issueSetId: string | null;
  registerSnapshotId: string | null;
  mode: AutomationWorkbenchMode | "combined";
  summary: string;
  preparedMarkupCount: number;
  reviewItemCount: number;
  routeCount: number;
  affectedDrawingCount: number;
  noteInsertCount: number;
  revisionCloudUpsertCount: number;
  deltaNoteUpsertCount: number;
  issueTagUpsertCount: number;
  titleBlockUpdateCount: number;
  textReplacementCount: number;
  textDeleteCount: number;
  textSwapCount: number;
  dimensionOverrideCount: number;
  cadUtilityChangedDrawingCount: number;
  cadUtilityChangedItemCount: number;
  terminalStripUpdateCount: number;
  managedRouteUpsertCount: number;
  markupSnapshotIds: string[];
  terminalScheduleSnapshotId: string | null;
  reportId: string | null;
  requestId: string | null;
  drawingName: string | null;
  createdAt: string;
}

export interface ProjectAutomationReceiptInput {
  projectId: string;
  issueSetId?: string | null;
  registerSnapshotId?: string | null;
  mode: AutomationWorkbenchMode | "combined";
  summary: string;
  preparedMarkupCount?: number;
  reviewItemCount?: number;
  routeCount?: number;
  affectedDrawingCount?: number;
  noteInsertCount?: number;
  revisionCloudUpsertCount?: number;
  deltaNoteUpsertCount?: number;
  issueTagUpsertCount?: number;
  titleBlockUpdateCount?: number;
  textReplacementCount?: number;
  textDeleteCount?: number;
  textSwapCount?: number;
  dimensionOverrideCount?: number;
  cadUtilityChangedDrawingCount?: number;
  cadUtilityChangedItemCount?: number;
  terminalStripUpdateCount?: number;
  managedRouteUpsertCount?: number;
  markupSnapshotIds?: string[];
  terminalScheduleSnapshotId?: string | null;
  reportId?: string | null;
  requestId?: string | null;
  drawingName?: string | null;
}

const RECEIPT_SETTING_KEY = "project_automation_receipts_v1";
const LOCAL_STORAGE_PREFIX = "suite:project-automation-receipts";
const automationReceiptFetchCache = createProjectScopedFetchCache<{
  data: ProjectAutomationReceiptRecord[];
  error: Error | null;
}>();

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `automation-receipt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function buildLocalStorageKey(projectId: string) {
  return `${LOCAL_STORAGE_PREFIX}:${projectId}`;
}

function normalizeRecord(
  value: unknown,
): ProjectAutomationReceiptRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ProjectAutomationReceiptRecord>;
  const projectId = normalizeText(candidate.projectId);
  if (!projectId) {
    return null;
  }

  const mode = normalizeText(candidate.mode).toLowerCase();
  const normalizedMode: ProjectAutomationReceiptRecord["mode"] =
    mode === "markup" ||
    mode === "wiring" ||
    mode === "cad-utils" ||
    mode === "combined"
      ? mode
      : "combined";

  return {
    id: normalizeText(candidate.id) || createId(),
    projectId,
    issueSetId: normalizeNullableText(candidate.issueSetId),
    registerSnapshotId: normalizeNullableText(candidate.registerSnapshotId),
    mode: normalizedMode,
    summary:
      normalizeText(candidate.summary) || "Automation Studio receipt recorded.",
    preparedMarkupCount: Math.max(
      0,
      Number(candidate.preparedMarkupCount || 0),
    ),
    reviewItemCount: Math.max(0, Number(candidate.reviewItemCount || 0)),
    routeCount: Math.max(0, Number(candidate.routeCount || 0)),
    affectedDrawingCount: Math.max(
      0,
      Number(candidate.affectedDrawingCount || 0),
    ),
    noteInsertCount: Math.max(0, Number(candidate.noteInsertCount || 0)),
    revisionCloudUpsertCount: Math.max(
      0,
      Number(candidate.revisionCloudUpsertCount || 0),
    ),
    deltaNoteUpsertCount: Math.max(
      0,
      Number(candidate.deltaNoteUpsertCount || 0),
    ),
    issueTagUpsertCount: Math.max(
      0,
      Number(candidate.issueTagUpsertCount || 0),
    ),
    titleBlockUpdateCount: Math.max(
      0,
      Number(candidate.titleBlockUpdateCount || 0),
    ),
    textReplacementCount: Math.max(
      0,
      Number(candidate.textReplacementCount || 0),
    ),
    textDeleteCount: Math.max(0, Number(candidate.textDeleteCount || 0)),
    textSwapCount: Math.max(0, Number(candidate.textSwapCount || 0)),
    dimensionOverrideCount: Math.max(
      0,
      Number(candidate.dimensionOverrideCount || 0),
    ),
    cadUtilityChangedDrawingCount: Math.max(
      0,
      Number(candidate.cadUtilityChangedDrawingCount || 0),
    ),
    cadUtilityChangedItemCount: Math.max(
      0,
      Number(candidate.cadUtilityChangedItemCount || 0),
    ),
    terminalStripUpdateCount: Math.max(
      0,
      Number(candidate.terminalStripUpdateCount || 0),
    ),
    managedRouteUpsertCount: Math.max(
      0,
      Number(candidate.managedRouteUpsertCount || 0),
    ),
    markupSnapshotIds: Array.isArray(candidate.markupSnapshotIds)
      ? candidate.markupSnapshotIds
          .map((entry) => normalizeText(entry))
          .filter(Boolean)
      : [],
    terminalScheduleSnapshotId: normalizeNullableText(
      candidate.terminalScheduleSnapshotId,
    ),
    reportId: normalizeNullableText(candidate.reportId),
    requestId: normalizeNullableText(candidate.requestId),
    drawingName: normalizeNullableText(candidate.drawingName),
    createdAt:
      normalizeNullableText(candidate.createdAt) || new Date().toISOString(),
  };
}

function sortReceipts(entries: ProjectAutomationReceiptRecord[]) {
  return [...entries].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function readLocalReceipts(
  projectId: string,
): ProjectAutomationReceiptRecord[] {
  const storage = getLocalStorageApi();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(buildLocalStorageKey(projectId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return sortReceipts(
      parsed
        .map((entry) => normalizeRecord(entry))
        .filter(
          (entry): entry is ProjectAutomationReceiptRecord => entry !== null,
        ),
    );
  } catch (error) {
    logger.warn(
      "Unable to read local automation receipt cache.",
      "ProjectAutomationReceiptService",
      error,
    );
    return [];
  }
}

function writeLocalReceipts(
  projectId: string,
  entries: ProjectAutomationReceiptRecord[],
) {
  const storage = getLocalStorageApi();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(
      buildLocalStorageKey(projectId),
      JSON.stringify(sortReceipts(entries)),
    );
  } catch (error) {
    logger.warn(
      "Unable to persist local automation receipt cache.",
      "ProjectAutomationReceiptService",
      error,
    );
  }
}

async function persistReceipts(
  projectId: string,
  entries: ProjectAutomationReceiptRecord[],
) {
  const sorted = sortReceipts(entries);
  const result = await saveSetting(RECEIPT_SETTING_KEY, sorted, projectId);
  writeLocalReceipts(projectId, sorted);
  if (!result.success) {
    return new Error(
      result.error ||
        "Unable to persist automation receipts to project settings.",
    );
  }
  return null;
}

export const projectAutomationReceiptService = {
  async fetchReceipts(projectId: string): Promise<{
    data: ProjectAutomationReceiptRecord[];
    error: Error | null;
  }> {
    const normalizedProjectId = normalizeText(projectId);
    if (!normalizedProjectId) {
      return {
        data: [],
        error: new Error("Project id is required."),
      };
    }

    const cached = automationReceiptFetchCache.read(normalizedProjectId);
    if (cached) {
      return cached;
    }
    const inFlight =
      automationReceiptFetchCache.readInFlight(normalizedProjectId);
    if (inFlight) {
      return await inFlight;
    }

    const localFallback = readLocalReceipts(normalizedProjectId);
    const loader = automationReceiptFetchCache.writeInFlight(
      normalizedProjectId,
      (async () => {
        try {
          const stored = await loadSetting<unknown>(
            RECEIPT_SETTING_KEY,
            normalizedProjectId,
            null,
          );
          if (stored === null) {
            return automationReceiptFetchCache.write(normalizedProjectId, {
              data: localFallback,
              error: null,
            });
          }
          if (!Array.isArray(stored)) {
            return automationReceiptFetchCache.write(normalizedProjectId, {
              data: localFallback,
              error: new Error("Stored automation receipt data is invalid."),
            });
          }
          const normalized = sortReceipts(
            stored
              .map((entry) => normalizeRecord(entry))
              .filter(
                (entry): entry is ProjectAutomationReceiptRecord =>
                  entry !== null,
              ),
          );
          writeLocalReceipts(normalizedProjectId, normalized);
          return automationReceiptFetchCache.write(normalizedProjectId, {
            data: normalized,
            error: null,
          });
        } catch (error) {
          return automationReceiptFetchCache.write(normalizedProjectId, {
            data: localFallback,
            error:
              error instanceof Error
                ? error
                : new Error("Unable to load automation receipts."),
          });
        }
      })(),
    );

    try {
      return await loader;
    } finally {
      automationReceiptFetchCache.clearInFlight(normalizedProjectId);
    }
  },

  async saveReceipt(input: ProjectAutomationReceiptInput): Promise<{
    data: ProjectAutomationReceiptRecord | null;
    error: Error | null;
  }> {
    const projectId = normalizeText(input.projectId);
    if (!projectId) {
      return {
        data: null,
        error: new Error("Project id is required."),
      };
    }
    const record: ProjectAutomationReceiptRecord = {
      id: createId(),
      projectId,
      issueSetId: normalizeNullableText(input.issueSetId),
      registerSnapshotId: normalizeNullableText(input.registerSnapshotId),
      mode: input.mode,
      summary:
        normalizeText(input.summary) || "Automation Studio receipt recorded.",
      preparedMarkupCount: Math.max(0, Number(input.preparedMarkupCount || 0)),
      reviewItemCount: Math.max(0, Number(input.reviewItemCount || 0)),
      routeCount: Math.max(0, Number(input.routeCount || 0)),
      affectedDrawingCount: Math.max(
        0,
        Number(input.affectedDrawingCount || 0),
      ),
      noteInsertCount: Math.max(0, Number(input.noteInsertCount || 0)),
      revisionCloudUpsertCount: Math.max(
        0,
        Number(input.revisionCloudUpsertCount || 0),
      ),
      deltaNoteUpsertCount: Math.max(
        0,
        Number(input.deltaNoteUpsertCount || 0),
      ),
      issueTagUpsertCount: Math.max(0, Number(input.issueTagUpsertCount || 0)),
      titleBlockUpdateCount: Math.max(
        0,
        Number(input.titleBlockUpdateCount || 0),
      ),
      textReplacementCount: Math.max(
        0,
        Number(input.textReplacementCount || 0),
      ),
      textDeleteCount: Math.max(0, Number(input.textDeleteCount || 0)),
      textSwapCount: Math.max(0, Number(input.textSwapCount || 0)),
      dimensionOverrideCount: Math.max(
        0,
        Number(input.dimensionOverrideCount || 0),
      ),
      cadUtilityChangedDrawingCount: Math.max(
        0,
        Number(input.cadUtilityChangedDrawingCount || 0),
      ),
      cadUtilityChangedItemCount: Math.max(
        0,
        Number(input.cadUtilityChangedItemCount || 0),
      ),
      terminalStripUpdateCount: Math.max(
        0,
        Number(input.terminalStripUpdateCount || 0),
      ),
      managedRouteUpsertCount: Math.max(
        0,
        Number(input.managedRouteUpsertCount || 0),
      ),
      markupSnapshotIds: Array.isArray(input.markupSnapshotIds)
        ? input.markupSnapshotIds
            .map((entry) => normalizeText(entry))
            .filter(Boolean)
        : [],
      terminalScheduleSnapshotId: normalizeNullableText(
        input.terminalScheduleSnapshotId,
      ),
      reportId: normalizeNullableText(input.reportId),
      requestId: normalizeNullableText(input.requestId),
      drawingName: normalizeNullableText(input.drawingName),
      createdAt: new Date().toISOString(),
    };

    const existing = await this.fetchReceipts(projectId);
    const nextEntries = [record, ...existing.data];
    const persistError = await persistReceipts(projectId, nextEntries);
    automationReceiptFetchCache.write(projectId, {
      data: nextEntries,
      error: persistError,
    });
    return {
      data: record,
      error: persistError,
    };
  },
};
