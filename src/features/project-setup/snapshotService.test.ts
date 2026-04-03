import { beforeEach, describe, expect, it, vi } from "vitest";

const snapshotServiceMocks = vi.hoisted(() => ({
	fetchProfileMock: vi.fn(),
	fetchEntriesMock: vi.fn(),
	issueTicketMock: vi.fn(),
	scanRootMock: vi.fn(),
	buildPreviewMock: vi.fn(),
}));

vi.mock("./backendService", () => ({
	projectSetupBackendService: {
		issueTicket: snapshotServiceMocks.issueTicketMock,
		buildPreview: snapshotServiceMocks.buildPreviewMock,
	},
}));

vi.mock("./companionService", () => ({
	projectSetupCompanionService: {
		scanRoot: snapshotServiceMocks.scanRootMock,
	},
}));

vi.mock("@/services/projectTitleBlockProfileService", async () => {
	const actual = await vi.importActual<
		typeof import("@/services/projectTitleBlockProfileService")
	>("@/services/projectTitleBlockProfileService");
	return {
		...actual,
		projectTitleBlockProfileService: {
			...actual.projectTitleBlockProfileService,
			fetchProfile: snapshotServiceMocks.fetchProfileMock,
		},
	};
});

vi.mock("@/services/projectRevisionRegisterService", async () => {
	const actual = await vi.importActual<
		typeof import("@/services/projectRevisionRegisterService")
	>("@/services/projectRevisionRegisterService");
	return {
		...actual,
		projectRevisionRegisterService: {
			...actual.projectRevisionRegisterService,
			fetchEntries: snapshotServiceMocks.fetchEntriesMock,
		},
	};
});

import { loadProjectSetupDocumentSnapshot } from "./snapshotService";

