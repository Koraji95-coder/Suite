import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectDocumentMetadataService } from "@/features/project-documents";
import { projectTitleBlockProfileService } from "@/services/projectTitleBlockProfileService";
import { ProjectFormModal } from "./ProjectFormModal";
import type { ProjectFormData } from "@/features/project-core";

vi.mock("@/components/system/Popover", () => ({
	Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	PopoverTrigger: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	PopoverContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
}));

vi.mock("@/features/project-documents", () => ({
	projectDocumentMetadataService: {
		loadSnapshot: vi.fn(),
	},
}));

vi.mock("@/services/projectTitleBlockProfileService", () => ({
	DEFAULT_PROJECT_TITLE_BLOCK_NAME: "R3P-24x36BORDER&TITLE",
	projectTitleBlockProfileService: {
		fetchProfile: vi.fn(),
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
	folderPickerUnavailable,
	folderPickerHelpMessage,
}: {
	onSubmit: () => Promise<void> | void;
	onSubmitAndOpenAcade?: () => Promise<void> | void;
	folderPickerUnavailable?: boolean;
	folderPickerHelpMessage?: string | null;
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
			folderPickerUnavailable={folderPickerUnavailable}
			folderPickerHelpMessage={folderPickerHelpMessage}
		/>
	);
}

function fillRequiredBasics(projectName = "Nanulak 180MW Substation") {
	fireEvent.change(screen.getByLabelText("Project name"), {
		target: { value: projectName },
	});
	fireEvent.change(screen.getByLabelText("Description"), {
		target: { value: "Fixture-backed ACADE smoke test project." },
	});
	fireEvent.change(screen.getByLabelText("PE"), {
		target: { value: "Engineer Name" },
	});
	fireEvent.change(screen.getByLabelText("Firm number"), {
		target: { value: "TX-Firm #000000" },
	});
	fireEvent.click(screen.getAllByRole("button", { name: "15" })[0]);
}

function fillRequiredDefaults() {
	fireEvent.change(screen.getByLabelText("Client / utility"), {
		target: { value: "Hunt Energy Network" },
	});
	fireEvent.change(screen.getByLabelText("Facility / site"), {
		target: { value: "Nanulak 180MW BESS Substation" },
	});
	fireEvent.change(screen.getByLabelText("Project number"), {
		target: { value: "R3P-25074" },
	});
	fireEvent.change(screen.getByLabelText("Drawn by"), {
		target: { value: "Drafting lead" },
	});
	fireEvent.change(screen.getByLabelText("Checked by"), {
		target: { value: "QA / reviewer" },
	});
	fireEvent.change(screen.getByLabelText("Engineer"), {
		target: { value: "Engineer of record" },
	});
}

describe("ProjectFormModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(projectTitleBlockProfileService.fetchProfile).mockResolvedValue({
			data: {
				id: "profile-1",
				project_id: "project-setup-test",
				user_id: "local",
				block_name: "R3P-24x36BORDER&TITLE",
				project_root_path: null,
				acade_project_file_path: null,
				acade_line1: "",
				acade_line2: "",
				acade_line4: "",
				signer_drawn_by: "",
				signer_checked_by: "",
				signer_engineer: "",
				created_at: "2026-04-02T00:00:00.000Z",
				updated_at: "2026-04-02T00:00:00.000Z",
			},
			error: null,
		});
	});

	it("keeps browse actions available while showing picker guidance", () => {
		render(
			<TestHarness
				onSubmit={vi.fn()}
				folderPickerUnavailable
				folderPickerHelpMessage="Start Runtime Control and try Browse again."
			/>,
		);

		fillRequiredBasics();
		fireEvent.click(screen.getByRole("button", { name: "Next" }));

		const browseButtons = screen.getAllByRole("button", { name: "Browse" });
		expect(browseButtons).toHaveLength(2);
		expect(
			browseButtons.every((button) => !(button as HTMLButtonElement).disabled),
		).toBe(true);
		expect(
			screen.getAllByText("Start Runtime Control and try Browse again."),
		).toHaveLength(2);
	});

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

		fillRequiredBasics();
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
		fireEvent.change(screen.getByLabelText("Project number"), {
			target: { value: "R3P-25074" },
		});
		fireEvent.change(screen.getByLabelText("Engineer"), {
			target: { value: "Engineer of record" },
		});

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

		fireEvent.click(screen.getByRole("button", { name: "Save Setup Only" }));
		await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
		},
		15_000,
	);

	it(
		"adopts the discovered existing wdp path when validation finds a real ACADE project",
		async () => {
			vi.mocked(projectTitleBlockProfileService.fetchProfile).mockResolvedValue({
				data: {
					id: "profile-1",
					project_id: "project-setup-test",
					user_id: "local",
					block_name: "R3P-24x36BORDER&TITLE",
					project_root_path: "C:/Fixtures/WDDemo",
					acade_project_file_path: "1/.wdp",
					acade_line1: "",
					acade_line2: "",
					acade_line4: "",
					signer_drawn_by: "",
					signer_checked_by: "",
					signer_engineer: "",
					created_at: "2026-04-02T00:00:00.000Z",
					updated_at: "2026-04-02T00:00:00.000Z",
				},
				error: null,
			});
			vi.mocked(projectDocumentMetadataService.loadSnapshot).mockResolvedValue({
				projectId: "project-setup-test",
				projectRootPath: "C:/Fixtures/WDDemo",
				profile: {
					blockName: "R3P-24x36BORDER&TITLE",
					projectRootPath: "C:/Fixtures/WDDemo",
					acadeProjectFilePath: "1/.wdp",
					acadeLine1: "WDDemo",
					acadeLine2: "Fixture project",
					acadeLine4: "",
					signerDrawnBy: "",
					signerCheckedBy: "",
					signerEngineer: "",
				},
				summary: {
					totalFiles: 12,
					drawingFiles: 9,
					flaggedFiles: 0,
					suiteWriteCount: 0,
					acadeWriteCount: 0,
					wdTbConflictCount: 0,
				},
				artifacts: {
					wdpPath: "C:/Fixtures/WDDemo/wddemo.wdp",
					wdtPath: "C:/Fixtures/WDDemo/wddemo.wdt",
					wdlPath: "C:/Fixtures/WDDemo/wddemo_wdtitle.wdl",
					wdpText: "",
					wdtText: "",
					wdlText: "",
					wdpState: "existing",
				},
				rows: [],
				titleBlockRows: [],
				warnings: [],
			});

			render(<TestHarness onSubmit={vi.fn()} />);

			fillRequiredBasics();
			fireEvent.click(screen.getByRole("button", { name: "Next" }));

			fireEvent.change(screen.getByLabelText("Project root folder"), {
				target: { value: "C:/Fixtures/WDDemo" },
			});
			fireEvent.change(screen.getByLabelText("PDF package root"), {
				target: { value: "C:/Fixtures/WDDemo" },
			});
			fireEvent.click(screen.getByRole("button", { name: /validate root/i }));

			await waitFor(() =>
				expect(
					screen.getByText(
						"Root validated. Found 9 drawings for project setup.",
					),
				).toBeTruthy(),
			);
			fireEvent.click(screen.getByRole("button", { name: "Next" }));

			await waitFor(() =>
				expect(
					(
						screen.getByLabelText(
							"ACADE project target (.wdp)",
						) as HTMLInputElement
					).value,
				).toBe("C:/Fixtures/WDDemo/wddemo.wdp"),
			);
		},
		15_000,
	);

	it(
		"derives the ACADE project file path from project name when the field is blank",
		async () => {
			vi.mocked(projectDocumentMetadataService.loadSnapshot).mockResolvedValue({
				projectId: "project-setup-test",
				projectRootPath: "C:/Projects/Nanulak",
				profile: {
					blockName: "R3P-24x36BORDER&TITLE",
					projectRootPath: "C:/Projects/Nanulak",
					acadeProjectFilePath: "",
					acadeLine1: "",
					acadeLine2: "",
					acadeLine4: "",
					signerDrawnBy: "",
					signerCheckedBy: "",
					signerEngineer: "",
				},
				summary: {
					totalFiles: 8,
					drawingFiles: 6,
					flaggedFiles: 0,
					suiteWriteCount: 0,
					acadeWriteCount: 0,
					wdTbConflictCount: 0,
				},
				artifacts: {
					wdpPath: "",
					wdtPath: "",
					wdlPath: "",
					wdpText: "",
					wdtText: "",
					wdlText: "",
					wdpState: "starter",
				},
				rows: [],
				titleBlockRows: [],
				warnings: [],
			});

			render(<TestHarness onSubmit={vi.fn()} />);

			fillRequiredBasics();
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
						"Root validated. Found 6 drawings for project setup.",
					),
				).toBeTruthy(),
			);
			fireEvent.click(screen.getByRole("button", { name: "Next" }));

			await waitFor(() =>
				expect(
					(
						screen.getByLabelText(
							"ACADE project target (.wdp)",
						) as HTMLInputElement
					).value,
				).toBe("C:/Projects/Nanulak/Nanulak 180MW Substation.wdp"),
			);
		},
		15_000,
	);

	it(
		"keeps the derived ACADE project file path aligned with root changes until manually overridden",
		async () => {
			vi.mocked(projectDocumentMetadataService.loadSnapshot).mockImplementation(
				async ({ projectRootPath }) => ({
					projectId: "project-setup-test",
					projectRootPath,
					profile: {
						blockName: "R3P-24x36BORDER&TITLE",
						projectRootPath,
						acadeProjectFilePath: "",
						acadeLine1: "",
						acadeLine2: "",
						acadeLine4: "",
						signerDrawnBy: "",
						signerCheckedBy: "",
						signerEngineer: "",
					},
					summary: {
						totalFiles: 4,
						drawingFiles: 3,
						flaggedFiles: 0,
						suiteWriteCount: 0,
						acadeWriteCount: 0,
						wdTbConflictCount: 0,
					},
					artifacts: {
						wdpPath: "",
						wdtPath: "",
						wdlPath: "",
						wdpText: "",
						wdtText: "",
						wdlText: "",
						wdpState: "starter",
					},
					rows: [],
					titleBlockRows: [],
					warnings: [],
				}),
			);

			render(<TestHarness onSubmit={vi.fn()} />);

			fillRequiredBasics("SuiteIntegrationSmoke");
			fireEvent.click(screen.getByRole("button", { name: "Next" }));

			fireEvent.change(screen.getByLabelText("Project root folder"), {
				target: { value: "C:/Projects/SuiteCleanTest" },
			});
			fireEvent.change(screen.getByLabelText("PDF package root"), {
				target: { value: "C:/Projects/SuiteCleanTest/Issued PDF" },
			});
			fireEvent.click(screen.getByRole("button", { name: /validate root/i }));
			await waitFor(() =>
				expect(
					screen.getByText(
						"Root validated. Found 3 drawings for project setup.",
					),
				).toBeTruthy(),
			);
			fireEvent.click(screen.getByRole("button", { name: "Next" }));

			await waitFor(() =>
				expect(
					(
						screen.getByLabelText(
							"ACADE project target (.wdp)",
						) as HTMLInputElement
					).value,
				).toBe("C:/Projects/SuiteCleanTest/SuiteIntegrationSmoke.wdp"),
			);

			fireEvent.click(screen.getByRole("button", { name: "Back" }));
			fireEvent.change(screen.getByLabelText("Project root folder"), {
				target: { value: "C:/Projects/SuiteTest" },
			});
			fireEvent.change(screen.getByLabelText("PDF package root"), {
				target: { value: "C:/Projects/SuiteTest/Issued PDF" },
			});
			fireEvent.click(screen.getByRole("button", { name: /validate root/i }));
			await waitFor(() =>
				expect(
					screen.getByText(
						"Root validated. Found 3 drawings for project setup.",
					),
				).toBeTruthy(),
			);
			fireEvent.click(screen.getByRole("button", { name: "Next" }));

			await waitFor(() =>
				expect(
					(
						screen.getByLabelText(
							"ACADE project target (.wdp)",
						) as HTMLInputElement
					).value,
				).toBe("C:/Projects/SuiteTest/SuiteIntegrationSmoke.wdp"),
			);

			fireEvent.change(screen.getByLabelText("ACADE project target (.wdp)"), {
				target: { value: "C:/Custom/ManualProject.wdp" },
			});
			fireEvent.click(screen.getByRole("button", { name: "Back" }));
			fireEvent.change(screen.getByLabelText("Project root folder"), {
				target: { value: "C:/Projects/AnotherRoot" },
			});
			fireEvent.change(screen.getByLabelText("PDF package root"), {
				target: { value: "C:/Projects/AnotherRoot/Issued PDF" },
			});
			fireEvent.click(screen.getByRole("button", { name: /validate root/i }));
			await waitFor(() =>
				expect(
					screen.getByText(
						"Root validated. Found 3 drawings for project setup.",
					),
				).toBeTruthy(),
			);
			fireEvent.click(screen.getByRole("button", { name: "Next" }));

			await waitFor(() =>
				expect(
					(
						screen.getByLabelText(
							"ACADE project target (.wdp)",
						) as HTMLInputElement
					).value,
				).toBe("C:/Custom/ManualProject.wdp"),
			);
		},
		15_000,
	);

	it(
		"stays on the defaults step while typing title block fields",
		async () => {
			vi.mocked(projectDocumentMetadataService.loadSnapshot).mockResolvedValue({
				projectId: "project-setup-test",
				projectRootPath: "C:/Projects/Nanulak",
				profile: {
					blockName: "R3P-24x36BORDER&TITLE",
					projectRootPath: "C:/Projects/Nanulak",
					acadeProjectFilePath: "",
					acadeLine1: "",
					acadeLine2: "",
					acadeLine4: "",
					signerDrawnBy: "",
					signerCheckedBy: "",
					signerEngineer: "",
				},
				summary: {
					totalFiles: 4,
					drawingFiles: 2,
					flaggedFiles: 0,
					suiteWriteCount: 0,
					acadeWriteCount: 0,
					wdTbConflictCount: 0,
				},
				artifacts: {
					wdpPath: "",
					wdtPath: "",
					wdlPath: "",
					wdpText: "",
					wdtText: "",
					wdlText: "",
					wdpState: "starter",
				},
				rows: [],
				titleBlockRows: [],
				warnings: [],
			});

			render(<TestHarness onSubmit={vi.fn()} />);

			fillRequiredBasics();
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
						"Root validated. Found 2 drawings for project setup.",
					),
				).toBeTruthy(),
			);

			fireEvent.click(screen.getByRole("button", { name: "Next" }));

			await waitFor(() =>
				expect(screen.getByText("Title block defaults")).toBeTruthy(),
			);

			fireEvent.change(screen.getByLabelText("Block name"), {
				target: { value: "TB,TITLE-D" },
			});

			expect(screen.getByText("Title block defaults")).toBeTruthy();
			expect(screen.getByLabelText("ACADE project target (.wdp)")).toBeTruthy();
		},
		15_000,
	);

	it(
		"keeps the wizard gated until prerequisites for each step are satisfied",
		async () => {
			vi.mocked(projectDocumentMetadataService.loadSnapshot).mockResolvedValue({
				projectId: "project-setup-test",
				projectRootPath: "C:/Projects/Nanulak",
				profile: {
					blockName: "R3P-24x36BORDER&TITLE",
					projectRootPath: "C:/Projects/Nanulak",
					acadeProjectFilePath: "",
					acadeLine1: "",
					acadeLine2: "",
					acadeLine4: "",
					signerDrawnBy: "",
					signerCheckedBy: "",
					signerEngineer: "",
				},
				summary: {
					totalFiles: 4,
					drawingFiles: 2,
					flaggedFiles: 0,
					suiteWriteCount: 0,
					acadeWriteCount: 0,
					wdTbConflictCount: 0,
				},
				artifacts: {
					wdpPath: "",
					wdtPath: "",
					wdlPath: "",
					wdpText: "",
					wdtText: "",
					wdlText: "",
					wdpState: "starter",
				},
				rows: [],
				titleBlockRows: [],
				warnings: [],
			});

			render(<TestHarness onSubmit={vi.fn()} />);

			const trackingStepButton = screen.getByRole("button", {
				name: /tracking/i,
			}) as HTMLButtonElement;
			const defaultsStepButton = screen.getByRole("button", {
				name: /defaults/i,
			}) as HTMLButtonElement;
			const reviewStepButton = screen.getByRole("button", {
				name: /review/i,
			}) as HTMLButtonElement;

			expect(trackingStepButton.disabled).toBe(true);
			expect(defaultsStepButton.disabled).toBe(true);
			expect(reviewStepButton.disabled).toBe(true);
			expect(screen.getByText("Project basics")).toBeTruthy();

			fillRequiredBasics();

			expect(trackingStepButton.disabled).toBe(false);
			expect(defaultsStepButton.disabled).toBe(true);
			expect(reviewStepButton.disabled).toBe(true);

			fireEvent.click(trackingStepButton);
			expect(screen.getByText("Tracking root")).toBeTruthy();

			fireEvent.change(screen.getByLabelText("Project root folder"), {
				target: { value: "C:/Projects/Nanulak" },
			});
			fireEvent.change(screen.getByLabelText("PDF package root"), {
				target: { value: "C:/Projects/Nanulak/Issued PDF" },
			});

			expect(defaultsStepButton.disabled).toBe(true);
			expect(reviewStepButton.disabled).toBe(true);

			fireEvent.click(screen.getByRole("button", { name: /validate root/i }));
			await waitFor(() =>
				expect(
					screen.getByText(
						"Root validated. Found 2 drawings for project setup.",
					),
				).toBeTruthy(),
			);

			expect(defaultsStepButton.disabled).toBe(false);
			expect(reviewStepButton.disabled).toBe(true);

			fireEvent.click(defaultsStepButton);
			fillRequiredDefaults();

			expect(reviewStepButton.disabled).toBe(false);

			fireEvent.click(reviewStepButton);
			expect(screen.getByText("Review project setup")).toBeTruthy();
			expect(
				(
					screen.getByRole("button", {
						name: "Save Setup Only",
					}) as HTMLButtonElement
				).disabled,
			).toBe(false);
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

			fillRequiredBasics();
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
			fireEvent.change(screen.getByLabelText("Project number"), {
				target: { value: "R3P-25074" },
			});
			fireEvent.change(screen.getByLabelText("Engineer"), {
				target: { value: "Engineer of record" },
			});
			fireEvent.click(screen.getByRole("button", { name: "Next" }));
			await waitFor(() =>
				expect(
					screen.getByText("Ready to save this project setup."),
				).toBeTruthy(),
			);

			fireEvent.click(
				screen.getByRole("button", {
					name: "Open Existing Project in ACADE",
				}),
			);

			await waitFor(() =>
				expect(submitAndOpenSpy).toHaveBeenCalledTimes(1),
			);
			expect(submitSpy).not.toHaveBeenCalled();
		},
		15_000,
	);
});
