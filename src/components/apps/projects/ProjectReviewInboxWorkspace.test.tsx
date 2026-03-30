import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useToast } from "@/components/notification-system/ToastProvider";
import { fetchProjectStandardsEvidence } from "@/services/projectDeliveryEvidenceService";
import { projectDocumentMetadataService } from "@/services/projectDocumentMetadataService";
import { projectIssueSetService } from "@/services/projectIssueSetService";
import { projectReviewDecisionService } from "@/services/projectReviewDecisionService";
import { projectRevisionRegisterService } from "@/services/projectRevisionRegisterService";
import { projectTransmittalReceiptService } from "@/services/projectTransmittalReceiptService";
import { ProjectReviewInboxWorkspace } from "./ProjectReviewInboxWorkspace";
import type { Project } from "./projectmanagertypes";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";

vi.mock("@/services/projectDocumentMetadataService", () => ({
	projectDocumentMetadataService: {
		loadSnapshot: vi.fn(),
	},
}));

vi.mock("@/services/projectRevisionRegisterService", () => ({
	projectRevisionRegisterService: {
		fetchEntries: vi.fn(),
		updateEntry: vi.fn(),
	},
}));

vi.mock("@/services/projectIssueSetService", () => ({
	projectIssueSetService: {
		fetchIssueSets: vi.fn(),
	},
}));

vi.mock("@/services/projectReviewDecisionService", () => ({
	projectReviewDecisionService: {
		fetchDecisions: vi.fn(),
		saveDecision: vi.fn(),
	},
}));

vi.mock("@/services/projectTransmittalReceiptService", () => ({
	projectTransmittalReceiptService: {
		fetchReceipts: vi.fn(),
	},
}));

vi.mock("@/services/projectDeliveryEvidenceService", () => ({
	fetchProjectStandardsEvidence: vi.fn(),
}));

vi.mock("@/components/notification-system/ToastProvider", () => ({
	useToast: vi.fn(),
}));

