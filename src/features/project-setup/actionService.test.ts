import { beforeEach, describe, expect, it, vi } from "vitest";

const actionServiceMocks = vi.hoisted(() => ({
	issueTicketMock: vi.fn(),
	buildPreviewMock: vi.fn(),
	recordResultMock: vi.fn(),
	scanRootMock: vi.fn(),
	ensureArtifactsMock: vi.fn(),
	createAcadeMock: vi.fn(),
	openAcadeMock: vi.fn(),
	applyTitleBlockMock: vi.fn(),
}));

vi.mock("./backendService", () => ({
	projectSetupBackendService: {
		issueTicket: actionServiceMocks.issueTicketMock,
		buildPreview: actionServiceMocks.buildPreviewMock,
		recordResult: actionServiceMocks.recordResultMock,
	},
}));

vi.mock("./companionService", () => ({
	projectSetupCompanionService: {
		scanRoot: actionServiceMocks.scanRootMock,
		ensureArtifacts: actionServiceMocks.ensureArtifactsMock,
		createAcade: actionServiceMocks.createAcadeMock,
		openAcade: actionServiceMocks.openAcadeMock,
		applyTitleBlock: actionServiceMocks.applyTitleBlockMock,
	},
}));

import { projectSetupActionService } from "./actionService";
import type { TitleBlockSyncPayload } from "./types";

function buildDrawingRow(overrides: Record<string, unknown> = {}) {
	return {
		id: "row-1",
		fileName: "PROJ-00001-E6-0001.dwg",
		relativePath: "Issued/PROJ-00001-E6-0001.dwg",
		absolutePath: "C:/Projects/MyProject/Issued/PROJ-00001-E6-0001.dwg",
		fileType: "dwg",
		filenameDrawingNumber: "PROJ-00001-E6-0001",
		filenameTitle: "Single Line",
		filenameRevision: "A",
		titleBlockFound: true,
		effectiveBlockName: "TB,TITLE-D",
		layoutName: "Layout1",
		titleBlockHandle: "ABCD",
		hasWdTbConflict: false,
		currentAttributes: {},
		editableFields: {
			scale: "NTS",
			drawnBy: "KD",
			drawnDate: "2026-04-03",
			checkedBy: "QA",
			checkedDate: "2026-04-03",
			engineer: "APS",
			engineerDate: "2026-04-03",
		},
		issues: [],
		warnings: [],
		revisionEntryCount: 0,
		drawingNumber: "PROJ-00001-E6-0001",
		drawingTitle: "Single Line",
		acadeValues: {},
		acadeExpectedTags: {},
		suiteUpdates: {
			TITLE3: "Single Line",
		},
		pendingSuiteWrites: [],
		pendingAcadeWrites: [],
		revisionRows: [],
		...overrides,
	};
}

function buildPayload(overrides: Partial<TitleBlockSyncPayload> = {}): TitleBlockSyncPayload {
	return {
		projectId: "project-1",
		projectRootPath: "C:/Projects/MyProject",
		profile: {
			blockName: "TB,TITLE-D",
			projectRootPath: "C:/Projects/MyProject",
			acadeProjectFilePath: "C:/Projects/MyProject/wddemo.wdp",
			acadeLine1: "MyProject Substation",
			acadeLine2: "Issue for review",
			acadeLine4: "PROJ-00001",
			signerDrawnBy: "KD",
			signerCheckedBy: "QA",
			signerEngineer: "APS",
		},
		revisionEntries: [],
		rows: [],
		selectedRelativePaths: [],
		triggerAcadeUpdate: false,
		...overrides,
	};
}

