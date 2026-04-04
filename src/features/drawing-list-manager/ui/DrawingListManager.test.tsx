import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawingListManager } from "./DrawingListManager";

const showToast = vi.fn();
const mockGetUser = vi.hoisted(() => vi.fn());
const mockOrder = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockFetchProfile = vi.hoisted(() => vi.fn());
const mockUpsertProfile = vi.hoisted(() => vi.fn());
const mockFetchEntries = vi.hoisted(() => vi.fn());
const mockFetchDecisions = vi.hoisted(() => vi.fn());
const mockFetchIssueSet = vi.hoisted(() => vi.fn());
const mockDrawingProgramPanel = vi.hoisted(() => vi.fn());
const mockTitleBlockScan = vi.hoisted(() => vi.fn());
const mockTitleBlockPreview = vi.hoisted(() => vi.fn());
const mockTitleBlockApply = vi.hoisted(() => vi.fn());

vi.mock("@/components/notification-system/ToastProvider", () => ({
	useToast: () => ({
		showToast,
	}),
}));

vi.mock("@/supabase/client", () => ({
	supabase: {
		auth: {
			getUser: mockGetUser,
		},
		from: mockFrom,
	},
}));

vi.mock("@/services/projectTitleBlockProfileService", () => ({
	projectTitleBlockProfileService: {
		fetchProfile: mockFetchProfile,
		upsertProfile: mockUpsertProfile,
	},
}));

vi.mock("@/services/projectRevisionRegisterService", () => ({
	projectRevisionRegisterService: {
		fetchEntries: mockFetchEntries,
	},
}));

vi.mock("@/services/projectReviewDecisionService", () => ({
	projectReviewDecisionService: {
		fetchDecisions: mockFetchDecisions,
	},
}));

vi.mock("@/features/project-workflow/issueSetService", () => ({
	projectIssueSetService: {
		fetchIssueSet: mockFetchIssueSet,
	},
}));

vi.mock("./DrawingProgramPanel", () => ({
	DrawingProgramPanel: (props: Record<string, unknown>) => {
		mockDrawingProgramPanel(props);
		return <div>Drawing program panel</div>;
	},
}));

vi.mock("@/features/project-setup/actionService", () => ({
	projectSetupActionService: {
		scan: mockTitleBlockScan,
		preview: mockTitleBlockPreview,
		apply: mockTitleBlockApply,
	},
}));

