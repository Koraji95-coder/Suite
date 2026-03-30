import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectFile } from "@/components/apps/projects/projectmanagertypes";
import type { ProjectDocumentMetadataRow } from "@/services/projectDocumentMetadataService";
import { projectDeliverableRegisterService } from "./projectDeliverableRegisterService";

vi.mock("@/settings/userSettings", () => ({
	loadSetting: vi.fn(async () => null),
	saveSetting: vi.fn(async () => ({ success: true, error: null })),
	deleteSetting: vi.fn(async () => ({ success: true, error: null })),
}));

vi.mock("@/supabase/client", () => ({
	supabase: {
		auth: {
			getUser: vi.fn(async () => ({
				data: { user: { id: "user-1" } },
				error: null,
			})),
		},
	},
}));

function createProjectFile(args: {
	id: string;
	name: string;
	filePath?: string;
}): ProjectFile {
	return {
		id: args.id,
		name: args.name,
		file_path: args.filePath ?? `project-1/${args.name}`,
		mime_type: "application/pdf",
		project_id: "project-1",
		user_id: "user-1",
		uploaded_at: "2026-03-25T00:00:00.000Z",
	} as ProjectFile;
}

function createMetadataRow(args: {
	id: string;
	fileName: string;
	drawingNumber: string;
	title: string;
	revision: string;
	acadeTitle?: string;
	acadeRevision?: string;
}): ProjectDocumentMetadataRow {
	return {
		id: args.id,
		projectId: "project-1",
		fileName: args.fileName,
		relativePath: `Issued/${args.fileName}`,
		absolutePath: `C:/Projects/Nanulak/Issued/${args.fileName}`,
		fileType: "dwg",
		drawingNumber: args.drawingNumber,
		title: args.title,
		revision: args.revision,
		source: "title_block_sync",
		reviewState: "ready",
		confidence: 1,
		titleBlockFound: true,
		hasWdTbConflict: false,
		currentAttributes: {},
		acadeValues: {
			TITLE3: args.acadeTitle ?? args.title,
			REV: args.acadeRevision ?? args.revision,
			DWGNO: args.drawingNumber,
		},
		suiteUpdates: {},
		revisionRows: [],
		issues: [],
		warnings: [],
		rawRow: {} as ProjectDocumentMetadataRow["rawRow"],
	};
}

async function createWorkbookBuffer() {
	const workbook = new ExcelJS.Workbook();
	const overall = workbook.addWorksheet("Overall");
	overall.addRow([
		"SET",
		"DRAWING NUMBER",
		"DRAWING DESCRIPTION",
		"REV",
		"DATE",
		"REV",
		"DATE",
		"STATUS",
		"NOTES",
	]);
	overall.addRow([
		"BESS",
		"R3P-25074-E0-0001",
		"Drawing Index",
		"A",
		"2026-03-01",
		"B",
		"2026-03-10",
		"READY FOR SUBMITTAL",
		"",
	]);

	const pc = workbook.addWorksheet("P&C");
	pc.addRow([
		"SET",
		"DRAWING NUMBER",
		"DRAWING DESCRIPTION",
		"REV",
		"DATE",
		"STATUS",
		"NOTES",
	]);
	pc.addRow([
		"P&C",
		"R3P-25074-E6-0001",
		"Relay One Line",
		"0",
		"2026-03-11",
		"READY FOR SUBMITTAL",
		"",
	]);
	pc.addRow([
		"P&C",
		"R3P-25074-E6-0999",
		"Future Control Detail",
		"",
		"",
		"READY FOR DRAFTING",
		"NOT CREATED YET",
	]);

	const buffer = await workbook.xlsx.writeBuffer();
	const bytes =
		buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	);
}

describe("projectDeliverableRegisterService", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("parses workbook sheets, revision history, pairing, and readiness rules", async () => {
		const arrayBuffer = await createWorkbookBuffer();
		const result = await projectDeliverableRegisterService.importWorkbook({
			projectId: "project-1",
			fileName: "Master Deliverable List.xlsx",
			arrayBuffer,
			projectFiles: [
				createProjectFile({
					id: "file-1",
					name: "R3P-25074-E0-0001 - DRAWING INDEX.pdf",
				}),
				createProjectFile({
					id: "file-2",
					name: "R3P-25074-E6-0001 - RELAY ONE LINE.pdf",
				}),
				createProjectFile({
					id: "file-3",
					name: "R3P-25074-E6-0001 - RELAY ONE LINE (SIGNED).pdf",
				}),
				createProjectFile({
					id: "file-4",
					name: "R3P-25074-E6-0999 - FUTURE DETAIL.pdf",
				}),
			],
			metadataRows: [
				createMetadataRow({
					id: "meta-1",
					fileName: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					drawingNumber: "R3P-25074-E0-0001",
					title: "Drawing Index",
					revision: "B",
				}),
				createMetadataRow({
					id: "meta-2",
					fileName: "R3P-25074-E6-0001 - RELAY ONE LINE.dwg",
					drawingNumber: "R3P-25074-E6-0001",
					title: "Relay Diagram",
					revision: "0",
					acadeTitle: "Relay Diagram",
				}),
			],
			dwgRootPath: "C:/Projects/Nanulak",
		});

		expect(result.error).toBeNull();
		expect(result.data?.sheetNames).toEqual(["Overall", "P&C"]);
		expect(result.data?.rowCount).toBe(3);

		const drawingIndexRow = result.data?.rows.find(
			(row) => row.drawingNumber === "R3P-25074-E0-0001",
		);
		expect(drawingIndexRow?.currentRevision).toBe("B");
		expect(drawingIndexRow?.revisionHistory).toHaveLength(2);
		expect(drawingIndexRow?.pdfPairingStatus).toBe("paired");
		expect(drawingIndexRow?.titleBlockVerificationState).toBe("matched");
		expect(drawingIndexRow?.acadeVerificationState).toBe("matched");
		expect(drawingIndexRow?.issueSetEligible).toBe(true);

		const relayRow = result.data?.rows.find(
			(row) => row.drawingNumber === "R3P-25074-E6-0001",
		);
		expect(relayRow?.pdfPairingStatus).toBe("multiple");
		expect(relayRow?.titleBlockVerificationState).toBe("mismatch");
		expect(relayRow?.titleBlockVerificationDetail).toContain(
			"Workbook title does not match title block metadata.",
		);
		expect(relayRow?.issueSetEligible).toBe(false);

		const futureRow = result.data?.rows.find(
			(row) => row.drawingNumber === "R3P-25074-E6-0999",
		);
		expect(futureRow?.readinessState).toBe("blocked");
		expect(futureRow?.titleBlockVerificationState).toBe("mismatch");
		expect(futureRow?.titleBlockVerificationDetail).toContain(
			"not created yet",
		);
		expect(futureRow?.issueSetEligible).toBe(false);
	});
});
