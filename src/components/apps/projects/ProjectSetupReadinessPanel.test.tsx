import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectRevisionRegisterService } from "@/services/projectRevisionRegisterService";
import {
	DEFAULT_PROJECT_TITLE_BLOCK_NAME,
	projectTitleBlockProfileService,
} from "@/services/projectTitleBlockProfileService";
import { ProjectSetupReadinessPanel } from "./ProjectSetupReadinessPanel";
import type { Project } from "./projectmanagertypes";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";

vi.mock("@/services/projectTitleBlockProfileService", async () => {
	const actual = await vi.importActual<
		typeof import("@/services/projectTitleBlockProfileService")
	>("@/services/projectTitleBlockProfileService");
	return {
		...actual,
		projectTitleBlockProfileService: {
			...actual.projectTitleBlockProfileService,
			fetchProfile: vi.fn(),
		},
	};
});

vi.mock("@/services/projectRevisionRegisterService", () => ({
	projectRevisionRegisterService: {
		fetchEntries: vi.fn(),
	},
}));

function createTelemetry(
	overrides: Partial<ProjectWatchdogTelemetry> = {},
): ProjectWatchdogTelemetry {
	return {
		loading: false,
		error: null,
		overview: null,
		recentEvents: [],
		recentAutoCadEvents: [],
		sessions: [],
		liveSessions: [],
		autoCadCollectors: [],
		liveAutoCadCollectors: [],
		activeCadSessionCount: 0,
		onlineCollectorCount: 0,
		latestAutoCadEvent: null,
		latestSession: null,
		totalCommandsInWindow: 0,
		latestTrackerUpdatedAt: null,
		rule: null,
		ruleConfigured: false,
		ruleUpdatedAt: null,
		trackedDrawings: [],
		...overrides,
	};
}

function createProject(overrides: Partial<Project> = {}): Project {
	return {
		id: "project-1",
		user_id: "user-1",
		name: "Nanulak",
		description: "Issue package setup",
		status: "active",
		priority: "high",
		deadline: "2026-03-31",
		category: "Substation",
		created_at: "2026-03-20T00:00:00.000Z",
		updated_at: "2026-03-20T00:00:00.000Z",
		watchdog_root_path: null,
		...overrides,
	} as Project;
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("ProjectSetupReadinessPanel", () => {
	it("shows setup gaps when the project is not configured", async () => {
		vi.mocked(projectTitleBlockProfileService.fetchProfile).mockResolvedValue({
			data: {
				id: "profile-1",
				project_id: "project-1",
				user_id: "user-1",
				block_name: DEFAULT_PROJECT_TITLE_BLOCK_NAME,
				project_root_path: null,
				acade_line1: "",
				acade_line2: "",
				acade_line4: "",
				signer_drawn_by: "",
				signer_checked_by: "",
				signer_engineer: "",
				created_at: "2026-03-20T00:00:00.000Z",
				updated_at: "2026-03-20T00:00:00.000Z",
			},
			error: null,
		});
		vi.mocked(projectRevisionRegisterService.fetchEntries).mockResolvedValue({
			data: [],
			error: null,
		});

		render(
			<MemoryRouter>
				<ProjectSetupReadinessPanel
					project={createProject()}
					telemetry={createTelemetry()}
				/>
			</MemoryRouter>,
		);

		await waitFor(() =>
			expect(
				screen.getByText("No tracking root is configured yet."),
			).toBeTruthy(),
		);
		expect(screen.getByText(/Only the base block is configured/i)).toBeTruthy();
		expect(screen.getByText(/No revision register entries yet/i)).toBeTruthy();
	});

	it("shows a ready setup when tracking, defaults, and revision history exist", async () => {
		vi.mocked(projectTitleBlockProfileService.fetchProfile).mockResolvedValue({
			data: {
				id: "profile-1",
				project_id: "project-1",
				user_id: "user-1",
				block_name: DEFAULT_PROJECT_TITLE_BLOCK_NAME,
				project_root_path: "C:/Projects/Nanulak",
				acade_line1: "Nanulak 180MW Substation",
				acade_line2: "Issue for review",
				acade_line4: "",
				signer_drawn_by: "KD",
				signer_checked_by: "QA",
				signer_engineer: "",
				created_at: "2026-03-20T00:00:00.000Z",
				updated_at: "2026-03-20T00:00:00.000Z",
			},
			error: null,
		});
		vi.mocked(projectRevisionRegisterService.fetchEntries).mockResolvedValue({
			data: [
				{
					id: "rev-1",
					project_id: "project-1",
					file_id: null,
					drawing_number: "R3P-25074-E0-0001",
					title: "Drawing Index",
					revision: "A",
					previous_revision: null,
					revision_description: "Initial issue",
					revision_by: "KD",
					revision_checked_by: "QA",
					revision_date: "2026-03-20",
					revision_sort_order: 1,
					issue_summary: "Issued for review",
					issue_status: "resolved",
					issue_severity: "low",
					source_kind: "manual",
					source_ref: null,
					autodraft_request_id: null,
					transmittal_number: null,
					transmittal_document_name: null,
					notes: null,
					user_id: "user-1",
					created_at: "2026-03-20T00:00:00.000Z",
					updated_at: "2026-03-20T00:00:00.000Z",
				},
			],
			error: null,
		});

		render(
			<MemoryRouter>
				<ProjectSetupReadinessPanel
					project={createProject({
						watchdog_root_path: "C:/Projects/Nanulak",
					})}
					telemetry={createTelemetry({
						ruleConfigured: true,
						rule: {
							projectId: "project-1",
							roots: ["C:/Projects/Nanulak"],
							includeGlobs: ["**/*.dwg"],
							excludeGlobs: [],
							drawingPatterns: ["R3P-*.dwg"],
							metadata: {},
							updatedAt: Date.now(),
						},
					})}
				/>
			</MemoryRouter>,
		);

		await waitFor(() =>
			expect(
				screen.getByText(/Project root and shared mapping rules are in place/i),
			).toBeTruthy(),
		);
		expect(screen.getByText(/project defaults set/i)).toBeTruthy();
		expect(
			screen.getByText(/Revision history is in place for issue-set review/i),
		).toBeTruthy();
	});
});
