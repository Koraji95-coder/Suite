import { beforeEach, describe, expect, it, vi } from "vitest";

const snapshotCacheMocks = vi.hoisted(() => ({
	loadProjectSetupDocumentSnapshotMock: vi.fn(),
}));

vi.mock("@/features/project-setup/snapshotService", () => ({
	loadProjectSetupDocumentSnapshot:
		snapshotCacheMocks.loadProjectSetupDocumentSnapshotMock,
}));

import { projectDocumentMetadataService } from "./service";

describe("projectDocumentMetadataService snapshot caching", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		snapshotCacheMocks.loadProjectSetupDocumentSnapshotMock.mockImplementation(
			async (args: { projectRootPath: string }) => ({
				projectRootPath: args.projectRootPath,
				profile: {
					blockName: "TB,TITLE-D",
					projectRootPath: args.projectRootPath,
					acadeProjectFilePath: `${args.projectRootPath}/wddemo.wdp`,
					acadeLine1: "Nanulak 180MW Substation",
					acadeLine2: "Issue for review",
					acadeLine4: "R3P-25074",
					signerDrawnBy: "KD",
					signerCheckedBy: "QA",
					signerEngineer: "",
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
					wdpPath: `${args.projectRootPath}/wddemo.wdp`,
					wdtPath: `${args.projectRootPath}/wddemo.wdt`,
					wdlPath: `${args.projectRootPath}/wddemo_wdtitle.wdl`,
					wdpText: "",
					wdtText: "",
					wdlText: "",
					wdpState: "existing" as const,
				},
				warnings: [],
			}),
		);
	});

	it("dedupes concurrent snapshot requests for the same project root", async () => {
		const [left, right] = await Promise.all([
			projectDocumentMetadataService.loadSnapshot({
				projectId: "project-1",
				projectRootPath: "C:/Projects/Nanulak",
			}),
			projectDocumentMetadataService.loadSnapshot({
				projectId: "project-1",
				projectRootPath: "C:/Projects/Nanulak",
			}),
		]);

		expect(left).toBe(right);
		expect(
			snapshotCacheMocks.loadProjectSetupDocumentSnapshotMock,
		).toHaveBeenCalledTimes(1);
	});

	it("bypasses the short-lived cache when report rows are supplied", async () => {
		await projectDocumentMetadataService.loadSnapshot({
			projectId: "project-2",
			projectRootPath: "C:/Projects/Nanulak",
		});

		await projectDocumentMetadataService.loadSnapshot({
			projectId: "project-2",
			projectRootPath: "C:/Projects/Nanulak",
			reportRows: [
				{
					fileName: "DEMO01.DWG",
					drawingNumber: "R3P-25074-E0-0001",
					title: "Drawing Index",
					revision: "A",
				},
			],
		});

		expect(
			snapshotCacheMocks.loadProjectSetupDocumentSnapshotMock,
		).toHaveBeenCalledTimes(2);
	});
});
