import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { titleBlockSyncService } from "@/services/titleBlockSyncService";
import { projectDocumentMetadataService } from "@/services/projectDocumentMetadataService";
import { projectRevisionRegisterService } from "@/services/projectRevisionRegisterService";
import {
	DEFAULT_PROJECT_TITLE_BLOCK_NAME,
	projectTitleBlockProfileService,
} from "@/services/projectTitleBlockProfileService";
import { ProjectSetupReadinessPanel } from "./ProjectSetupReadinessPanel";
import type { Project } from "./projectmanagertypes";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";

const projectSetupReadinessMocks = vi.hoisted(() => ({
	showToastMock: vi.fn(),
	openProjectMock: vi.fn(),
}));

vi.mock("@/components/notification-system/ToastProvider", () => ({
	useToast: () => ({
		showToast: projectSetupReadinessMocks.showToastMock,
	}),
}));

vi.mock("@/services/projectTitleBlockProfileService", async () => {
	const actual = await vi.importActual<
		typeof import("@/services/projectTitleBlockProfileService")
	>("@/services/projectTitleBlockProfileService");
	return {
		...actual,
		projectTitleBlockProfileService: {
			...actual.projectTitleBlockProfileService,
			fetchProfile: vi.fn(),
		},
	};
});

vi.mock("@/services/projectRevisionRegisterService", () => ({
	projectRevisionRegisterService: {
		fetchEntries: vi.fn(),
	},
}));

vi.mock("@/services/projectDocumentMetadataService", () => ({
	projectDocumentMetadataService: {
		loadSnapshot: vi.fn(),
	},
}));

