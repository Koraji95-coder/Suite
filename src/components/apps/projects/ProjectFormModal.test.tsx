import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { projectDocumentMetadataService } from "@/services/projectDocumentMetadataService";
import { ProjectFormModal } from "./ProjectFormModal";
import type { ProjectFormData } from "./projectmanagertypes";

vi.mock("@/components/apps/ui/Popover", () => ({
	Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	PopoverTrigger: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	PopoverContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
}));

vi.mock("@/services/projectDocumentMetadataService", () => ({
	projectDocumentMetadataService: {
		loadSnapshot: vi.fn(),
	},
}));

const BASE_FORM: ProjectFormData = {
	name: "",
	description: "",
	deadline: "",
	priority: "high",
	status: "active",
	category: "Substation",
	projectPeName: "",
	projectFirmNumber: "",
	watchdogRootPath: "",
	pdfPackageRootPath: "",
	titleBlockBlockName: "",
	titleBlockAcadeLine1: "",
	titleBlockAcadeLine2: "",
	titleBlockAcadeLine4: "",
	titleBlockAcadeProjectFilePath: "",
	titleBlockDrawnBy: "",
	titleBlockCheckedBy: "",
	titleBlockEngineer: "",
};

function TestHarness({
	onSubmit,
	onSubmitAndOpenAcade,
}: {
	onSubmit: () => Promise<void> | void;
	onSubmitAndOpenAcade?: () => Promise<void> | void;
}) {
	const [formData, setFormData] = useState<ProjectFormData>(BASE_FORM);

	return (
		<ProjectFormModal
			isOpen
			projectId={null}
			onClose={vi.fn()}
			onSubmit={onSubmit}
			onSubmitAndOpenAcade={onSubmitAndOpenAcade}
			formData={formData}
			setFormData={setFormData}
			isEditing={false}
			onBrowseRootPath={async () => undefined}
			isBrowsingRootPath={false}
			onBrowsePdfRootPath={async () => undefined}
			isBrowsingPdfRootPath={false}
		/>
	);
}

