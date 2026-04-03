import { describe, expect, it } from "vitest";
import {
  buildAutomationPlanSummary,
  buildAutomationReceiptSummary,
  buildUnifiedAutomationQueue,
} from "./selectors";
import type {
  AutoDraftAutomationSnapshot,
  AutoWireAutomationSnapshot,
  CadUtilityAutomationSnapshot,
} from "./models";

const autodraftSnapshot: AutoDraftAutomationSnapshot = {
  sourceName: "marked-submittal.pdf",
  requestId: "markup-req-1",
  preparedMarkupCount: 2,
  markupReviewCount: 1,
  replacementReviewCount: 1,
  warningCount: 0,
  readyForPlan: true,
  summary: "2 markup intents ready for binding.",
  queueItems: [
    {
      id: "markup-1",
      source: "autodraft",
      status: "needs-review",
      bindingKind: "title-block",
      label: "Revise title block field",
      detail: "Cloud markup points at drawing title.",
      suggestedTarget: "TITLE1",
      drawingNumber: "R3P-1000",
    },
  ],
};

const autowireSnapshot: AutoWireAutomationSnapshot = {
  requestId: "wire-req-1",
  drawingName: "R3P-1000.dwg",
  terminalCount: 4,
  stripCount: 2,
  routeCount: 3,
  syncedRouteCount: 1,
  pendingRouteCount: 2,
  failedRouteCount: 0,
  diagnosticCount: 0,
  scheduleSnapshotId: "schedule-1",
  scheduleRowCount: 4,
  stripUpdateCount: 2,
  routeUpsertCount: 3,
  changedDrawingCount: 1,
  reportId: "report-1",
  reportFilename: "terminal-authoring.xlsx",
  drawingSummaries: [],
  warnings: [],
  readyForPlan: true,
  summary:
    "2 strip writes and 3 route upserts are ready for schedule planning.",
  queueItems: [
    {
      id: "wire-1",
      source: "autowire",
      status: "planned",
      bindingKind: "terminal-wiring",
      label: "Terminal strip route pending sync",
      detail: "Preview route should update schedule rows.",
      suggestedTarget: "TB-1",
      drawingNumber: "R3P-1000",
    },
  ],
};

const cadUtilitySnapshot: CadUtilityAutomationSnapshot = {
  requestId: "cad-req-1",
  matchCount: 2,
  selectedMatchCount: 2,
  changedDrawingCount: 0,
  changedItemCount: 0,
  reportId: null,
  reportFilename: null,
  readyForPlan: true,
  summary: "2 CAD utility changes selected across one drawing.",
  warnings: [],
  drawings: [
    {
      drawingPath: "C:\\dwg\\A-100.dwg",
      drawingName: "A-100.dwg",
      relativePath: "A-100.dwg",
      matchCount: 2,
      selectedMatchCount: 2,
      liveWorkstationIds: [],
      liveSessionStatus: null,
      lastWorkedAt: null,
      warningCount: 0,
    },
  ],
  queueItems: [
    {
      id: "cad-utils:c:\\dwg\\a-100.dwg",
      source: "cad-utils",
      status: "planned",
      bindingKind: "drawing-content",
      label: "A-100.dwg",
      detail: "2 CAD changes selected.",
      suggestedTarget: "A-100.dwg",
      drawingNumber: "A-100.dwg",
    },
  ],
};

describe("automationStudioSelectors", () => {
  it("merges specialist queues and respects binding overrides", () => {
    const queue = buildUnifiedAutomationQueue({
      autoDraftSnapshot: autodraftSnapshot,
      autoWireSnapshot: autowireSnapshot,
      cadUtilitySnapshot: null,
      bindingOverrides: {
        "wire-1": "schedule-row",
      },
    });

    expect(queue).toHaveLength(2);
    expect(queue.find((item) => item.id === "wire-1")?.bindingKind).toBe(
      "schedule-row",
    );
    expect(queue.find((item) => item.id === "markup-1")?.bindingKind).toBe(
      "title-block",
    );
  });

  it("summarizes approved work by binding kind", () => {
    const queue = buildUnifiedAutomationQueue({
      autoDraftSnapshot: autodraftSnapshot,
      autoWireSnapshot: autowireSnapshot,
      cadUtilitySnapshot,
      bindingOverrides: {
        "wire-1": "schedule-row",
      },
    });
    const summary = buildAutomationPlanSummary({
      queueItems: queue,
      approvedItemIds: ["markup-1", "wire-1", "cad-utils:c:\\dwg\\a-100.dwg"],
      registerRowCount: 1,
      selectedDrawingCount: 0,
    });

    expect(summary.approvedItems).toBe(3);
    expect(summary.titleBlockCount).toBe(1);
    expect(summary.drawingContentCount).toBe(1);
    expect(summary.scheduleCount).toBe(1);
    expect(summary.affectedDrawingCount).toBe(2);
  });

  it("builds a human-readable receipt summary", () => {
    const summary = buildAutomationReceiptSummary({
      autoDraftSnapshot: autodraftSnapshot,
      autoWireSnapshot: autowireSnapshot,
      cadUtilitySnapshot,
      planSummary: {
        totalItems: 3,
        approvedItems: 3,
        titleBlockCount: 1,
        drawingRowCount: 0,
        deliverableRowCount: 0,
        drawingContentCount: 1,
        terminalWiringCount: 1,
        scheduleCount: 0,
        noteOnlyCount: 0,
        affectedDrawingCount: 1,
      },
    });

    expect(summary).toContain("2 markups prepared");
    expect(summary).toContain("3 terminal routes");
    expect(summary).toContain("2 strip writes");
    expect(summary).toContain("3 managed route upserts");
    expect(summary).toContain("2 CAD utility changes selected");
    expect(summary).toContain("3 items approved");
  });
});
