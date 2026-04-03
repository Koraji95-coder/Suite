import { describe, expect, it } from "vitest";
import {
	buildDefaultDraft,
	buildRegisterBackedDocuments,
	buildProjectMetadataDocuments,
	buildPayload,
	buildStandardDocuments,
	createProjectSenderId,
	validateDraft,
	type FileState,
} from "./models";

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

	it("keeps project-assigned sender values while clearing the catalog profile id in the payload", () => {
		const draft = buildDefaultDraft();
		const files = makeStandardFiles();
		draft.projectName = "Project Atlas";
		draft.projectNumber = "23001";
		draft.transmittalNumber = "XMTL-001";
		draft.peName = createProjectSenderId("project-1");
		draft.fromName = "Jamie River, PE";
		draft.fromTitle = "Professional Engineer";
		draft.fromEmail = "jamie.river@example.com";
		draft.fromPhone = "555-0199";
		draft.firmNumber = "AB - Firm #99887";
		draft.options.ci_fabrication = true;
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

		expect(payload.fields.from_profile_id).toBe("");
		expect(payload.fields.from_name).toBe("Jamie River, PE");
		expect(payload.fields.firm).toBe("AB - Firm #99887");
		expect(payload.checks.ci_fab).toBe(true);
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

	it("builds package-backed documents from deliverable register rows", () => {
		const files = [
			new File(["pdf"], "R3P-25074-E6-0001 - RELAY ONE LINE.pdf", {
				type: "application/pdf",
			}),
		];
		const documents = buildRegisterBackedDocuments(
			[
				{
					id: "register-row-1",
					snapshotId: "register-1",
					sheetName: "P&C",
					setName: "P&C",
					drawingNumber: "R3P-25074-E6-0001",
					drawingKey: "R3P25074E60001",
					drawingDescription: "Relay One Line",
					currentRevision: "0",
					revisionHistory: [{ revision: "0", date: "2026-03-11", order: 0 }],
					notes: null,
					status: "READY FOR SUBMITTAL",
					readinessState: "package-ready",
					pdfPairingStatus: "paired",
					pdfMatches: [
						{
							id: "file-1",
							fileId: "file-1",
							fileName: "R3P-25074-E6-0001 - RELAY ONE LINE.pdf",
							filePath: "project-1/R3P-25074-E6-0001 - RELAY ONE LINE.pdf",
							relativePath: "R3P-25074-E6-0001 - RELAY ONE LINE.pdf",
							matchKind: "project-file",
							manual: false,
							title: null,
							revision: null,
						},
					],
					manualPdfMatchId: null,
					dwgPairingStatus: "paired",
					dwgMatches: [
						{
							id: "meta-1",
							fileId: null,
							fileName: "R3P-25074-E6-0001 - RELAY ONE LINE.dwg",
							filePath: "C:/Issued/R3P-25074-E6-0001 - RELAY ONE LINE.dwg",
							relativePath: "Issued/R3P-25074-E6-0001 - RELAY ONE LINE.dwg",
							matchKind: "metadata-row",
							manual: false,
							title: "Relay One Line",
							revision: "0",
						},
					],
					manualDwgMatchId: null,
					titleBlockVerificationState: "matched",
					titleBlockVerificationDetail: null,
					acadeVerificationState: "matched",
					acadeVerificationDetail: null,
					issueSetEligible: true,
				},
			],
			files,
			[
				{
					id: "meta-1",
					projectId: "project-1",
					fileName: "R3P-25074-E6-0001 - RELAY ONE LINE.dwg",
					relativePath: "Issued/R3P-25074-E6-0001 - RELAY ONE LINE.dwg",
					absolutePath: "C:/Issued/R3P-25074-E6-0001 - RELAY ONE LINE.dwg",
					fileType: "dwg",
					drawingNumber: "R3P-25074-E6-0001",
					title: "Relay One Line",
					revision: "0",
					confidence: 1,
					source: "title_block_sync",
					reviewState: "ready",
					titleBlockFound: true,
					hasWdTbConflict: false,
					currentAttributes: {},
					acadeValues: {},
					suiteUpdates: {},
					revisionRows: [],
					issues: [],
					warnings: [],
					rawRow: {} as never,
				},
			],
			[],
		);

		expect(documents).toHaveLength(1);
		expect(documents[0].attachmentFileName).toBe(
			"R3P-25074-E6-0001 - RELAY ONE LINE.pdf",
		);
		expect(documents[0].projectRelativePath).toBe(
			"Issued/R3P-25074-E6-0001 - RELAY ONE LINE.dwg",
		);
		expect(documents[0].drawingNumber).toBe("R3P-25074-E6-0001");
		expect(documents[0].title).toBe("Relay One Line");
		expect(documents[0].source).toBe("project_register");
		expect(documents[0].needsReview).toBe(false);
	});
});
