import {
  ArrowUpRight,
  CheckCircle2,
  CircuitBoard,
  FileBadge2,
  FilePenLine,
  RefreshCw,
  Route,
  Wand2,
} from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/components/notification-system/ToastProvider";
import { AutoDraftComparePanel } from "@/components/apps/autodraft-studio/AutoDraftComparePanel";
import { AutomationRecipePanel } from "@/components/apps/automation-studio/AutomationRecipePanel";
import { CadUtilitiesPanel } from "@/components/apps/automation-studio/CadUtilitiesPanel";
import { TerminalAuthoringPanel } from "@/components/apps/automation-studio/TerminalAuthoringPanel";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame, Section } from "@/components/apps/ui/PageFrame";
import { ProjectWorkflowLinks } from "@/components/apps/ui/ProjectWorkflowLinks";
import { TrustStateBadge } from "@/components/apps/ui/TrustStateBadge";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { buildProjectIssueSetAppHref } from "@/lib/projectWorkflowNavigation";
import { projectAutomationReceiptService } from "@/services/projectAutomationReceiptService";
import {
  buildAutomationPlanSummary,
  buildAutomationReceiptSummary,
  buildUnifiedAutomationQueue,
  AutoDraftAutomationSnapshot,
  AutoWireAutomationSnapshot,
  AutomationBindingKind,
  AutomationQueueItem,
  AutomationStudioTab,
  AutomationWorkbenchMode,
  CadUtilityAutomationSnapshot,
  useAutomationStudioState,
} from "@/features/automation-studio";
import styles from "./AutomationStudioApp.module.css";

const STAGE_COPY: Record<
  AutomationStudioTab,
  { eyebrow: string; title: string; detail: string }
> = {
  intake: {
    eyebrow: "Intake",
    title: "Load markup intent and project package context first.",
    detail:
      "Start with the marked PDFs, the active issue set, and the terminal scan context that should drive the next P&C update.",
  },
  review: {
    eyebrow: "Review",
    title: "Clear the combined queue before building the execution plan.",
    detail:
      "Markup intent, title block items, terminal routes, and schedule follow-up stay in one operator queue here.",
  },
  plan: {
    eyebrow: "Plan",
    title:
      "Bind the approved work to title blocks, drawings, terminals, and schedules.",
    detail:
      "Use binding overrides and inclusion toggles to decide what belongs in this automation run before preview.",
  },
  preview: {
    eyebrow: "Preview",
    title: "Preview the combined update before any CAD write path.",
    detail:
      "Markup compare stays review-first, terminal routing stays deterministic, and both remain attached to the same package scope.",
  },
  commit: {
    eyebrow: "Commit",
    title:
      "Capture a receipt and hand the approved work back to the package flow.",
    detail:
      "Record the approved queue against the issue set, then continue through Issue Sets and Transmittal instead of forking a parallel workflow.",
  },
};

const BINDING_OPTIONS: Array<{
  value: AutomationBindingKind;
  label: string;
}> = [
  { value: "title-block", label: "Title block" },
  { value: "drawing-row", label: "Drawing row" },
  { value: "deliverable-row", label: "Deliverable row" },
  { value: "drawing-content", label: "Drawing content" },
  { value: "terminal-wiring", label: "Terminal / wiring" },
  { value: "schedule-row", label: "Schedule row" },
  { value: "note-only", label: "Note only" },
];

function hasSameBindingOverrides(
  current: Record<string, AutomationBindingKind | undefined>,
  next: Record<string, AutomationBindingKind | undefined>,
) {
  const currentEntries = Object.entries(current).filter(([, value]) => value);
  const nextEntries = Object.entries(next).filter(([, value]) => value);
  if (currentEntries.length !== nextEntries.length) {
    return false;
  }
  return currentEntries.every(([key, value]) => next[key] === value);
}

function hasSameIds(current: string[], next: string[]) {
  if (current.length !== next.length) {
    return false;
  }
  return current.every((value, index) => next[index] === value);
}

