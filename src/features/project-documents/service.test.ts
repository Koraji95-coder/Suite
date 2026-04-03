import { describe, expect, it } from "vitest";
import type { TitleBlockSyncRow } from "@/features/project-setup/types";
import {
	buildProjectDocumentMetadataRows,
	buildStandardDocumentsFromProjectMetadata,
	parseAcadeDocumentReportFile,
} from "./service";

function makeTitleBlockSyncRow(
	overrides: Partial<TitleBlockSyncRow> = {},
): TitleBlockSyncRow {
	return {
		id: "row-1",
		fileName: "R3P-25074-E6-0001.dwg",
		relativePath: "Drawings/R3P-25074-E6-0001.dwg",
		absolutePath: "C:/Projects/R3P-25074/Drawings/R3P-25074-E6-0001.dwg",
		fileType: "dwg",
		filenameDrawingNumber: "R3P-25074-E6-0001",
		filenameTitle: "Overall Single Line Diagram",
		filenameRevision: "A",
		titleBlockFound: true,
		effectiveBlockName: "R3P-24x36BORDER&TITLE",
		layoutName: "Layout1",
		titleBlockHandle: "ABCD",
		hasWdTbConflict: false,
		currentAttributes: {
			DWGNO: "R3P-25074-E6-0001",
			TITLE3: "Overall Single Line Diagram",
			REV: "A",
		},
		editableFields: {
			scale: "NTS",
			drawnBy: "KE",
			drawnDate: "10/14/25",
			checkedBy: "DW",
			checkedDate: "10/14/25",
			engineer: "APS",
			engineerDate: "10/14/25",
		},
		issues: [],
		warnings: [],
		revisionEntryCount: 0,
		drawingNumber: "R3P-25074-E6-0001",
		drawingTitle: "Overall Single Line Diagram",
		acadeValues: {},
		suiteUpdates: {},
		pendingSuiteWrites: [],
		pendingAcadeWrites: [],
		revisionRows: [],
		...overrides,
	};
}

describe("projectDocumentMetadataService", () => {
	it("uses ACADE report rows as the source for fallback drawings", () => {
		const rows = [
			makeTitleBlockSyncRow({
				id: "pdf-1",
				fileName: "R3P-25074-E6-0001.pdf",
				relativePath: "Issued/R3P-25074-E6-0001.pdf",
				absolutePath: "C:/Projects/R3P-25074/Issued/R3P-25074-E6-0001.pdf",
				fileType: "pdf",
				titleBlockFound: false,
				layoutName: "",
				titleBlockHandle: "",
				currentAttributes: {},
				drawingNumber: "",
				drawingTitle: "",
			}),
		];
		const reportRows = [
			{
				fileName: "R3P-25074-E6-0001.pdf",
				drawingNumber: "R3P-25074-E6-0001",
				title: "Overall Single Line Diagram",
				revision: "A",
			},
		];

		const [row] = buildProjectDocumentMetadataRows("project-1", rows, reportRows);

		expect(row.source).toBe("acade_report");
		expect(row.reviewState).toBe("fallback");
		expect(row.drawingNumber).toBe("R3P-25074-E6-0001");
	});

	it("adds mismatch issues when ACADE report metadata disagrees with title-block metadata", () => {
		const rows = [
			makeTitleBlockSyncRow({
				currentAttributes: {
					DWGNO: "R3P-25074-E6-0001",
					TITLE3: "Old Title",
					REV: "A",
				},
				drawingTitle: "Old Title",
				suiteUpdates: {
					REV: "A",
				},
			}),
		];
		const reportRows = [
			{
				fileName: "R3P-25074-E6-0001.dwg",
				drawingNumber: "R3P-25074-E6-0001",
				title: "Overall Single Line Diagram",
				revision: "B",
			},
		];

		const [row] = buildProjectDocumentMetadataRows("project-1", rows, reportRows);

		expect(row.issues).toContain(
			"ACADE report title does not match title block metadata.",
		);
		expect(row.issues).toContain(
			"ACADE report revision does not match revision register/title block metadata.",
		);
	});

	it("builds standard documents from project metadata and falls back by filename when needed", () => {
		const metadataRows = buildProjectDocumentMetadataRows("project-1", [
			makeTitleBlockSyncRow(),
		]);
		const pdfFiles = [
			new File([""], "R3P-25074-E6-0001.pdf", { type: "application/pdf" }),
			new File([""], "R3P-25074-E6-9999.pdf", { type: "application/pdf" }),
		];

		const documents = buildStandardDocumentsFromProjectMetadata(
			metadataRows,
			pdfFiles,
		);

		expect(documents).toHaveLength(2);
		expect(documents[0].source).toBe("project_metadata");
		expect(documents[0].title).toBe("Overall Single Line Diagram");
		expect(documents[1].source).toBe("filename_fallback");
		expect(documents[1].needsReview).toBe(true);
	});

	it("parses ACADE CSV report files into normalized rows", async () => {
		const file = new File(
			[
				[
					"File Name,Drawing Number,Title,Revision",
					"R3P-25074-E6-0001.pdf,R3P-25074-E6-0001,Overall Single Line Diagram,A",
				].join("\n"),
			],
			"drawing-list-report.csv",
			{ type: "text/csv" },
		);

		const rows = await parseAcadeDocumentReportFile(file);

		expect(rows).toEqual([
			{
				fileName: "R3P-25074-E6-0001.pdf",
				drawingNumber: "R3P-25074-E6-0001",
				title: "Overall Single Line Diagram",
				revision: "A",
			},
		]);
	});
});
