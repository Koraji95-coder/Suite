import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectDetail } from "./ProjectDetail";
import type { Project } from "@/features/project-core";

const { useProjectDetailWorkspaceStateMock } = vi.hoisted(() => ({
	useProjectDetailWorkspaceStateMock: vi.fn(() => ({
		createLinkedDesign: vi.fn(),
		gridDesigns: [],
		openGridDesign: vi.fn(),
		telemetry: {
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
		},
	})),
}));

vi.mock("@/features/project-detail", () => ({
	CalendarView: () => <div>calendar view</div>,
	FilesBrowser: () => <div>files browser</div>,
	ProjectDetailHeader: () => <div>project header</div>,
	ProjectDetailViewTabs: () => <div>project tabs</div>,
	TaskList: () => <div>task list</div>,
	useProjectDetailWorkspaceState: useProjectDetailWorkspaceStateMock,
}));

vi.mock("@/features/project-detail/ProjectDetailGroundGridsView", () => ({
	ProjectDetailGroundGridsView: () => <div>ground grids</div>,
}));

vi.mock("@/features/project-setup/ProjectSetupWorkspace", () => ({
	ProjectSetupWorkspace: () => <div>setup workspace</div>,
}));

vi.mock("@/features/project-review/ProjectReadinessWorkspace", () => ({
	ProjectReadinessWorkspace: () => <div>readiness workspace</div>,
}));

vi.mock("@/features/project-review/ProjectReviewInboxWorkspace", () => ({
	ProjectReviewInboxWorkspace: () => <div>review workspace</div>,
}));

vi.mock("@/features/project-workflow/ProjectIssueSetManager", () => ({
	ProjectIssueSetManager: () => <div>issue set manager</div>,
}));

vi.mock("@/features/project-revisions/ProjectRevisionRegisterView", () => ({
	ProjectRevisionRegisterView: () => <div>revision register</div>,
}));

vi.mock("@/features/project-watchdog/ProjectTelemetryPanel", () => ({
	ProjectTelemetryPanel: () => <div>telemetry panel</div>,
}));

function createProject(): Project {
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
		watchdog_root_path: "C:/Projects/Nanulak",
	} as Project;
}

function renderProjectDetail(viewMode: "setup" | "files" | "readiness") {
	return render(
		<ProjectDetail
			project={createProject()}
			tasks={[]}
			files={[]}
			calendarEvents={[]}
			onToggleArchive={vi.fn()}
			onExportMarkdown={vi.fn()}
			onAddTask={vi.fn()}
			onEditTask={vi.fn()}
			onDeleteTask={vi.fn()}
			onToggleTaskComplete={vi.fn()}
			onAddSubtask={vi.fn()}
			onDragEnd={vi.fn()}
			expandedTasks={new Set()}
			onToggleExpand={vi.fn()}
			sensors={[]}
			taskFilter="all"
			onTaskFilterChange={vi.fn()}
			viewMode={viewMode}
			onViewModeChange={vi.fn()}
			activeIssueSetId={null}
			onActiveIssueSetIdChange={vi.fn()}
			selectedCalendarDate={null}
			onCalendarDateSelect={vi.fn()}
			currentMonth={new Date("2026-04-01T00:00:00.000Z")}
			onMonthChange={vi.fn()}
			fileFilter=""
			onFileFilterChange={vi.fn()}
			onFileUpload={vi.fn()}
			onDownloadFile={vi.fn()}
			onProjectWatchdogRootChange={vi.fn()}
		/>,
	);
}

describe("ProjectDetail", () => {
	beforeEach(() => {
		useProjectDetailWorkspaceStateMock.mockClear();
	});

	it("requests detail workspace state for setup mode", () => {
		renderProjectDetail("setup");

		expect(useProjectDetailWorkspaceStateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				project: expect.objectContaining({ id: "project-1" }),
				viewMode: "setup",
			}),
		);
	});

	it("requests detail workspace state for files mode", () => {
		renderProjectDetail("files");

		expect(useProjectDetailWorkspaceStateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				project: expect.objectContaining({ id: "project-1" }),
				viewMode: "files",
			}),
		);
	});

	it("requests detail workspace state for readiness mode", () => {
		renderProjectDetail("readiness");

		expect(useProjectDetailWorkspaceStateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				project: expect.objectContaining({ id: "project-1" }),
				viewMode: "readiness",
			}),
		);
	});
});