function getQueueTone(status: AutomationQueueItem["status"]) {
  switch (status) {
    case "planned":
      return "success";
    case "warning":
      return "warning";
    default:
      return "default";
  }
}

function getQueueSourceMeta(source: AutomationQueueItem["source"]) {
  switch (source) {
    case "autodraft":
      return {
        label: "Markup",
        color: "warning" as const,
      };
    case "autowire":
      return {
        label: "Wiring",
        color: "info" as const,
      };
    case "cad-utils":
      return {
        label: "CAD utility",
        color: "success" as const,
      };
  }
}

interface AutomationStudioAppProps {
  preferredProjectId?: string;
  preferredIssueSetId?: string;
  preferredRegisterSnapshotId?: string;
  preferredDrawingId?: string;
}

export function AutomationStudioApp({
  preferredProjectId,
  preferredIssueSetId,
  preferredRegisterSnapshotId,
  preferredDrawingId,
}: AutomationStudioAppProps) {
  const { showToast } = useToast();
  const {
    projectOptions,
    selectedProject,
    selectedProjectId,
    setSelectedProjectId,
    issueSets,
    selectedIssueSet,
    selectedIssueSetId,
    setSelectedIssueSetId,
    selectedRegisterRows,
    latestReceipt,
    studioContext,
    workflowLinks,
    loadingProjects,
    loadingContext,
    messages,
    refreshProjectContext,
  } = useAutomationStudioState({
    preferredProjectId,
    preferredIssueSetId,
    preferredRegisterSnapshotId,
    preferredDrawingId,
  });
  const [activeTab, setActiveTab] = useState<AutomationStudioTab>("intake");
  const [workbenchMode, setWorkbenchMode] =
    useState<AutomationWorkbenchMode>("markup");
  const [autoDraftSnapshot, setAutoDraftSnapshot] =
    useState<AutoDraftAutomationSnapshot | null>(null);
  const [autoWireSnapshot, setAutoWireSnapshot] =
    useState<AutoWireAutomationSnapshot | null>(null);
  const [cadUtilitySnapshot, setCadUtilitySnapshot] =
    useState<CadUtilityAutomationSnapshot | null>(null);
  const [bindingOverrides, setBindingOverrides] = useState<
    Record<string, AutomationBindingKind | undefined>
  >({});
  const [approvedItemIds, setApprovedItemIds] = useState<string[]>([]);
  const [recordingReceipt, setRecordingReceipt] = useState(false);

  const queueItems = useMemo(
    () =>
      buildUnifiedAutomationQueue({
        autoDraftSnapshot,
        autoWireSnapshot,
        cadUtilitySnapshot,
        bindingOverrides,
      }),
    [autoDraftSnapshot, autoWireSnapshot, cadUtilitySnapshot, bindingOverrides],
  );
  const planSummary = useMemo(
    () =>
      buildAutomationPlanSummary({
        queueItems,
        approvedItemIds,
        registerRowCount: selectedRegisterRows.length,
        selectedDrawingCount:
          selectedIssueSet?.selectedDrawingPaths.length ?? 0,
      }),
    [
      approvedItemIds,
      queueItems,
      selectedIssueSet,
      selectedRegisterRows.length,
    ],
  );
  const receiptSummary = useMemo(
    () =>
      buildAutomationReceiptSummary({
        autoDraftSnapshot,
        autoWireSnapshot,
        cadUtilitySnapshot,
        planSummary,
      }),
    [autoDraftSnapshot, autoWireSnapshot, cadUtilitySnapshot, planSummary],
  );

  useEffect(() => {
    setBindingOverrides((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) =>
          queueItems.some((item) => item.id === key),
        ),
      );
      return hasSameBindingOverrides(current, next) ? current : next;
    });
    setApprovedItemIds((current) => {
      const next = [
        ...new Set([
          ...current.filter((id) => queueItems.some((item) => item.id === id)),
          ...queueItems
            .map((item) => item.id)
            .filter((id) => !current.includes(id)),
        ]),
      ];
      return hasSameIds(current, next) ? current : next;
    });
  }, [queueItems]);

  const autoDraftHref = useMemo(
    () =>
      buildProjectIssueSetAppHref(
        "/app/apps/autodraft-studio",
        studioContext.projectId,
        studioContext.issueSetId,
        {
          registerSnapshot: studioContext.registerSnapshotId,
          drawing: studioContext.drawingId,
        },
      ),
    [studioContext],
  );
  const autoWireHref = useMemo(
    () =>
      buildProjectIssueSetAppHref(
        "/app/apps/autowire",
        studioContext.projectId,
        studioContext.issueSetId,
        {
          registerSnapshot: studioContext.registerSnapshotId,
          drawing: studioContext.drawingId,
        },
      ),
    [studioContext],
  );
  const batchFindReplaceHref = useMemo(
    () =>
      buildProjectIssueSetAppHref(
        "/app/apps/batch-find-replace",
        studioContext.projectId,
        studioContext.issueSetId,
        {
          registerSnapshot: studioContext.registerSnapshotId,
          drawing: studioContext.drawingId,
        },
      ),
    [studioContext],
  );

  const activeSnapshotModes = useMemo(
    () =>
      [
        autoDraftSnapshot?.queueItems.length ? "markup" : null,
        autoWireSnapshot?.queueItems.length ? "wiring" : null,
        cadUtilitySnapshot?.queueItems.length ? "cad-utils" : null,
      ].filter((mode): mode is AutomationWorkbenchMode => mode !== null),
    [autoDraftSnapshot, autoWireSnapshot, cadUtilitySnapshot],
  );

  const benchLabel =
    workbenchMode === "markup"
      ? "AutoDraft intent"
      : workbenchMode === "wiring"
        ? "AutoWire routing"
        : "Project CAD utilities";

  const benchTone =
    workbenchMode === "markup"
      ? ("warning" as const)
      : workbenchMode === "wiring"
        ? ("info" as const)
        : ("success" as const);

  const specialistSummary =
    workbenchMode === "markup"
      ? autoDraftSnapshot?.summary ||
        "Load a marked PDF to start markup classification."
      : workbenchMode === "wiring"
        ? autoWireSnapshot?.summary ||
          "Import a terminal schedule workbook to preview issue-set wiring writes."
        : cadUtilitySnapshot?.summary ||
          "Preview issue-set CAD utility changes to build the drawing queue.";

  const handleQueueItemApprovalChange = (itemId: string, approved: boolean) => {
    setApprovedItemIds((current) =>
      approved
        ? [...new Set([...current, itemId])]
        : current.filter((id) => id !== itemId),
    );
  };

  const handleRecordReceipt = async () => {
    if (!studioContext.projectId) {
      showToast("warning", "Select a project before recording a receipt.");
      return;
    }

    const markupFamilyCounts = (
      autoDraftSnapshot?.previewOperations ?? []
    ).reduce(
      (counts, operation) => {
        const key = String(operation.operationType || "").trim();
        if (!key) {
          return counts;
        }
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      },
      {} as Record<string, number>,
    );

    setRecordingReceipt(true);
    const result = await projectAutomationReceiptService.saveReceipt({
      projectId: studioContext.projectId,
      issueSetId: studioContext.issueSetId,
      registerSnapshotId: studioContext.registerSnapshotId,
      mode:
        activeSnapshotModes.length > 1
          ? "combined"
          : (activeSnapshotModes[0] ?? "markup"),
      summary: receiptSummary,
      preparedMarkupCount: autoDraftSnapshot?.preparedMarkupCount ?? 0,
      reviewItemCount: planSummary.approvedItems,
      routeCount: autoWireSnapshot?.routeCount ?? 0,
      affectedDrawingCount: planSummary.affectedDrawingCount,
      noteInsertCount: markupFamilyCounts["note-upsert"] ?? 0,
      revisionCloudUpsertCount:
        markupFamilyCounts["revision-cloud-upsert"] ?? 0,
      deltaNoteUpsertCount: markupFamilyCounts["delta-note-upsert"] ?? 0,
      issueTagUpsertCount: markupFamilyCounts["issue-tag-upsert"] ?? 0,
      titleBlockUpdateCount: markupFamilyCounts["title-block-update"] ?? 0,
      textReplacementCount: markupFamilyCounts["text-replace"] ?? 0,
      textDeleteCount: markupFamilyCounts["text-delete"] ?? 0,
      textSwapCount: markupFamilyCounts["text-swap"] ?? 0,
      dimensionOverrideCount: markupFamilyCounts["dimension-override"] ?? 0,
      terminalStripUpdateCount: autoWireSnapshot?.stripUpdateCount ?? 0,
      managedRouteUpsertCount:
        autoWireSnapshot?.routeUpsertCount ?? autoWireSnapshot?.routeCount ?? 0,
      markupSnapshotIds: autoDraftSnapshot?.markupSnapshotIds ?? [],
      terminalScheduleSnapshotId: autoWireSnapshot?.scheduleSnapshotId ?? null,
      reportId:
        autoWireSnapshot?.reportId ?? cadUtilitySnapshot?.reportId ?? null,
      cadUtilityChangedDrawingCount:
        cadUtilitySnapshot?.changedDrawingCount ?? 0,
      cadUtilityChangedItemCount: cadUtilitySnapshot?.changedItemCount ?? 0,
      requestId:
        autoDraftSnapshot?.requestId ??
        autoWireSnapshot?.requestId ??
        cadUtilitySnapshot?.requestId ??
        null,
      drawingName:
        autoWireSnapshot?.drawingName ??
        (cadUtilitySnapshot?.drawings.length === 1
          ? (cadUtilitySnapshot.drawings[0]?.drawingName ?? null)
          : null),
    });
    setRecordingReceipt(false);

    if (result.error) {
      showToast("error", result.error.message);
      return;
    }

    showToast("success", "Automation receipt recorded.");
    void refreshProjectContext();
    startTransition(() => {
      setActiveTab("commit");
    });
  };

  const stage = STAGE_COPY[activeTab];
  const studioTrustState =
    queueItems.length === 0
      ? "background"
      : queueItems.some((item) => item.status === "warning")
        ? "needs-attention"
        : queueItems.some((item) => item.status === "needs-review")
          ? "background"
          : "ready";

  return (
    <PageFrame maxWidth="full">
      <div className={styles.root}>
        <PageContextBand
          mode="hero"
          eyebrow="Automation Studio"
          summary={
            <div className={styles.heroCopy}>
              <p className={styles.heroTitle}>
                One developer-only review bench for markup intent, terminal
                authoring, issue-set CAD cleanup, and package-scoped automation
                receipts.
              </p>
              <p className={styles.heroDetail}>
                Keep AutoDraft as the markup engine and AutoWire as the terminal
                engine for issue-set schedule authoring, add project-aware CAD
                utilities for drawing text cleanup, and drive all three from the
                same project and issue-set context.
              </p>
            </div>
          }
          meta={
            <div className={styles.heroMeta}>
              <TrustStateBadge
                state={studioTrustState}
                label={
                  queueItems.length === 0
                    ? "Waiting for intake"
                    : `${queueItems.length} queued item${
                        queueItems.length === 1 ? "" : "s"
                      }`
                }
              />
              {selectedIssueSet ? (
                <Badge variant="soft" color="warning">
                  {selectedIssueSet.issueTag}
                </Badge>
              ) : (
                <Badge variant="outline" color="default">
                  No issue set selected
                </Badge>
              )}
              <Badge variant="soft" color="default">
                {workbenchMode === "markup"
                  ? "Markup focus"
                  : workbenchMode === "wiring"
                    ? "Wiring focus"
                    : "CAD utilities focus"}
              </Badge>
            </div>
          }
          actions={
            <div className={styles.heroActions}>
              <Link to={autoDraftHref} className={styles.inlineAction}>
                <span>Open AutoDraft Studio</span>
                <ArrowUpRight className={styles.inlineActionIcon} />
              </Link>
              <Link to={autoWireHref} className={styles.inlineActionSecondary}>
                <span>Open AutoWire</span>
                <ArrowUpRight className={styles.inlineActionIcon} />
              </Link>
              <Link
                to={batchFindReplaceHref}
                className={styles.inlineActionSecondary}
              >
                <span>Open standalone CAD cleanup</span>
                <ArrowUpRight className={styles.inlineActionIcon} />
              </Link>
              <Button
                variant="outline"
                size="sm"
                iconLeft={<RefreshCw size={14} />}
                onClick={() => void refreshProjectContext()}
                loading={loadingContext}
              >
                Refresh context
              </Button>
            </div>
          }
        >
          <div className={styles.signalStrip}>
            <div className={styles.signal}>
              <span className={styles.signalLabel}>Project</span>
              <strong className={styles.signalValue}>
                {selectedProject?.name || "Choose project"}
              </strong>
            </div>
            <div className={styles.signal}>
              <span className={styles.signalLabel}>Issue set</span>
              <strong className={styles.signalValue}>
                {selectedIssueSet?.issueTag || "Optional"}
              </strong>
            </div>
            <div className={styles.signal}>
              <span className={styles.signalLabel}>Register rows</span>
              <strong className={styles.signalValue}>
                {selectedRegisterRows.length}
              </strong>
            </div>
            <div className={styles.signal}>
              <span className={styles.signalLabel}>Latest receipt</span>
              <strong className={styles.signalValue}>
                {latestReceipt
                  ? new Date(latestReceipt.createdAt).toLocaleString()
                  : "None"}
              </strong>
            </div>
          </div>
          <ProjectWorkflowLinks
            links={workflowLinks}
            label="Package workflow"
          />
        </PageContextBand>

        <Section
          title="Combined workbench"
          description="Choose the package context, review the combined queue, and keep specialist flows under one restrained developer bench."
        >
          <div className={styles.workbench}>
            <Panel variant="support" padding="lg" className={styles.leftRail}>
              <div className={styles.railSection}>
                <span className={styles.sectionEyebrow}>Context</span>
                <label className={styles.field}>
                  <span>Project</span>
                  <select
                    value={selectedProjectId}
                    onChange={(event) =>
                      startTransition(() =>
                        setSelectedProjectId(event.target.value),
                      )
                    }
                    disabled={loadingProjects}
                  >
                    <option value="">Select project</option>
                    {projectOptions.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Issue set</span>
                  <select
                    value={selectedIssueSetId}
                    onChange={(event) =>
                      startTransition(() =>
                        setSelectedIssueSetId(event.target.value),
                      )
                    }
                    disabled={!selectedProjectId || loadingContext}
                  >
                    <option value="">No issue set selected</option>
                    {issueSets.map((issueSet) => (
                      <option key={issueSet.id} value={issueSet.id}>
                        {issueSet.issueTag} • {issueSet.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.metaBlock}>
                  <span className={styles.sectionEyebrow}>Package scope</span>
                  <strong className={styles.metaTitle}>
                    {studioContext.issueSetLabel ||
                      "Project-wide automation pass"}
                  </strong>
                  <p className={styles.metaDetail}>
                    {selectedIssueSet
                      ? `${selectedIssueSet.selectedDrawingPaths.length} selected drawing${selectedIssueSet.selectedDrawingPaths.length === 1 ? "" : "s"} and ${selectedRegisterRows.length} register row${selectedRegisterRows.length === 1 ? "" : "s"} will anchor the combined plan.`
                      : "Pick an issue set when you want the automation receipt and follow-up work tied to a package snapshot."}
                  </p>
                </div>
              </div>

              <div className={styles.railSection}>
                <span className={styles.sectionEyebrow}>Focus</span>
                <div className={styles.modeTabs}>
                  <button
                    type="button"
                    className={
                      workbenchMode === "markup"
                        ? styles.modeTabActive
                        : styles.modeTab
                    }
                    onClick={() => setWorkbenchMode("markup")}
                  >
                    <Wand2 className={styles.modeIcon} />
                    <span>Markup bench</span>
                  </button>
                  <button
                    type="button"
                    className={
                      workbenchMode === "wiring"
                        ? styles.modeTabActive
                        : styles.modeTab
                    }
                    onClick={() => setWorkbenchMode("wiring")}
                  >
                    <CircuitBoard className={styles.modeIcon} />
                    <span>Wiring bench</span>
                  </button>
                  <button
                    type="button"
                    className={
                      workbenchMode === "cad-utils"
                        ? styles.modeTabActive
                        : styles.modeTab
                    }
                    onClick={() => setWorkbenchMode("cad-utils")}
                  >
                    <FileBadge2 className={styles.modeIcon} />
                    <span>CAD utilities</span>
                  </button>
                </div>
                <p className={styles.metaDetail}>
                  {workbenchMode === "markup"
                    ? "Load the marked PDF in the center canvas, classify markup intent, and bind the resulting queue back to package scope."
                    : workbenchMode === "wiring"
                      ? "Run the terminal strip scan, route preview, and CAD diagnostics here while keeping the same project and issue-set context."
                      : "Preview and approve text or block cleanup across the selected issue-set drawings, with watchdog context and drawing-level queue control."}
                </p>
              </div>

              <div className={styles.railSection}>
                <span className={styles.sectionEyebrow}>Stage</span>
                <div className={styles.stageList}>
                  {(
                    [
                      "intake",
                      "review",
                      "plan",
                      "preview",
                      "commit",
                    ] as AutomationStudioTab[]
                  ).map((tab) => (
                    <button
                      type="button"
                      key={tab}
                      className={
                        activeTab === tab
                          ? styles.stageTabActive
                          : styles.stageTab
                      }
                      onClick={() => setActiveTab(tab)}
                    >
                      <span>{STAGE_COPY[tab].eyebrow}</span>
                      <strong>{STAGE_COPY[tab].title}</strong>
                    </button>
                  ))}
                </div>
              </div>

              {messages.length > 0 ? (
                <div className={styles.railSection}>
                  <span className={styles.sectionEyebrow}>Context notes</span>
                  <div className={styles.noteList}>
                    {messages.map((message) => (
                      <p key={message} className={styles.noteItem}>
                        {message}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </Panel>

            <div className={styles.centerStack}>
              <Panel
                variant="feature"
                padding="lg"
                className={styles.canvasHeader}
              >
                <div className={styles.canvasTitleRow}>
                  <div>
                    <p className={styles.sectionEyebrow}>{stage.eyebrow}</p>
                    <h3 className={styles.canvasTitle}>{stage.title}</h3>
                  </div>
                  <Badge variant="soft" color={benchTone}>
                    {benchLabel}
                  </Badge>
                </div>
                <p className={styles.canvasDetail}>{stage.detail}</p>
              </Panel>

              <Panel
                variant="glass"
                padding="lg"
                className={styles.canvasSurface}
              >
                {workbenchMode === "markup" ? (
                  <AutoDraftComparePanel
                    onAutomationSnapshotChange={setAutoDraftSnapshot}
                    projectId={studioContext.projectId}
                    issueSetId={studioContext.issueSetId}
                    selectedDrawingPaths={studioContext.selectedDrawingPaths}
                  />
                ) : workbenchMode === "wiring" ? (
                  <TerminalAuthoringPanel
                    studioContext={studioContext}
                    selectedIssueSet={selectedIssueSet}
                    approvedItemIds={approvedItemIds}
                    onQueueItemApprovalChange={handleQueueItemApprovalChange}
                    onAutomationSnapshotChange={setAutoWireSnapshot}
                    onProjectContextRefresh={refreshProjectContext}
                  />
                ) : (
                  <CadUtilitiesPanel
                    studioContext={studioContext}
                    approvedItemIds={approvedItemIds}
                    onQueueItemApprovalChange={handleQueueItemApprovalChange}
                    onAutomationSnapshotChange={setCadUtilitySnapshot}
                    onProjectContextRefresh={refreshProjectContext}
                  />
                )}
              </Panel>
            </div>

            <Panel variant="support" padding="lg" className={styles.rightRail}>
              <div className={styles.railHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Unified review queue</p>
                  <h3 className={styles.railTitle}>
                    {queueItems.length === 0
                      ? "No queued automation items yet"
                      : `${queueItems.length} queued item${
                          queueItems.length === 1 ? "" : "s"
                        }`}
                  </h3>
                </div>
                <Badge variant="outline" color="default">
                  {planSummary.approvedItems} approved
                </Badge>
              </div>
              <p className={styles.railDetail}>
                Adjust binding targets and inclusion here so AutoDraft and
                project wiring authoring feed one combined plan instead of two
                separate lab queues.
              </p>
              <div className={styles.queueList}>
                {queueItems.length === 0 ? (
                  <div className={styles.emptyQueue}>
                    Load a marked PDF or terminal scan to populate the combined
                    queue.
                  </div>
                ) : (
                  queueItems.map((item) => (
                    <div key={item.id} className={styles.queueItem}>
                      <div className={styles.queueItemHeader}>
                        <div className={styles.queueItemIdentity}>
                          <Badge
                            variant="soft"
                            color={getQueueSourceMeta(item.source).color}
                          >
                            {getQueueSourceMeta(item.source).label}
                          </Badge>
                          <Badge
                            variant="outline"
                            color={getQueueTone(item.status)}
                          >
                            {item.status === "needs-review"
                              ? "Needs review"
                              : item.status === "warning"
                                ? "Warning"
                                : "Planned"}
                          </Badge>
                        </div>
                        <label className={styles.queueToggle}>
                          <input
                            type="checkbox"
                            checked={approvedItemIds.includes(item.id)}
                            onChange={(event) =>
                              handleQueueItemApprovalChange(
                                item.id,
                                event.target.checked,
                              )
                            }
                          />
                          <span>Include</span>
                        </label>
                      </div>
                      <strong className={styles.queueItemLabel}>
                        {item.label}
                      </strong>
                      <p className={styles.queueItemDetail}>{item.detail}</p>
                      <label className={styles.inlineField}>
                        <span>Binding</span>
                        <select
                          value={item.bindingKind}
                          onChange={(event) =>
                            setBindingOverrides((current) => ({
                              ...current,
                              [item.id]: event.target
                                .value as AutomationBindingKind,
                            }))
                          }
                        >
                          {BINDING_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {item.suggestedTarget ? (
                        <span className={styles.queueTarget}>
                          Suggested target: {item.suggestedTarget}
                        </span>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <div className={styles.bottomDock}>
              <Panel variant="inset" padding="lg" className={styles.dockPanel}>
                <div className={styles.dockHeader}>
                  <FilePenLine className={styles.dockIcon} />
                  <div>
                    <p className={styles.sectionEyebrow}>Plan summary</p>
                    <h3 className={styles.dockTitle}>Combined plan</h3>
                  </div>
                </div>
                <p className={styles.dockDetail}>
                  {planSummary.approvedItems > 0
                    ? `${planSummary.approvedItems} approved item${
                        planSummary.approvedItems === 1 ? "" : "s"
                      } across ${planSummary.affectedDrawingCount} drawing${
                        planSummary.affectedDrawingCount === 1 ? "" : "s"
                      }.`
                    : "Approve queue items to build the combined plan."}
                </p>
                <div className={styles.factList}>
                  <span>Title blocks {planSummary.titleBlockCount}</span>
                  <span>Drawing rows {planSummary.drawingRowCount}</span>
                  <span>
                    Deliverable rows {planSummary.deliverableRowCount}
                  </span>
                  <span>Drawing content {planSummary.drawingContentCount}</span>
                  <span>
                    Terminal / wiring {planSummary.terminalWiringCount}
                  </span>
                  <span>Schedules {planSummary.scheduleCount}</span>
                  <span>Notes {planSummary.noteOnlyCount}</span>
                </div>
              </Panel>

              <Panel variant="inset" padding="lg" className={styles.dockPanel}>
                <div className={styles.dockHeader}>
                  <Route className={styles.dockIcon} />
                  <div>
                    <p className={styles.sectionEyebrow}>Specialist state</p>
                    <h3 className={styles.dockTitle}>Bench status</h3>
                  </div>
                </div>
                <p className={styles.dockDetail}>{specialistSummary}</p>
                <div className={styles.factList}>
                  {autoDraftSnapshot ? (
                    <>
                      <span>
                        Markups {autoDraftSnapshot.preparedMarkupCount}
                      </span>
                      <span>
                        Markup review {autoDraftSnapshot.markupReviewCount}
                      </span>
                      <span>
                        Text review {autoDraftSnapshot.replacementReviewCount}
                      </span>
                    </>
                  ) : null}
                  {autoWireSnapshot ? (
                    <>
                      <span>Terminals {autoWireSnapshot.terminalCount}</span>
                      <span>
                        Schedule rows {autoWireSnapshot.scheduleRowCount ?? 0}
                      </span>
                      <span>
                        Strip writes {autoWireSnapshot.stripUpdateCount ?? 0}
                      </span>
                      <span>
                        Route upserts {autoWireSnapshot.routeUpsertCount ?? 0}
                      </span>
                      <span>
                        Changed drawings{" "}
                        {autoWireSnapshot.changedDrawingCount ?? 0}
                      </span>
                    </>
                  ) : null}
                  {cadUtilitySnapshot ? (
                    <>
                      <span>
                        Preview matches {cadUtilitySnapshot.matchCount}
                      </span>
                      <span>
                        Selected {cadUtilitySnapshot.selectedMatchCount}
                      </span>
                      <span>
                        Changed drawings{" "}
                        {cadUtilitySnapshot.changedDrawingCount}
                      </span>
                      <span>
                        Changed items {cadUtilitySnapshot.changedItemCount}
                      </span>
                    </>
                  ) : null}
                </div>
              </Panel>

              <Panel variant="inset" padding="lg" className={styles.dockPanel}>
                <div className={styles.dockHeader}>
                  <CheckCircle2 className={styles.dockIcon} />
                  <div>
                    <p className={styles.sectionEyebrow}>Receipt</p>
                    <h3 className={styles.dockTitle}>Issue-set checkpoint</h3>
                  </div>
                </div>
                <p className={styles.dockDetail}>{receiptSummary}</p>
                {latestReceipt ? (
                  <div className={styles.receiptMeta}>
                    <span>
                      Last receipt{" "}
                      {new Date(latestReceipt.createdAt).toLocaleString()}
                    </span>
                    <span>{latestReceipt.mode} mode</span>
                  </div>
                ) : null}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRecordReceipt}
                  disabled={!studioContext.projectId}
                  loading={recordingReceipt}
                >
                  Record automation receipt
                </Button>
              </Panel>

              <Panel variant="inset" padding="lg" className={styles.dockPanel}>
                <div className={styles.dockHeader}>
                  <FileBadge2 className={styles.dockIcon} />
                  <div>
                    <p className={styles.sectionEyebrow}>Next step</p>
                    <h3 className={styles.dockTitle}>Back to package flow</h3>
                  </div>
                </div>
                <p className={styles.dockDetail}>
                  Keep execution human-in-the-loop. Use the issue set and
                  transmittal flow after you capture the combined receipt.
                </p>
                <div className={styles.actionGroup}>
                  {workflowLinks.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className={styles.inlineAction}
                    >
                      <span>{link.label}</span>
                      <ArrowUpRight className={styles.inlineActionIcon} />
                    </Link>
                  ))}
                </div>
              </Panel>
            </div>

            <div className={styles.recipeRow}>
              <AutomationRecipePanel
                studioContext={studioContext}
                selectedIssueSet={selectedIssueSet}
                autoDraftSnapshot={autoDraftSnapshot}
                autoWireSnapshot={autoWireSnapshot}
                cadUtilitySnapshot={cadUtilitySnapshot}
                approvedItemIds={approvedItemIds}
                onProjectContextRefresh={refreshProjectContext}
              />
            </div>
          </div>
        </Section>
      </div>
    </PageFrame>
  );
}
