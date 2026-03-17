import { describe, expect, it } from "vitest";
import {
	buildDefaultDraft,
	buildPayload,
	buildStandardDocuments,
	validateDraft,
	type FileState,
} from "./transmittalBuilderModels";

function makeStandardFiles(): FileState {
	return {
		template: new File(["template"], "template.docx"),
		index: null,
		pdfs: [new File(["pdf"], "sheet-01.pdf", { type: "application/pdf" })],
		cid: [],
	};
}

describe("transmittalBuilderModels", () => {
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
	});

	it("accepts reviewed PDF document rows when no index file is uploaded", () => {
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
				drawingNumber: "E1-100",
				title: "One-Line Diagram",
				revision: "3",
				confidence: 0.92,
				source: "embedded_text",
				needsReview: true,
				accepted: true,
				overrideReason: "Verified against title block.",
				modelVersion: "deterministic-v1",
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
				drawingNumber: "E1-100",
				title: "One-Line Diagram",
				revision: "3",
				confidence: 0.92,
				source: "embedded_text",
				needsReview: false,
				accepted: true,
				overrideReason: "",
				modelVersion: "deterministic-v1",
			},
		];

		const payload = buildPayload(draft, files);
		expect(payload.pdf_document_data).toEqual([
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
				model_version: "deterministic-v1",
			},
		]);
	});
});
