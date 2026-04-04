import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AutomationStudioApp } from "./AutomationStudioApp";

const automationStudioMocks = vi.hoisted(() => ({
  saveReceiptMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock("@/components/notification-system/ToastProvider", () => ({
  useToast: () => ({
    showToast: automationStudioMocks.showToastMock,
  }),
}));

vi.mock("@/services/projectAutomationReceiptService", () => ({
  projectAutomationReceiptService: {
    saveReceipt: automationStudioMocks.saveReceiptMock,
  },
}));

vi.mock("@/features/automation-studio/useAutomationStudioState", () => {
  return {
    useAutomationStudioState: () => ({
      projectOptions: [
        {
          id: "project-1",
          name: "MyProject Substation",
          description: "Demo",
          watchdogRootPath: "G:/Drawings",
          pdfPackageRootPath: "G:/Package",
        },
      ],
      selectedProject: {
        id: "project-1",
        name: "MyProject Substation",
        description: "Demo",
        watchdogRootPath: "G:/Drawings",
        pdfPackageRootPath: "G:/Package",
      },
      selectedProjectId: "project-1",
      setSelectedProjectId: vi.fn(),
      issueSets: [
        {
          id: "issue-1",
          issueTag: "IFC-01",
          name: "IFC package",
          selectedDrawingPaths: ["R3P-1000.dwg"],
          selectedRegisterRowIds: ["row-1"],
        },
      ],
      selectedIssueSet: {
        id: "issue-1",
        issueTag: "IFC-01",
        name: "IFC package",
        selectedDrawingPaths: ["R3P-1000.dwg"],
        selectedRegisterRowIds: ["row-1"],
      },
      selectedIssueSetId: "issue-1",
      setSelectedIssueSetId: vi.fn(),
      registerSnapshot: {
        id: "snapshot-1",
        projectId: "project-1",
        workbookFileName: "Master Deliverable List.xlsx",
        importedAt: "2026-03-26T00:00:00.000Z",
        dwgRootPath: "G:/Drawings",
        pdfSourceSummary: "G:/Package",
        sheetNames: ["Overall"],
        rowCount: 1,
        rows: [],
      },
      selectedRegisterRows: [
        {
          id: "row-1",
          drawingNumber: "R3P-1000",
        },
      ],
      receipts: [],
      latestReceipt: null,
      studioContext: {
        projectId: "project-1",
        projectName: "MyProject Substation",
        issueSetId: "issue-1",
        issueSetLabel: "IFC-01 / IFC package",
        registerSnapshotId: "snapshot-1",
        drawingId: null,
        selectedDrawingPaths: ["R3P-1000.dwg"],
        drawingRootPath: "G:/Drawings",
        watchdogRootPath: "G:/Drawings",
        pdfPackageRootPath: "G:/Package",
      },
      workflowLinks: [
        { label: "Review", to: "/app/projects/project-1/review" },
        { label: "Issue Sets", to: "/app/projects/project-1/release" },
        {
          label: "Transmittal",
          to: "/app/projects/transmittal-builder?project=project-1&issueSet=issue-1",
        },
      ],
      loadingProjects: false,
      loadingContext: false,
      messages: [],
      refreshProjectContext: vi.fn(),
    }),
  };
});

vi.mock("@/features/autodraft-studio/ui/AutoDraftComparePanel", () => ({
  AutoDraftComparePanel: ({
    onAutomationSnapshotChange,
  }: {
    onAutomationSnapshotChange?: (snapshot: Record<string, unknown>) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onAutomationSnapshotChange?.({
            sourceName: "marked.pdf",
            requestId: "markup-req-1",
            preparedMarkupCount: 2,
            markupReviewCount: 1,
            replacementReviewCount: 1,
            warningCount: 0,
            readyForPlan: true,
            summary: "2 markup intents ready for planning.",
            queueItems: [
              {
                id: "markup-1",
                source: "autodraft",
                status: "needs-review",
                bindingKind: "title-block",
                label: "Revise title block field",
                detail: "Update title block note",
                suggestedTarget: "TITLE1",
                drawingNumber: "R3P-1000",
              },
            ],
          })
        }
      >
        Emit markup snapshot
      </button>
      <div>Mock AutoDraft canvas</div>
    </div>
  ),
}));

vi.mock("@/features/automation-studio/ui/TerminalAuthoringPanel", () => ({
  TerminalAuthoringPanel: ({
    onAutomationSnapshotChange,
  }: {
    onAutomationSnapshotChange?: (snapshot: Record<string, unknown>) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onAutomationSnapshotChange?.({
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
              "2 strip writes and 3 route upserts are ready for issue-set apply.",
            queueItems: [
              {
                id: "wire-1",
                source: "autowire",
                status: "planned",
                bindingKind: "terminal-wiring",
                label: "Route terminal strip",
                detail: "Preview route should sync schedule rows.",
                suggestedTarget: "TB-1",
                drawingNumber: "R3P-1000",
              },
            ],
          })
        }
      >
        Emit wiring snapshot
      </button>
      <div>Mock AutoWire canvas</div>
    </div>
  ),
}));

vi.mock("@/features/automation-studio/ui/CadUtilitiesPanel", () => ({
  CadUtilitiesPanel: ({
    onAutomationSnapshotChange,
  }: {
    onAutomationSnapshotChange?: (snapshot: Record<string, unknown>) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onAutomationSnapshotChange?.({
            requestId: "cad-req-1",
            matchCount: 2,
            selectedMatchCount: 2,
            changedDrawingCount: 0,
            changedItemCount: 0,
            reportId: null,
            reportFilename: null,
            readyForPlan: true,
            summary: "2 CAD utility changes selected.",
            warnings: [],
            drawings: [
              {
                drawingPath: "G:/Drawings/R3P-1000.dwg",
                drawingName: "R3P-1000.dwg",
                relativePath: "R3P-1000.dwg",
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
                id: "cad-utils:g:/drawings/r3p-1000.dwg",
                source: "cad-utils",
                status: "planned",
                bindingKind: "drawing-content",
                label: "R3P-1000.dwg",
                detail: "2 CAD utility changes selected.",
                suggestedTarget: "R3P-1000.dwg",
                drawingNumber: "R3P-1000.dwg",
              },
            ],
          })
        }
      >
        Emit CAD utility snapshot
      </button>
      <div>Mock CAD utilities panel</div>
    </div>
  ),
}));

vi.mock("@/features/automation-studio/ui/AutomationRecipePanel", () => ({
  AutomationRecipePanel: () => <div>Mock recipe builder panel</div>,
}));

describe("AutomationStudioApp", () => {
  it("renders the combined developer workbench", () => {
    render(
      <MemoryRouter>
        <AutomationStudioApp />
      </MemoryRouter>,
    );

    expect(screen.getByText("Automation Studio")).toBeTruthy();
    expect(screen.getByText("Combined workbench")).toBeTruthy();
    expect(screen.getByText("Unified review queue")).toBeTruthy();
    expect(screen.getByText("Mock AutoDraft canvas")).toBeTruthy();
    expect(screen.getByText("Mock recipe builder panel")).toBeTruthy();
  });

  it("switches to the wiring bench", () => {
    render(
      <MemoryRouter>
        <AutomationStudioApp />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Wiring bench/i }));

    expect(screen.getByText("Mock AutoWire canvas")).toBeTruthy();
  });

  it("switches to the cad utilities bench", () => {
    render(
      <MemoryRouter>
        <AutomationStudioApp />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /CAD utilities/i }));

    expect(screen.getByText("Mock CAD utilities panel")).toBeTruthy();
  });

  it("records a package-scoped automation receipt", async () => {
    automationStudioMocks.saveReceiptMock.mockResolvedValue({
      data: { id: "receipt-1" },
      error: null,
    });

    render(
      <MemoryRouter>
        <AutomationStudioApp />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Emit markup snapshot/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Record automation receipt/i }),
    );

    await waitFor(() => {
      expect(automationStudioMocks.saveReceiptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-1",
          issueSetId: "issue-1",
          registerSnapshotId: "snapshot-1",
          mode: "markup",
          preparedMarkupCount: 2,
        }),
      );
    });
  });

  it("records a cad utility receipt when the CAD bench is active", async () => {
    automationStudioMocks.saveReceiptMock.mockResolvedValue({
      data: { id: "receipt-2" },
      error: null,
    });

    render(
      <MemoryRouter>
        <AutomationStudioApp />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /CAD utilities/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Emit CAD utility snapshot/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Record automation receipt/i }),
    );

    await waitFor(() => {
      expect(automationStudioMocks.saveReceiptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "cad-utils",
          cadUtilityChangedDrawingCount: 0,
          cadUtilityChangedItemCount: 0,
        }),
      );
    });
  });
});
