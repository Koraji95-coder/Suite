import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ViewMode } from "@/features/project-core";
import { useProjectDetailWorkspaceState } from "./useProjectDetailWorkspaceState";

const detailWorkspaceMocks = vi.hoisted(() => ({
	useProjectWatchdogTelemetryMock: vi.fn(() => ({
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
	})),
	useProjectDetailGridDesignsMock: vi.fn(() => ({
		createLinkedDesign: vi.fn(),
		gridDesigns: [],
		openGridDesign: vi.fn(),
	})),
}));

vi.mock("@/features/project-watchdog", () => ({
	useProjectWatchdogTelemetry: detailWorkspaceMocks.useProjectWatchdogTelemetryMock,
}));

vi.mock("./useProjectDetailGridDesigns", () => ({
	useProjectDetailGridDesigns: detailWorkspaceMocks.useProjectDetailGridDesignsMock,
}));

function createProject(): Project {
	return {
		id: "project-1",
		user_id: "user-1",
		name: "MyProject",
		description: "Issue package setup",
		status: "active",
		priority: "high",
		deadline: "2026-03-31",
		category: "Substation",
		created_at: "2026-03-20T00:00:00.000Z",
		updated_at: "2026-03-20T00:00:00.000Z",
		watchdog_root_path: "C:/Projects/MyProject",
	} as Project;
}

function HookProbe({ viewMode }: { viewMode: ViewMode }) {
	useProjectDetailWorkspaceState({
		project: createProject(),
		viewMode,
	});
	return null;
}

describe("useProjectDetailWorkspaceState", () => {
	beforeEach(() => {
		detailWorkspaceMocks.useProjectWatchdogTelemetryMock.mockClear();
		detailWorkspaceMocks.useProjectDetailGridDesignsMock.mockClear();
	});

	it("keeps deep telemetry off for non-files project views", () => {
		render(<HookProbe viewMode="setup" />);

		expect(detailWorkspaceMocks.useProjectWatchdogTelemetryMock).toHaveBeenCalledWith(
			"project-1",
			undefined,
			expect.objectContaining({
				includeOverview: false,
				includeRecentEvents: false,
				includeTrackedDrawings: false,
			}),
		);
	});

	it("enables deep telemetry for the files and activity view", () => {
		render(<HookProbe viewMode="files" />);

		expect(detailWorkspaceMocks.useProjectWatchdogTelemetryMock).toHaveBeenCalledWith(
			"project-1",
			undefined,
			expect.objectContaining({
				includeOverview: true,
				includeRecentEvents: true,
				includeTrackedDrawings: true,
			}),
		);
	});

	it("keeps tracked drawings available for readiness without loading deep telemetry", () => {
		render(<HookProbe viewMode="readiness" />);

		expect(detailWorkspaceMocks.useProjectWatchdogTelemetryMock).toHaveBeenCalledWith(
			"project-1",
			undefined,
			expect.objectContaining({
				includeOverview: false,
				includeRecentEvents: false,
				includeTrackedDrawings: true,
			}),
		);
	});
});
