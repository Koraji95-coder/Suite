import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	projectDrawingProgramService,
	type ProjectDrawingProgramRecord,
	type ProjectDrawingStandardSnapshot,
} from "./projectDrawingProgramService";

const saveSettingMock = vi.hoisted(() => vi.fn());
const loadSettingMock = vi.hoisted(() => vi.fn());
const deleteSettingMock = vi.hoisted(() => vi.fn());

vi.mock("@/settings/userSettings", () => ({
	saveSetting: saveSettingMock,
	loadSetting: loadSettingMock,
	deleteSetting: deleteSettingMock,
}));

async function createOverrideWorkbook() {
	const workbook = new ExcelJS.Workbook();
	const starter = workbook.addWorksheet("Starter Matrix");
	starter.addRow([
		"Family Key",
		"Type Code",
		"Sheet Family",
		"Default Title",
		"Default Count",
		"Sequence Band Start",
		"Sequence Band End",
		"Sequence Digits",
		"Template Key",
		"Discipline",
		"ACADE Section",
	]);
	starter.addRow([
		"three-line",
		"E6",
		"Three Line Diagram",
		"Three Line Diagram",
		2,
		101,
		200,
		4,
		"3LINE",
		"E",
		"SCHEMATIC",
	]);
	const templates = workbook.addWorksheet("Template Map");
	templates.addRow(["Template Key", "Template Path", "ACADE Section"]);
	templates.addRow(["3LINE", "Templates/3line-template.dwg", "SCHEMATIC"]);
	return workbook.xlsx.writeBuffer();
}