describe("DrawingListManager", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("shows a project-ready scan stage instead of a busy utility summary", async () => {
		mockGetUser.mockResolvedValue({
			data: {
				user: {
					id: "user-1",
				},
			},
			error: null,
		});
		mockOrder.mockResolvedValue({
			data: [
				{
					id: "project-1",
					name: "MyProject",
					watchdog_root_path: "C:/Projects/MyProject",
				},
			],
			error: null,
		});
		mockEq.mockReturnValue({ order: mockOrder });
		mockSelect.mockReturnValue({ eq: mockEq });
		mockFrom.mockReturnValue({ select: mockSelect });
		mockFetchProfile.mockResolvedValue({
			data: {
				id: "profile-1",
				project_id: "project-1",
				user_id: "user-1",
				block_name: "R3P-24x36BORDER&TITLE",
				project_root_path: "",
				acade_project_file_path: "C:/Projects/MyProject/MyProject.wdp",
				acade_line1: "",
				acade_line2: "",
				acade_line4: "",
				signer_drawn_by: "",
				signer_checked_by: "",
				signer_engineer: "",
				created_at: "2026-03-23T00:00:00.000Z",
				updated_at: "2026-03-23T00:00:00.000Z",
			},
			error: null,
		});
		mockUpsertProfile.mockResolvedValue({
			id: "profile-1",
			project_id: "project-1",
			user_id: "user-1",
			block_name: "R3P-24x36BORDER&TITLE",
			project_root_path: "C:/Projects/MyProject",
			acade_project_file_path: "C:/Projects/MyProject/MyProject.wdp",
			acade_line1: "",
			acade_line2: "",
			acade_line4: "",
			signer_drawn_by: "",
			signer_checked_by: "",
			signer_engineer: "",
		});
		mockFetchEntries.mockResolvedValue({
			data: [
				{
					id: "rev-1",
					project_id: "project-1",
				},
			],
			error: null,
		});
		mockFetchDecisions.mockResolvedValue({
			data: [],
			error: null,
		});
		mockFetchIssueSet.mockResolvedValue({
			data: {
				id: "issue-set-1",
				projectId: "project-1",
				name: "MyProject IFC package",
				issueTag: "IFC-01",
				status: "review",
				targetDate: "2026-03-31",
				transmittalNumber: "XMTL-001",
				transmittalDocumentName: "IFC package",
				summary: "Ready for review.",
				notes: null,
				selectedDrawingPaths: ["Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg"],
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
				createdAt: "2026-03-23T00:00:00.000Z",
				updatedAt: "2026-03-23T00:00:00.000Z",
				issuedAt: null,
			},
			error: null,
		});
		mockTitleBlockScan.mockResolvedValue({
			success: true,
			message: "Scan complete.",
			data: {
				projectRootPath: "C:/Projects/MyProject",
				profile: {
					blockName: "R3P-24x36BORDER&TITLE",
					projectRootPath: "C:/Projects/MyProject",
					acadeProjectFilePath: "C:/Projects/MyProject/MyProject.wdp",
					acadeLine1: "",
					acadeLine2: "",
					acadeLine4: "",
					signerDrawnBy: "",
					signerCheckedBy: "",
					signerEngineer: "",
				},
				drawings: [],
				summary: {
					totalFiles: 0,
					drawingFiles: 0,
					flaggedFiles: 0,
					suiteWriteCount: 0,
					acadeWriteCount: 0,
					wdTbConflictCount: 0,
				},
				artifacts: {
					wdtPath: "",
					wdlPath: "",
					wdpPath: "",
					wdtText: "",
					wdlText: "",
					wdpText: "",
					wdpState: "starter",
				},
			},
			warnings: [],
		});

		render(
			<MemoryRouter>
				<DrawingListManager
					preferredProjectId="project-1"
					preferredIssueSetId="issue-set-1"
				/>
			</MemoryRouter>,
		);

		await waitFor(() =>
			expect(screen.getByText("Project title block review")).toBeTruthy(),
		);
		expect(screen.getByText("Project title block review")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /scan project/i }),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: /save defaults/i })).toBeTruthy();
		expect(
			screen.getByRole("link", { name: /^Setup$/i }).getAttribute("href"),
		).toBe("/app/projects/project-1/overview");
		await waitFor(() =>
			expect(
				screen.getByRole("link", { name: /^Review$/i }).getAttribute("href"),
			).toBe("/app/projects/project-1/review?issueSet=issue-set-1"),
		);
	});

	it("surfaces a pending title block review staged by the drawing program", async () => {
		mockGetUser.mockResolvedValue({
			data: {
				user: {
					id: "user-1",
				},
			},
			error: null,
		});
		mockOrder.mockResolvedValue({
			data: [
				{
					id: "project-1",
					name: "MyProject",
					watchdog_root_path: "C:/Projects/MyProject",
				},
			],
			error: null,
		});
		mockEq.mockReturnValue({ order: mockOrder });
		mockSelect.mockReturnValue({ eq: mockEq });
		mockFrom.mockReturnValue({ select: mockSelect });
		mockFetchProfile.mockResolvedValue({
			data: {
				id: "profile-1",
				project_id: "project-1",
				user_id: "user-1",
				block_name: "R3P-24x36BORDER&TITLE",
				project_root_path: "C:/Projects/MyProject",
				acade_project_file_path: "C:/Projects/MyProject/MyProject.wdp",
				acade_line1: "",
				acade_line2: "",
				acade_line4: "",
				signer_drawn_by: "",
				signer_checked_by: "",
				signer_engineer: "",
				created_at: "2026-03-23T00:00:00.000Z",
				updated_at: "2026-03-23T00:00:00.000Z",
			},
			error: null,
		});
		mockUpsertProfile.mockResolvedValue({
			id: "profile-1",
			project_id: "project-1",
			user_id: "user-1",
			block_name: "R3P-24x36BORDER&TITLE",
			project_root_path: "C:/Projects/MyProject",
			acade_project_file_path: "C:/Projects/MyProject/MyProject.wdp",
			acade_line1: "",
			acade_line2: "",
			acade_line4: "",
			signer_drawn_by: "",
			signer_checked_by: "",
			signer_engineer: "",
		});
		mockFetchEntries.mockResolvedValue({ data: [], error: null });
		mockFetchDecisions.mockResolvedValue({ data: [], error: null });
		mockFetchIssueSet.mockResolvedValue({ data: null, error: null });
		render(
			<MemoryRouter>
				<DrawingListManager preferredProjectId="project-1" />
			</MemoryRouter>,
		);

		await waitFor(() => expect(mockDrawingProgramPanel).toHaveBeenCalled());
		const latestProps = (
			mockDrawingProgramPanel.mock.calls[
				mockDrawingProgramPanel.mock.calls.length - 1
			]?.[0] ?? null
		) as
			| {
					onPendingTitleBlockSyncChange?: (pending: {
						paths: string[];
						at: string | null;
					} | null) => void;
			  }
			| null;
		expect(latestProps).toBeTruthy();

		await act(async () => {
			latestProps?.onPendingTitleBlockSyncChange?.({
				paths: ["Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg"],
				at: "2026-03-30T04:00:00.000Z",
			});
		});

		await waitFor(() =>
			expect(
				screen.getByText(/Review pending title block sync for 1 drawing/i),
			).toBeTruthy(),
		);
		expect(mockTitleBlockScan).toHaveBeenCalled();
	});
});
