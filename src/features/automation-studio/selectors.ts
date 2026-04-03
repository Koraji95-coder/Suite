import type {
  AutomationBindingKind,
  AutomationPlanSummary,
  AutomationQueueItem,
  AutoDraftAutomationSnapshot,
  AutoWireAutomationSnapshot,
  CadUtilityAutomationSnapshot,
} from "./models";

function countByBindingKind(
  items: Array<AutomationQueueItem & { approved: boolean }>,
  kind: AutomationBindingKind,
) {
  return items.filter((item) => item.approved && item.bindingKind === kind)
    .length;
}

export function buildUnifiedAutomationQueue(args: {
  autoDraftSnapshot: AutoDraftAutomationSnapshot | null;
  autoWireSnapshot: AutoWireAutomationSnapshot | null;
  cadUtilitySnapshot: CadUtilityAutomationSnapshot | null;
  bindingOverrides: Record<string, AutomationBindingKind | undefined>;
}) {
  const merged = [
    ...(args.autoDraftSnapshot?.queueItems ?? []),
    ...(args.autoWireSnapshot?.queueItems ?? []),
    ...(args.cadUtilitySnapshot?.queueItems ?? []),
  ];

  return merged.map((item) => ({
    ...item,
    bindingKind: args.bindingOverrides[item.id] ?? item.bindingKind,
  }));
}

export function buildAutomationPlanSummary(args: {
  queueItems: AutomationQueueItem[];
  approvedItemIds: string[];
  registerRowCount: number;
  selectedDrawingCount: number;
}) {
  const approvedItems = new Set(args.approvedItemIds);
  const scopedItems = args.queueItems.map((item) => ({
    ...item,
    approved: approvedItems.has(item.id),
  }));
  const affectedDrawingCount =
    args.selectedDrawingCount > 0
      ? args.selectedDrawingCount
      : Math.max(
          0,
          new Set(
            scopedItems
              .filter((item) => item.approved)
              .map((item) => item.drawingNumber || item.suggestedTarget || "")
              .filter(Boolean),
          ).size,
        );

  return {
    totalItems: scopedItems.length,
    approvedItems: scopedItems.filter((item) => item.approved).length,
    titleBlockCount: countByBindingKind(scopedItems, "title-block"),
    drawingRowCount: countByBindingKind(scopedItems, "drawing-row"),
    deliverableRowCount: countByBindingKind(scopedItems, "deliverable-row"),
    drawingContentCount: countByBindingKind(scopedItems, "drawing-content"),
    terminalWiringCount: countByBindingKind(scopedItems, "terminal-wiring"),
    scheduleCount: countByBindingKind(scopedItems, "schedule-row"),
    noteOnlyCount: countByBindingKind(scopedItems, "note-only"),
    affectedDrawingCount: Math.max(affectedDrawingCount, args.registerRowCount),
  } satisfies AutomationPlanSummary;
}

export function buildAutomationReceiptSummary(args: {
  autoDraftSnapshot: AutoDraftAutomationSnapshot | null;
  autoWireSnapshot: AutoWireAutomationSnapshot | null;
  cadUtilitySnapshot: CadUtilityAutomationSnapshot | null;
  planSummary: AutomationPlanSummary;
}) {
  const parts: string[] = [];

  if (args.autoDraftSnapshot?.preparedMarkupCount) {
    parts.push(
      `${args.autoDraftSnapshot.preparedMarkupCount} markup${args.autoDraftSnapshot.preparedMarkupCount === 1 ? "" : "s"} prepared`,
    );
  }
  if (args.autoDraftSnapshot?.previewOperations?.length) {
    parts.push(
      `${args.autoDraftSnapshot.previewOperations.length} Bluebeam write op${args.autoDraftSnapshot.previewOperations.length === 1 ? "" : "s"} staged`,
    );
  }
  if (args.autoDraftSnapshot?.replacementReviewCount) {
    parts.push(
      `${args.autoDraftSnapshot.replacementReviewCount} text review item${args.autoDraftSnapshot.replacementReviewCount === 1 ? "" : "s"}`,
    );
  }
  if (args.autoWireSnapshot?.routeCount) {
    parts.push(
      `${args.autoWireSnapshot.routeCount} terminal route${args.autoWireSnapshot.routeCount === 1 ? "" : "s"}`,
    );
  }
  if (args.autoWireSnapshot?.stripUpdateCount) {
    parts.push(
      `${args.autoWireSnapshot.stripUpdateCount} strip write${args.autoWireSnapshot.stripUpdateCount === 1 ? "" : "s"}`,
    );
  }
  if (args.autoWireSnapshot?.routeUpsertCount) {
    parts.push(
      `${args.autoWireSnapshot.routeUpsertCount} managed route upsert${args.autoWireSnapshot.routeUpsertCount === 1 ? "" : "s"}`,
    );
  }
  if (args.cadUtilitySnapshot?.selectedMatchCount) {
    parts.push(
      `${args.cadUtilitySnapshot.selectedMatchCount} CAD utility change${args.cadUtilitySnapshot.selectedMatchCount === 1 ? "" : "s"} selected`,
    );
  }
  if (args.planSummary.approvedItems) {
    parts.push(
      `${args.planSummary.approvedItems} item${args.planSummary.approvedItems === 1 ? "" : "s"} approved for the plan`,
    );
  }

  return parts.length > 0
    ? parts.join(" • ")
    : "Automation Studio opened without a captured plan yet.";
}
