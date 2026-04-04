import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AutoDraftAutomationSnapshot,
  AutomationStudioContext,
  AutoWireAutomationSnapshot,
  CadUtilityAutomationSnapshot,
} from "@/features/automation-studio";
import type { ProjectIssueSetRecord } from "@/features/project-workflow/issueSetService";
import { AutomationRecipePanel } from "./AutomationRecipePanel";

const recipePanelMocks = vi.hoisted(() => ({
  showToastMock: vi.fn(),
  saveWorkPackageMock: vi.fn(),
  saveRecipeMock: vi.fn(),
  saveRunMock: vi.fn(),
  preflightProjectScopeMock: vi.fn(),
  previewRecipeMock: vi.fn(),
  applyRecipeMock: vi.fn(),
  verifyRecipeMock: vi.fn(),
  reconcileAcadeProjectScopeMock: vi.fn(),
  downloadCadReportMock: vi.fn(),
  saveIssueSetMock: vi.fn(),
  saveReceiptMock: vi.fn(),
}));

vi.mock("@/components/notification-system/ToastProvider", () => ({
  useToast: () => ({
    showToast: recipePanelMocks.showToastMock,
  }),
}));

vi.mock("@/services/projectAutomationRecipeService", () => ({
  projectAutomationRecipeService: {
    saveWorkPackage: recipePanelMocks.saveWorkPackageMock,
    saveRecipe: recipePanelMocks.saveRecipeMock,
    saveRun: recipePanelMocks.saveRunMock,
    preflightProjectScope: recipePanelMocks.preflightProjectScopeMock,
    previewRecipe: recipePanelMocks.previewRecipeMock,
    applyRecipe: recipePanelMocks.applyRecipeMock,
    verifyRecipe: recipePanelMocks.verifyRecipeMock,
    reconcileAcadeProjectScope: recipePanelMocks.reconcileAcadeProjectScopeMock,
    downloadCadReport: recipePanelMocks.downloadCadReportMock,
  },
}));

vi.mock("@/features/project-workflow/issueSetService", () => ({
  projectIssueSetService: {
    saveIssueSet: recipePanelMocks.saveIssueSetMock,
  },
}));

vi.mock("@/services/projectAutomationReceiptService", () => ({
  projectAutomationReceiptService: {
    saveReceipt: recipePanelMocks.saveReceiptMock,
  },
}));

const studioContext: AutomationStudioContext = {
  projectId: "project-1",
  projectName: "MyProject Substation",
  issueSetId: "issue-1",
  issueSetLabel: "IFC-01 / Package",
  registerSnapshotId: "register-1",
  drawingId: null,
  selectedDrawingPaths: ["Issued/A-100.dwg"],
  drawingRootPath: "C:/Projects/MyProject/Drawings",
  watchdogRootPath: "C:/Projects/MyProject",
  pdfPackageRootPath: "C:/Projects/MyProject/PDF",
};

const selectedIssueSet: ProjectIssueSetRecord = {
  id: "issue-1",
  projectId: "project-1",
  name: "IFC package",
  issueTag: "IFC-01",
  status: "review",
  targetDate: null,
  transmittalNumber: null,
  transmittalDocumentName: null,
  registerSnapshotId: "register-1",
  terminalScheduleSnapshotId: "schedule-1",
  workPackageId: null,
  recipeSnapshotId: null,
  summary: "Issue-set scoped offline automation package.",
  notes: null,
  selectedDrawingPaths: ["Issued/A-100.dwg"],
  selectedRegisterRowIds: ["row-1"],
  selectedDrawingNumbers: ["A-100"],
  selectedPdfFileIds: ["pdf-1"],
  snapshot: {
    drawingCount: 1,
    selectedDrawingCount: 1,
    reviewItemCount: 2,
    titleBlockReviewCount: 0,
    standardsReviewCount: 0,
    unresolvedRevisionCount: 0,
    setupBlockerCount: 0,
    trackedDrawingCount: 1,
    acceptedTitleBlockCount: 1,
    waivedStandardsCount: 0,
  },
  createdAt: "2026-03-28T00:00:00.000Z",
  updatedAt: "2026-03-28T00:00:00.000Z",
  issuedAt: null,
};

