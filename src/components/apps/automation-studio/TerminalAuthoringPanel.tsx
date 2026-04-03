import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Route,
  Upload,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { Checkbox } from "@/components/apps/ui/checkbox";
import { useProjectWatchdogTelemetry } from "@/features/project-watchdog";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { Text } from "@/components/primitives/Text";
import {
  projectTerminalAuthoringService,
  type TerminalAuthoringPreviewOperation,
} from "@/services/projectTerminalAuthoringService";
import {
  projectTerminalScheduleService,
  type ProjectTerminalScheduleSnapshot,
} from "@/services/projectTerminalScheduleService";
import {
  projectIssueSetService,
  type ProjectIssueSetRecord,
} from "@/features/project-workflow/issueSetService";
import { projectAutomationReceiptService } from "@/services/projectAutomationReceiptService";
import type {
  AutomationQueueItem,
  AutomationStudioContext,
  AutoWireAutomationDrawingSummary,
  AutoWireAutomationSnapshot,
} from "@/features/automation-studio";
import styles from "./TerminalAuthoringPanel.module.css";

function normalizeDrawingKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^/.]+$/, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function formatRelativeTime(value: string | null) {
  if (!value) {
    return "No recent watchdog activity";
  }
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return value;
  }
  const deltaMinutes = Math.round((Date.now() - timestamp) / 60_000);
  if (Math.abs(deltaMinutes) < 1) {
    return "just now";
  }
  if (Math.abs(deltaMinutes) < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return `${deltaHours}h ago`;
  }
  return `${Math.round(deltaHours / 24)}d ago`;
}

function buildTerminalQueueItemId(drawingPath: string) {
  return `autowire:${drawingPath.trim().toLowerCase()}`;
}