function createProgram(projectId = "project-1"): ProjectDrawingProgramRecord {
	const timestamp = "2026-03-30T00:00:00.000Z";
	return {
		id: "program-1",
		projectId,
		activeStandardKey: "r3p-electrical-v1",
		standardSnapshotId: null,
		workbookMirror: {
			workbookRelativePath: "Drawing Index.xlsx",
			lastExportedAt: null,
			lastImportedAt: null,
			lastDriftEventAt: null,
		},
		rows: [],
		pendingTitleBlockSyncPaths: [],
		pendingTitleBlockSyncAt: null,
		lastAcadeSyncAt: null,
		acadeSyncPending: false,
		lastProvisionReceiptId: null,
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}

describe("projectDrawingProgramService", () => {
	beforeEach(() => {
		saveSettingMock.mockResolvedValue({ success: true });
		loadSettingMock.mockResolvedValue(null);
		deleteSettingMock.mockResolvedValue({ success: true });
		window.localStorage.clear();
	});

	it("returns the built-in R3P electrical catalog by default", async () => {
		const result = await projectDrawingProgramService.fetchStandardSnapshot(
			"project-1",
		);
		expect(result.error).toBeNull();
		expect(result.data?.standardKey).toBe("r3p-electrical-v1");
		expect(result.data?.source).toBe("builtin");
		const typeCodes = new Set(result.data?.catalogEntries.map((entry) => entry.typeCode));
		expect(typeCodes).toEqual(new Set(["E0", "E1", "E2", "E6"]));
		expect(
			result.data?.catalogEntries.some((entry) => entry.typeCode === "E3"),
		).toBe(false);
		expect(
			result.data?.catalogEntries.some((entry) => entry.typeCode === "E4"),
		).toBe(false);
		expect(
			result.data?.catalogEntries.some((entry) => entry.typeCode === "E5"),
		).toBe(false);
	});

	it("imports an override workbook into catalog entries", async () => {
		const buffer = await createOverrideWorkbook();
		const result = await projectDrawingProgramService.importStandardWorkbook({
			projectId: "project-1",
			fileName: "drawing-standard.xlsx",
			arrayBuffer: buffer,
		});
		expect(result.error).toBeNull();
		expect(result.data?.source).toBe("project-import");
		expect(result.data?.catalogEntries).toHaveLength(1);
		expect(result.data?.catalogEntries[0].templatePath).toBe(
			"Templates/3line-template.dwg",
		);
		expect(result.data?.catalogEntries[0].typeCode).toBe("E6");
		expect(result.data?.catalogEntries[0].familyKey).toBe("three-line");
	});

	it("bootstraps the minimal electrical starter pack", async () => {
		const standard = (
			await projectDrawingProgramService.fetchStandardSnapshot("project-1")
		).data as ProjectDrawingStandardSnapshot;
		const plan = projectDrawingProgramService.buildBootstrapPlan({
			projectId: "project-1",
			program: createProgram(),
			standardSnapshot: standard,
			projectNumber: "00001",
		});
		expect(plan.updatedProgram.rows).toHaveLength(3);
		expect(plan.updatedProgram.rows.map((row) => row.drawingNumber)).toEqual([
			"R3P-00001-E0-0000",
			"R3P-00001-E0-0001",
			"R3P-00001-E6-0001",
		]);
	});

	it("ripples only the affected family band when inserting three-lines", async () => {
		const standard = (
			await projectDrawingProgramService.fetchStandardSnapshot("project-1")
		).data as ProjectDrawingStandardSnapshot;
		const threeLine = standard.catalogEntries.find(
			(entry) => entry.familyKey === "three-line",
		);
		expect(threeLine).toBeTruthy();
		const existingProgram: ProjectDrawingProgramRecord = {
			...createProgram(),
			rows: [
				{
					id: "single-line-1",
					projectId: "project-1",
					standardRowId: "single-line",
					sortOrder: 10,
					drawingNumber: "R3P-00001-E6-0001",
					title: "Single Line Diagram",
					discipline: "E",
					sheetFamily: "Single Line Diagram",
					familyKey: "single-line",
					typeCode: "E6",
					sequenceBandStart: 1,
					sequenceBandEnd: 100,
					catalogSource: "builtin",
					templateKey: "SINGLE_LINE",
					templatePath: "Templates/single-line.dwg",
					status: "planned",
					provisionState: "provisioned",
					dwgRelativePath: "R3P-00001-E6-0001 - Single Line Diagram.dwg",
					acadeSection: "SCHEMATIC",
					acadeGroup: "DIAGRAMS",
					workbookSyncedAt: null,
					workbookDriftDetectedAt: null,
					numberPrefix: "R3P-00001-E6-",
					sequenceDigits: 4,
					sequenceNumber: 1,
					createdAt: "2026-03-30T00:00:00.000Z",
					updatedAt: "2026-03-30T00:00:00.000Z",
				},
				{
					id: "three-line-1",
					projectId: "project-1",
					standardRowId: threeLine?.id ?? null,
					sortOrder: 20,
					drawingNumber: "R3P-00001-E6-0101",
					title: "Three Line Diagram",
					discipline: "E",
					sheetFamily: "Three Line Diagram",
					familyKey: "three-line",
					typeCode: "E6",
					sequenceBandStart: 101,
					sequenceBandEnd: 200,
					catalogSource: "builtin",
					templateKey: "THREE_LINE",
					templatePath: "Templates/three-line.dwg",
					status: "planned",
					provisionState: "provisioned",
					dwgRelativePath: "R3P-00001-E6-0101 - Three Line Diagram.dwg",
					acadeSection: "SCHEMATIC",
					acadeGroup: "DIAGRAMS",
					workbookSyncedAt: null,
					workbookDriftDetectedAt: null,
					numberPrefix: "R3P-00001-E6-",
					sequenceDigits: 4,
					sequenceNumber: 101,
					createdAt: "2026-03-30T00:00:00.000Z",
					updatedAt: "2026-03-30T00:00:00.000Z",
				},
			],
		};
		const plan = projectDrawingProgramService.buildInsertPlan({
			projectId: "project-1",
			program: existingProgram,
			standardSnapshot: standard,
			standardRowId: threeLine!.id,
			projectNumber: "00001",
			insertBeforeRowId: "three-line-1",
			count: 1,
		});
		expect(plan.updatedProgram.rows.map((row) => row.drawingNumber)).toEqual([
			"R3P-00001-E6-0001",
			"R3P-00001-E6-0101",
			"R3P-00001-E6-0102",
		]);
		expect(
			plan.renumberPlan?.changes.some(
				(change) => change.oldDrawingNumber === "R3P-00001-E6-0001",
			),
		).toBe(false);
	});

	it("blocks overflow beyond a family band", async () => {
		const standard = (
			await projectDrawingProgramService.fetchStandardSnapshot("project-1")
		).data as ProjectDrawingStandardSnapshot;
		const threeLine = standard.catalogEntries.find(
			(entry) => entry.familyKey === "three-line",
		);
		expect(threeLine).toBeTruthy();
		const rows = Array.from({ length: 100 }, (_, index) => ({
			id: `three-line-${index + 1}`,
			projectId: "project-1",
			standardRowId: threeLine!.id,
			sortOrder: (index + 1) * 10,
			drawingNumber: `R3P-00001-E6-${String(101 + index).padStart(4, "0")}`,
			title: `Three Line Diagram ${index + 1}`,
			discipline: "E",
			sheetFamily: "Three Line Diagram",
			familyKey: "three-line",
			typeCode: "E6",
			sequenceBandStart: 101,
			sequenceBandEnd: 200,
			catalogSource: "builtin" as const,
			templateKey: "THREE_LINE",
			templatePath: "Templates/three-line.dwg",
			status: "planned" as const,
			provisionState: "provisioned" as const,
			dwgRelativePath: `R3P-00001-E6-${String(101 + index).padStart(4, "0")} - Three Line Diagram ${index + 1}.dwg`,
			acadeSection: "SCHEMATIC",
			acadeGroup: "DIAGRAMS",
			workbookSyncedAt: null,
			workbookDriftDetectedAt: null,
			numberPrefix: "R3P-00001-E6-",
			sequenceDigits: 4,
			sequenceNumber: 101 + index,
			createdAt: "2026-03-30T00:00:00.000Z",
			updatedAt: "2026-03-30T00:00:00.000Z",
		}));
		expect(() =>
			projectDrawingProgramService.buildInsertPlan({
				projectId: "project-1",
				program: {
					...createProgram(),
					rows,
				},
				standardSnapshot: standard,
				standardRowId: threeLine!.id,
				projectNumber: "00001",
				count: 1,
			}),
		).toThrow(/exceeds the 0101-0200 band/i);
	});
});