describe("ProjectFormModal", () => {
	it(
		"walks through the project setup wizard and submits after validation",
		async () => {
		const submitSpy = vi.fn();
		vi.mocked(projectDocumentMetadataService.loadSnapshot).mockResolvedValue({
			projectId: "project-setup-test",
			projectRootPath: "C:/Projects/Nanulak",
			profile: {
				blockName: "R3P-24x36BORDER&TITLE",
				projectRootPath: "C:/Projects/Nanulak",
				acadeProjectFilePath: "C:/Projects/Nanulak/Nanulak.wdp",
				acadeLine1: "Nanulak 180MW Substation",
				acadeLine2: "Issue for review",
				acadeLine4: "",
				signerDrawnBy: "KD",
				signerCheckedBy: "QA",
				signerEngineer: "",
			},
			summary: {
				totalFiles: 12,
				drawingFiles: 8,
				flaggedFiles: 0,
				suiteWriteCount: 0,
				acadeWriteCount: 0,
				wdTbConflictCount: 0,
			},
			artifacts: {
				wdpPath: "C:/Projects/Nanulak/Nanulak.wdp",
				wdtPath: "C:/Projects/Nanulak/_suite/scan.wdt",
				wdlPath: "C:/Projects/Nanulak/_suite/scan.wdl",
				wdpText: "",
				wdtText: "",
				wdlText: "",
				wdpState: "existing",
			},
			rows: [
				{
					id: "row-1",
					projectId: "project-setup-test",
					fileName: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					relativePath: "Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					absolutePath:
						"C:/Projects/Nanulak/Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
					fileType: "dwg",
					drawingNumber: "R3P-25074-E0-0001",
					title: "Drawing Index",
					revision: "A",
					source: "title_block_sync",
					reviewState: "ready",
					confidence: 1,
					titleBlockFound: true,
					hasWdTbConflict: false,
					currentAttributes: {},
					acadeValues: {},
					suiteUpdates: {},
					revisionRows: [],
					issues: [],
					warnings: [],
					rawRow: {
						id: "raw-1",
						fileName: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
						relativePath: "Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
						absolutePath:
							"C:/Projects/Nanulak/Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
						fileType: "dwg",
						filenameDrawingNumber: "R3P-25074-E0-0001",
						filenameTitle: "Drawing Index",
						filenameRevision: "A",
						titleBlockFound: true,
						effectiveBlockName: "R3P-24x36BORDER&TITLE",
						layoutName: "Model",
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
						revisionEntryCount: 0,
						drawingNumber: "R3P-25074-E0-0001",
						drawingTitle: "Drawing Index",
						acadeValues: {},
						suiteUpdates: {},
						pendingSuiteWrites: [],
						pendingAcadeWrites: [],
						revisionRows: [],
					},
				},
			],
			titleBlockRows: [],
			warnings: [],
		});

		render(<TestHarness onSubmit={submitSpy} />);

		fireEvent.change(screen.getByLabelText("Project name"), {
			target: { value: "Nanulak 180MW Substation" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Next" }));

		fireEvent.change(screen.getByLabelText("Project root folder"), {
			target: { value: "C:/Projects/Nanulak" },
		});
		fireEvent.change(screen.getByLabelText("PDF package root"), {
			target: { value: "C:/Projects/Nanulak/Issued PDF" },
		});
		fireEvent.click(screen.getByRole("button", { name: /validate root/i }));

		await waitFor(() =>
			expect(
				screen.getByText(
					"Root validated. Found 8 drawings for project setup.",
				),
			).toBeTruthy(),
		);
		fireEvent.click(screen.getByRole("button", { name: "Next" }));

		await waitFor(() =>
			expect(screen.getByDisplayValue("Nanulak 180MW Substation")).toBeTruthy(),
		);
		expect(screen.getByDisplayValue("Issue for review")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Next" }));
		await waitFor(() =>
			expect(
				screen.getByText("Ready to save this project setup."),
			).toBeTruthy(),
		);
		expect(
			screen.getByText(
				/After you save, open the project workflow to run drawing scan, clear review items, and build the package/i,
			),
		).toBeTruthy();
		expect(screen.getByText("C:/Projects/Nanulak/Issued PDF")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
		await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
		},
		15_000,
	);

	it(
		"supports creating the project and opening it in ACADE from the review step",
		async () => {
			const submitSpy = vi.fn();
			const submitAndOpenSpy = vi.fn();
			vi.mocked(projectDocumentMetadataService.loadSnapshot).mockResolvedValue({
				projectId: "project-setup-test",
				projectRootPath: "C:/Projects/Nanulak",
				profile: {
					blockName: "R3P-24x36BORDER&TITLE",
					projectRootPath: "C:/Projects/Nanulak",
					acadeProjectFilePath: "C:/Projects/Nanulak/Nanulak.wdp",
					acadeLine1: "Nanulak 180MW Substation",
					acadeLine2: "Issue for review",
					acadeLine4: "",
					signerDrawnBy: "KD",
					signerCheckedBy: "QA",
					signerEngineer: "",
				},
				summary: {
					totalFiles: 12,
					drawingFiles: 8,
					flaggedFiles: 0,
					suiteWriteCount: 0,
					acadeWriteCount: 0,
					wdTbConflictCount: 0,
				},
				artifacts: {
					wdpPath: "C:/Projects/Nanulak/Nanulak.wdp",
					wdtPath: "C:/Projects/Nanulak/_suite/scan.wdt",
					wdlPath: "C:/Projects/Nanulak/_suite/scan.wdl",
					wdpText: "",
					wdtText: "",
					wdlText: "",
					wdpState: "existing",
				},
				rows: [],
				titleBlockRows: [],
				warnings: [],
			});

			render(
				<TestHarness
					onSubmit={submitSpy}
					onSubmitAndOpenAcade={submitAndOpenSpy}
				/>,
			);

			fireEvent.change(screen.getByLabelText("Project name"), {
				target: { value: "Nanulak 180MW Substation" },
			});
			fireEvent.click(screen.getByRole("button", { name: "Next" }));

			fireEvent.change(screen.getByLabelText("Project root folder"), {
				target: { value: "C:/Projects/Nanulak" },
			});
			fireEvent.click(screen.getByRole("button", { name: /validate root/i }));

			await waitFor(() =>
				expect(
					screen.getByText(
						"Root validated. Found 8 drawings for project setup.",
					),
				).toBeTruthy(),
			);
			fireEvent.click(screen.getByRole("button", { name: "Next" }));
			await waitFor(() =>
				expect(screen.getByDisplayValue("Nanulak 180MW Substation")).toBeTruthy(),
			);
			fireEvent.click(screen.getByRole("button", { name: "Next" }));
			await waitFor(() =>
				expect(
					screen.getByText("Ready to save this project setup."),
				).toBeTruthy(),
			);

			fireEvent.click(
				screen.getByRole("button", { name: "Create and Open in ACADE" }),
			);

			await waitFor(() =>
				expect(submitAndOpenSpy).toHaveBeenCalledTimes(1),
			);
			expect(submitSpy).not.toHaveBeenCalled();
		},
		15_000,
	);
});