function createProject(overrides: Partial<Project> = {}): Project {
	return {
		id: "project-1",
		user_id: "user-1",
		name: "Nanulak",
		description: "Issue package setup",
		status: "active",
		priority: "high",
		deadline: "2026-03-31",
		category: "Substation",
		created_at: "2026-03-20T00:00:00.000Z",
		updated_at: "2026-03-20T00:00:00.000Z",
		watchdog_root_path: "C:/Projects/Nanulak",
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
		ruleConfigured: true,
		ruleUpdatedAt: null,
		trackedDrawings: [
			{
				drawingPath:
					"C:/Projects/Nanulak/Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
				drawingName: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
				lifetimeTrackedMs: 120_000,
				todayTrackedMs: 120_000,
				lastWorkedAt: "2026-03-21T00:00:00.000Z",
				daysWorkedCount: 1,
				liveTrackedMs: 0,
				liveStatus: null,
				dateGroups: [],
			},
		],
		...overrides,
	};
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("ProjectReviewInboxWorkspace", () => {
	it("filters to standards and issue-set follow-up items", async () => {
		const openViewMode = vi.fn();
		vi.mocked(projectRevisionRegisterService.fetchEntries).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(projectRevisionRegisterService.updateEntry).mockResolvedValue(
			null,
		);
		vi.mocked(projectIssueSetService.fetchIssueSets).mockResolvedValue({
			data: [
				{
					id: "issue-set-1",
					projectId: "project-1",
					name: "Nanulak IFC package",
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
						"Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					],
					selectedRegisterRowIds: [],
					selectedDrawingNumbers: [],
					selectedPdfFileIds: [],
					snapshot: {
						drawingCount: 8,
						selectedDrawingCount: 1,
						reviewItemCount: 1,
						titleBlockReviewCount: 0,
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
		vi.mocked(projectTransmittalReceiptService.fetchReceipts).mockResolvedValue(
			{
				data: [],
				error: null,
			},
		);
		vi.mocked(projectReviewDecisionService.fetchDecisions).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(projectReviewDecisionService.saveDecision).mockResolvedValue({
			data: {
				id: "decision-1",
				projectId: "project-1",
				issueSetId: "issue-set-1",
				itemId: "standards:ann-1",
				itemType: "standards",
				fingerprint: "standards",
				status: "waived",
				note: null,
				createdAt: "2026-03-21T00:00:00.000Z",
				updatedAt: "2026-03-21T00:00:00.000Z",
			},
			error: null,
		});
		vi.mocked(fetchProjectStandardsEvidence).mockResolvedValue({
			data: [
				{
					id: "ann-1",
					drawing_name: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					file_path: "/Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
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
			projectRootPath: "C:/Projects/Nanulak",
			profile: {
				blockName: "R3P-24x36BORDER&TITLE",
				projectRootPath: "C:/Projects/Nanulak",
				acadeLine1: "Nanulak 180MW Substation",
				acadeLine2: "Issue for review",
				acadeLine4: "",
				signerDrawnBy: "KD",
				signerCheckedBy: "QA",
				signerEngineer: "",
			},
			summary: {
				totalFiles: 12,
				drawingFiles: 8,
				flaggedFiles: 1,
				suiteWriteCount: 0,
				acadeWriteCount: 0,
				wdTbConflictCount: 0,
			},
			artifacts: {
				wdtPath: "C:/Projects/Nanulak/_suite/scan.wdt",
				wdlPath: "C:/Projects/Nanulak/_suite/scan.wdl",
				wdtText: "",
				wdlText: "",
			},
			rows: [
				{
					id: "row-1",
					projectId: "project-1",
					fileName: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					relativePath: "Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					absolutePath:
						"C:/Projects/Nanulak/Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					fileType: "dwg",
					drawingNumber: "R3P-25074-E0-0001",
					title: "Drawing Index",
					revision: "A",
					source: "title_block_sync",
					reviewState: "ready",
					confidence: 1,
					titleBlockFound: true,
					hasWdTbConflict: false,
					currentAttributes: {},
					acadeValues: {},
					suiteUpdates: {},
					revisionRows: [],
					issues: [],
					warnings: [],
					rawRow: {} as never,
				},
			],
			titleBlockRows: [],
			warnings: [],
		});

		vi.mocked(useToast).mockReturnValue({
			showToast: vi.fn(),
		});

		render(
			<MemoryRouter>
				<ProjectReviewInboxWorkspace
					project={createProject()}
					telemetry={createTelemetry()}
					onOpenViewMode={openViewMode}
				/>
			</MemoryRouter>,
		);

		expect(await screen.findByText(/review inbox/i)).toBeTruthy();
		expect(screen.getAllByText("IFC-01").length).toBeGreaterThan(0);
		expect(screen.getByText(/Layer naming issue/i)).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /^Issue sets$/i }));
		expect(
			screen.getByText(/no generated receipt is linked yet/i),
		).toBeTruthy();

		fireEvent.click(
			screen.getAllByRole("button", { name: /^Open issue sets$/i })[0]!,
		);
		expect(openViewMode).toHaveBeenCalledWith("issue-sets");

		fireEvent.click(screen.getByRole("button", { name: /^Standards$/i }));
		fireEvent.click(screen.getByRole("button", { name: /Waive for package/i }));
		expect(projectReviewDecisionService.saveDecision).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "project-1",
				issueSetId: "issue-set-1",
				itemType: "standards",
				itemId: "standards:ann-1",
				status: "waived",
			}),
		);
	});

	it("uses the preferred issue-set scope for package workflow links", async () => {
		vi.mocked(projectRevisionRegisterService.fetchEntries).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(projectIssueSetService.fetchIssueSets).mockResolvedValue({
			data: [
				{
					id: "issue-set-1",
					projectId: "project-1",
					name: "Nanulak IFC package",
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
						"Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
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
				{
					id: "issue-set-2",
					projectId: "project-1",
					name: "Nanulak final issue",
					issueTag: "IFC-02",
					status: "ready",
					targetDate: "2026-04-07",
					transmittalNumber: "XMTL-002",
					transmittalDocumentName: "Final IFC package",
					registerSnapshotId: null,
					terminalScheduleSnapshotId: null,
					summary: "Ready for issue.",
					notes: null,
					selectedDrawingPaths: [
						"Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					],
					selectedRegisterRowIds: [],
					selectedDrawingNumbers: [],
					selectedPdfFileIds: [],
					snapshot: {
						drawingCount: 8,
						selectedDrawingCount: 1,
						reviewItemCount: 0,
						titleBlockReviewCount: 0,
						standardsReviewCount: 0,
						unresolvedRevisionCount: 0,
						setupBlockerCount: 0,
						trackedDrawingCount: 1,
						acceptedTitleBlockCount: 1,
						waivedStandardsCount: 0,
					},
					createdAt: "2026-03-22T00:00:00.000Z",
					updatedAt: "2026-03-23T00:00:00.000Z",
					issuedAt: null,
				},
			],
			error: null,
		});
		vi.mocked(projectTransmittalReceiptService.fetchReceipts).mockResolvedValue(
			{
				data: [],
				error: null,
			},
		);
		vi.mocked(projectReviewDecisionService.fetchDecisions).mockResolvedValue({
			data: [
				{
					id: "decision-2",
					projectId: "project-1",
					issueSetId: "issue-set-2",
					itemId: "title-block:row-1",
					itemType: "title-block",
					fingerprint: "title-block:row-1:TITLE_BLOCK_SYNC:0:1:0:0.82",
					status: "accepted",
					note: null,
					createdAt: "2026-03-23T00:00:00.000Z",
					updatedAt: "2026-03-23T00:00:00.000Z",
				},
			],
			error: null,
		});
		vi.mocked(projectReviewDecisionService.saveDecision).mockResolvedValue({
			data: null,
			error: null,
		});
		vi.mocked(fetchProjectStandardsEvidence).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(projectDocumentMetadataService.loadSnapshot).mockResolvedValue({
			projectId: "project-1",
			projectRootPath: "C:/Projects/Nanulak",
			profile: {
				blockName: "R3P-24x36BORDER&TITLE",
				projectRootPath: "C:/Projects/Nanulak",
				acadeLine1: "Nanulak 180MW Substation",
				acadeLine2: "Issue for review",
				acadeLine4: "",
				signerDrawnBy: "KD",
				signerCheckedBy: "QA",
				signerEngineer: "",
			},
			summary: {
				totalFiles: 12,
				drawingFiles: 8,
				flaggedFiles: 1,
				suiteWriteCount: 0,
				acadeWriteCount: 0,
				wdTbConflictCount: 0,
			},
			artifacts: {
				wdtPath: "C:/Projects/Nanulak/_suite/scan.wdt",
				wdlPath: "C:/Projects/Nanulak/_suite/scan.wdl",
				wdtText: "",
				wdlText: "",
			},
			rows: [
				{
					id: "row-1",
					projectId: "project-1",
					fileName: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					relativePath: "Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					absolutePath:
						"C:/Projects/Nanulak/Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					fileType: "dwg",
					drawingNumber: "R3P-25074-E0-0001",
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
					rawRow: {} as never,
				},
			],
			titleBlockRows: [],
			warnings: [],
		});

		vi.mocked(useToast).mockReturnValue({
			showToast: vi.fn(),
		});

		render(
			<MemoryRouter>
				<ProjectReviewInboxWorkspace
					project={createProject()}
					telemetry={createTelemetry()}
					preferredIssueSetId="issue-set-2"
					onOpenViewMode={vi.fn()}
				/>
			</MemoryRouter>,
		);

		expect(
			await screen.findByText(/package acceptance recorded for IFC-02/i),
		).toBeTruthy();
		expect(
			screen
				.getAllByRole("link", { name: /Title block review/i })
				.some((link) =>
					link.getAttribute("href")?.includes("issueSet=issue-set-2"),
				),
		).toBe(true);
	});
});