describe("projectSetupActionService", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		actionServiceMocks.issueTicketMock
			.mockResolvedValueOnce({
				ok: true,
				ticket: "scan-ticket",
				requestId: "scan-request",
				action: "scan-root",
				issuedAt: Date.now(),
				expiresAt: Date.now() + 180_000,
				ttlSeconds: 180,
				projectId: "project-1",
			})
			.mockResolvedValueOnce({
				ok: true,
				ticket: "ensure-ticket",
				requestId: "ensure-request",
				action: "ensure-artifacts",
				issuedAt: Date.now(),
				expiresAt: Date.now() + 180_000,
				ttlSeconds: 180,
				projectId: "project-1",
			});

		actionServiceMocks.scanRootMock.mockResolvedValue({
			success: true,
			message: "Scan complete",
			requestId: "scan-request",
			data: {
				projectRootPath: "C:/Projects/MyProject",
				files: [],
				bridgeDrawings: [],
				artifacts: {
					wdpPath: "C:/Projects/MyProject/wddemo.wdp",
					wdtPath: "C:/Projects/MyProject/wddemo.wdt",
					wdlPath: "C:/Projects/MyProject/wddemo_wdtitle.wdl",
					wdpText: "",
					wdtText: "",
					wdlText: "",
					wdpState: "existing",
				},
			},
			warnings: [],
		});

		actionServiceMocks.buildPreviewMock.mockResolvedValue({
			success: true,
			message: "Preview complete",
			requestId: "preview-request",
			data: {
				projectRootPath: "C:/Projects/MyProject",
				profile: {
					blockName: "TB,TITLE-D",
					projectRootPath: "C:/Projects/MyProject",
					acadeProjectFilePath: "C:/Projects/MyProject/wddemo.wdp",
					acadeLine1: "MyProject Substation",
					acadeLine2: "Issue for review",
					acadeLine4: "PROJ-00001",
					signerDrawnBy: "KD",
					signerCheckedBy: "QA",
					signerEngineer: "APS",
				},
				drawings: [
					buildDrawingRow(),
				],
				summary: {
					totalFiles: 1,
					drawingFiles: 1,
					flaggedFiles: 0,
					suiteWriteCount: 0,
					acadeWriteCount: 0,
					wdTbConflictCount: 0,
				},
				artifacts: {
					wdpPath: "C:/Projects/MyProject/wddemo.wdp",
					wdtPath: "C:/Projects/MyProject/wddemo.wdt",
					wdlPath: "C:/Projects/MyProject/wddemo_wdtitle.wdl",
					wdpText: "",
					wdtText: "",
					wdlText: "",
					wdpState: "existing",
				},
			},
			warnings: [],
		});

		actionServiceMocks.ensureArtifactsMock.mockResolvedValue({
			success: true,
			message: "Artifacts ready",
			requestId: "ensure-request",
			data: {
				wdpPath: "C:/Projects/MyProject/wddemo.wdp",
				wdtPath: "C:/Projects/MyProject/wddemo.wdt",
				wdlPath: "C:/Projects/MyProject/wddemo_wdtitle.wdl",
				wdpText: "",
				wdtText: "",
				wdlText: "",
				wdpState: "existing",
			},
			warnings: [],
		});
	});

	it("runs ensure-artifacts through the feature-owned preview and companion flow", async () => {
		const response = await projectSetupActionService.ensureArtifacts(buildPayload());

		expect(actionServiceMocks.scanRootMock).toHaveBeenCalledTimes(1);
		expect(actionServiceMocks.buildPreviewMock).toHaveBeenCalledTimes(1);
		expect(actionServiceMocks.ensureArtifactsMock).toHaveBeenCalledTimes(1);
		expect(actionServiceMocks.recordResultMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "project-1",
				action: "ensure-artifacts",
				status: "success",
			}),
		);
		expect(response.success).toBe(true);
		expect(response.data?.artifacts.wdpPath).toBe("C:/Projects/MyProject/wddemo.wdp");
	});

	it("keeps the apply conflict envelope backward compatible", async () => {
		actionServiceMocks.buildPreviewMock.mockResolvedValueOnce({
			success: true,
			message: "Preview complete",
			requestId: "preview-request",
			data: {
				projectRootPath: "C:/Projects/MyProject",
				profile: buildPayload().profile,
				drawings: [buildDrawingRow({ hasWdTbConflict: true })],
				summary: {
					totalFiles: 1,
					drawingFiles: 1,
					flaggedFiles: 1,
					suiteWriteCount: 0,
					acadeWriteCount: 0,
					wdTbConflictCount: 1,
				},
				artifacts: {
					wdpPath: "C:/Projects/MyProject/wddemo.wdp",
					wdtPath: "C:/Projects/MyProject/wddemo.wdt",
					wdlPath: "C:/Projects/MyProject/wddemo_wdtitle.wdl",
					wdpText: "",
					wdtText: "",
					wdlText: "",
					wdpState: "existing",
				},
			},
			warnings: [],
		});

		const response = await projectSetupActionService.apply(buildPayload());

		expect(response).toEqual({
			success: false,
			code: "INVALID_REQUEST",
			message: "WD_TB conflicts must be removed before apply.",
			requestId: "preview-request",
			warnings: [],
		});
		expect(actionServiceMocks.ensureArtifactsMock).not.toHaveBeenCalled();
		expect(actionServiceMocks.applyTitleBlockMock).not.toHaveBeenCalled();
	});
});
