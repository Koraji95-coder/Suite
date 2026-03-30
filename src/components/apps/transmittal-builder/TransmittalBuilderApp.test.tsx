import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { TransmittalBuilderApp } from "./TransmittalBuilderApp";

const mockUseTransmittalBuilderState = vi.hoisted(() => vi.fn());

vi.mock("./useTransmittalBuilderState", () => ({
	useTransmittalBuilderState: mockUseTransmittalBuilderState,
}));

vi.mock("./TransmittalBuilderMainForm", () => ({
	TransmittalBuilderMainForm: () => <div>main form</div>,
}));

vi.mock("./TransmittalBuilderRightRail", () => ({
	TransmittalBuilderRightRail: () => <div>right rail</div>,
}));

function createState(overrides: Record<string, unknown> = {}) {
	return {
		draft: {
			transmittalType: "standard",
			standardDocumentSource: "project_metadata",
			selectedProjectId: "",
			projectName: "",
			projectNumber: "",
			date: "2026-03-23",
			transmittalNumber: "",
			description: "",
			peName: "",
			fromName: "",
			fromTitle: "",
			fromEmail: "",
			fromPhone: "",
			firmNumber: "",
			contacts: [],
			options: {},
			cidDocuments: [],
			standardDocuments: [],
		},
		files: {
			template: null,
			index: null,
			acadeReport: null,
			pdfs: [],
			cid: [],
		},
		profileOptions: [],
		firmOptions: [],
		profileOptionsError: null,
		templateLoading: false,
		templateError: null,
		pdfAnalysisLoading: false,
		pdfAnalysisError: null,
		pdfAnalysisWarnings: [],
		projectOptions: [],
		projectMetadataLoading: false,
		projectMetadataError: null,
		projectMetadataWarnings: [],
		projectMetadataLoadedAt: null,
		outputFormat: "both",
		generationState: { state: "idle" },
		outputs: [],
		submitAttempted: false,
		lastSavedAt: null,
		validation: { errors: [] },
		completeContacts: [],
		optionSummary: [],
		fileSummary: {
			template: "Not selected",
			index: "Not selected",
			documents: "0 PDFs",
			report: "No ACADE report",
		},
		setOutputFormat: vi.fn(),
		updateDraft: vi.fn(),
		handlePeChange: vi.fn(),
		handleTemplateFiles: vi.fn(),
		handleIndexFiles: vi.fn(),
		handleAcadeReportFiles: vi.fn(),
		handlePdfFiles: vi.fn(),
		handleStandardDocumentSourceChange: vi.fn(),
		handleProjectSelectionChange: vi.fn(),
		handleLoadProjectMetadata: vi.fn(),
		analyzePdfFiles: vi.fn(),
		handleCidFiles: vi.fn(),
		handleScanCid: vi.fn(),
		handleStandardDocumentChange: vi.fn(),
		handleContactChange: vi.fn(),
		addContact: vi.fn(),
		removeContact: vi.fn(),
		updateCidDocument: vi.fn(),
		removeCidDocument: vi.fn(),
		handleOptionToggle: vi.fn(),
		resetSession: vi.fn(),
		handleGenerate: vi.fn(),
		handleUseExampleTemplate: vi.fn(),
		isInvalid: vi.fn(() => false),
		...overrides,
	};
}

describe("TransmittalBuilderApp", () => {
	it("shows the project-first package context when no project is selected", () => {
		mockUseTransmittalBuilderState.mockReturnValue(createState());

		render(
			<MemoryRouter>
				<TransmittalBuilderApp />
			</MemoryRouter>,
		);

		expect(
			screen.getByText("Choose the project package context first."),
		).toBeTruthy();
		expect(screen.getByText("No project selected")).toBeTruthy();
	});

	it("surfaces document review pressure in the top package band", () => {
		mockUseTransmittalBuilderState.mockReturnValue(
			createState({
				projectOptions: [
					{
						id: "project-1",
						name: "Nanulak",
						description: "Substation package",
						projectPeName: "Jamie River, PE",
						firmNumber: "AB - Firm #99887",
						watchdogRootPath: "C:/Projects/Nanulak",
					},
				],
				draft: {
					...createState().draft,
					selectedProjectId: "project-1",
					projectName: "Nanulak",
					standardDocuments: [
						{
							id: "doc-1",
							fileName: "One.pdf",
							attachmentFileName: "One.pdf",
							drawingNumber: "R3P-1",
							title: "One",
							revision: "A",
							confidence: 0.9,
							source: "project_metadata",
							needsReview: true,
							accepted: false,
							overrideReason: "",
							metadataWarnings: [],
						},
					],
				},
				files: {
					template: new File(["template"], "template.docx"),
					index: null,
					acadeReport: null,
					pdfs: [new File(["pdf"], "One.pdf")],
					cid: [],
				},
				completeContacts: [
					{
						id: "contact-1",
						name: "Alex",
						company: "Root3",
						email: "alex@example.com",
						phone: "555-1234",
					},
				],
				projectMetadataLoadedAt: "2026-03-23T10:00:00.000Z",
				preferredIssueSet: {
					id: "issue-set-1",
					projectId: "project-1",
					name: "Nanulak IFC package",
					issueTag: "IFC-01",
					status: "review",
					targetDate: "2026-03-31",
					transmittalNumber: "XMTL-001",
					transmittalDocumentName: "IFC package",
					registerSnapshotId: "register-1",
					summary: "Ready for final review.",
					notes: null,
					selectedDrawingPaths: ["Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg"],
					selectedRegisterRowIds: ["register-row-1"],
					selectedDrawingNumbers: ["R3P-25074-E0-0001"],
					selectedPdfFileIds: ["file-1"],
					snapshot: {
						drawingCount: 1,
						selectedDrawingCount: 1,
						reviewItemCount: 1,
						titleBlockReviewCount: 1,
						standardsReviewCount: 0,
						unresolvedRevisionCount: 0,
						setupBlockerCount: 0,
						trackedDrawingCount: 1,
						acceptedTitleBlockCount: 0,
						waivedStandardsCount: 0,
					},
					createdAt: "2026-03-23T10:00:00.000Z",
					updatedAt: "2026-03-23T10:00:00.000Z",
					issuedAt: null,
				},
			}),
		);

		render(
			<MemoryRouter>
				<TransmittalBuilderApp />
			</MemoryRouter>,
		);

		expect(
			screen.getByText("1 document still needs review before issue."),
		).toBeTruthy();
		expect(screen.getByText("Nanulak")).toBeTruthy();
		expect(screen.getByText("Project metadata ready")).toBeTruthy();
		expect(screen.getByText(/IFC-01 • 1 row/i)).toBeTruthy();
		expect(
			screen.getByRole("link", { name: /review/i }).getAttribute("href"),
		).toBe("/app/projects/project-1?view=review&issueSet=issue-set-1");
	});
});
