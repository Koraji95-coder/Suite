import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProjectStandardsEvidence } from "@/features/project-delivery";
import { projectDocumentMetadataService } from "@/features/project-documents";
import { projectIssueSetService } from "@/features/project-workflow/issueSetService";
import { standardsCheckerBackendService } from "@/features/standards-checker/backendService";
import { projectReviewDecisionService } from "@/services/projectReviewDecisionService";
import { projectRevisionRegisterService } from "@/services/projectRevisionRegisterService";
import { projectTransmittalReceiptService } from "@/services/projectTransmittalReceiptService";
import { projectWorkflowSharedStateService } from "@/features/project-workflow/sharedStateService";
import { ProjectReadinessWorkspace } from "./ProjectReadinessWorkspace";
import type { Project } from "@/features/project-core";
import type { ProjectWatchdogTelemetry } from "@/features/project-watchdog";

vi.mock("@/features/project-documents", () => ({
	projectDocumentMetadataService: {
		loadSnapshot: vi.fn(),
	},
}));

vi.mock("@/services/projectRevisionRegisterService", () => ({
	projectRevisionRegisterService: {
		fetchEntries: vi.fn(),
	},
}));

vi.mock("@/features/project-workflow/issueSetService", () => ({
	projectIssueSetService: {
		fetchIssueSets: vi.fn(),
	},
}));

vi.mock("@/services/projectReviewDecisionService", () => ({
	projectReviewDecisionService: {
		fetchDecisions: vi.fn(),
	},
}));

vi.mock("@/services/projectTransmittalReceiptService", () => ({
	projectTransmittalReceiptService: {
		fetchReceipts: vi.fn(),
	},
}));

vi.mock("@/features/project-delivery", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/features/project-delivery")>();
	return {
		...actual,
		fetchProjectStandardsEvidence: vi.fn(),
		ProjectDeliverableRegisterPanel: () => (
			<div data-testid="deliverable-register-panel" />
		),
	};
});

vi.mock("@/features/standards-checker/backendService", () => ({
	standardsCheckerBackendService: {
		fetchLatestReview: vi.fn(),
	},
}));

function createProject(overrides: Partial<Project> = {}): Project {
	return {
		id: "project-1",
		user_id: "user-1",
		name: "MyProject",
		description: "Issue package setup",
		status: "active",
		priority: "high",
		deadline: "2026-03-31",
		category: "Substation",
		created_at: "2026-03-20T00:00:00.000Z",
		updated_at: "2026-03-20T00:00:00.000Z",
		watchdog_root_path: null,
		...overrides,
	} as Project;
}

function createTelemetry(
	overrides: Partial<ProjectWatchdogTelemetry> = {},
): ProjectWatchdogTelemetry {
	return {
		loading: false,
		error: null,
		overview: null,
		recentEvents: [],
		recentAutoCadEvents: [],
		sessions: [],
		liveSessions: [],
		autoCadCollectors: [],
		liveAutoCadCollectors: [],
		activeCadSessionCount: 0,
		onlineCollectorCount: 0,
		latestAutoCadEvent: null,
		latestSession: null,
		totalCommandsInWindow: 0,
		latestTrackerUpdatedAt: null,
		rule: null,
		ruleConfigured: false,
		ruleUpdatedAt: null,
		trackedDrawings: [],
		...overrides,
	};
}

afterEach(() => {
	projectWorkflowSharedStateService.clearAll();
	vi.clearAllMocks();
});

beforeEach(() => {
	vi.mocked(standardsCheckerBackendService.fetchLatestReview).mockResolvedValue({
		data: null,
		error: null,
	});
});

