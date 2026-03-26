import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildProjectIssueSetEvidencePacket,
	fetchProjectStandardsEvidence,
	type ProjectIssueSetEvidencePacket,
	renderProjectIssueSetEvidencePacketMarkdown,
} from "@/services/projectDeliveryEvidenceService";
import { projectDocumentMetadataService } from "@/services/projectDocumentMetadataService";
import {
	type ProjectIssueSetRecord,
	projectIssueSetService,
} from "@/services/projectIssueSetService";
import { projectReviewDecisionService } from "@/services/projectReviewDecisionService";
import { projectRevisionRegisterService } from "@/services/projectRevisionRegisterService";
import {
	type ProjectTransmittalReceiptRecord,
	projectTransmittalReceiptService,
} from "@/services/projectTransmittalReceiptService";
import { ProjectIssueSetManager } from "./ProjectIssueSetManager";
import type { Project } from "./projectmanagertypes";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";

const showToast = vi.fn();

vi.mock("@/components/notification-system/ToastProvider", () => ({
	useToast: () => ({
		showToast,
	}),
}));

vi.mock("@/services/projectDocumentMetadataService", () => ({
	projectDocumentMetadataService: {
		loadSnapshot: vi.fn(),
	},
}));

vi.mock("@/services/projectIssueSetService", () => ({
	projectIssueSetService: {
		fetchIssueSets: vi.fn(),
		saveIssueSet: vi.fn(),
		deleteIssueSet: vi.fn(),
	},
}));

vi.mock("@/services/projectReviewDecisionService", () => ({
	projectReviewDecisionService: {
		fetchDecisions: vi.fn(),
	},
}));

vi.mock("@/services/projectRevisionRegisterService", () => ({
	projectRevisionRegisterService: {
		fetchEntries: vi.fn(),
	},
}));

vi.mock("@/services/projectTransmittalReceiptService", () => ({
	projectTransmittalReceiptService: {
		fetchReceipts: vi.fn(),
	},
}));