function buildWarningQueueItemId(label: string) {
  return `autowire:warning:${label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;
}

interface TerminalAuthoringPanelProps {
  studioContext: AutomationStudioContext;
  selectedIssueSet: ProjectIssueSetRecord | null;
  approvedItemIds: string[];
  onQueueItemApprovalChange: (itemId: string, approved: boolean) => void;
  onAutomationSnapshotChange?: (
    snapshot: AutoWireAutomationSnapshot | null,
  ) => void;
  onProjectContextRefresh?: () => Promise<void> | void;
}

export function TerminalAuthoringPanel({
  studioContext,
  selectedIssueSet,
  approvedItemIds,
  onQueueItemApprovalChange,
  onAutomationSnapshotChange,
  onProjectContextRefresh,
}: TerminalAuthoringPanelProps) {
  const { showToast } = useToast();
  const telemetry = useProjectWatchdogTelemetry(studioContext.projectId ?? "");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [scheduleSnapshot, setScheduleSnapshot] =
    useState<ProjectTerminalScheduleSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [importingSnapshot, setImportingSnapshot] = useState(false);
  const [runningPreview, setRunningPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [operations, setOperations] = useState<
    TerminalAuthoringPreviewOperation[]
  >([]);
  const [selectedOperationIds, setSelectedOperationIds] = useState<string[]>(
    [],
  );
  const [requestId, setRequestId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportFilename, setReportFilename] = useState<string | null>(null);
  const [changedDrawingCount, setChangedDrawingCount] = useState(0);
  const [terminalStripUpdateCount, setTerminalStripUpdateCount] = useState(0);
  const [managedRouteUpsertCount, setManagedRouteUpsertCount] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!studioContext.projectId) {
      setScheduleSnapshot(null);
      setOperations([]);
      setSelectedOperationIds([]);
      return;
    }
    let cancelled = false;
    const loadSnapshot = async () => {
      setLoadingSnapshot(true);
      const result = await projectTerminalScheduleService.fetchSnapshot(
        studioContext.projectId!,
      );
      if (cancelled) {
        return;
      }
      setScheduleSnapshot(result.data);
      setLoadingSnapshot(false);
      if (result.error) {
        setWarnings([result.error.message]);
      }
    };
    void loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, [studioContext.projectId]);

  const issueSetSelected = Boolean(studioContext.issueSetId);
  const selectedDrawingPaths = studioContext.selectedDrawingPaths ?? [];
  const scopeResolvable =
    selectedDrawingPaths.length > 0 &&
    Boolean(
      studioContext.drawingRootPath ||
      selectedDrawingPaths.every((path) => /^[a-z]:[\\/]/i.test(path)),
    );
  const hasSnapshot = Boolean(scheduleSnapshot?.stripRows.length);

  const activeSessionByDrawingKey = useMemo(() => {
    const map = new Map<
      string,
      { workstationIds: string[]; status: "live" | "paused" | null }
    >();
    for (const session of telemetry.liveSessions) {
      const key = normalizeDrawingKey(session.drawingPath);
      if (!key) continue;
      const current = map.get(key) ?? { workstationIds: [], status: null };
      const workstationId = String(session.workstationId ?? "").trim();
      if (workstationId && !current.workstationIds.includes(workstationId)) {
        current.workstationIds.push(workstationId);
      }
      current.status =
        current.status === "live"
          ? current.status
          : session.status === "live" || session.status === "paused"
            ? session.status
            : null;
      map.set(key, current);
    }
    return map;
  }, [telemetry.liveSessions]);

  const trackedDrawingByKey = useMemo(() => {
    const map = new Map<
      string,
      { lastWorkedAt: string | null; drawingName: string }
    >();
    for (const drawing of telemetry.trackedDrawings) {
      const key = normalizeDrawingKey(
        drawing.drawingPath || drawing.drawingName,
      );
      if (!key) continue;
      map.set(key, {
        lastWorkedAt: drawing.lastWorkedAt,
        drawingName: drawing.drawingName,
      });
    }
    return map;
  }, [telemetry.trackedDrawings]);

  const selectedOperationIdSet = useMemo(
    () => new Set(selectedOperationIds),
    [selectedOperationIds],
  );

  const groupedDrawings = useMemo(() => {
    const groups = new Map<
      string,
      {
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
        operations: TerminalAuthoringPreviewOperation[];
      }
    >();
    for (const operation of operations) {
      const drawingPath =
        String(operation.drawingPath ?? "").trim() ||
        `unresolved:${operation.operationId}`;
      const drawingKey = normalizeDrawingKey(
        drawingPath || operation.drawingName,
      );
      const tracked = trackedDrawingByKey.get(drawingKey);
      const session = activeSessionByDrawingKey.get(drawingKey);
      const current = groups.get(drawingPath) ?? {
        drawingPath,
        drawingName:
          String(operation.drawingName ?? "").trim() ||
          tracked?.drawingName ||
          drawingPath.split(/[\\/]/).pop() ||
          drawingPath,
        relativePath: operation.relativePath || null,
        operationCount: 0,
        selectedOperationCount: 0,
        stripUpdateCount: 0,
        routeUpsertCount: 0,
        unresolvedCount: 0,
        liveWorkstationIds: session?.workstationIds ?? [],
        liveSessionStatus: session?.status ?? null,
        lastWorkedAt: tracked?.lastWorkedAt ?? null,
        warningCount: session ? 1 : 0,
        operations: [],
      };
      current.operationCount += 1;
      current.selectedOperationCount += selectedOperationIdSet.has(
        operation.operationId,
      )
        ? 1
        : 0;
      if (operation.operationType === "label-upsert") {
        current.stripUpdateCount += 1;
      }
      if (
        operation.operationType === "route-insert" ||
        operation.operationType === "route-update"
      ) {
        current.routeUpsertCount += 1;
      }
      if (operation.operationType === "unresolved") {
        current.unresolvedCount += 1;
        current.warningCount += 1;
      }
      if (operation.warning) {
        current.warningCount += 1;
      }
      current.operations.push(operation);
      groups.set(drawingPath, current);
    }
    return Array.from(groups.values()).sort((left, right) =>
      left.drawingName.localeCompare(right.drawingName, undefined, {
        sensitivity: "base",
      }),
    );
  }, [
    activeSessionByDrawingKey,
    operations,
    selectedOperationIdSet,
    trackedDrawingByKey,
  ]);

  const drawingSummaries = useMemo<AutoWireAutomationDrawingSummary[]>(
    () =>
      groupedDrawings
        .filter((drawing) => !drawing.drawingPath.startsWith("unresolved:"))
        .map((drawing) => ({
          drawingPath: drawing.drawingPath,
          drawingName: drawing.drawingName,
          relativePath: drawing.relativePath,
          operationCount: drawing.operationCount,
          selectedOperationCount: drawing.selectedOperationCount,
          stripUpdateCount: drawing.stripUpdateCount,
          routeUpsertCount: drawing.routeUpsertCount,
          unresolvedCount: drawing.unresolvedCount,
          liveWorkstationIds: drawing.liveWorkstationIds,
          liveSessionStatus: drawing.liveSessionStatus,
          lastWorkedAt: drawing.lastWorkedAt,
          warningCount: drawing.warningCount,
        })),
    [groupedDrawings],
  );
  const unresolvedCount = useMemo(
    () =>
      operations.filter((operation) => operation.operationType === "unresolved")
        .length,
    [operations],
  );
  const selectedActionableCount = useMemo(
    () =>
      operations.filter(
        (operation) =>
          operation.operationType !== "unresolved" &&
          selectedOperationIdSet.has(operation.operationId),
      ).length,
    [operations, selectedOperationIdSet],
  );
  const queueItems = useMemo<AutomationQueueItem[]>(() => {
    const items = groupedDrawings
      .filter((drawing) => !drawing.drawingPath.startsWith("unresolved:"))
      .map<AutomationQueueItem>((drawing) => {
        const itemId = buildTerminalQueueItemId(drawing.drawingPath);
        const approved = approvedItemIds.includes(itemId);
        const liveStatusText = drawing.liveSessionStatus
          ? `Live session ${drawing.liveSessionStatus} on ${drawing.liveWorkstationIds.join(", ")}.`
          : `Last worked ${formatRelativeTime(drawing.lastWorkedAt)}.`;
        const status: AutomationQueueItem["status"] =
          drawing.warningCount > 0
            ? "warning"
            : approved && drawing.selectedOperationCount > 0
              ? "planned"
              : "needs-review";
        return {
          id: itemId,
          source: "autowire",
          status,
          bindingKind: "terminal-wiring",
          label: drawing.drawingName,
          detail: `${drawing.selectedOperationCount}/${drawing.operationCount} terminal authoring change${drawing.operationCount === 1 ? "" : "s"} selected. ${liveStatusText}`,
          suggestedTarget: drawing.relativePath || drawing.drawingPath,
          drawingNumber: drawing.drawingName,
        };
      });
    if (unresolvedCount > 0) {
      items.push({
        id: buildWarningQueueItemId("unresolved-terminal-authoring"),
        source: "autowire",
        status: "warning",
        bindingKind: "schedule-row",
        label: `${unresolvedCount} unresolved schedule row${unresolvedCount === 1 ? "" : "s"}`,
        detail:
          "Resolve workbook rows or drawing matches before applying project terminal authoring.",
        suggestedTarget: scheduleSnapshot?.workbookFileName ?? null,
        drawingNumber: null,
      });
    }
    return items;
  }, [
    approvedItemIds,
    groupedDrawings,
    scheduleSnapshot?.workbookFileName,
    unresolvedCount,
  ]);

  const persistIssueSetScheduleLink = async (snapshotId: string | null) => {
    if (!selectedIssueSet) {
      return;
    }
    const result = await projectIssueSetService.saveIssueSet(
      {
        projectId: selectedIssueSet.projectId,
        name: selectedIssueSet.name,
        issueTag: selectedIssueSet.issueTag,
        status: selectedIssueSet.status,
        targetDate: selectedIssueSet.targetDate,
        transmittalNumber: selectedIssueSet.transmittalNumber,
        transmittalDocumentName: selectedIssueSet.transmittalDocumentName,
        registerSnapshotId: selectedIssueSet.registerSnapshotId,
        terminalScheduleSnapshotId: snapshotId,
        summary: selectedIssueSet.summary,
        notes: selectedIssueSet.notes,
        selectedDrawingPaths: selectedIssueSet.selectedDrawingPaths,
        selectedRegisterRowIds: selectedIssueSet.selectedRegisterRowIds,
        selectedDrawingNumbers: selectedIssueSet.selectedDrawingNumbers,
        selectedPdfFileIds: selectedIssueSet.selectedPdfFileIds,
        snapshot: selectedIssueSet.snapshot,
      },
      selectedIssueSet.id,
    );
    if (result.error) {
      showToast("warning", result.error.message);
    }
    if (onProjectContextRefresh) {
      await onProjectContextRefresh();
    }
  };

  const handleImportSchedule = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !studioContext.projectId) {
      return;
    }
    setImportingSnapshot(true);
    setMessage(null);
    setWarnings([]);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await projectTerminalScheduleService.importWorkbook({
        projectId: studioContext.projectId,
        fileName: file.name,
        arrayBuffer,
        previousSnapshot: scheduleSnapshot,
      });
      if (!result.data) {
        throw result.error || new Error("Terminal schedule import failed.");
      }
      setScheduleSnapshot(result.data);
      setOperations([]);
      setSelectedOperationIds([]);
      setWarnings(result.data.warnings);
      setMessage(
        `Loaded ${result.data.stripRowCount} strip row${result.data.stripRowCount === 1 ? "" : "s"} and ${result.data.connectionRowCount} connection row${result.data.connectionRowCount === 1 ? "" : "s"} from ${result.data.workbookFileName}.`,
      );
      await persistIssueSetScheduleLink(result.data.id);
      showToast("success", "Terminal schedule imported.");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Terminal schedule import failed.";
      setMessage(errorMessage);
      showToast("error", errorMessage);
    } finally {
      setImportingSnapshot(false);
      event.target.value = "";
    }
  };

  const handleClearSnapshot = async () => {
    if (!studioContext.projectId) {
      return;
    }
    const result = await projectTerminalScheduleService.clearSnapshot(
      studioContext.projectId,
    );
    if (!result.success) {
      showToast(
        "error",
        result.error?.message || "Unable to clear terminal schedule snapshot.",
      );
      return;
    }
    setScheduleSnapshot(null);
    setOperations([]);
    setSelectedOperationIds([]);
    setWarnings([]);
    setMessage("Terminal schedule snapshot cleared.");
    await persistIssueSetScheduleLink(null);
  };

  useEffect(() => {
    if (!onAutomationSnapshotChange) {
      return;
    }
    if (!scheduleSnapshot && operations.length === 0 && !reportId) {
      onAutomationSnapshotChange(null);
      return;
    }
    onAutomationSnapshotChange({
      requestId,
      workPackageId: null,
      recipeSnapshotId: null,
      drawingName:
        drawingSummaries.length === 1
          ? (drawingSummaries[0]?.drawingName ?? null)
          : null,
      terminalCount:
        scheduleSnapshot?.stripRows.reduce(
          (total, row) => total + row.terminalCount,
          0,
        ) ?? 0,
      stripCount: scheduleSnapshot?.stripRows.length ?? 0,
      routeCount:
        scheduleSnapshot?.connectionRows.length ??
        operations.filter(
          (operation) =>
            operation.operationType === "route-insert" ||
            operation.operationType === "route-update",
        ).length,
      syncedRouteCount: managedRouteUpsertCount,
      pendingRouteCount: Math.max(
        0,
        operations.filter(
          (operation) =>
            (operation.operationType === "route-insert" ||
              operation.operationType === "route-update") &&
            !selectedOperationIdSet.has(operation.operationId),
        ).length,
      ),
      failedRouteCount: 0,
      diagnosticCount:
        warnings.length + (scheduleSnapshot?.warnings.length ?? 0),
      scheduleSnapshotId: scheduleSnapshot?.id ?? null,
      scheduleRowCount: scheduleSnapshot?.rowCount ?? 0,
      stripUpdateCount: operations.filter(
        (operation) => operation.operationType === "label-upsert",
      ).length,
      routeUpsertCount: operations.filter(
        (operation) =>
          operation.operationType === "route-insert" ||
          operation.operationType === "route-update",
      ).length,
      changedDrawingCount,
      reportId,
      reportFilename,
      drawingSummaries,
      warnings: [...(scheduleSnapshot?.warnings ?? []), ...warnings],
      stripRows: scheduleSnapshot?.stripRows ?? [],
      connectionRows: scheduleSnapshot?.connectionRows ?? [],
      selectedOperationIds,
      previewOperations: operations,
      readyForPlan: operations.length > 0 && unresolvedCount === 0,
      summary:
        message ||
        `${selectedActionableCount} project terminal authoring change${selectedActionableCount === 1 ? "" : "s"} selected across ${drawingSummaries.length} drawing${drawingSummaries.length === 1 ? "" : "s"}.`,
      queueItems,
    });
  }, [
    changedDrawingCount,
    drawingSummaries,
    managedRouteUpsertCount,
    message,
    onAutomationSnapshotChange,
    operations,
    queueItems,
    reportFilename,
    reportId,
    requestId,
    scheduleSnapshot,
    selectedActionableCount,
    selectedOperationIds,
    selectedOperationIdSet,
    unresolvedCount,
    warnings,
  ]);

  const handlePreview = async () => {
    if (
      !scheduleSnapshot ||
      !studioContext.projectId ||
      !issueSetSelected ||
      !scopeResolvable
    ) {
      return;
    }
    setRunningPreview(true);
    setMessage(null);
    setWarnings(scheduleSnapshot.warnings);
    setReportId(null);
    setReportFilename(null);
    setChangedDrawingCount(0);
    setTerminalStripUpdateCount(0);
    setManagedRouteUpsertCount(0);
    try {
      const result = await projectTerminalAuthoringService.previewProjectScope({
        projectId: studioContext.projectId,
        issueSetId: studioContext.issueSetId,
        scheduleSnapshotId: scheduleSnapshot.id,
        selectedDrawingPaths,
        drawingRootPath: studioContext.drawingRootPath,
        projectRootPath: studioContext.watchdogRootPath,
        stripRows: scheduleSnapshot.stripRows,
        connectionRows: scheduleSnapshot.connectionRows,
      });
      setRequestId(result.requestId);
      setOperations(result.operations);
      setSelectedOperationIds(
        result.operations
          .filter((operation) => operation.operationType !== "unresolved")
          .map((operation) => operation.operationId),
      );
      setWarnings([
        ...scheduleSnapshot.warnings,
        ...result.warnings.filter(
          (warning) => !scheduleSnapshot.warnings.includes(warning),
        ),
      ]);
      setMessage(result.message);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Preview failed.";
      setMessage(errorMessage);
      setWarnings(scheduleSnapshot.warnings);
      setOperations([]);
      setSelectedOperationIds([]);
      showToast("error", errorMessage);
    } finally {
      setRunningPreview(false);
    }
  };

  const handleApply = async () => {
    if (!studioContext.projectId || !scheduleSnapshot) {
      return;
    }
    if (unresolvedCount > 0) {
      setMessage(
        "Resolve unresolved schedule rows before applying project terminal authoring.",
      );
      return;
    }
    const approvedDrawingIds = new Set(
      approvedItemIds.filter((itemId) => itemId.startsWith("autowire:")),
    );
    const scopedOperations = operations.filter((operation) => {
      if (operation.operationType === "unresolved") {
        return false;
      }
      if (!selectedOperationIdSet.has(operation.operationId)) {
        return false;
      }
      const drawingPath = String(operation.drawingPath ?? "").trim();
      return drawingPath
        ? approvedDrawingIds.has(buildTerminalQueueItemId(drawingPath))
        : false;
    });
    if (scopedOperations.length === 0) {
      setMessage(
        "Approve at least one drawing and one resolved row before applying terminal authoring.",
      );
      return;
    }
    setApplying(true);
    try {
      const result = await projectTerminalAuthoringService.applyProjectScope({
        projectId: studioContext.projectId,
        issueSetId: studioContext.issueSetId,
        scheduleSnapshotId: scheduleSnapshot.id,
        operations: scopedOperations,
        projectRootPath: studioContext.watchdogRootPath,
      });
      setRequestId(result.requestId);
      setWarnings(result.warnings);
      setMessage(result.message);
      setReportId(result.reportId);
      setReportFilename(result.reportFilename);
      setChangedDrawingCount(result.changedDrawingCount);
      setTerminalStripUpdateCount(result.terminalStripUpdateCount);
      setManagedRouteUpsertCount(result.managedRouteUpsertCount);
      await projectTerminalAuthoringService.downloadReport(
        result.reportId,
        result.reportFilename,
      );
      const receiptResult = await projectAutomationReceiptService.saveReceipt({
        projectId: studioContext.projectId,
        issueSetId: studioContext.issueSetId,
        registerSnapshotId: studioContext.registerSnapshotId,
        mode: "wiring",
        summary: result.message,
        reviewItemCount: scopedOperations.length,
        routeCount: result.managedRouteUpsertCount,
        affectedDrawingCount: result.changedDrawingCount,
        terminalStripUpdateCount: result.terminalStripUpdateCount,
        managedRouteUpsertCount: result.managedRouteUpsertCount,
        terminalScheduleSnapshotId: scheduleSnapshot.id,
        reportId: result.reportId,
        requestId: result.requestId,
        drawingName:
          result.drawings.length === 1
            ? (result.drawings[0]?.drawingName ?? null)
            : null,
      });
      if (receiptResult.error) {
        showToast("warning", receiptResult.error.message);
      }
      if (onProjectContextRefresh) {
        await onProjectContextRefresh();
      }
      showToast(
        "success",
        `Applied terminal authoring across ${result.changedDrawingCount} drawing${result.changedDrawingCount === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Apply failed.";
      setMessage(errorMessage);
      showToast("error", errorMessage);
    } finally {
      setApplying(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!reportId) {
      return;
    }
    setDownloadingReport(true);
    try {
      await projectTerminalAuthoringService.downloadReport(
        reportId,
        reportFilename || undefined,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to download report.",
      );
    } finally {
      setDownloadingReport(false);
    }
  };

  if (!issueSetSelected) {
    return (
      <Panel variant="default" padding="lg" className={styles.emptyState}>
        <AlertTriangle className={styles.emptyIcon} />
        <Text as="h3" size="lg" weight="semibold">
          Terminal authoring requires an issue set.
        </Text>
        <Text color="muted" className={styles.emptyCopy}>
          This first tranche only writes against selected issue-set drawings.
          Use the standalone AutoWire workspace for active-drawing work.
        </Text>
      </Panel>
    );
  }

  if (!scopeResolvable) {
    return (
      <Panel variant="default" padding="lg" className={styles.emptyState}>
        <AlertTriangle className={styles.emptyIcon} />
        <Text as="h3" size="lg" weight="semibold">
          Issue-set drawing scope is not ready.
        </Text>
        <Text color="muted" className={styles.emptyCopy}>
          Project terminal authoring needs selected issue-set drawings plus a
          DWG root path so Suite can resolve drawings deterministically.
        </Text>
      </Panel>
    );
  }

  return (
    <div className={styles.root}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className={styles.hiddenInput}
        onChange={handleImportSchedule}
      />

      <div className={styles.headerRow}>
        <div>
          <p className={styles.eyebrow}>Wiring Bench</p>
          <h3 className={styles.title}>Issue-set scoped terminal authoring</h3>
          <p className={styles.detail}>
            Import a terminal schedule workbook, preview strip label writes and
            managed route upserts per drawing, then apply the approved changes
            with an audit report and Automation Studio receipt.
          </p>
        </div>
        <div className={styles.actionRow}>
          <Button
            variant="outline"
            size="sm"
            iconLeft={
              importingSnapshot ? (
                <LoaderCircle size={14} />
              ) : (
                <Upload size={14} />
              )
            }
            loading={importingSnapshot}
            onClick={() => fileInputRef.current?.click()}
          >
            Import schedule
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconLeft={<FileSpreadsheet size={14} />}
            onClick={() => void handlePreview()}
            disabled={!hasSnapshot || runningPreview || loadingSnapshot}
            loading={runningPreview}
          >
            Preview authoring
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Wrench size={14} />}
            onClick={() => void handleApply()}
            disabled={operations.length === 0 || applying}
            loading={applying}
          >
            Apply approved changes
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Download size={14} />}
            onClick={() => void handleDownloadReport()}
            disabled={!reportId || downloadingReport}
            loading={downloadingReport}
          >
            Download audit
          </Button>
        </div>
      </div>

      <div className={styles.scopeRow}>
        <Badge variant="soft" color="warning">
          {selectedDrawingPaths.length} scoped drawing
          {selectedDrawingPaths.length === 1 ? "" : "s"}
        </Badge>
        <Badge variant="outline" color="default">
          Root {studioContext.drawingRootPath || "not resolved"}
        </Badge>
        <Badge
          variant="outline"
          color={telemetry.activeCadSessionCount > 0 ? "warning" : "default"}
        >
          {telemetry.activeCadSessionCount > 0
            ? `${telemetry.activeCadSessionCount} live CAD session${telemetry.activeCadSessionCount === 1 ? "" : "s"}`
            : "No live CAD sessions"}
        </Badge>
        {selectedIssueSet?.terminalScheduleSnapshotId ? (
          <Badge variant="outline" color="success">
            Issue set linked to schedule
          </Badge>
        ) : (
          <Badge variant="outline" color="default">
            No linked schedule on issue set
          </Badge>
        )}
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Schedule</p>
            <h4 className={styles.sectionTitle}>Imported workbook snapshot</h4>
          </div>
        </div>
        <div className={styles.scheduleGrid}>
          <div className={styles.snapshotCard}>
            <strong>
              {scheduleSnapshot?.workbookFileName ||
                "No terminal schedule loaded"}
            </strong>
            <span className={styles.snapshotMeta}>
              {loadingSnapshot
                ? "Loading snapshot..."
                : scheduleSnapshot
                  ? `${scheduleSnapshot.stripRowCount} strip row${scheduleSnapshot.stripRowCount === 1 ? "" : "s"} / ${scheduleSnapshot.connectionRowCount} connection row${scheduleSnapshot.connectionRowCount === 1 ? "" : "s"}`
                  : "Import a .xlsx schedule workbook to start."}
            </span>
            <span className={styles.snapshotMeta}>
              {scheduleSnapshot
                ? `Imported ${new Date(scheduleSnapshot.importedAt).toLocaleString()}`
                : "TerminalStrips is required. TerminalConnections is optional."}
            </span>
            <div className={styles.snapshotActions}>
              <button
                type="button"
                className={styles.inlineButton}
                onClick={() => fileInputRef.current?.click()}
              >
                Replace workbook
              </button>
              {scheduleSnapshot ? (
                <button
                  type="button"
                  className={styles.inlineButton}
                  onClick={() => void handleClearSnapshot()}
                >
                  Clear snapshot
                </button>
              ) : null}
            </div>
          </div>
          <div className={styles.snapshotCard}>
            <strong>Workbook contract</strong>
            <span className={styles.snapshotMeta}>
              Required sheet: TerminalStrips
            </span>
            <span className={styles.snapshotMeta}>
              Optional sheet: TerminalConnections
            </span>
            <span className={styles.snapshotMeta}>
              LabelsCsv stays semicolon-delimited and preserves blanks.
            </span>
          </div>
        </div>
      </section>

      {message ? <div className={styles.message}>{message}</div> : null}
      {warnings.length > 0 ? (
        <div className={styles.warningPanel}>
          {warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Watchdog Context</p>
            <h4 className={styles.sectionTitle}>Scoped drawing activity</h4>
          </div>
        </div>
        <div className={styles.watchdogGrid}>
          {drawingSummaries.length === 0 ? (
            <div className={styles.watchdogEmpty}>
              Run a preview to attach drawing-level watchdog context here.
            </div>
          ) : (
            drawingSummaries.map((drawing) => (
              <div key={drawing.drawingPath} className={styles.watchdogCard}>
                <strong>{drawing.relativePath || drawing.drawingName}</strong>
                <span>{formatRelativeTime(drawing.lastWorkedAt)}</span>
                <span>
                  {drawing.liveSessionStatus
                    ? `${drawing.liveSessionStatus} on ${drawing.liveWorkstationIds.join(", ")}`
                    : "No live session"}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Preview</p>
            <h4 className={styles.sectionTitle}>
              {operations.length === 0
                ? "No project terminal preview yet"
                : `${operations.length} scoped operation${operations.length === 1 ? "" : "s"}`}
            </h4>
          </div>
          {operations.length > 0 ? (
            <div className={styles.selectionControls}>
              <button
                type="button"
                className={styles.selectionButton}
                onClick={() =>
                  setSelectedOperationIds(
                    operations
                      .filter(
                        (operation) => operation.operationType !== "unresolved",
                      )
                      .map((operation) => operation.operationId),
                  )
                }
              >
                Select resolved
              </button>
              <button
                type="button"
                className={styles.selectionButton}
                onClick={() => setSelectedOperationIds([])}
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>

        {operations.length === 0 ? (
          <div className={styles.watchdogEmpty}>
            Import a schedule and run preview to build one queue item per
            drawing plus row-level approvals here.
          </div>
        ) : (
          <div className={styles.previewGroups}>
            {groupedDrawings.map((drawing) => {
              const itemId = drawing.drawingPath.startsWith("unresolved:")
                ? null
                : buildTerminalQueueItemId(drawing.drawingPath);
              const approved = itemId
                ? approvedItemIds.includes(itemId)
                : false;
              return (
                <div key={drawing.drawingPath} className={styles.previewGroup}>
                  <div className={styles.previewGroupHeader}>
                    <div className={styles.previewGroupIdentity}>
                      {itemId ? (
                        <label className={styles.drawingInclude}>
                          <input
                            type="checkbox"
                            checked={approved}
                            onChange={(event) =>
                              onQueueItemApprovalChange(
                                itemId,
                                event.target.checked,
                              )
                            }
                          />
                          <span>Include drawing</span>
                        </label>
                      ) : null}
                      <div>
                        <strong>
                          {drawing.relativePath || drawing.drawingName}
                        </strong>
                        <p className={styles.groupDetail}>
                          {drawing.selectedOperationCount}/
                          {drawing.operationCount} selected{" / "}
                          {drawing.liveSessionStatus
                            ? `Live ${drawing.liveSessionStatus} on ${drawing.liveWorkstationIds.join(", ")}`
                            : `Last worked ${formatRelativeTime(drawing.lastWorkedAt)}`}
                        </p>
                      </div>
                    </div>
                    <div className={styles.previewGroupBadges}>
                      <Badge variant="soft" color="default">
                        {drawing.operationCount} item
                        {drawing.operationCount === 1 ? "" : "s"}
                      </Badge>
                      {drawing.unresolvedCount > 0 ? (
                        <Badge variant="outline" color="warning">
                          {drawing.unresolvedCount} unresolved
                        </Badge>
                      ) : null}
                      {drawing.routeUpsertCount > 0 ? (
                        <Badge variant="outline" color="info">
                          <Route size={12} />
                          {drawing.routeUpsertCount} routes
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className={styles.previewList}>
                    {drawing.operations.map((operation, index) => {
                      const selected = selectedOperationIdSet.has(
                        operation.operationId,
                      );
                      const disabled = operation.operationType === "unresolved";
                      return (
                        <div
                          key={operation.operationId}
                          className={
                            selected
                              ? styles.previewItemSelected
                              : styles.previewItem
                          }
                        >
                          <div className={styles.previewItemHeader}>
                            <label
                              className={styles.operationToggle}
                              htmlFor={`${drawing.drawingPath}-${index}`}
                            >
                              <Checkbox
                                id={`${drawing.drawingPath}-${index}`}
                                checked={selected}
                                disabled={disabled}
                                onCheckedChange={() =>
                                  setSelectedOperationIds((current) =>
                                    current.includes(operation.operationId)
                                      ? current.filter(
                                          (value) =>
                                            value !== operation.operationId,
                                        )
                                      : [...current, operation.operationId],
                                  )
                                }
                              />
                              <span>
                                {operation.operationType}
                                {" / "}
                                {operation.source === "strip"
                                  ? operation.stripId || "Strip"
                                  : operation.routeRef || "Route"}
                              </span>
                            </label>
                            <div className={styles.operationMeta}>
                              {operation.routeType ? (
                                <Badge variant="outline" color="default">
                                  {operation.routeType}
                                </Badge>
                              ) : null}
                              {operation.warning ? (
                                <Badge variant="outline" color="warning">
                                  Warning
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <div className={styles.previewMeta}>
                            {operation.detail}
                          </div>
                          {operation.before || operation.after ? (
                            <div className={styles.previewDiff}>
                              {operation.before ? (
                                <div>
                                  <span className={styles.diffDanger}>
                                    âˆ’
                                  </span>
                                  {operation.before}
                                </div>
                              ) : null}
                              {operation.after ? (
                                <div>
                                  <span className={styles.diffSuccess}>+</span>
                                  {operation.after}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {operation.warning ? (
                            <div className={styles.previewMeta}>
                              {operation.warning}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {reportId ? (
        <div className={styles.auditBar}>
          <Badge variant="soft" color="success">
            Audit ready
          </Badge>
          <span className={styles.previewMeta}>
            {reportFilename || "Terminal authoring audit"}
            {" / "}
            {terminalStripUpdateCount} strip update
            {terminalStripUpdateCount === 1 ? "" : "s"}
            {" / "}
            {managedRouteUpsertCount} route upsert
            {managedRouteUpsertCount === 1 ? "" : "s"}
            {" / "}
            {changedDrawingCount} drawing
            {changedDrawingCount === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