vi.mock("@/services/titleBlockSyncService", async () => {
	const actual = await vi.importActual<
		typeof import("@/services/titleBlockSyncService")
	>("@/services/titleBlockSyncService");
	return {
		...actual,
		titleBlockSyncService: {
			...actual.titleBlockSyncService,
			openProject: projectSetupReadinessMocks.openProjectMock,
		},
	};
});

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
		watchdog_root_path: null,
		...overrides,
	} as Project;
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("ProjectSetupReadinessPanel", () => {
	it("shows setup gaps when the project is not configured", async () => {
		vi.mocked(projectTitleBlockProfileService.fetchProfile).mockResolvedValue({
			data: {
				id: "profile-1",
				project_id: "project-1",
				user_id: "user-1",
				block_name: DEFAULT_PROJECT_TITLE_BLOCK_NAME,
				project_root_path: null,
				acade_project_file_path: null,
				acade_line1: "",
				acade_line2: "",
				acade_line4: "",
				signer_drawn_by: "",
				signer_checked_by: "",
				signer_engineer: "",
				created_at: "2026-03-20T00:00:00.000Z",
				updated_at: "2026-03-20T00:00:00.000Z",
			},
			error: null,
		});
		vi.mocked(projectRevisionRegisterService.fetchEntries).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(projectDocumentMetadataService.loadSnapshot).mockResolvedValue({
			projectId: "project-1",
			projectRootPath: "C:/Projects/Nanulak",
			profile: {
				blockName: DEFAULT_PROJECT_TITLE_BLOCK_NAME,
				projectRootPath: "C:/Projects/Nanulak",
				acadeProjectFilePath: null,
				acadeLine1: "",
				acadeLine2: "",
				acadeLine4: "",
				signerDrawnBy: "",
				signerCheckedBy: "",
				signerEngineer: "",
			},
			summary: {
				totalFiles: 0,
				drawingFiles: 0,
				flaggedFiles: 0,
				suiteWriteCount: 0,
				acadeWriteCount: 0,
				wdTbConflictCount: 0,
			},
			artifacts: {
				wdpPath: "C:/Projects/Nanulak/Nanulak.wdp",
				wdtPath: "C:/Projects/Nanulak/Nanulak.wdt",
				wdlPath: "C:/Projects/Nanulak/Nanulak.wdl",
				wdpText: "",
				wdtText: "",
				wdlText: "",
				wdpState: "starter",
			},
			rows: [],
			titleBlockRows: [],
			warnings: [
				"Live drawing metadata is not connected right now, so Suite is pairing drawing rows by filename until the DWG bridge is available.",
			],
		});

		render(
			<MemoryRouter>
				<ProjectSetupReadinessPanel
					project={createProject()}
					telemetry={createTelemetry()}
				/>
			</MemoryRouter>,
		);

		await waitFor(() =>
			expect(
				screen.getByText("No tracking root is configured yet."),
			).toBeTruthy(),
		);
		expect(screen.getByText(/Only the base block is configured/i)).toBeTruthy();
		expect(screen.getByText(/No revision register entries yet/i)).toBeTruthy();
		expect(screen.getByText(/ACADE project setup/i)).toBeTruthy();
		expect(screen.getByText(/Project number/i)).toBeTruthy();
		expect(
			screen.getByText(
				/ACADE scaffold not written yet/i,
			),
		).toBeTruthy();
		expect(
			screen.getByText(
				/Save the project once with a valid root and Suite will create the starter \.wdp\/\.wdt\/\.wdl files automatically/i,
			),
		).toBeTruthy();
		expect(
			screen.getByText(
				/Create the support files first, then verify the live drawings before you build the package/i,
			),
		).toBeTruthy();
		expect(
			screen.queryByText(/Live drawing metadata is not connected right now/i),
		).toBeNull();
	});

	it("shows starter scaffold status when Suite has derived support artifacts", async () => {
		vi.mocked(projectTitleBlockProfileService.fetchProfile).mockResolvedValue({
			data: {
				id: "profile-1",
				project_id: "project-1",
				user_id: "user-1",
				block_name: DEFAULT_PROJECT_TITLE_BLOCK_NAME,
				project_root_path: "C:/Projects/Nanulak",
				acade_project_file_path: null,
				acade_line1: "Nanulak 180MW Substation",
				acade_line2: "Issue for review",
				acade_line4: "R3P-25074",
				signer_drawn_by: "KD",
				signer_checked_by: "QA",
				signer_engineer: "",
				created_at: "2026-03-20T00:00:00.000Z",
				updated_at: "2026-03-20T00:00:00.000Z",
			},
			error: null,
		});
		vi.mocked(projectRevisionRegisterService.fetchEntries).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(projectDocumentMetadataService.loadSnapshot).mockResolvedValue({
			projectId: "project-1",
			projectRootPath: "C:/Projects/Nanulak",
			profile: {
				blockName: DEFAULT_PROJECT_TITLE_BLOCK_NAME,
				projectRootPath: "C:/Projects/Nanulak",
				acadeProjectFilePath: null,
				acadeLine1: "Nanulak 180MW Substation",
				acadeLine2: "Issue for review",
				acadeLine4: "R3P-25074",
				signerDrawnBy: "KD",
				signerCheckedBy: "QA",
				signerEngineer: "",
			},
			summary: {
				totalFiles: 4,
				drawingFiles: 1,
				flaggedFiles: 0,
				suiteWriteCount: 0,
				acadeWriteCount: 0,
				wdTbConflictCount: 0,
			},
			artifacts: {
				wdpPath: "C:/Projects/Nanulak/Nanulak.wdp",
				wdtPath: "C:/Projects/Nanulak/Nanulak.wdt",
				wdlPath: "C:/Projects/Nanulak/Nanulak.wdl",
				wdpText: "",
				wdtText: "",
				wdlText: "",
				wdpState: "starter",
			},
			rows: [],
			titleBlockRows: [],
			warnings: [],
		});

		render(
			<MemoryRouter>
				<ProjectSetupReadinessPanel
					project={createProject({
						watchdog_root_path: "C:/Projects/Nanulak",
					})}
					telemetry={createTelemetry({
						ruleConfigured: true,
						rule: {
							projectId: "project-1",
							roots: ["C:/Projects/Nanulak"],
							includeGlobs: ["**/*.dwg"],
							excludeGlobs: [],
							drawingPatterns: ["R3P-*.dwg"],
							metadata: {},
							updatedAt: Date.now(),
						},
					})}
				/>
			</MemoryRouter>,
		);

		await waitFor(() =>
			expect(screen.getByText(/Suite starter scaffold active/i)).toBeTruthy(),
		);
		expect(
			screen.getByText(
				/Suite is using a starter \.wdp scaffold and companion \.wdt\/\.wdl files/i,
			),
		).toBeTruthy();
	});

	it("shows a ready setup when tracking, defaults, and revision history exist", async () => {
		vi.mocked(projectTitleBlockProfileService.fetchProfile).mockResolvedValue({
			data: {
				id: "profile-1",
				project_id: "project-1",
				user_id: "user-1",
				block_name: DEFAULT_PROJECT_TITLE_BLOCK_NAME,
				project_root_path: "C:/Projects/Nanulak",
				acade_project_file_path: "C:/Projects/Nanulak/Nanulak.wdp",
				acade_line1: "Nanulak 180MW Substation",
				acade_line2: "Issue for review",
				acade_line4: "R3P-25074",
				signer_drawn_by: "KD",
				signer_checked_by: "QA",
				signer_engineer: "",
				created_at: "2026-03-20T00:00:00.000Z",
				updated_at: "2026-03-20T00:00:00.000Z",
			},
			error: null,
		});
		vi.mocked(projectRevisionRegisterService.fetchEntries).mockResolvedValue({
			data: [
				{
					id: "rev-1",
					project_id: "project-1",
					file_id: null,
					drawing_number: "R3P-25074-E0-0001",
					title: "Drawing Index",
					revision: "A",
					previous_revision: null,
					revision_description: "Initial issue",
					revision_by: "KD",
					revision_checked_by: "QA",
					revision_date: "2026-03-20",
					revision_sort_order: 1,
					issue_summary: "Issued for review",
					issue_status: "resolved",
					issue_severity: "low",
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
		vi.mocked(projectDocumentMetadataService.loadSnapshot).mockResolvedValue({
			projectId: "project-1",
			projectRootPath: "C:/Projects/Nanulak",
			profile: {
				blockName: DEFAULT_PROJECT_TITLE_BLOCK_NAME,
				projectRootPath: "C:/Projects/Nanulak",
				acadeProjectFilePath: "C:/Projects/Nanulak/Nanulak.wdp",
				acadeLine1: "Nanulak 180MW Substation",
				acadeLine2: "Issue for review",
				acadeLine4: "R3P-25074",
				signerDrawnBy: "KD",
				signerCheckedBy: "QA",
				signerEngineer: "",
			},
			summary: {
				totalFiles: 4,
				drawingFiles: 1,
				flaggedFiles: 0,
				suiteWriteCount: 0,
				acadeWriteCount: 0,
				wdTbConflictCount: 0,
			},
			artifacts: {
				wdpPath: "C:/Projects/Nanulak/Nanulak.wdp",
				wdtPath: "C:/Projects/Nanulak/Nanulak.wdt",
				wdlPath: "C:/Projects/Nanulak/Nanulak.wdl",
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
				<ProjectSetupReadinessPanel
					project={createProject({
						watchdog_root_path: "C:/Projects/Nanulak",
					})}
					telemetry={createTelemetry({
						ruleConfigured: true,
						rule: {
							projectId: "project-1",
							roots: ["C:/Projects/Nanulak"],
							includeGlobs: ["**/*.dwg"],
							excludeGlobs: [],
							drawingPatterns: ["R3P-*.dwg"],
							metadata: {},
							updatedAt: Date.now(),
						},
					})}
				/>
			</MemoryRouter>,
		);

		await waitFor(() =>
			expect(
				screen.getByText(/Project root and shared mapping rules are in place/i),
			).toBeTruthy(),
		);
		expect(screen.getByText(/project defaults set/i)).toBeTruthy();
		expect(
			screen.getByText(/Revision history is in place for issue-set review/i),
		).toBeTruthy();
		expect(screen.getByText("R3P-25074")).toBeTruthy();
		expect(screen.getByText("C:/Projects/Nanulak/Nanulak.wdp")).toBeTruthy();
		expect(
			screen.getAllByText(/Existing ACADE project file/i).length,
		).toBeGreaterThan(0);
		expect(
			screen.getByText(
				/Suite detected an existing \.wdp and will preserve it/i,
			),
		).toBeTruthy();
	});

	it("opens the derived ACADE project from the support files card", async () => {
		projectSetupReadinessMocks.openProjectMock.mockResolvedValue({
			success: true,
			message: "ACADE project open requested.",
			data: {
				projectRootPath: "C:/Projects/Nanulak",
				profile: {
					blockName: DEFAULT_PROJECT_TITLE_BLOCK_NAME,
					projectRootPath: "C:/Projects/Nanulak",
					acadeProjectFilePath: "C:/Projects/Nanulak/Nanulak.wdp",
					acadeLine1: "Nanulak 180MW Substation",
					acadeLine2: "Issue for review",
					acadeLine4: "R3P-25074",
					signerDrawnBy: "KD",
					signerCheckedBy: "QA",
					signerEngineer: "",
				},
				drawings: [],
				summary: {
					totalFiles: 0,
					drawingFiles: 0,
					flaggedFiles: 0,
					suiteWriteCount: 0,
					acadeWriteCount: 0,
					wdTbConflictCount: 0,
				},
				artifacts: {
					wdpPath: "C:/Projects/Nanulak/Nanulak.wdp",
					wdtPath: "C:/Projects/Nanulak/Nanulak.wdt",
					wdlPath: "C:/Projects/Nanulak/Nanulak.wdl",
					wdpText: "",
					wdtText: "",
					wdlText: "",
					wdpState: "starter",
				},
			},
		});
		vi.mocked(projectTitleBlockProfileService.fetchProfile).mockResolvedValue({
			data: {
				id: "profile-1",
				project_id: "project-1",
				user_id: "user-1",
				block_name: DEFAULT_PROJECT_TITLE_BLOCK_NAME,
				project_root_path: "C:/Projects/Nanulak",
				acade_project_file_path: "C:/Projects/Nanulak/Nanulak.wdp",
				acade_line1: "Nanulak 180MW Substation",
				acade_line2: "Issue for review",
				acade_line4: "R3P-25074",
				signer_drawn_by: "KD",
				signer_checked_by: "QA",
				signer_engineer: "",
				created_at: "2026-03-20T00:00:00.000Z",
				updated_at: "2026-03-20T00:00:00.000Z",
			},
			error: null,
		});
		vi.mocked(projectRevisionRegisterService.fetchEntries).mockResolvedValue({
			data: [],
			error: null,
		});
		vi.mocked(projectDocumentMetadataService.loadSnapshot).mockResolvedValue({
			projectId: "project-1",
			projectRootPath: "C:/Projects/Nanulak",
			profile: {
				blockName: DEFAULT_PROJECT_TITLE_BLOCK_NAME,
				projectRootPath: "C:/Projects/Nanulak",
				acadeProjectFilePath: "C:/Projects/Nanulak/Nanulak.wdp",
				acadeLine1: "Nanulak 180MW Substation",
				acadeLine2: "Issue for review",
				acadeLine4: "R3P-25074",
				signerDrawnBy: "KD",
				signerCheckedBy: "QA",
				signerEngineer: "",
			},
			summary: {
				totalFiles: 4,
				drawingFiles: 1,
				flaggedFiles: 0,
				suiteWriteCount: 0,
				acadeWriteCount: 0,
				wdTbConflictCount: 0,
			},
			artifacts: {
				wdpPath: "C:/Projects/Nanulak/Nanulak.wdp",
				wdtPath: "C:/Projects/Nanulak/Nanulak.wdt",
				wdlPath: "C:/Projects/Nanulak/Nanulak.wdl",
				wdpText: "",
				wdtText: "",
				wdlText: "",
				wdpState: "starter",
			},
			rows: [],
			titleBlockRows: [],
			warnings: [],
		});

		render(
			<MemoryRouter>
				<ProjectSetupReadinessPanel
					project={createProject({
						watchdog_root_path: "C:/Projects/Nanulak",
					})}
					telemetry={createTelemetry()}
				/>
			</MemoryRouter>,
		);

		const openButton = await screen.findByRole("button", {
			name: /open in acade/i,
		});
		fireEvent.click(openButton);

		await waitFor(() =>
			expect(projectSetupReadinessMocks.openProjectMock).toHaveBeenCalledWith({
				projectId: "project-1",
				projectRootPath: "C:/Projects/Nanulak",
				profile: {
					blockName: DEFAULT_PROJECT_TITLE_BLOCK_NAME,
					projectRootPath: "C:/Projects/Nanulak",
					acadeProjectFilePath: "C:/Projects/Nanulak/Nanulak.wdp",
					acadeLine1: "Nanulak 180MW Substation",
					acadeLine2: "Issue for review",
					acadeLine4: "R3P-25074",
					signerDrawnBy: "KD",
					signerCheckedBy: "QA",
					signerEngineer: "",
				},
				revisionEntries: [],
				rows: [],
				selectedRelativePaths: [],
				triggerAcadeUpdate: false,
			}),
		);
		expect(projectSetupReadinessMocks.showToastMock).toHaveBeenCalledWith(
			"success",
			"ACADE project open requested.",
		);
		expect(titleBlockSyncService.openProject).toBe(
			projectSetupReadinessMocks.openProjectMock,
		);
	});
});