const autoWireSnapshot: AutoWireAutomationSnapshot = {
  requestId: "wire-req-1",
  drawingName: "A-100.dwg",
  terminalCount: 4,
  stripCount: 1,
  routeCount: 1,
  syncedRouteCount: 0,
  pendingRouteCount: 1,
  failedRouteCount: 0,
  diagnosticCount: 0,
  scheduleSnapshotId: "schedule-1",
  scheduleRowCount: 1,
  stripUpdateCount: 1,
  routeUpsertCount: 1,
  changedDrawingCount: 0,
  reportId: null,
  reportFilename: null,
  drawingSummaries: [],
  warnings: [],
  stripRows: [
    {
      id: "strip-row-1",
      snapshotId: "schedule-1",
      sheetName: "TerminalStrips",
      rowNumber: 2,
      drawingPath: "Issued/A-100.dwg",
      drawingNumber: "A-100",
      panelId: "P1",
      side: "L",
      stripId: "TB1",
      terminalCount: 2,
      labelsCsv: "1;2",
      labels: ["1", "2"],
      stripKey: "issued/a-100.dwg::TB1",
      warnings: [],
    },
  ],
  connectionRows: [],
  selectedOperationIds: ["strip-op-1"],
  previewOperations: [],
  readyForPlan: true,
  summary: "Terminal authoring preview is ready.",
  queueItems: [],
};

const cadUtilitySnapshot: CadUtilityAutomationSnapshot = {
  requestId: "cad-req-1",
  matchCount: 1,
  selectedMatchCount: 1,
  changedDrawingCount: 0,
  changedItemCount: 0,
  reportId: null,
  reportFilename: null,
  readyForPlan: true,
  summary: "CAD utility preview is ready.",
  warnings: [],
  rules: [
    {
      id: "rule-1",
      find: "OLD",
      replace: "NEW",
      useRegex: false,
      matchCase: true,
    },
  ],
  selectedPreviewKeys: ["match-1"],
  previewMatches: [],
  blockNameHint: "R3P-24x36BORDER&TITLE",
  drawings: [],
  queueItems: [],
};

const defaultPreflightResult = {
  requestId: "preflight-1",
  workPackageId: "work-package-saved",
  recipeSnapshotId: "recipe-saved",
  ok: true,
  simulateOnCopy: true,
  drawingCount: 1,
  resolvedDrawingCount: 1,
  pluginReady: true,
  acadeContextFound: true,
  blockers: [],
  warnings: [],
  issues: [],
  message: "CAD preflight completed.",
};

const defaultPreviewResult = {
  requestId: "preview-1",
  workPackageId: "work-package-saved",
  recipeSnapshotId: "recipe-saved",
  steps: [],
  operations: [
    {
      id: "strip-op-1",
      source: "autowire" as const,
      operationType: "label-upsert",
      drawingPath: "C:/Projects/MyProject/Drawings/Issued/A-100.dwg",
      drawingName: "A-100.dwg",
      relativePath: "Issued/A-100.dwg",
      managedKey: {
        source: "autowire" as const,
        entityKind: "strip",
        value: "issued/a-100.dwg::TB1",
        drawingPath: "C:/Projects/MyProject/Drawings/Issued/A-100.dwg",
      },
      before: "1 | 3",
      after: "1 | 2",
      detail: "Update strip TB1.",
      warnings: [],
      artifactRefs: [],
      approved: true,
      nativePayload: { operationId: "strip-op-1" },
    },
    {
      id: "match-1",
      source: "cad-utils" as const,
      operationType: "replace",
      drawingPath: "C:/Projects/MyProject/Drawings/Issued/A-100.dwg",
      drawingName: "A-100.dwg",
      relativePath: "Issued/A-100.dwg",
      managedKey: {
        source: "cad-utils" as const,
        entityKind: "AttributeReference",
        value: "match-1",
        drawingPath: "C:/Projects/MyProject/Drawings/Issued/A-100.dwg",
      },
      before: "OLD",
      after: "NEW",
      detail: "Attribute replacement via rule-1",
      warnings: [],
      artifactRefs: [],
      approved: true,
      nativePayload: { matchKey: "match-1" },
    },
  ],
  warnings: [],
  blockers: [],
  message:
    "Recipe preview built 2 CAD operation(s) across 1 scoped drawing(s).",
};

function renderPanel(args?: {
  selectedIssueSet?: ProjectIssueSetRecord | null;
  autoDraftSnapshot?: AutoDraftAutomationSnapshot | null;
  autoWireSnapshot?: AutoWireAutomationSnapshot | null;
  cadUtilitySnapshot?: CadUtilityAutomationSnapshot | null;
}) {
  const issueSet =
    args && "selectedIssueSet" in args
      ? args.selectedIssueSet
      : selectedIssueSet;
  return render(
    <AutomationRecipePanel
      studioContext={studioContext}
      selectedIssueSet={issueSet ?? null}
      autoDraftSnapshot={args?.autoDraftSnapshot ?? null}
      autoWireSnapshot={args?.autoWireSnapshot ?? autoWireSnapshot}
      cadUtilitySnapshot={args?.cadUtilitySnapshot ?? cadUtilitySnapshot}
      approvedItemIds={[]}
      onProjectContextRefresh={vi.fn()}
    />,
  );
}

