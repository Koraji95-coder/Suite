import {
  AlertTriangle,
  BookCopy,
  CheckCircle2,
  Download,
  FileCog,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { projectAutomationReceiptService } from "@/services/projectAutomationReceiptService";
import {
  projectAutomationRecipeService,
  type ProjectAutomationRecipeRecord,
  type ProjectAutomationRecipeRequest,
  type ProjectAutomationRunRecord,
  type ProjectAutomationWorkPackageRecord,
} from "@/services/projectAutomationRecipeService";
import { projectCadWritePassService } from "@/services/projectCadWritePassService";
import {
  projectIssueSetService,
  type ProjectIssueSetRecord,
} from "@/features/project-workflow/issueSetService";
import {
  projectMarkupSnapshotService,
  type ProjectMarkupSnapshotRecord,
} from "@/services/projectMarkupSnapshotService";
import type {
  AutoDraftAutomationSnapshot,
  AutomationStudioContext,
  AutoWireAutomationSnapshot,
  CadUtilityAutomationSnapshot,
} from "@/features/automation-studio";
import styles from "./AutomationRecipePanel.module.css";

function createLocalId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildRecipeMode(args: {
  autoDraftEnabled: boolean;
  autoWireEnabled: boolean;
  cadUtilsEnabled: boolean;
}) {
  const enabledCount = [
    args.autoDraftEnabled,
    args.autoWireEnabled,
    args.cadUtilsEnabled,
  ].filter(Boolean).length;
  if (enabledCount > 1) {
    return "combined" as const;
  }
  if (args.autoWireEnabled) {
    return "wiring" as const;
  }
  if (args.cadUtilsEnabled) {
    return "cad-utils" as const;
  }
  return "markup" as const;
}

function normalizePathKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMarkupSnapshotOperations(snapshot: ProjectMarkupSnapshotRecord) {
  const comparePayload = isRecord(snapshot.comparePayload)
    ? snapshot.comparePayload
    : {};
  const previewOperations = Array.isArray(comparePayload.preview_operations)
    ? comparePayload.preview_operations
    : Array.isArray(comparePayload.previewOperations)
      ? comparePayload.previewOperations
      : [];
  return previewOperations.filter(isRecord);
}

function summarizeMarkupSnapshots(snapshots: ProjectMarkupSnapshotRecord[]) {
  if (snapshots.length === 0) {
    return "Publish a reviewed Bluebeam page bundle to project scope before this step can write to AutoCAD.";
  }
  const operationCount = snapshots.reduce(
    (total, snapshot) => total + readMarkupSnapshotOperations(snapshot).length,
    0,
  );
  const drawingCount = new Set(
    snapshots
      .map((snapshot) => normalizePathKey(snapshot.drawingPath))
      .filter(Boolean),
  ).size;
  return `${snapshots.length} saved Bluebeam snapshot${
    snapshots.length === 1 ? "" : "s"
  } across ${drawingCount} drawing${
    drawingCount === 1 ? "" : "s"
  } with ${operationCount} preview operation${
    operationCount === 1 ? "" : "s"
  }.`;
}

interface AutomationRecipePanelProps {
  studioContext: AutomationStudioContext;
  selectedIssueSet: ProjectIssueSetRecord | null;
  autoDraftSnapshot: AutoDraftAutomationSnapshot | null;
  autoWireSnapshot: AutoWireAutomationSnapshot | null;
  cadUtilitySnapshot: CadUtilityAutomationSnapshot | null;
  approvedItemIds: string[];
  onProjectContextRefresh?: () => Promise<void> | void;
}

export function AutomationRecipePanel({
  studioContext,
  selectedIssueSet,
  autoDraftSnapshot,
  autoWireSnapshot,
  cadUtilitySnapshot,
  onProjectContextRefresh,
}: AutomationRecipePanelProps) {
  const { showToast } = useToast();
  const [simulateOnCopy, setSimulateOnCopy] = useState(true);
  const [workPackageId, setWorkPackageId] = useState<string>(() =>
    createLocalId("work-package"),
  );
  const [recipeId, setRecipeId] = useState<string>(() =>
    createLocalId("recipe"),
  );
  const [enabledSources, setEnabledSources] = useState({
    autodraft: false,
    autowire: false,
    cadUtils: false,
  });
  const [markupSnapshots, setMarkupSnapshots] = useState<
    ProjectMarkupSnapshotRecord[]
  >([]);
  const [selectedMarkupSnapshotIds, setSelectedMarkupSnapshotIds] = useState<
    string[]
  >([]);
  const [loadingMarkupSnapshots, setLoadingMarkupSnapshots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningPreflight, setRunningPreflight] = useState(false);
  const [runningPreview, setRunningPreview] = useState(false);
  const [runningAcade, setRunningAcade] = useState(false);
  const [applying, setApplying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [preflightResult, setPreflightResult] = useState<Awaited<
    ReturnType<typeof projectAutomationRecipeService.preflightProjectScope>
  > | null>(null);
  const [previewResult, setPreviewResult] = useState<Awaited<
    ReturnType<typeof projectAutomationRecipeService.previewRecipe>
  > | null>(null);
  const [runRecord, setRunRecord] = useState<ProjectAutomationRunRecord | null>(
    null,
  );
  const [acadeResult, setAcadeResult] = useState<Awaited<
    ReturnType<typeof projectAutomationRecipeService.reconcileAcadeProjectScope>
  > | null>(null);

  useEffect(() => {
    setWorkPackageId(
      selectedIssueSet?.workPackageId || createLocalId("work-package"),
    );
    setRecipeId(selectedIssueSet?.recipeSnapshotId || createLocalId("recipe"));
  }, [
    selectedIssueSet?.id,
    selectedIssueSet?.recipeSnapshotId,
    selectedIssueSet?.workPackageId,
  ]);

  useEffect(() => {
    setEnabledSources((current) => ({
      autodraft:
        current.autodraft ||
        Boolean(autoDraftSnapshot?.markupSnapshotIds?.length) ||
        Boolean(autoDraftSnapshot?.publishedSnapshots?.length),
      autowire:
        current.autowire ||
        Boolean(
          autoWireSnapshot?.scheduleSnapshotId &&
          (autoWireSnapshot?.stripRows?.length ?? 0) > 0,
        ),
      cadUtils:
        current.cadUtils ||
        Boolean(
          cadUtilitySnapshot?.rules?.some(
            (rule) => rule.find.trim().length > 0,
          ),
        ),
    }));
  }, [
    autoDraftSnapshot?.queueItems.length,
    autoWireSnapshot?.scheduleSnapshotId,
    autoWireSnapshot?.stripRows,
    cadUtilitySnapshot?.rules,
  ]);

  useEffect(() => {
    let cancelled = false;
    const projectId = studioContext.projectId;
    if (!projectId) {
      setMarkupSnapshots([]);
      setSelectedMarkupSnapshotIds([]);
      return;
    }

    void (async () => {
      setLoadingMarkupSnapshots(true);
      const result =
        await projectMarkupSnapshotService.fetchSnapshots(projectId);
      if (cancelled) {
        return;
      }
      if (result.error) {
        showToast("warning", result.error.message);
      }
      setMarkupSnapshots(result.data);
      setLoadingMarkupSnapshots(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [showToast, studioContext.projectId]);

  const availableMarkupSnapshots = useMemo(() => {
    const selectedDrawingKeys = new Set(
      (studioContext.selectedDrawingPaths ?? []).map((value) =>
        normalizePathKey(value),
      ),
    );
    const merged = new Map<string, ProjectMarkupSnapshotRecord>();
    for (const snapshot of [
      ...markupSnapshots,
      ...(autoDraftSnapshot?.publishedSnapshots ?? []),
    ]) {
      if (!snapshot?.id) {
        continue;
      }
      const snapshotIssueSetId = snapshot.issueSetId;
      if (
        snapshotIssueSetId &&
        selectedIssueSet?.id &&
        snapshotIssueSetId !== selectedIssueSet.id
      ) {
        continue;
      }
      if (
        selectedDrawingKeys.size > 0 &&
        !selectedDrawingKeys.has(normalizePathKey(snapshot.drawingPath))
      ) {
        continue;
      }
      merged.set(snapshot.id, snapshot);
    }
    return [...merged.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }, [
    autoDraftSnapshot?.publishedSnapshots,
    markupSnapshots,
    selectedIssueSet?.id,
    studioContext.selectedDrawingPaths,
  ]);

  useEffect(() => {
    setSelectedMarkupSnapshotIds((current) => {
      const availableIds = new Set(
        availableMarkupSnapshots.map((snapshot) => snapshot.id),
      );
      const retained = current.filter((id) => availableIds.has(id));
      if (retained.length > 0) {
        return retained;
      }
      const latestPerDrawing = new Map<string, string>();
      for (const snapshot of availableMarkupSnapshots) {
        const key = normalizePathKey(snapshot.drawingPath) || snapshot.id;
        if (!latestPerDrawing.has(key)) {
          latestPerDrawing.set(key, snapshot.id);
        }
      }
      return [...latestPerDrawing.values()];
    });
  }, [availableMarkupSnapshots]);

  const selectedMarkupSnapshots = useMemo(
    () =>
      availableMarkupSnapshots.filter((snapshot) =>
        selectedMarkupSnapshotIds.includes(snapshot.id),
      ),
    [availableMarkupSnapshots, selectedMarkupSnapshotIds],
  );

  const draftWorkPackage = useMemo<ProjectAutomationWorkPackageRecord>(() => {
    const warningCount =
      (selectedIssueSet?.snapshot?.titleBlockReviewCount ?? 0) +
      (selectedIssueSet?.snapshot?.standardsReviewCount ?? 0) +
      (selectedIssueSet?.snapshot?.setupBlockerCount ?? 0);
    return {
      id: workPackageId,
      projectId: studioContext.projectId || "",
      issueSetId: studioContext.issueSetId,
      issueSetLabel: studioContext.issueSetLabel,
      registerSnapshotId: studioContext.registerSnapshotId,
      terminalScheduleSnapshotId: autoWireSnapshot?.scheduleSnapshotId ?? null,
      selectedDrawingPaths: studioContext.selectedDrawingPaths ?? [],
      drawingRootPath: studioContext.drawingRootPath,
      projectRootPath: studioContext.watchdogRootPath,
      pdfPackageRootPath: studioContext.pdfPackageRootPath,
      titleBlockSnapshotStatus: warningCount > 0 ? "needs-review" : "ready",
      titleBlockWarningCount: warningCount,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      warnings: [
        ...(autoDraftSnapshot?.warnings ?? []),
        ...selectedMarkupSnapshots.flatMap(
          (snapshot) => snapshot.warnings ?? [],
        ),
        ...(autoWireSnapshot?.warnings ?? []),
        ...(cadUtilitySnapshot?.warnings ?? []),
      ],
    };
  }, [
    autoDraftSnapshot?.warnings,
    autoWireSnapshot?.scheduleSnapshotId,
    autoWireSnapshot?.warnings,
    cadUtilitySnapshot?.warnings,
    selectedIssueSet?.snapshot?.setupBlockerCount,
    selectedIssueSet?.snapshot?.standardsReviewCount,
    selectedIssueSet?.snapshot?.titleBlockReviewCount,
    selectedMarkupSnapshots,
    studioContext,
    workPackageId,
  ]);

  const draftRecipe = useMemo<ProjectAutomationRecipeRecord>(() => {
    const autoDraftPlanned = selectedMarkupSnapshots.reduce(
      (total, snapshot) =>
        total + readMarkupSnapshotOperations(snapshot).length,
      0,
    );
    const autoDraftApproved = selectedMarkupSnapshots.reduce(
      (total, snapshot) =>
        total +
        readMarkupSnapshotOperations(snapshot).filter((operation) =>
          snapshot.selectedOperationIds.includes(String(operation.id ?? "")),
        ).length,
      0,
    );
    const autoDraftWarnings =
      (autoDraftSnapshot?.warnings?.length ?? 0) +
      selectedMarkupSnapshots.reduce(
        (total, snapshot) => total + (snapshot.warnings?.length ?? 0),
        0,
      );
    const autoWirePlanned = autoWireSnapshot?.previewOperations?.length ?? 0;
    const autoWireApproved =
      autoWireSnapshot?.selectedOperationIds?.length ?? 0;
    const cadUtilsPlanned = cadUtilitySnapshot?.matchCount ?? 0;
    const cadUtilsApproved =
      cadUtilitySnapshot?.selectedPreviewKeys?.length ?? 0;
    return {
      id: recipeId,
      projectId: studioContext.projectId || "",
      issueSetId: studioContext.issueSetId,
      workPackageId,
      name: studioContext.issueSetLabel
        ? `${studioContext.issueSetLabel} offline package run`
        : "Offline package run",
      simulateOnCopy,
      steps: [
        {
          id: "autodraft-step",
          source: "autodraft",
          label: "Bluebeam markup authoring",
          enabled: enabledSources.autodraft,
          ready: selectedMarkupSnapshots.length > 0 && autoDraftPlanned > 0,
          actionable:
            selectedMarkupSnapshots.length > 0 && autoDraftPlanned > 0,
          plannedItemCount: autoDraftPlanned,
          approvedItemCount: autoDraftApproved,
          warningCount: autoDraftWarnings,
          bindingKinds: [
            "title-block",
            "drawing-row",
            "deliverable-row",
            "note-only",
          ],
          summary: summarizeMarkupSnapshots(selectedMarkupSnapshots),
          requestId: autoDraftSnapshot?.requestId ?? null,
          reportId: null,
        },
        {
          id: "autowire-step",
          source: "autowire",
          label: "Wiring authoring",
          enabled: enabledSources.autowire,
          ready:
            Boolean(autoWireSnapshot?.scheduleSnapshotId) &&
            (autoWireSnapshot?.stripRows?.length ?? 0) > 0,
          actionable: true,
          plannedItemCount: autoWirePlanned,
          approvedItemCount: autoWireApproved,
          warningCount: autoWireSnapshot?.warnings?.length ?? 0,
          bindingKinds: ["terminal-wiring", "schedule-row"],
          summary:
            autoWireSnapshot?.summary ||
            "Terminal authoring preview can be rerun and applied through the shared recipe.",
          requestId: autoWireSnapshot?.requestId ?? null,
          reportId: autoWireSnapshot?.reportId ?? null,
        },
        {
          id: "cad-utils-step",
          source: "cad-utils",
          label: "CAD utilities",
          enabled: enabledSources.cadUtils,
          ready:
            Boolean(
              cadUtilitySnapshot?.rules?.some(
                (rule) => rule.find.trim().length > 0,
              ),
            ) && (studioContext.selectedDrawingPaths?.length ?? 0) > 0,
          actionable: true,
          plannedItemCount: cadUtilsPlanned,
          approvedItemCount: cadUtilsApproved,
          warningCount: cadUtilitySnapshot?.warnings?.length ?? 0,
          bindingKinds: ["drawing-content"],
          summary:
            cadUtilitySnapshot?.summary ||
            "Project-aware CAD cleanup can be previewed and applied through the shared recipe.",
          requestId: cadUtilitySnapshot?.requestId ?? null,
          reportId: cadUtilitySnapshot?.reportId ?? null,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      warnings: [
        ...(autoDraftSnapshot?.warnings ?? []),
        ...(autoWireSnapshot?.warnings ?? []),
        ...(cadUtilitySnapshot?.warnings ?? []),
      ],
    };
  }, [
    autoDraftSnapshot,
    autoWireSnapshot,
    cadUtilitySnapshot,
    enabledSources.autodraft,
    enabledSources.autowire,
    enabledSources.cadUtils,
    recipeId,
    selectedMarkupSnapshots,
    simulateOnCopy,
    studioContext.issueSetId,
    studioContext.issueSetLabel,
    studioContext.projectId,
    studioContext.selectedDrawingPaths,
    workPackageId,
  ]);

  const draftRequest = useMemo<ProjectAutomationRecipeRequest>(
    () => ({
      workPackage: draftWorkPackage,
      recipe: draftRecipe,
      stepPayloads: {
        autodraft:
          selectedMarkupSnapshots.length > 0 || autoDraftSnapshot
            ? {
                requestId: autoDraftSnapshot?.requestId ?? null,
                queueItems: autoDraftSnapshot?.queueItems ?? [],
                markupSnapshotIds: selectedMarkupSnapshots.map(
                  (snapshot) => snapshot.id,
                ),
                markupSnapshots: selectedMarkupSnapshots,
                selectedActionIds: selectedMarkupSnapshots.flatMap(
                  (snapshot) => snapshot.selectedActionIds,
                ),
                selectedOperationIds: selectedMarkupSnapshots.flatMap(
                  (snapshot) => snapshot.selectedOperationIds,
                ),
              }
            : null,
        autowire: autoWireSnapshot
          ? {
              requestId: autoWireSnapshot.requestId ?? null,
              scheduleSnapshotId: autoWireSnapshot.scheduleSnapshotId ?? null,
              stripRows: autoWireSnapshot.stripRows ?? [],
              connectionRows: autoWireSnapshot.connectionRows ?? [],
              selectedOperationIds: autoWireSnapshot.selectedOperationIds ?? [],
            }
          : null,
        cadUtils: cadUtilitySnapshot
          ? {
              requestId: cadUtilitySnapshot.requestId ?? null,
              rules: cadUtilitySnapshot.rules ?? [],
              selectedPreviewKeys: cadUtilitySnapshot.selectedPreviewKeys ?? [],
              blockNameHint: cadUtilitySnapshot.blockNameHint ?? null,
            }
          : null,
      },
      operations: previewResult?.operations ?? [],
      runId: runRecord?.id ?? null,
    }),
    [
      autoDraftSnapshot,
      autoWireSnapshot,
      cadUtilitySnapshot,
      draftRecipe,
      draftWorkPackage,
      previewResult?.operations,
      runRecord?.id,
      selectedMarkupSnapshots,
    ],
  );

  const enabledStepCount = draftRecipe.steps.filter(
    (step) => step.enabled,
  ).length;
  const primaryArtifacts = runRecord?.verificationArtifacts ?? [];

  const persistIssueSetLinks = async (
    nextWorkPackageId: string | null,
    nextRecipeId: string | null,
  ) => {
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
        terminalScheduleSnapshotId: selectedIssueSet.terminalScheduleSnapshotId,
        workPackageId: nextWorkPackageId,
        recipeSnapshotId: nextRecipeId,
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
    } else if (onProjectContextRefresh) {
      await onProjectContextRefresh();
    }
  };

  const saveDraftPackage = async () => {
    if (!draftWorkPackage.projectId) {
      throw new Error("Project context is required.");
    }
    setSaving(true);
    try {
      const [workPackageResult, recipeResult] = await Promise.all([
        projectAutomationRecipeService.saveWorkPackage(draftWorkPackage),
        projectAutomationRecipeService.saveRecipe(draftRecipe),
      ]);
      if (workPackageResult.error) {
        throw workPackageResult.error;
      }
      if (recipeResult.error) {
        throw recipeResult.error;
      }
      const nextWorkPackageId =
        workPackageResult.data?.id ?? draftWorkPackage.id;
      const nextRecipeId = recipeResult.data?.id ?? draftRecipe.id;
      const nextWorkPackage = {
        ...(workPackageResult.data ?? draftWorkPackage),
        id: nextWorkPackageId,
      };
      const nextRecipe = {
        ...(recipeResult.data ?? draftRecipe),
        id: nextRecipeId,
        workPackageId: nextWorkPackageId,
      };
      setWorkPackageId(nextWorkPackageId);
      setRecipeId(nextRecipeId);
      await persistIssueSetLinks(nextWorkPackageId, nextRecipeId);
      showToast("success", "Offline work package and recipe saved.");
      return {
        workPackage: nextWorkPackage,
        recipe: nextRecipe,
      };
    } finally {
      setSaving(false);
    }
  };

  const runPreflight = async () => {
    try {
      setRunningPreflight(true);
      const saved = await saveDraftPackage();
      const result = await projectAutomationRecipeService.preflightProjectScope(
        {
          ...draftRequest,
          workPackage: saved.workPackage,
          recipe: saved.recipe,
        },
      );
      setPreflightResult(result);
      showToast(result.ok ? "success" : "warning", result.message);
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Preflight failed.",
      );
    } finally {
      setRunningPreflight(false);
    }
  };

  const runAcadeReconcile = async () => {
    try {
      setRunningAcade(true);
      const saved = await saveDraftPackage();
      const result =
        await projectAutomationRecipeService.reconcileAcadeProjectScope({
          ...draftRequest,
          workPackage: saved.workPackage,
          recipe: saved.recipe,
        });
      setAcadeResult(result);
      showToast(
        result.blockers.length === 0 ? "success" : "warning",
        result.message,
      );
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "ACADE reconcile failed.",
      );
    } finally {
      setRunningAcade(false);
    }
  };

  const runPreview = async () => {
    try {
      setRunningPreview(true);
      const saved = await saveDraftPackage();
      const result = await projectAutomationRecipeService.previewRecipe({
        ...draftRequest,
        workPackage: saved.workPackage,
        recipe: saved.recipe,
      });
      setPreviewResult(result);
      showToast(
        result.blockers.length === 0 ? "success" : "warning",
        result.message,
      );
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Recipe preview failed.",
      );
    } finally {
      setRunningPreview(false);
    }
  };

  const runApply = async () => {
    try {
      setApplying(true);
      const saved = await saveDraftPackage();
      const applyResult = await projectAutomationRecipeService.applyRecipe({
        ...draftRequest,
        workPackage: saved.workPackage,
        recipe: saved.recipe,
        operations: previewResult?.operations ?? [],
      });
      const nextRun: ProjectAutomationRunRecord = {
        id: applyResult.runId,
        projectId: saved.workPackage.projectId,
        issueSetId: saved.workPackage.issueSetId,
        workPackageId: saved.workPackage.id,
        recipeId: saved.recipe.id,
        status: "applied",
        requestId: applyResult.requestId,
        simulateOnCopy: saved.recipe.simulateOnCopy,
        changedDrawingCount: applyResult.changedDrawingCount,
        changedItemCount: applyResult.changedItemCount,
        reportId: applyResult.reportId,
        reportFilename: applyResult.reportFilename,
        downloadUrl: applyResult.downloadUrl,
        operations: applyResult.operations,
        warnings: applyResult.warnings,
        verificationArtifacts: applyResult.artifacts,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const runSaveResult =
        await projectAutomationRecipeService.saveRun(nextRun);
      if (runSaveResult.error) {
        showToast("warning", runSaveResult.error.message);
      }
      setRunRecord(runSaveResult.data ?? nextRun);

      const appliedMarkupOperations = applyResult.operations.filter(
        (entry) => entry.source === "autodraft",
      );
      if (appliedMarkupOperations.length > 0) {
        const passResult = await projectCadWritePassService.savePasses(
          appliedMarkupOperations.map((operation) => {
            const nativePayload = isRecord(operation.nativePayload)
              ? operation.nativePayload
              : {};
            const beforeJson = isRecord(nativePayload.before)
              ? nativePayload.before
              : operation.before
                ? { text: operation.before }
                : null;
            const afterJson = isRecord(nativePayload.after)
              ? nativePayload.after
              : operation.after
                ? { text: operation.after }
                : null;
            const artifactRefs =
              operation.artifactRefs?.map((artifactId) => ({
                id: artifactId,
              })) ?? [];
            return {
              projectId: saved.workPackage.projectId,
              runId: applyResult.runId,
              snapshotId:
                typeof nativePayload.markupSnapshotId === "string"
                  ? nativePayload.markupSnapshotId
                  : typeof nativePayload.snapshotId === "string"
                    ? nativePayload.snapshotId
                    : null,
              drawingPath: operation.drawingPath || "",
              writerKind: "autodraft",
              operationType: operation.operationType,
              managedKey:
                operation.managedKey?.value ??
                (typeof nativePayload.managedKey === "string"
                  ? nativePayload.managedKey
                  : null),
              handleRefs: operation.targetHandleRefs ?? [],
              beforeJson,
              afterJson,
              status: "applied",
              warnings: operation.warnings,
              artifactRefs,
            };
          }),
        );
        if (passResult.error) {
          showToast("warning", passResult.error.message);
        }
      }

      const markupFamilyCounts = appliedMarkupOperations.reduce(
        (counts, operation) => {
          const key = operation.operationType;
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        },
        {} as Record<string, number>,
      );

      const receiptResult = await projectAutomationReceiptService.saveReceipt({
        projectId: saved.workPackage.projectId,
        issueSetId: saved.workPackage.issueSetId,
        registerSnapshotId: saved.workPackage.registerSnapshotId,
        mode: buildRecipeMode({
          autoDraftEnabled: enabledSources.autodraft,
          autoWireEnabled: enabledSources.autowire,
          cadUtilsEnabled: enabledSources.cadUtils,
        }),
        summary: applyResult.message,
        reviewItemCount: applyResult.operations.filter(
          (entry) => entry.approved,
        ).length,
        affectedDrawingCount: applyResult.changedDrawingCount,
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
        managedRouteUpsertCount: autoWireSnapshot?.routeUpsertCount ?? 0,
        markupSnapshotIds: selectedMarkupSnapshots.map(
          (snapshot) => snapshot.id,
        ),
        terminalScheduleSnapshotId:
          saved.workPackage.terminalScheduleSnapshotId,
        cadUtilityChangedDrawingCount: enabledSources.cadUtils
          ? applyResult.changedDrawingCount
          : 0,
        cadUtilityChangedItemCount: enabledSources.cadUtils
          ? applyResult.changedItemCount
          : 0,
        reportId: applyResult.reportId,
        requestId: applyResult.requestId,
      });
      if (receiptResult.error) {
        showToast("warning", receiptResult.error.message);
      }
      showToast("success", applyResult.message);
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Recipe apply failed.",
      );
    } finally {
      setApplying(false);
    }
  };

  const runVerify = async () => {
    if (!runRecord) {
      return;
    }
    try {
      setVerifying(true);
      const result = await projectAutomationRecipeService.verifyRecipe({
        ...draftRequest,
        runId: runRecord.id,
      });
      const nextRun: ProjectAutomationRunRecord = {
        ...runRecord,
        status: result.verified ? "verified" : "failed",
        verificationArtifacts: result.artifacts,
        warnings: result.warnings,
        updatedAt: new Date().toISOString(),
      };
      const runSaveResult =
        await projectAutomationRecipeService.saveRun(nextRun);
      if (runSaveResult.error) {
        showToast("warning", runSaveResult.error.message);
      }
      setRunRecord(runSaveResult.data ?? nextRun);
      showToast(result.verified ? "success" : "warning", result.message);
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Recipe verify failed.",
      );
    } finally {
      setVerifying(false);
    }
  };

  const downloadPrimaryReport = async (
    reportId: string,
    filename?: string | null,
  ) => {
    try {
      await projectAutomationRecipeService.downloadCadReport(
        reportId,
        filename || undefined,
      );
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Unable to download report.",
      );
    }
  };

  if (!studioContext.projectId) {
    return (
      <Panel variant="support" padding="lg">
        <div className={styles.emptyState}>
          Select a project before building an offline automation recipe.
        </div>
      </Panel>
    );
  }

  if (!selectedIssueSet) {
    return (
      <Panel variant="support" padding="lg">
        <div className={styles.emptyState}>
          Select an issue set before building a shared offline work package. The
          recipe runner binds previews, snapshots, reports, and verification
          artifacts to that issue-set scope.
        </div>
      </Panel>
    );
  }

  return (
    <Panel variant="support" padding="lg">
      <div className={styles.root}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>Recipe Builder</p>
            <h3 className={styles.title}>
              Offline-first project automation spine
            </h3>
            <p className={styles.detail}>
              Bind the current issue-set context, specialist benches, and
              operator approvals into one saved work package. Preflight checks,
              preview, apply, and verification stay review-first, and new runs
              default to simulate-on-copy until you explicitly switch them to
              source drawings later.
            </p>
          </div>
          <div className={styles.toggleCard}>
            <div className={styles.toggleHeader}>
              <div className={styles.toggleTitle}>
                <PackageCheck size={16} />
                <strong>Safety mode</strong>
              </div>
              <Badge
                variant="soft"
                color={simulateOnCopy ? "success" : "warning"}
              >
                {simulateOnCopy ? "simulate-on-copy" : "source drawings"}
              </Badge>
            </div>
            <label className={styles.toggleControl}>
              <input
                type="checkbox"
                checked={simulateOnCopy}
                onChange={(event) => setSimulateOnCopy(event.target.checked)}
              />
              <span>Apply into a copied workspace by default</span>
            </label>
            <p className={styles.metaText}>
              Keep this enabled while the shared runner is absorbing more CAD
              write paths.
            </p>
          </div>
        </div>

        <div className={styles.stepList}>
          {draftRecipe.steps.map((step) => (
            <div key={step.id} className={styles.toggleCard}>
              <div className={styles.toggleHeader}>
                <div className={styles.toggleTitle}>
                  {step.source === "autodraft" ? (
                    <BookCopy size={16} />
                  ) : step.source === "autowire" ? (
                    <FileCog size={16} />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  <strong>{step.label}</strong>
                </div>
                <Badge
                  variant="soft"
                  color={
                    step.ready
                      ? step.actionable
                        ? "success"
                        : "warning"
                      : "default"
                  }
                >
                  {step.ready
                    ? step.actionable
                      ? "ready"
                      : "planning only"
                    : "missing input"}
                </Badge>
              </div>
              <label className={styles.toggleControl}>
                <input
                  type="checkbox"
                  checked={
                    step.source === "autodraft"
                      ? enabledSources.autodraft
                      : step.source === "autowire"
                        ? enabledSources.autowire
                        : enabledSources.cadUtils
                  }
                  onChange={(event) =>
                    setEnabledSources((current) => ({
                      ...current,
                      [step.source === "cad-utils" ? "cadUtils" : step.source]:
                        event.target.checked,
                    }))
                  }
                />
                <span>Include this step in the shared recipe</span>
              </label>
              <p className={styles.metaText}>{step.summary}</p>
              <div className={styles.metaList}>
                <span className={styles.metaChip}>
                  planned {step.plannedItemCount}
                </span>
                <span className={styles.metaChip}>
                  approved {step.approvedItemCount}
                </span>
                <span className={styles.metaChip}>
                  warnings {step.warningCount}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.toggleCard}>
          <div className={styles.toggleHeader}>
            <div className={styles.toggleTitle}>
              <BookCopy size={16} />
              <strong>Saved Bluebeam snapshots</strong>
            </div>
            <Badge
              variant="soft"
              color={selectedMarkupSnapshots.length > 0 ? "success" : "warning"}
            >
              {selectedMarkupSnapshots.length} selected
            </Badge>
          </div>
          <p className={styles.metaText}>
            Use reviewed Bluebeam page bundles already published to the project.
            Only snapshots bound to the selected issue-set drawings are eligible
            here.
          </p>
          {loadingMarkupSnapshots ? (
            <p className={styles.metaText}>Loading markup snapshots...</p>
          ) : availableMarkupSnapshots.length === 0 ? (
            <p className={styles.metaText}>
              No published markup snapshots are available for the selected
              issue-set drawing scope yet.
            </p>
          ) : (
            <div className={styles.stepList}>
              {availableMarkupSnapshots.map((snapshot) => {
                const operationCount =
                  readMarkupSnapshotOperations(snapshot).length;
                const checked = selectedMarkupSnapshotIds.includes(snapshot.id);
                return (
                  <label key={snapshot.id} className={styles.toggleControl}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setSelectedMarkupSnapshotIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, snapshot.id])]
                            : current.filter((id) => id !== snapshot.id),
                        )
                      }
                    />
                    <span>
                      {snapshot.drawingName || snapshot.drawingPath}
                      {" / "}page {snapshot.pageIndex + 1}
                      {" / "}
                      {operationCount} op
                      {operationCount === 1 ? "" : "s"}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.toolbar}>
          <Button
            variant="outline"
            size="sm"
            iconLeft={<BookCopy size={14} />}
            onClick={() => void saveDraftPackage()}
            disabled={enabledStepCount === 0}
            loading={saving}
          >
            Save package
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconLeft={<ShieldCheck size={14} />}
            onClick={() => void runPreflight()}
            disabled={enabledStepCount === 0}
            loading={runningPreflight}
          >
            Run preflight
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconLeft={<FileCog size={14} />}
            onClick={() => void runAcadeReconcile()}
            disabled={enabledStepCount === 0}
            loading={runningAcade}
          >
            Reconcile ACADE
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconLeft={<PackageCheck size={14} />}
            onClick={() => void runPreview()}
            disabled={enabledStepCount === 0}
            loading={runningPreview}
          >
            Preview recipe
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<CheckCircle2 size={14} />}
            onClick={() => void runApply()}
            disabled={(previewResult?.operations.length ?? 0) === 0}
            loading={applying}
          >
            Apply recipe
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<CheckCircle2 size={14} />}
            onClick={() => void runVerify()}
            disabled={!runRecord}
            loading={verifying}
          >
            Verify run
          </Button>
        </div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
              <strong>Work package</strong>
              <Badge variant="outline" color="default">
                {draftWorkPackage.selectedDrawingPaths.length} drawings
              </Badge>
            </div>
            <p className={styles.metaText}>
              {draftWorkPackage.issueSetLabel || "Project-scoped package"}
            </p>
            <div className={styles.metaList}>
              <span className={styles.metaChip}>
                register {draftWorkPackage.registerSnapshotId || "none"}
              </span>
              <span className={styles.metaChip}>
                schedule {draftWorkPackage.terminalScheduleSnapshotId || "none"}
              </span>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
              <strong>Preflight</strong>
              <Badge
                variant="soft"
                color={
                  preflightResult?.ok
                    ? "success"
                    : preflightResult
                      ? "warning"
                      : "default"
                }
              >
                {preflightResult?.ok
                  ? "ready"
                  : preflightResult
                    ? "review"
                    : "idle"}
              </Badge>
            </div>
            <p className={styles.metaText}>
              {preflightResult?.message ||
                "Validate drawing resolution, plugin readiness, schedule scope, and ACADE support before preview."}
            </p>
            <div className={styles.metaList}>
              <span className={styles.metaChip}>
                blockers {preflightResult?.blockers.length ?? 0}
              </span>
              <span className={styles.metaChip}>
                warnings {preflightResult?.warnings.length ?? 0}
              </span>
              <span className={styles.metaChip}>
                ACADE{" "}
                {acadeResult?.acadeProjectFilePath ? "linked" : "unchecked"}
              </span>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
              <strong>Preview</strong>
              <Badge
                variant="soft"
                color={previewResult ? "success" : "default"}
              >
                {previewResult ? "built" : "idle"}
              </Badge>
            </div>
            <p className={styles.metaText}>
              {previewResult?.message ||
                "Shared preview reruns the actionable specialist steps and preserves their operator selections."}
            </p>
            <div className={styles.metaList}>
              <span className={styles.metaChip}>
                steps {previewResult?.steps.length ?? 0}
              </span>
              <span className={styles.metaChip}>
                ops {previewResult?.operations.length ?? 0}
              </span>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
              <strong>Run</strong>
              <Badge
                variant="soft"
                color={
                  runRecord?.status === "verified"
                    ? "success"
                    : runRecord?.status === "failed"
                      ? "warning"
                      : runRecord
                        ? "info"
                        : "default"
                }
              >
                {runRecord?.status || "idle"}
              </Badge>
            </div>
            <p className={styles.metaText}>
              {runRecord
                ? `${runRecord.changedItemCount} changed item(s) across ${runRecord.changedDrawingCount} drawing(s).`
                : "A completed run will persist its report ids, verification artifacts, and workspace location here."}
            </p>
            <div className={styles.metaList}>
              <span className={styles.metaChip}>
                artifacts {primaryArtifacts.length}
              </span>
              <span className={styles.metaChip}>
                report {runRecord?.reportId || "none"}
              </span>
            </div>
          </div>
        </div>

        {preflightResult?.blockers.length ? (
          <div className={styles.warningPanel}>
            {preflightResult.blockers.map((warning) => (
              <div key={warning} className={styles.warningCard}>
                <div className={styles.toggleTitle}>
                  <AlertTriangle size={16} />
                  <strong>Preflight blocker</strong>
                </div>
                <p className={styles.warningText}>{warning}</p>
              </div>
            ))}
          </div>
        ) : null}

        {primaryArtifacts.length ? (
          <div className={styles.artifactList}>
            {primaryArtifacts.map((artifact) => (
              <div key={artifact.id} className={styles.artifactCard}>
                <div className={styles.artifactHeader}>
                  <strong>{artifact.label}</strong>
                  <Badge variant="outline" color="default">
                    {artifact.kind}
                  </Badge>
                </div>
                <p className={styles.artifactText}>
                  {artifact.description ||
                    artifact.path ||
                    "Automation artifact"}
                </p>
                {artifact.downloadUrl ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    iconLeft={<Download size={14} />}
                    onClick={() =>
                      void downloadPrimaryReport(
                        artifact.id,
                        runRecord?.reportFilename ?? undefined,
                      )
                    }
                  >
                    Download
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            No shared run artifacts yet. Save the package, run preflight,
            preview the recipe, then apply and verify to capture the offline
            bundle.
          </div>
        )}
      </div>
    </Panel>
  );
}