vi.mock("@/services/projectDeliveryEvidenceService", () => ({
	fetchProjectStandardsEvidence: vi.fn(),
	buildProjectIssueSetEvidencePacket: vi.fn(),
	renderProjectIssueSetEvidencePacketMarkdown: vi.fn(),
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

function createSavedIssueSet(
	overrides: Partial<ProjectIssueSetRecord> = {},
): ProjectIssueSetRecord {
	return {
		id: "issue-set-1",
		projectId: "project-1",
		name: "Nanulak IFC package",
		issueTag: "IFC-01",
		status: "review",
		targetDate: "2026-03-31",
		transmittalNumber: "XMTL-001",
		transmittalDocumentName: "IFC package",
		summary: "Ready for final review.",
		notes: "Keep substation index and SLD together.",
		selectedDrawingPaths: ["Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg"],
		snapshot: {
			drawingCount: 4,
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
		...overrides,
	};
}

function createReceipt(
	overrides: Partial<ProjectTransmittalReceiptRecord> = {},
): ProjectTransmittalReceiptRecord {
	return {
		id: "receipt-1",
		projectId: "project-1",
		projectName: "Nanulak",
		projectNumber: "25074",
		transmittalType: "standard",
		transmittalNumber: "XMTL-001",
		description: "IFC package",
		date: "2026-03-31",
		outputFormat: "both",
		standardDocumentSource: "project_metadata",
		projectMetadataLoadedAt: "2026-03-20T00:00:00.000Z",
		outputs: [
			{
				label: "PDF",
				filename: "nanulak-ifc.pdf",
				size: 10_240,
				createdAt: "2026-03-21T01:00:00.000Z",
			},
		],
		documentCount: 4,
		reviewedDocumentCount: 4,
		pendingReviewCount: 0,
		cidDocumentCount: 0,
		contactCount: 2,
		fileSummary: {
			template: "template.docx",
			index: "index.xlsx",
			documents: "4 PDFs",
			report: "report.xlsx",
		},
		optionSummary: [{ label: "Sent via", value: "Email" }],
		generatedMessage: "Transmittal generated successfully.",
		generatedAt: "2026-03-21T01:05:00.000Z",
		...overrides,
	};
}

function createEvidencePacket(
	issueSet: ProjectIssueSetRecord,
	receipt: ProjectTransmittalReceiptRecord | null = createReceipt(),
): ProjectIssueSetEvidencePacket {
	return {
		projectId: issueSet.projectId,
		projectName: "Nanulak",
		issueSetId: issueSet.id,
		issueSetName: issueSet.name,
		issueTag: issueSet.issueTag,
		status: issueSet.status,
		targetDate: issueSet.targetDate,
		generatedAt: "2026-03-21T02:00:00.000Z",
		summary: issueSet.summary,
		selectedDrawings: [
			{
				fileName: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
				relativePath: "Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
				drawingNumber: "R3P-25074-E0-0001",
				title: "Drawing Index",
				revision: "A",
				reviewState: "ready",
				issues: [],
				warnings: [],
			},
		],
		titleBlock: {
			readyCount: 1,
			needsReviewCount: 0,
			fallbackCount: 0,
			drawings: [
				{
					fileName: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					drawingNumber: "R3P-25074-E0-0001",
					reviewState: "ready",
					acceptedForPackage: false,
					issues: [],
					warnings: [],
				},
			],
		},
		reviewDecisions: {
			acceptedTitleBlockCount: 0,
			waivedStandardsCount: 0,
			items: [],
		},
		revisions: {
			openCount: 0,
			entries: [],
		},
		standards: {
			matchedDrawingCount: 1,
			passCount: 1,
			warningCount: 0,
			failCount: 0,
			pendingCount: 0,
			checks: [
				{
					drawingName: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					qaStatus: "pass",
					reviewedAt: "2026-03-21T00:00:00.000Z",
					issuesFound: 0,
					rulesApplied: ["Title Block"],
					issues: [],
				},
			],
		},
		transmittal: {
			linkedReceipt: receipt,
			number: issueSet.transmittalNumber,
			documentName: issueSet.transmittalDocumentName,
			source: receipt?.standardDocumentSource ?? null,
		},
		watchdog: {
			matchedTrackedCount: 1,
			drawings: [
				{
					drawingName: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					lifetimeTrackedMs: 120_000,
					lastWorkedAt: "2026-03-21T00:00:00.000Z",
				},
			],
		},
	};
}

function mockProjectData(
	issueSets: ProjectIssueSetRecord[] = [],
	receipts: ProjectTransmittalReceiptRecord[] = [],
) {
	vi.mocked(projectIssueSetService.fetchIssueSets).mockResolvedValue({
		data: issueSets,
		error: null,
	});
	vi.mocked(projectRevisionRegisterService.fetchEntries).mockResolvedValue({
		data: [],
		error: null,
	});
	vi.mocked(projectReviewDecisionService.fetchDecisions).mockResolvedValue({
		data: [],
		error: null,
	});
	vi.mocked(projectTransmittalReceiptService.fetchReceipts).mockResolvedValue({
		data: receipts,
		error: null,
	});
	vi.mocked(fetchProjectStandardsEvidence).mockResolvedValue({
		data: [],
		error: null,
	});
	vi.mocked(buildProjectIssueSetEvidencePacket).mockImplementation(
		({ issueSet, transmittalReceipts }) =>
			createEvidencePacket(issueSet, transmittalReceipts[0] ?? null),
	);
	vi.mocked(renderProjectIssueSetEvidencePacketMarkdown).mockImplementation(
		(packet) => `# ${packet.issueSetName}\n`,
	);
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
			totalFiles: 8,
			drawingFiles: 4,
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
				rawRow: {
					id: "raw-1",
					fileName: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					relativePath: "Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					absolutePath:
						"C:/Projects/Nanulak/Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					fileType: "dwg",
					filenameDrawingNumber: "R3P-25074-E0-0001",
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
					issues: [],
					warnings: [],
					revisionEntryCount: 0,
					drawingNumber: "R3P-25074-E0-0001",
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
}

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("ProjectIssueSetManager", () => {
	it("renders saved issue sets with the current project snapshot", async () => {
		mockProjectData([createSavedIssueSet()], [createReceipt()]);

		render(
			<MemoryRouter>
				<ProjectIssueSetManager
					project={createProject()}
					telemetry={createTelemetry()}
					onOpenViewMode={vi.fn()}
				/>
			</MemoryRouter>,
		);

		expect(await screen.findByText("Nanulak IFC package")).toBeTruthy();
		expect(screen.getByText(/current package snapshot/i)).toBeTruthy();
		expect(screen.getByText("IFC-01")).toBeTruthy();
		expect(screen.getByText(/1 ready/i)).toBeTruthy();
		expect(screen.getByText(/1 pass/i)).toBeTruthy();
		expect(screen.getAllByText(/XMTL-001/i).length).toBeGreaterThan(0);
		fireEvent.click(screen.getByRole("button", { name: /view details/i }));
		expect(screen.getByText(/Package scope/i)).toBeTruthy();
		expect(screen.getByText(/R3P-25074-E0-0001/i)).toBeTruthy();
		expect(fetchProjectStandardsEvidence).toHaveBeenCalledWith("project-1", [
			"Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
		]);
	});

	it("uses the preferred issue-set scope for linked workflow tools", async () => {
		mockProjectData([
			createSavedIssueSet(),
			createSavedIssueSet({
				id: "issue-set-2",
				name: "Nanulak final issue",
				issueTag: "IFC-02",
				transmittalNumber: "XMTL-002",
				transmittalDocumentName: "Final IFC package",
			}),
		]);

		render(
			<MemoryRouter>
				<ProjectIssueSetManager
					project={createProject()}
					telemetry={createTelemetry()}
					preferredIssueSetId="issue-set-2"
					onIssueSetContextChange={vi.fn()}
					onOpenViewMode={vi.fn()}
				/>
			</MemoryRouter>,
		);

		expect(await screen.findByText("Nanulak IFC package")).toBeTruthy();
		expect(
			screen
				.getByRole("link", { name: /Title block review/i })
				.getAttribute("href"),
		).toContain("issueSet=issue-set-2");
		expect(
			screen
				.getByRole("link", { name: /Standards Checker/i })
				.getAttribute("href"),
		).toContain("issueSet=issue-set-2");
		expect(
			screen.getByRole("link", { name: /^Watchdog$/i }).getAttribute("href"),
		).toContain("issueSet=issue-set-2");
	});

	it("creates a new issue set draft from the current project", async () => {
		mockProjectData();
		vi.mocked(projectIssueSetService.saveIssueSet).mockResolvedValue({
			data: createSavedIssueSet({
				id: "issue-set-2",
				name: "Nanulak issued package",
				issueTag: "ISSUE-01",
				status: "draft",
				summary:
					"Project package draft is ready to move into standards review and transmittal assembly.",
			}),
			error: null,
		});

		render(
			<MemoryRouter>
				<ProjectIssueSetManager
					project={createProject()}
					telemetry={createTelemetry()}
					onOpenViewMode={vi.fn()}
				/>
			</MemoryRouter>,
		);

		expect(
			await screen.findByRole("button", {
				name: /create draft from current project/i,
			}),
		).toBeTruthy();
		fireEvent.click(
			screen.getByRole("button", {
				name: /create draft from current project/i,
			}),
		);

		await waitFor(() =>
			expect(screen.getByLabelText(/issue set name/i)).toBeTruthy(),
		);
		fireEvent.change(screen.getByLabelText(/issue set name/i), {
			target: { value: "Nanulak issued package" },
		});
		fireEvent.click(screen.getByRole("button", { name: /create issue set/i }));

		await waitFor(() =>
			expect(projectIssueSetService.saveIssueSet).toHaveBeenCalledTimes(1),
		);
		expect(projectIssueSetService.saveIssueSet).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "project-1",
				name: "Nanulak issued package",
				selectedDrawingPaths: ["Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg"],
					snapshot: expect.objectContaining({
						drawingCount: 4,
						selectedDrawingCount: 1,
						reviewItemCount: 0,
						standardsReviewCount: 0,
						trackedDrawingCount: 1,
						acceptedTitleBlockCount: 0,
						waivedStandardsCount: 0,
					}),
				}),
			null,
		);
		expect(showToast).toHaveBeenCalledWith(
			"success",
			"Issue set draft created.",
		);
	});

	it("exports an evidence packet for a saved issue set", async () => {
		const createObjectURL = vi.fn(() => "blob:test");
		const revokeObjectURL = vi.fn();
		const click = vi.fn();
		vi.stubGlobal("URL", {
			createObjectURL,
			revokeObjectURL,
		});
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
		mockProjectData([createSavedIssueSet()], [createReceipt()]);

		render(
			<MemoryRouter>
				<ProjectIssueSetManager
					project={createProject()}
					telemetry={createTelemetry()}
					onOpenViewMode={vi.fn()}
				/>
			</MemoryRouter>,
		);

		fireEvent.click(
			await screen.findByRole("button", { name: /export packet/i }),
		);

		expect(renderProjectIssueSetEvidencePacketMarkdown).toHaveBeenCalledTimes(
			1,
		);
		expect(createObjectURL).toHaveBeenCalledTimes(1);
		expect(click).toHaveBeenCalledTimes(1);
		expect(showToast).toHaveBeenCalledWith(
			"success",
			"Evidence packet exported.",
		);
	});
});