describe("ProjectReadinessWorkspace", () => {
	it("shows setup blockers when the project root is missing", async () => {
		const openViewMode = vi.fn();
		vi.mocked(projectRevisionRegisterService.fetchEntries).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(projectIssueSetService.fetchIssueSets).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(projectReviewDecisionService.fetchDecisions).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(projectTransmittalReceiptService.fetchReceipts).mockResolvedValue(
			{
				data: [],
				error: null,
			},
		);
		vi.mocked(fetchProjectStandardsEvidence).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(standardsCheckerBackendService.fetchLatestReview).mockResolvedValue(
			{
				data: null,
				error: null,
			},
		);

		render(
			<MemoryRouter>
				<ProjectReadinessWorkspace
					project={createProject()}
					telemetry={createTelemetry()}
					onOpenViewMode={openViewMode}
				/>
			</MemoryRouter>,
		);

		await waitFor(() =>
			expect(screen.getByText("Configure project root")).toBeTruthy(),
		);
		expect(screen.getByText(/No project root configured/i)).toBeTruthy();
		expect(projectDocumentMetadataService.loadSnapshot).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: /open issue sets/i }));
		expect(openViewMode).toHaveBeenCalledWith("issue-sets");
		fireEvent.click(screen.getByRole("button", { name: /open review inbox/i }));
		expect(openViewMode).toHaveBeenCalledWith("review");
		fireEvent.click(
			screen.getByRole("button", { name: /open files & activity/i }),
		);
		expect(openViewMode).toHaveBeenCalledWith("files");
	});

	it("combines title block, standards, revision, and issue-set follow-up into one inbox", async () => {
		const openViewMode = vi.fn();
		vi.mocked(projectRevisionRegisterService.fetchEntries).mockResolvedValue({
			data: [
				{
					id: "rev-1",
					project_id: "project-1",
					file_id: null,
					drawing_number: "PROJ-00001-E0-0001",
					title: "Drawing Index",
					revision: "A",
					previous_revision: null,
					revision_description: "Initial issue",
					revision_by: "KD",
					revision_checked_by: "QA",
					revision_date: "2026-03-20",
					revision_sort_order: 1,
					issue_summary: "Revision item needs signoff",
					issue_status: "open",
					issue_severity: "high",
					source_kind: "manual",
					source_ref: null,
					autodraft_request_id: null,
					transmittal_number: null,
					transmittal_document_name: null,
					notes: null,
					user_id: "user-1",
					created_at: "2026-03-20T00:00:00.000Z",
					updated_at: "2026-03-20T00:00:00.000Z",
				},
			],
			error: null,
		});
		vi.mocked(projectIssueSetService.fetchIssueSets).mockResolvedValue({
			data: [
				{
					id: "issue-set-1",
					projectId: "project-1",
					name: "MyProject IFC package",
					issueTag: "IFC-01",
					status: "review",
					targetDate: "2026-03-31",
					transmittalNumber: "XMTL-001",
					transmittalDocumentName: "IFC package",
					registerSnapshotId: null,
					terminalScheduleSnapshotId: null,
					summary: "Ready for final review.",
					notes: null,
					selectedDrawingPaths: [
						"Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
					],
					selectedRegisterRowIds: [],
					selectedDrawingNumbers: [],
					selectedPdfFileIds: [],
					snapshot: {
						drawingCount: 8,
						selectedDrawingCount: 1,
						reviewItemCount: 1,
						titleBlockReviewCount: 1,
						standardsReviewCount: 0,
						unresolvedRevisionCount: 0,
						setupBlockerCount: 0,
						trackedDrawingCount: 1,
						acceptedTitleBlockCount: 0,
						waivedStandardsCount: 0,
					},
					createdAt: "2026-03-20T00:00:00.000Z",
					updatedAt: "2026-03-21T00:00:00.000Z",
					issuedAt: null,
				},
			],
			error: null,
		});
		vi.mocked(projectReviewDecisionService.fetchDecisions).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(projectTransmittalReceiptService.fetchReceipts).mockResolvedValue(
			{
				data: [],
				error: null,
			},
		);
		vi.mocked(fetchProjectStandardsEvidence).mockResolvedValue({
			data: [
				{
					id: "ann-1",
					drawing_name: "PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
					file_path: "/Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
					annotations: [
						{
							type: "layer",
							severity: "warning",
							message: "Layer naming issue",
							location: "Sheet 1",
						},
					],
					qa_status: "warning",
					checked_at: "2026-03-21T00:00:00.000Z",
					checked_by: "QA",
					rules_applied: ["Layer Standards"],
					issues_found: 1,
					created_at: "2026-03-21T00:00:00.000Z",
				},
			],
			error: null,
		});
		vi.mocked(projectDocumentMetadataService.loadSnapshot).mockResolvedValue({
			projectId: "project-1",
			projectRootPath: "C:/Projects/MyProject",
			profile: {
				blockName: "R3P-24x36BORDER&TITLE",
				projectRootPath: "C:/Projects/MyProject",
				acadeProjectFilePath: null,
				acadeLine1: "MyProject Substation",
				acadeLine2: "Issue for review",
				acadeLine4: "",
				signerDrawnBy: "KD",
				signerCheckedBy: "QA",
				signerEngineer: "",
			},
			summary: {
				totalFiles: 12,
				drawingFiles: 8,
				flaggedFiles: 2,
				suiteWriteCount: 0,
				acadeWriteCount: 0,
				wdTbConflictCount: 0,
			},
			artifacts: {
				wdpPath: "C:/Projects/MyProject/MyProject.wdp",
				wdtPath: "C:/Projects/MyProject/_suite/scan.wdt",
				wdlPath: "C:/Projects/MyProject/_suite/scan.wdl",
				wdpText: "",
				wdtText: "",
				wdlText: "",
				wdpState: "starter",
			},
			rows: [
				{
					id: "row-1",
					projectId: "project-1",
					fileName: "PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
					relativePath: "Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
					absolutePath:
						"C:/Projects/MyProject/Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
					fileType: "dwg",
					drawingNumber: "PROJ-00001-E0-0001",
					title: "Drawing Index",
					revision: "A",
					source: "title_block_sync",
					reviewState: "needs-review",
					confidence: 0.82,
					titleBlockFound: true,
					hasWdTbConflict: false,
					currentAttributes: {},
					acadeValues: {},
					suiteUpdates: {},
					revisionRows: [],
					issues: ["Revision mismatch needs review."],
					warnings: [],
					rawRow: {
						id: "raw-1",
						fileName: "PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
						relativePath: "Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
						absolutePath:
							"C:/Projects/MyProject/Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
						fileType: "dwg",
						filenameDrawingNumber: "PROJ-00001-E0-0001",
						filenameTitle: "Drawing Index",
						filenameRevision: "A",
						titleBlockFound: true,
						effectiveBlockName: "R3P-24x36BORDER&TITLE",
						layoutName: "Model",
						titleBlockHandle: "ABCD",
						hasWdTbConflict: false,
						currentAttributes: {},
						editableFields: {
							scale: "",
							drawnBy: "",
							drawnDate: "",
							checkedBy: "",
							checkedDate: "",
							engineer: "",
							engineerDate: "",
						},
						issues: ["Revision mismatch needs review."],
						warnings: [],
						revisionEntryCount: 0,
						drawingNumber: "PROJ-00001-E0-0001",
						drawingTitle: "Drawing Index",
						acadeValues: {},
						suiteUpdates: {},
						pendingSuiteWrites: [],
						pendingAcadeWrites: [],
						revisionRows: [],
					},
				},
			],
			titleBlockRows: [],
			warnings: [],
		});

		render(
			<MemoryRouter>
				<ProjectReadinessWorkspace
					project={createProject({
						watchdog_root_path: "C:/Projects/MyProject",
					})}
					telemetry={createTelemetry({
						ruleConfigured: true,
						trackedDrawings: [
							{
								drawingPath:
									"C:/Projects/MyProject/Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
								drawingName: "PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
								lifetimeTrackedMs: 60_000,
								todayTrackedMs: 60_000,
								lastWorkedAt: "2026-03-21T00:00:00.000Z",
								daysWorkedCount: 1,
								liveTrackedMs: 0,
								liveStatus: null,
								dateGroups: [],
							},
						],
					})}
					onOpenViewMode={openViewMode}
				/>
			</MemoryRouter>,
		);

		await waitFor(() =>
			expect(screen.getAllByText(/review inbox/i).length).toBeGreaterThan(0),
		);
		expect(
			screen.getAllByText(/Revision mismatch needs review/i).length,
		).toBeGreaterThan(0);
		expect(screen.getByText(/Revision item needs signoff/i)).toBeTruthy();
		expect(screen.getByText(/Layer naming issue/i)).toBeTruthy();
		expect(
			screen.getByText(/transmittal, but no generated receipt is linked yet/i),
		).toBeTruthy();
		expect(
			screen.getByText(/\.wdp\/\.wdt\/\.wdl files before package work starts/i),
		).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: /open revisions/i }));
		expect(openViewMode).toHaveBeenCalledWith("revisions");
	});

	it("normalizes stale issue-set context to the first available package", async () => {
		const onIssueSetContextChange = vi.fn();
		vi.mocked(projectRevisionRegisterService.fetchEntries).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(standardsCheckerBackendService.fetchLatestReview).mockResolvedValue(
			{
				data: null,
				error: null,
			},
		);
		vi.mocked(projectIssueSetService.fetchIssueSets).mockResolvedValue({
			data: [
				{
					id: "issue-set-1",
					projectId: "project-1",
					name: "MyProject IFC package",
					issueTag: "IFC-01",
					status: "review",
					targetDate: "2026-03-31",
					transmittalNumber: null,
					transmittalDocumentName: null,
					registerSnapshotId: null,
					terminalScheduleSnapshotId: null,
					summary: "Ready for final review.",
					notes: null,
					selectedDrawingPaths: [],
					selectedRegisterRowIds: [],
					selectedDrawingNumbers: [],
					selectedPdfFileIds: [],
					snapshot: {
						drawingCount: 1,
						selectedDrawingCount: 1,
						reviewItemCount: 0,
						titleBlockReviewCount: 0,
						standardsReviewCount: 0,
						unresolvedRevisionCount: 0,
						setupBlockerCount: 0,
						trackedDrawingCount: 0,
						acceptedTitleBlockCount: 0,
						waivedStandardsCount: 0,
					},
					createdAt: "2026-03-20T00:00:00.000Z",
					updatedAt: "2026-03-21T00:00:00.000Z",
					issuedAt: null,
				},
			],
			error: null,
		});
		vi.mocked(projectReviewDecisionService.fetchDecisions).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(projectTransmittalReceiptService.fetchReceipts).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(fetchProjectStandardsEvidence).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(projectDocumentMetadataService.loadSnapshot).mockResolvedValue({
			projectId: "project-1",
			projectRootPath: "C:/Projects/MyProject",
			profile: {
				blockName: "R3P-24x36BORDER&TITLE",
				projectRootPath: "C:/Projects/MyProject",
				acadeProjectFilePath: null,
				acadeLine1: "MyProject Substation",
				acadeLine2: "Issue for review",
				acadeLine4: "",
				signerDrawnBy: "KD",
				signerCheckedBy: "QA",
				signerEngineer: "",
			},
			summary: {
				totalFiles: 1,
				drawingFiles: 1,
				flaggedFiles: 0,
				suiteWriteCount: 0,
				acadeWriteCount: 0,
				wdTbConflictCount: 0,
			},
			artifacts: {
				wdpPath: "C:/Projects/MyProject/MyProject.wdp",
				wdtPath: "C:/Projects/MyProject/_suite/scan.wdt",
				wdlPath: "C:/Projects/MyProject/_suite/scan.wdl",
				wdpText: "",
				wdtText: "",
				wdlText: "",
				wdpState: "existing",
			},
			rows: [],
			titleBlockRows: [],
			warnings: [],
		});

		render(
			<MemoryRouter>
				<ProjectReadinessWorkspace
					project={createProject({
						watchdog_root_path: "C:/Projects/MyProject",
					})}
					telemetry={createTelemetry({
						ruleConfigured: true,
					})}
					preferredIssueSetId="missing-issue-set"
					onIssueSetContextChange={onIssueSetContextChange}
					onOpenViewMode={vi.fn()}
				/>
			</MemoryRouter>,
		);

		expect(await screen.findByText(/project readiness/i)).toBeTruthy();
		await waitFor(() => {
			expect(onIssueSetContextChange).toHaveBeenCalledWith("issue-set-1");
		});
	});
});