describe("AutomationRecipePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recipePanelMocks.saveWorkPackageMock.mockImplementation(async (input) => ({
      data: {
        ...(input as Record<string, unknown>),
        id: "work-package-saved",
      },
      error: null,
    }));
    recipePanelMocks.saveRecipeMock.mockImplementation(async (input) => ({
      data: {
        ...(input as Record<string, unknown>),
        id: "recipe-saved",
      },
      error: null,
    }));
    recipePanelMocks.saveRunMock.mockImplementation(async (input) => ({
      data: input,
      error: null,
    }));
    recipePanelMocks.preflightProjectScopeMock.mockResolvedValue(
      defaultPreflightResult,
    );
    recipePanelMocks.previewRecipeMock.mockResolvedValue(defaultPreviewResult);
    recipePanelMocks.applyRecipeMock.mockResolvedValue({
      requestId: "apply-1",
      runId: "run-1",
      changedDrawingCount: 1,
      changedItemCount: 3,
      reportId: "report-1",
      reportFilename: "suite_automation_recipe.xlsx",
      downloadUrl: "/api/cad/reports/report-1",
      warnings: [],
      artifacts: [
        {
          id: "artifact-1",
          label: "Recipe audit workbook",
          kind: "excel-report",
          downloadUrl: "/api/cad/reports/report-1",
          path: "C:/Temp/report.xlsx",
          description: "Combined offline automation workbook.",
        },
      ],
      operations: defaultPreviewResult.operations,
      message:
        "Recipe apply completed across 1 drawing(s) with 3 changed item(s).",
    });
    recipePanelMocks.verifyRecipeMock.mockResolvedValue({
      requestId: "verify-1",
      runId: "run-1",
      verified: true,
      warnings: [],
      artifacts: [
        {
          id: "artifact-2",
          label: "Verification manifest",
          kind: "verification",
          downloadUrl: null,
          path: "C:/Temp/verify.json",
          description: "Verification summary.",
        },
      ],
      message: "Recipe verification completed.",
    });
    recipePanelMocks.reconcileAcadeProjectScopeMock.mockResolvedValue({
      requestId: "acade-1",
      drawingCount: 1,
      acadeProjectFilePath: "C:/Projects/MyProject/demo.wdp",
      acadeSupportFiles: ["C:/Projects/MyProject/demo.wdp"],
      blockers: [],
      warnings: [],
      message: "ACADE reconcile completed.",
    });
    recipePanelMocks.downloadCadReportMock.mockResolvedValue(undefined);
    recipePanelMocks.saveIssueSetMock.mockResolvedValue({
      data: {
        ...selectedIssueSet,
        workPackageId: "work-package-saved",
        recipeSnapshotId: "recipe-saved",
      },
      error: null,
    });
    recipePanelMocks.saveReceiptMock.mockResolvedValue({
      data: { id: "receipt-1" },
      error: null,
    });
  });

  it("requires an issue set before enabling the shared runner", () => {
    renderPanel({ selectedIssueSet: null });

    expect(
      screen.getByText(
        /Select an issue set before building a shared offline work package/i,
      ),
    ).toBeTruthy();
  });

  it("saves a work package and runs preflight against the selected issue set", async () => {
    renderPanel();

    await waitFor(() => {
      expect(
        (
          screen.getByRole("button", {
            name: /Run preflight/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: /Run preflight/i }));

    await waitFor(() => {
      expect(recipePanelMocks.preflightProjectScopeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workPackage: expect.objectContaining({
            projectId: "project-1",
            issueSetId: "issue-1",
            selectedDrawingPaths: ["Issued/A-100.dwg"],
          }),
          recipe: expect.objectContaining({
            id: "recipe-saved",
            workPackageId: "work-package-saved",
          }),
        }),
      );
    });

    expect(recipePanelMocks.saveIssueSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        workPackageId: "work-package-saved",
        recipeSnapshotId: "recipe-saved",
      }),
      "issue-1",
    );
  });

  it("previews and applies a combined recipe, then records a receipt", async () => {
    renderPanel();

    await waitFor(() => {
      expect(
        (
          screen.getByRole("button", {
            name: /Preview recipe/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: /Preview recipe/i }));

    await waitFor(() => {
      expect(recipePanelMocks.previewRecipeMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        (
          screen.getByRole("button", {
            name: /Apply recipe/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: /Apply recipe/i }));

    await waitFor(() => {
      expect(recipePanelMocks.applyRecipeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          operations: defaultPreviewResult.operations,
        }),
      );
    });

    expect(recipePanelMocks.saveReceiptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        issueSetId: "issue-1",
        mode: "combined",
        affectedDrawingCount: 1,
        terminalScheduleSnapshotId: "schedule-1",
        reportId: "report-1",
      }),
    );
  });
});
