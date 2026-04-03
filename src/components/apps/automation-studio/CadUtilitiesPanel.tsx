import {
  AlertTriangle,
  Download,
  FileSearch,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/components/notification-system/ToastProvider";
import { Checkbox } from "@/components/apps/ui/checkbox";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { Text } from "@/components/primitives/Text";
import {
  type CadPreviewMatch,
  type CadReplaceRule,
  buildCadPreviewKey,
  buildCadUtilityQueueItemId,
  cadBatchFindReplaceService,
  isAbsoluteWindowsPath,
} from "@/services/cadBatchFindReplaceService";
import { projectAutomationReceiptService } from "@/services/projectAutomationReceiptService";
import { useProjectWatchdogTelemetry } from "@/features/project-watchdog";
import type {
  AutomationQueueItem,
  AutomationStudioContext,
  CadUtilityAutomationDrawingSummary,
  CadUtilityAutomationSnapshot,
} from "@/features/automation-studio";
import styles from "./CadUtilitiesPanel.module.css";

const DEFAULT_BLOCK_NAME_HINT = "R3P-24x36BORDER&TITLE";

const createRule = (): CadReplaceRule => ({
  id:
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cad-rule-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  find: "",
  replace: "",
  useRegex: false,
  matchCase: false,
});

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

interface CadUtilitiesPanelProps {
  studioContext: AutomationStudioContext;
  approvedItemIds: string[];
  onQueueItemApprovalChange: (itemId: string, approved: boolean) => void;
  onAutomationSnapshotChange?: (
    snapshot: CadUtilityAutomationSnapshot | null,
  ) => void;
  onProjectContextRefresh?: () => Promise<void> | void;
}

export function CadUtilitiesPanel({
  studioContext,
  approvedItemIds,
  onQueueItemApprovalChange,
  onAutomationSnapshotChange,
  onProjectContextRefresh,
}: CadUtilitiesPanelProps) {
  const { showToast } = useToast();
  const telemetry = useProjectWatchdogTelemetry(studioContext.projectId ?? "");
  const [rules, setRules] = useState<CadReplaceRule[]>([createRule()]);
  const [previewMatches, setPreviewMatches] = useState<CadPreviewMatch[]>([]);
  const [selectedPreviewKeys, setSelectedPreviewKeys] = useState<string[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [runningPreview, setRunningPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportFilename, setReportFilename] = useState<string | null>(null);
  const [changedDrawingCount, setChangedDrawingCount] = useState(0);
  const [changedItemCount, setChangedItemCount] = useState(0);

  const issueSetSelected = Boolean(studioContext.issueSetId);
  const selectedDrawingPaths = studioContext.selectedDrawingPaths ?? [];
  const scopeResolvable =
    selectedDrawingPaths.length > 0 &&
    (Boolean(studioContext.drawingRootPath) ||
      selectedDrawingPaths.every((path) => isAbsoluteWindowsPath(path)));
  const hasRules = rules.some((rule) => rule.find.trim().length > 0);
  const canPreview =
    issueSetSelected && scopeResolvable && hasRules && !runningPreview;

  const activeSessionByDrawingKey = useMemo(() => {
    const map = new Map<
      string,
      { workstationIds: string[]; status: "live" | "paused" | null }
    >();
    for (const session of telemetry.liveSessions) {
      const key = normalizeDrawingKey(session.drawingPath);
      if (!key) {
        continue;
      }
      const sessionStatus =
        session.status === "live" || session.status === "paused"
          ? session.status
          : null;
      const current = map.get(key) ?? {
        workstationIds: [],
        status: null,
      };
      const workstationId = String(session.workstationId ?? "").trim();
      if (workstationId && !current.workstationIds.includes(workstationId)) {
        current.workstationIds.push(workstationId);
      }
      current.status =
        current.status === "live" ? current.status : sessionStatus;
      map.set(key, current);
    }
    return map;
  }, [telemetry.liveSessions]);

  const trackedDrawingByKey = useMemo(() => {
    const map = new Map<
      string,
      {
        lastWorkedAt: string | null;
        drawingName: string;
      }
    >();
    for (const drawing of telemetry.trackedDrawings) {
      const key = normalizeDrawingKey(
        drawing.drawingPath || drawing.drawingName,
      );
      if (!key) {
        continue;
      }
      map.set(key, {
        lastWorkedAt: drawing.lastWorkedAt,
        drawingName: drawing.drawingName,
      });
    }
    return map;
  }, [telemetry.trackedDrawings]);

  const selectedPreviewKeySet = useMemo(
    () => new Set(selectedPreviewKeys),
    [selectedPreviewKeys],
  );

  const groupedDrawings = useMemo(() => {
    const groups = new Map<
      string,
      {
        drawingPath: string;
        drawingName: string;
        relativePath: string | null;
        matchCount: number;
        selectedMatchCount: number;
        matchKeys: string[];
        liveWorkstationIds: string[];
        liveSessionStatus: "live" | "paused" | null;
        lastWorkedAt: string | null;
        warningCount: number;
      }
    >();

    previewMatches.forEach((match, index) => {
      const drawingPath =
        String(match.drawingPath ?? "").trim() ||
        String(match.file ?? "").trim() ||
        `drawing-${index}`;
      const drawingKey = normalizeDrawingKey(drawingPath || match.drawingName);
      const previewKey = buildCadPreviewKey(match, index);
      const tracked = trackedDrawingByKey.get(drawingKey);
      const session = activeSessionByDrawingKey.get(drawingKey);
      const current = groups.get(drawingPath) ?? {
        drawingPath,
        drawingName:
          String(match.drawingName ?? "").trim() ||
          tracked?.drawingName ||
          String(match.file ?? "").trim() ||
          drawingPath.split(/[\\/]/).pop() ||
          drawingPath,
        relativePath: String(match.relativePath ?? "").trim() || null,
        matchCount: 0,
        selectedMatchCount: 0,
        matchKeys: [],
        liveWorkstationIds: session?.workstationIds ?? [],
        liveSessionStatus: session?.status ?? null,
        lastWorkedAt: tracked?.lastWorkedAt ?? null,
        warningCount: session ? 1 : 0,
      };
      current.matchCount += 1;
      current.selectedMatchCount += selectedPreviewKeySet.has(previewKey)
        ? 1
        : 0;
      current.matchKeys.push(previewKey);
      groups.set(drawingPath, current);
    });

    return Array.from(groups.values()).sort((left, right) =>
      left.drawingName.localeCompare(right.drawingName, undefined, {
        sensitivity: "base",
      }),
    );
  }, [
    activeSessionByDrawingKey,
    previewMatches,
    selectedPreviewKeySet,
    trackedDrawingByKey,
  ]);

  const queueItems = useMemo<AutomationQueueItem[]>(() => {
    return groupedDrawings.map((drawing) => {
      const itemId = buildCadUtilityQueueItemId(drawing.drawingPath);
      const approved = approvedItemIds.includes(itemId);
      const liveStatusText = drawing.liveSessionStatus
        ? `Live session ${drawing.liveSessionStatus} on ${drawing.liveWorkstationIds.join(", ")}.`
        : `Last worked ${formatRelativeTime(drawing.lastWorkedAt)}.`;
      const status: AutomationQueueItem["status"] =
        drawing.warningCount > 0
          ? "warning"
          : approved && drawing.selectedMatchCount > 0
            ? "planned"
            : "needs-review";
      return {
        id: itemId,
        source: "cad-utils",
        status,
        bindingKind: "drawing-content",
        label: drawing.drawingName,
        detail: `${drawing.selectedMatchCount}/${drawing.matchCount} scoped text or block change${drawing.matchCount === 1 ? "" : "s"} selected. ${liveStatusText}`,
        suggestedTarget: drawing.relativePath || drawing.drawingPath,
        drawingNumber: drawing.drawingName,
      };
    });
  }, [approvedItemIds, groupedDrawings]);

  const drawingSummaries = useMemo<CadUtilityAutomationDrawingSummary[]>(
    () =>
      groupedDrawings.map((drawing) => ({
        drawingPath: drawing.drawingPath,
        drawingName: drawing.drawingName,
        relativePath: drawing.relativePath,
        matchCount: drawing.matchCount,
        selectedMatchCount: drawing.selectedMatchCount,
        liveWorkstationIds: drawing.liveWorkstationIds,
        liveSessionStatus: drawing.liveSessionStatus,
        lastWorkedAt: drawing.lastWorkedAt,
        warningCount: drawing.warningCount,
      })),
    [groupedDrawings],
  );

  const selectedMatchCount = useMemo(
    () =>
      previewMatches.reduce(
        (total, match, index) =>
          total +
          (selectedPreviewKeySet.has(buildCadPreviewKey(match, index)) ? 1 : 0),
        0,
      ),
    [previewMatches, selectedPreviewKeySet],
  );

  useEffect(() => {
    if (!onAutomationSnapshotChange) {
      return;
    }
    if (
      previewMatches.length === 0 &&
      reportId === null &&
      changedItemCount === 0 &&
      changedDrawingCount === 0
    ) {
      onAutomationSnapshotChange(null);
      return;
    }

    onAutomationSnapshotChange({
      requestId,
      workPackageId: null,
      recipeSnapshotId: null,
      matchCount: previewMatches.length,
      selectedMatchCount,
      changedDrawingCount,
      changedItemCount,
      reportId,
      reportFilename,
      readyForPlan: previewMatches.length > 0,
      summary:
        message ||
        `${selectedMatchCount} CAD utility change${selectedMatchCount === 1 ? "" : "s"} selected across ${groupedDrawings.length} drawing${groupedDrawings.length === 1 ? "" : "s"}.`,
      warnings,
      rules,
      selectedPreviewKeys,
      previewMatches,
      blockNameHint: DEFAULT_BLOCK_NAME_HINT,
      drawings: drawingSummaries,
      queueItems,
    });
  }, [
    changedDrawingCount,
    changedItemCount,
    drawingSummaries,
    groupedDrawings.length,
    message,
    onAutomationSnapshotChange,
    previewMatches.length,
    previewMatches,
    queueItems,
    reportFilename,
    reportId,
    requestId,
    rules,
    selectedMatchCount,
    selectedPreviewKeys,
    warnings,
  ]);

  const runPreview = async () => {
    if (!canPreview) {
      return;
    }
    setRunningPreview(true);
    setMessage(null);
    setWarnings([]);
    setReportId(null);
    setReportFilename(null);
    setChangedDrawingCount(0);
    setChangedItemCount(0);
    try {
      const result = await cadBatchFindReplaceService.previewProjectScope({
        rules,
        selectedDrawingPaths,
        drawingRootPath: studioContext.drawingRootPath,
        projectRootPath: studioContext.watchdogRootPath,
        blockNameHint: DEFAULT_BLOCK_NAME_HINT,
      });
      setRequestId(result.requestId);
      setPreviewMatches(result.matches);
      setSelectedPreviewKeys(
        result.matches.map((match, index) => buildCadPreviewKey(match, index)),
      );
      setWarnings(result.warnings);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview failed.");
      setPreviewMatches([]);
      setSelectedPreviewKeys([]);
    } finally {
      setRunningPreview(false);
    }
  };

  const applyChanges = async () => {
    const approvedDrawingIds = new Set(
      approvedItemIds.filter((itemId) => itemId.startsWith("cad-utils:")),
    );
    const scopedMatches = previewMatches.filter((match, index) => {
      const previewKey = buildCadPreviewKey(match, index);
      if (!selectedPreviewKeySet.has(previewKey)) {
        return false;
      }
      const drawingPath =
        String(match.drawingPath ?? "").trim() ||
        String(match.file ?? "").trim();
      if (!drawingPath) {
        return false;
      }
      return approvedDrawingIds.has(buildCadUtilityQueueItemId(drawingPath));
    });

    if (scopedMatches.length === 0) {
      setMessage(
        "Approve at least one drawing and one preview row before applying project CAD utilities.",
      );
      return;
    }

    setApplying(true);
    setMessage(null);
    try {
      const result = await cadBatchFindReplaceService.applyProjectScope({
        matches: scopedMatches,
        blockNameHint: DEFAULT_BLOCK_NAME_HINT,
      });
      setRequestId(result.requestId);
      setWarnings(result.warnings);
      setMessage(result.message);
      setChangedDrawingCount(result.changedDrawingCount);
      setChangedItemCount(result.changedItemCount);
      setReportId(result.reportId);
      setReportFilename(result.reportFilename);

      await cadBatchFindReplaceService.downloadReport(
        result.reportId,
        result.reportFilename,
      );
      showToast(
        "success",
        `CAD utilities applied to ${result.changedDrawingCount} drawing${result.changedDrawingCount === 1 ? "" : "s"}.`,
      );

      if (studioContext.projectId) {
        const receiptResult = await projectAutomationReceiptService.saveReceipt(
          {
            projectId: studioContext.projectId,
            issueSetId: studioContext.issueSetId,
            registerSnapshotId: studioContext.registerSnapshotId,
            mode: "cad-utils",
            summary: result.message,
            reviewItemCount: scopedMatches.length,
            affectedDrawingCount: result.changedDrawingCount,
            cadUtilityChangedDrawingCount: result.changedDrawingCount,
            cadUtilityChangedItemCount: result.changedItemCount,
            requestId: result.requestId,
            drawingName:
              result.drawings.length === 1
                ? (result.drawings[0]?.drawingName ?? null)
                : null,
          },
        );
        if (receiptResult.error) {
          showToast("warning", receiptResult.error.message);
        } else if (onProjectContextRefresh) {
          await onProjectContextRefresh();
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Apply failed.");
      showToast(
        "error",
        error instanceof Error ? error.message : "Apply failed.",
      );
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
      await cadBatchFindReplaceService.downloadReport(
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

  const updateRule = (id: string, patch: Partial<CadReplaceRule>) => {
    setRules((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    );
  };

  const removeRule = (id: string) => {
    setRules((current) =>
      current.length > 1 ? current.filter((rule) => rule.id !== id) : current,
    );
  };

  if (!issueSetSelected) {
    return (
      <Panel variant="default" padding="lg" className={styles.emptyState}>
        <FileSearch className={styles.emptyIcon} />
        <Text as="h3" size="lg" weight="semibold">
          CAD utilities require an issue set.
        </Text>
        <Text color="muted">
          Project-aware CAD utilities only run against selected issue-set
          drawings in this first tranche. Use the standalone tool for ad hoc
          active-drawing cleanup.
        </Text>
        <Link to="/app/apps/batch-find-replace" className={styles.inlineLink}>
          Open standalone Batch Find & Replace
        </Link>
      </Panel>
    );
  }

  if (!scopeResolvable) {
    return (
      <Panel variant="default" padding="lg" className={styles.emptyState}>
        <AlertTriangle className={styles.emptyIcon} />
        <Text as="h3" size="lg" weight="semibold">
          CAD utility scope is not ready.
        </Text>
        <Text color="muted">
          The selected issue set needs drawing paths plus a DWG root path before
          project-aware preview can resolve drawings.
        </Text>
        <div className={styles.factRow}>
          <Badge variant="outline" color="warning">
            {selectedDrawingPaths.length} selected drawing
            {selectedDrawingPaths.length === 1 ? "" : "s"}
          </Badge>
          <Badge
            variant="outline"
            color={studioContext.drawingRootPath ? "success" : "default"}
          >
            {studioContext.drawingRootPath
              ? "DWG root ready"
              : "DWG root missing"}
          </Badge>
        </div>
      </Panel>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.headerRow}>
        <div>
          <p className={styles.eyebrow}>CAD Utilities</p>
          <h3 className={styles.title}>
            Issue-set scoped text and block cleanup
          </h3>
          <p className={styles.detail}>
            Preview DBText, MText, and block-attribute replacements across the
            selected issue-set drawings. Drawing approval stays package-aware,
            while match approval stays review-first here.
          </p>
        </div>
        <div className={styles.actionRow}>
          <Button
            variant="outline"
            size="sm"
            iconLeft={<FileSearch size={14} />}
            onClick={() => void runPreview()}
            disabled={!canPreview}
            loading={runningPreview}
          >
            {runningPreview ? "Previewing…" : "Preview utilities"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Wrench size={14} />}
            onClick={() => void applyChanges()}
            disabled={previewMatches.length === 0 || applying}
            loading={applying}
          >
            {applying ? "Applying…" : "Apply approved changes"}
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
        <Badge variant="outline" color="default">
          Tracker {telemetry.latestTrackerUpdatedAt ? "updated" : "offline"}
        </Badge>
      </div>

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
            <p className={styles.eyebrow}>Rules</p>
            <h4 className={styles.sectionTitle}>Replacement rules</h4>
          </div>
          <Button
            variant="outline"
            size="sm"
            iconLeft={<Sparkles size={14} />}
            onClick={() => setRules((current) => [...current, createRule()])}
          >
            Add rule
          </Button>
        </div>
        <div className={styles.rulesList}>
          {rules.map((rule) => (
            <div key={rule.id} className={styles.ruleCard}>
              <div className={styles.ruleGrid}>
                <input
                  value={rule.find}
                  onChange={(event) =>
                    updateRule(rule.id, { find: event.target.value })
                  }
                  placeholder="Find"
                  className={styles.textInput}
                />
                <input
                  value={rule.replace}
                  onChange={(event) =>
                    updateRule(rule.id, { replace: event.target.value })
                  }
                  placeholder="Replace"
                  className={styles.textInput}
                />
                <button
                  type="button"
                  onClick={() => removeRule(rule.id)}
                  className={styles.removeRuleButton}
                >
                  Remove
                </button>
              </div>
              <div className={styles.ruleOptions}>
                <label
                  className={styles.checkboxLabel}
                  htmlFor={`cad-regex-${rule.id}`}
                >
                  <Checkbox
                    id={`cad-regex-${rule.id}`}
                    checked={rule.useRegex}
                    onCheckedChange={(checked) =>
                      updateRule(rule.id, { useRegex: checked === true })
                    }
                  />
                  <span>Regex</span>
                </label>
                <label
                  className={styles.checkboxLabel}
                  htmlFor={`cad-case-${rule.id}`}
                >
                  <Checkbox
                    id={`cad-case-${rule.id}`}
                    checked={rule.matchCase}
                    onCheckedChange={(checked) =>
                      updateRule(rule.id, { matchCase: checked === true })
                    }
                  />
                  <span>Case sensitive</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

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
              {previewMatches.length === 0
                ? "No project CAD preview yet"
                : `${previewMatches.length} scoped match${previewMatches.length === 1 ? "" : "es"}`}
            </h4>
          </div>
          {previewMatches.length > 0 ? (
            <div className={styles.selectionControls}>
              <button
                type="button"
                className={styles.selectionButton}
                onClick={() =>
                  setSelectedPreviewKeys(
                    previewMatches.map((match, index) =>
                      buildCadPreviewKey(match, index),
                    ),
                  )
                }
              >
                Select all
              </button>
              <button
                type="button"
                className={styles.selectionButton}
                onClick={() => setSelectedPreviewKeys([])}
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>

        {previewMatches.length === 0 ? (
          <div className={styles.previewEmpty}>
            Run a preview to build one queue item per drawing and a match-level
            review list here.
          </div>
        ) : (
          <div className={styles.previewGroups}>
            {groupedDrawings.map((drawing) => {
              const itemId = buildCadUtilityQueueItemId(drawing.drawingPath);
              const approved = approvedItemIds.includes(itemId);
              const drawingMatches = previewMatches.filter(
                (match) =>
                  (String(match.drawingPath ?? "").trim() ||
                    String(match.file ?? "").trim()) === drawing.drawingPath,
              );
              return (
                <div key={drawing.drawingPath} className={styles.previewGroup}>
                  <div className={styles.previewGroupHeader}>
                    <div className={styles.previewGroupIdentity}>
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
                      <div>
                        <strong>
                          {drawing.relativePath || drawing.drawingName}
                        </strong>
                        <p className={styles.groupDetail}>
                          {drawing.selectedMatchCount}/{drawing.matchCount}{" "}
                          selected •{" "}
                          {drawing.liveSessionStatus
                            ? `Live ${drawing.liveSessionStatus} on ${drawing.liveWorkstationIds.join(", ")}`
                            : `Last worked ${formatRelativeTime(drawing.lastWorkedAt)}`}
                        </p>
                      </div>
                    </div>
                    <div className={styles.previewGroupBadges}>
                      <Badge variant="soft" color="default">
                        {drawing.matchCount} match
                        {drawing.matchCount === 1 ? "" : "es"}
                      </Badge>
                      {drawing.liveSessionStatus ? (
                        <Badge variant="outline" color="warning">
                          Live activity
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className={styles.previewList}>
                    {drawingMatches.map((match, index) => {
                      const previewIndex = previewMatches.indexOf(match);
                      const previewKey = buildCadPreviewKey(
                        match,
                        previewIndex,
                      );
                      const selected = selectedPreviewKeySet.has(previewKey);
                      return (
                        <div
                          key={match.matchKey || previewKey}
                          className={
                            selected
                              ? styles.previewItemSelected
                              : styles.previewItem
                          }
                        >
                          <div className={styles.previewItemHeader}>
                            <label
                              className={styles.previewSelectLabel}
                              htmlFor={`${itemId}-match-${index}`}
                            >
                              <Checkbox
                                id={`${itemId}-match-${index}`}
                                checked={selected}
                                onCheckedChange={() =>
                                  setSelectedPreviewKeys((current) =>
                                    current.includes(previewKey)
                                      ? current.filter(
                                          (value) => value !== previewKey,
                                        )
                                      : [...current, previewKey],
                                  )
                                }
                              />
                              <span>
                                {match.entityType || "Text"} •{" "}
                                {match.layoutName || "Active"} •{" "}
                                {match.attributeTag || match.handle || "Target"}
                              </span>
                            </label>
                            <span className={styles.previewRule}>
                              {match.ruleId}
                            </span>
                          </div>
                          <div className={styles.previewDiff}>
                            <div>
                              <span className={styles.previewDiffDanger}>
                                −
                              </span>
                              {match.before}
                            </div>
                            <div>
                              <span className={styles.previewDiffSuccess}>
                                +
                              </span>
                              {match.after}
                            </div>
                          </div>
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
          <span>
            {reportFilename || "CAD audit report"} • {changedItemCount} change
            {changedItemCount === 1 ? "" : "s"} across {changedDrawingCount}{" "}
            drawing
            {changedDrawingCount === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

