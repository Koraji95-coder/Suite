import { describe, expect, it } from "vitest";
import {
	buildDefaultDraft,
	buildProjectMetadataDocuments,
	buildPayload,
	buildStandardDocuments,
	validateDraft,
	type FileState,
} from "./transmittalBuilderModels";

function makeStandardFiles(): FileState {
	return {
		template: new File(["template"], "template.docx"),
		index: null,
		acadeReport: null,
		pdfs: [new File(["pdf"], "sheet-01.pdf", { type: "application/pdf" })],
		cid: [],
	};
}

describe("transmittalBuilderModels", () => {
	it("defaults standard transmittals to project metadata mode", () => {
		const draft = buildDefaultDraft();

		expect(draft.standardDocumentSource).toBe("project_metadata");
	});

	it("maps analyzed PDF rows into standard document metadata", () => {
		const files = [new File(["pdf"], "sheet-01.pdf", { type: "application/pdf" })];
		const documents = buildStandardDocuments(files, [], [
			{
				file_name: "sheet-01.pdf",
				drawing_number: "E1-100",
				title: "One-Line Diagram",
				revision: "3",
				confidence: 0.92,
				source: "embedded_text",
				needs_review: false,
				accepted: true,
				override_reason: "",
				recognition: { model_version: "deterministic-v1" },
			},
		]);

		expect(documents).toHaveLength(1);
		expect(documents[0].drawingNumber).toBe("E1-100");
		expect(documents[0].title).toBe("One-Line Diagram");
		expect(documents[0].revision).toBe("3");
		expect(documents[0].modelVersion).toBe("deterministic-v1");
		expect(documents[0].attachmentFileName).toBe("sheet-01.pdf");
	});

	it("accepts reviewed PDF document rows when no index file is uploaded", () => {
		const draft = buildDefaultDraft();
		const files = makeStandardFiles();
		draft.standardDocumentSource = "pdf_analysis";
		draft.projectName = "Project Atlas";
		draft.projectNumber = "23001";
		draft.transmittalNumber = "XMTL-001";
		draft.peName = "sample-pe";
		draft.fromName = "Sample PE";
		draft.fromTitle = "PE";
		draft.fromEmail = "pe@example.com";
		draft.contacts[0] = {
			...draft.contacts[0],
			name: "Client Contact",
			company: "Client Co",
			email: "client@example.com",
			phone: "555-0100",
		};
		draft.standardDocuments = [
			{
				id: "doc-1",
				fileName: "sheet-01.pdf",
				attachmentFileName: "sheet-01.pdf",
				projectRelativePath: "",
				drawingNumber: "E1-100",
				title: "One-Line Diagram",
				revision: "3",
				confidence: 0.92,
				source: "embedded_text",
				needsReview: true,
				accepted: true,
				overrideReason: "Verified against title block.",
				modelVersion: "deterministic-v1",
				metadataWarnings: [],
			},
		];

		const validation = validateDraft(draft, files);
		expect(validation.errors).toEqual([]);
	});

	it("includes reviewed PDF document data in the render payload", () => {
		const draft = buildDefaultDraft();
		const files = makeStandardFiles();
		draft.projectName = "Project Atlas";
		draft.projectNumber = "23001";
		draft.transmittalNumber = "XMTL-001";
		draft.peName = "sample-pe";
		draft.fromName = "Sample PE";
		draft.fromTitle = "PE";
		draft.fromEmail = "pe@example.com";
		draft.contacts[0] = {
			...draft.contacts[0],
			name: "Client Contact",
			company: "Client Co",
			email: "client@example.com",
			phone: "555-0100",
		};
		draft.standardDocuments = [
			{
				id: "doc-1",
				fileName: "sheet-01.pdf",
				attachmentFileName: "sheet-01.pdf",
				projectRelativePath: "",
				drawingNumber: "E1-100",
				title: "One-Line Diagram",
				revision: "3",
				confidence: 0.92,
				source: "embedded_text",
				needsReview: false,
				accepted: true,
				overrideReason: "",
				modelVersion: "deterministic-v1",
				metadataWarnings: [],
			},
		];

		const payload = buildPayload(draft, files);
		expect(payload.pdf_document_data).toEqual([
			{
				file_name: "sheet-01.pdf",
				attachment_file_name: "sheet-01.pdf",
				project_relative_path: undefined,
				drawing_number: "E1-100",
				title: "One-Line Diagram",
				revision: "3",
				confidence: 0.92,
				source: "embedded_text",
				needs_review: false,
				accepted: true,
				override_reason: "",
				model_version: "deterministic-v1",
				metadata_warnings: undefined,
			},
		]);
	});

	it("builds standard rows from project metadata without OCR", () => {
		const files = [new File(["pdf"], "R3P-25074-E6-0001.pdf", { type: "application/pdf" })];
		const documents = buildProjectMetadataDocuments(
			files,
			[
				{
					id: "meta-1",
					projectId: "project-1",
					fileName: "R3P-25074-E6-0001 MAIN.dwg",
					relativePath: "Issued/R3P-25074-E6-0001 MAIN.dwg",
					absolutePath: "C:/Issued/R3P-25074-E6-0001 MAIN.dwg",
					fileType: "dwg",
					drawingNumber: "R3P-25074-E6-0001",
					title: "Overall Single Line Diagram",
					revision: "C",
					confidence: 1,
					source: "title_block_sync",
					reviewState: "ready",
					titleBlockFound: true,
					hasWdTbConflict: false,
					currentAttributes: {},
					acadeValues: {},
					suiteUpdates: { REV: "C" },
					revisionRows: [
						{
							revision: "C",
							description: "Issued for approval",
							by: "KE",
							checkedBy: "DW",
							date: "2026-03-16",
						},
					],
					issues: [],
					warnings: [],
					rawRow: {
						id: "raw-1",
						fileName: "R3P-25074-E6-0001 MAIN.dwg",
						relativePath: "Issued/R3P-25074-E6-0001 MAIN.dwg",
						absolutePath: "C:/Issued/R3P-25074-E6-0001 MAIN.dwg",
						fileType: "dwg",
						filenameDrawingNumber: "R3P-25074-E6-0001",
						filenameTitle: "MAIN",
						filenameRevision: "",
						titleBlockFound: true,
						effectiveBlockName: "R3P-24x36BORDER&TITLE",
						layoutName: "Layout1",
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
						revisionEntryCount: 1,
						drawingNumber: "R3P-25074-E6-0001",
						drawingTitle: "Overall Single Line Diagram",
						acadeValues: {},
						suiteUpdates: { REV: "C" },
						pendingSuiteWrites: [],
						pendingAcadeWrites: [],
						revisionRows: [
							{
								revision: "C",
								description: "Issued for approval",
								by: "KE",
								checkedBy: "DW",
								date: "2026-03-16",
							},
						],
					},
				},
			],
			[],
		);

		expect(documents).toHaveLength(1);
		expect(documents[0].attachmentFileName).toBe("R3P-25074-E6-0001.pdf");
		expect(documents[0].drawingNumber).toBe("R3P-25074-E6-0001");
		expect(documents[0].title).toBe("Overall Single Line Diagram");
		expect(documents[0].revision).toBe("C");
		expect(documents[0].source).toBe("title_block_sync");
	});
});