describe("projectSetup snapshotService", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		snapshotServiceMocks.fetchProfileMock.mockResolvedValue({
			data: {
				id: "profile-1",
				project_id: "project-1",
				user_id: "user-1",
				block_name: "TB,TITLE-D",
				project_root_path: "C:/Projects/Nanulak",
				acade_project_file_path: "C:/Projects/Nanulak/wddemo.wdp",
				acade_line1: "Nanulak 180MW Substation",
				acade_line2: "Issue for review",
				acade_line4: "R3P-25074",
				signer_drawn_by: "KD",
				signer_checked_by: "QA",
				signer_engineer: "APS",
				created_at: "2026-04-03T00:00:00.000Z",
				updated_at: "2026-04-03T00:00:00.000Z",
			},
			error: new Error("project_title_block_profiles is unavailable"),
		});

		snapshotServiceMocks.fetchEntriesMock.mockResolvedValue({
			data: [
				{
					id: "rev-1",
					project_id: "project-1",
					file_id: null,
					drawing_number: "R3P-25074-E6-0001",
					title: "Single Line Diagram",
					revision: "A",
					previous_revision: null,
					revision_description: "Issued for review",
					revision_by: "KD",
					revision_checked_by: "QA",
					revision_date: "2026-04-03",
					revision_sort_order: 1,
					issue_summary: "",
					issue_status: "open",
					issue_severity: "medium",
					source_kind: "manual",
					source_ref: null,
					autodraft_request_id: null,
					transmittal_number: null,
					transmittal_document_name: null,
					notes: null,
					user_id: "user-1",
					created_at: "2026-04-03T00:00:00.000Z",
					updated_at: "2026-04-03T00:00:00.000Z",
				},
			],
			error: new Error("drawing_revision_register_entries unavailable"),
		});

		snapshotServiceMocks.issueTicketMock.mockResolvedValue({
			ok: true,
			ticket: "ticket-1",
			requestId: "project-setup-snapshot-project-1-123",
			action: "scan-root",
			issuedAt: Date.now(),
			expiresAt: Date.now() + 180_000,
			ttlSeconds: 180,
			projectId: "project-1",
		});

		snapshotServiceMocks.scanRootMock.mockResolvedValue({
			success: true,
			message: "Scan complete",
			requestId: "scan-1",
			data: {
				projectRootPath: "C:/Projects/Nanulak",
				files: [],
				bridgeDrawings: [],
				artifacts: {
					wdpPath: "C:/Projects/Nanulak/wddemo.wdp",
					wdtPath: "C:/Projects/Nanulak/wddemo.wdt",
					wdlPath: "C:/Projects/Nanulak/wddemo_wdtitle.wdl",
					wdpText: "",
					wdtText: "",
					wdlText: "",
					wdpState: "existing",
				},
			},
			warnings: ["Local scan warning"],
		});

		snapshotServiceMocks.buildPreviewMock.mockResolvedValue({
			success: true,
			message: "Preview complete",
			requestId: "preview-1",
			data: {
				projectRootPath: "C:/Projects/Nanulak",
				profile: {
					blockName: "TB,TITLE-D",
					projectRootPath: "C:/Projects/Nanulak",
					acadeProjectFilePath: "C:/Projects/Nanulak/wddemo.wdp",
					acadeLine1: "Nanulak 180MW Substation",
					acadeLine2: "Issue for review",
					acadeLine4: "R3P-25074",
					signerDrawnBy: "KD",
					signerCheckedBy: "QA",
					signerEngineer: "APS",
				},
				drawings: [],
				summary: {
					totalFiles: 4,
					drawingFiles: 2,
					flaggedFiles: 0,
					suiteWriteCount: 0,
					acadeWriteCount: 0,
					wdTbConflictCount: 0,
				},
				artifacts: {
					wdpPath: "C:/Projects/Nanulak/wddemo.wdp",
					wdtPath: "C:/Projects/Nanulak/wddemo.wdt",
					wdlPath: "C:/Projects/Nanulak/wddemo_wdtitle.wdl",
					wdpText: "",
					wdtText: "",
					wdlText: "",
					wdpState: "existing",
				},
			},
			warnings: ["Preview warning", "Local scan warning"],
		});
	});

	it("loads snapshots through the ticketed scan and hosted preview flow", async () => {
		const result = await loadProjectSetupDocumentSnapshot({
			projectId: "project-1",
			projectRootPath: "C:/Projects/Nanulak",
		});

		expect(snapshotServiceMocks.issueTicketMock).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "scan-root",
				projectId: "project-1",
				requestId: expect.stringContaining("project-setup-snapshot-project-1-"),
			}),
		);
		expect(snapshotServiceMocks.scanRootMock).toHaveBeenCalledWith(
			expect.objectContaining({
				ticket: "ticket-1",
			}),
			expect.objectContaining({
				projectRootPath: "C:/Projects/Nanulak",
				profile: expect.objectContaining({
					blockName: "TB,TITLE-D",
					projectRootPath: "C:/Projects/Nanulak",
				}),
			}),
		);
		expect(snapshotServiceMocks.buildPreviewMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "project-1",
				projectRootPath: "C:/Projects/Nanulak",
				scanSnapshot: expect.objectContaining({
					projectRootPath: "C:/Projects/Nanulak",
				}),
				revisionEntries: expect.arrayContaining([
					expect.objectContaining({
						id: "rev-1",
					}),
				]),
			}),
		);
		expect(result.summary.drawingFiles).toBe(2);
		expect(result.artifacts.wdpPath).toBe("C:/Projects/Nanulak/wddemo.wdp");
		expect(result.warnings).toEqual([
			"Local scan warning",
			"Preview warning",
			"Hosted revision history is unavailable right now, so Suite is using local revision data where available.",
		]);
	});

	it("surfaces hosted preview failures with the combined workflow message", async () => {
		snapshotServiceMocks.buildPreviewMock.mockResolvedValueOnce({
			success: false,
			message: "Preview failed",
			warnings: ["Scan artifacts are incomplete."],
		});

		await expect(
			loadProjectSetupDocumentSnapshot({
				projectId: "project-1",
				projectRootPath: "C:/Projects/Nanulak",
			}),
		).rejects.toThrow("Preview failed Scan artifacts are incomplete.");
	});
});
