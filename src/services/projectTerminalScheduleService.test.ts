import ExcelJS from "exceljs";
import { beforeEach, describe, expect, test, vi } from "vitest";

const settingsStore = new Map<string, unknown>();

vi.mock("@/settings/userSettings", () => ({
	loadSetting: vi.fn(async (key: string, scope: string) =>
		settingsStore.get(`${key}:${scope}`) ?? null,
	),
	saveSetting: vi.fn(async (key: string, value: unknown, scope: string) => {
		settingsStore.set(`${key}:${scope}`, value);
		return { success: true, error: null };
	}),
	deleteSetting: vi.fn(async (key: string, scope: string) => {
		settingsStore.delete(`${key}:${scope}`);
		return { success: true, error: null };
	}),
}));

import { projectTerminalScheduleService } from "@/services/projectTerminalScheduleService";

async function buildWorkbookArrayBuffer(
	configure: (workbook: ExcelJS.Workbook) => void,
) {
	const workbook = new ExcelJS.Workbook();
	configure(workbook);
	const buffer = await workbook.xlsx.writeBuffer();
	return buffer as unknown as ArrayBuffer;
}

describe("projectTerminalScheduleService", () => {
	beforeEach(() => {
		settingsStore.clear();
		localStorage.clear();
	});

	test("imports a terminal workbook and normalizes labels plus connections", async () => {
		const arrayBuffer = await buildWorkbookArrayBuffer((workbook) => {
			const strips = workbook.addWorksheet("TerminalStrips");
			strips.addRow([
				"DrawingPath",
				"PanelId",
				"Side",
				"StripId",
				"TerminalCount",
				"LabelsCsv",
			]);
			strips.addRow([
				"DWGS\\E-101.dwg",
				"P1",
				"Left",
				"TB1",
				3,
				"L1;L2",
			]);

			const connections = workbook.addWorksheet("TerminalConnections");
			connections.addRow([
				"DrawingPath",
				"RouteRef",
				"RouteType",
				"CableType",
				"WireFunction",
				"FromStripId",
				"FromTerminal",
				"ToStripId",
				"ToTerminal",
				"AnnotateRef",
			]);
			connections.addRow([
				"DWGS\\E-101.dwg",
				"R-01",
				"jumper",
				"THHN",
				"Control",
				"TB1",
				1,
				"TB2",
				2,
				"false",
			]);
		});

		const result = await projectTerminalScheduleService.importWorkbook({
			projectId: "project-alpha",
			fileName: "terminal-authoring.xlsx",
			arrayBuffer,
		});

		expect(result.error).toBeNull();
		expect(result.data).not.toBeNull();
		expect(result.data?.stripRowCount).toBe(1);
		expect(result.data?.connectionRowCount).toBe(1);
		expect(result.data?.warnings).toContain(
			"TerminalStrips row 2 declared 3 terminals but supplied 2 label value(s); Suite padded/truncated the labels.",
		);
		expect(result.data?.stripRows[0]?.labels).toEqual(["L1", "L2", ""]);
		expect(result.data?.stripRows[0]?.side).toBe("L");
		expect(result.data?.connectionRows[0]?.routeType).toBe("jumper");
		expect(result.data?.connectionRows[0]?.annotateRef).toBe(false);
	});

	test("rejects workbooks without the required TerminalStrips sheet", async () => {
		const arrayBuffer = await buildWorkbookArrayBuffer((workbook) => {
			const sheet = workbook.addWorksheet("OtherSheet");
			sheet.addRow(["Value"]);
			sheet.addRow(["ignored"]);
		});

		const result = await projectTerminalScheduleService.importWorkbook({
			projectId: "project-alpha",
			fileName: "invalid-terminal-authoring.xlsx",
			arrayBuffer,
		});

		expect(result.data).toBeNull();
		expect(result.error?.message).toBe(
			"Workbook must include a 'TerminalStrips' sheet.",
		);
	});
});
