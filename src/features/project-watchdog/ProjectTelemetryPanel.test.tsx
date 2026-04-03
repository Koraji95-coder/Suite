import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	saveSharedProjectWatchdogRule,
	syncSharedProjectWatchdogRulesToLocalRuntime,
} from "@/services/projectWatchdogService";
import type { WatchdogSessionSummary } from "@/services/watchdogService";
import { ProjectTelemetryPanel } from "./ProjectTelemetryPanel";
import type { ProjectWatchdogTelemetry } from "@/features/project-watchdog";

vi.mock("@/services/projectWatchdogService", () => ({
	saveSharedProjectWatchdogRule: vi.fn(),
	syncSharedProjectWatchdogRulesToLocalRuntime: vi.fn(),
}));

const baseSession = {
	sessionId: "session-1",
	collectorId: "collector-cad",
	collectorType: "autocad_state",
	workstationId: "DUSTIN-HOME",
	projectId: "project-1",
	drawingPath: "C:/Projects/Alpha/Drawing1.dwg",
	status: "live",
	active: true,
	startedAt: Date.now() - 10 * 60 * 1000,
	endedAt: null,
	latestEventAt: Date.now(),
	lastActivityAt: Date.now(),
	lastEventType: "command_executed",
	eventCount: 3,
	commandCount: 2,
	idleCount: 0,
	activationCount: 1,
	durationMs: 10 * 60 * 1000,
	sourceAvailable: true,
	pendingCount: 0,
	trackerUpdatedAt: Date.now(),
} satisfies WatchdogSessionSummary;

function createTelemetry(): ProjectWatchdogTelemetry {
	return {
		loading: false,
		error: null,
		overview: null,
		recentEvents: [],
		recentAutoCadEvents: [],
		sessions: [baseSession],
		liveSessions: [baseSession],
		autoCadCollectors: [],
		liveAutoCadCollectors: [],
		activeCadSessionCount: 1,
		onlineCollectorCount: 1,
		latestAutoCadEvent: null,
		latestSession: baseSession,
		totalCommandsInWindow: 2,
		latestTrackerUpdatedAt: Date.now(),
		rule: {
			projectId: "project-1",
			roots: ["C:/Projects/Alpha"],
			includeGlobs: ["**/*.dwg"],
			excludeGlobs: [],
			drawingPatterns: ["Drawing*.dwg"],
			metadata: {},
			updatedAt: Date.now(),
		},
		ruleConfigured: true,
		ruleUpdatedAt: Date.now(),
		trackedDrawings: [
			{
				drawingPath: "C:/Projects/Alpha/Drawing1.dwg",
				drawingName: "Drawing1.dwg",
				lifetimeTrackedMs: 2 * 60 * 60 * 1000,
				todayTrackedMs: 30 * 60 * 1000,
				lastWorkedAt: new Date().toISOString(),
				daysWorkedCount: 2,
				liveTrackedMs: 10 * 60 * 1000,
				liveStatus: "live",
				dateGroups: [
					{
						workDate: "2026-03-19",
						trackedMs: 30 * 60 * 1000,
						idleMs: 5 * 60 * 1000,
						segmentCount: 1,
						lastWorkedAt: new Date().toISOString(),
						segments: [
							{
								id: "segment-1",
								workDate: "2026-03-19",
								startedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
								endedAt: new Date().toISOString(),
								trackedMs: 10 * 60 * 1000,
								idleMs: 0,
								commandCount: 2,
								workstationId: "DUSTIN-HOME",
								sourceSessionId: "session-1",
								syncKey: "segment-1",
								status: "live",
								isLive: true,
							},
						],
					},
				],
			},
		],
	};
}

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe("ProjectTelemetryPanel", () => {
	it("renders recent sessions, watchdog link, and tracked drawings", () => {
		render(
			<MemoryRouter>
				<ProjectTelemetryPanel
					projectId="project-1"
					telemetry={createTelemetry()}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByText("Project activity")).toBeTruthy();
		expect(screen.getByText("Recent CAD sessions")).toBeTruthy();
		expect(screen.getAllByText("Drawing1.dwg").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Tracked drawings").length).toBeGreaterThan(0);
		expect(screen.getByText(/Lifetime 2h/i)).toBeTruthy();
		const link = screen.getByRole("link", {
			name: /open watchdog/i,
		}) as HTMLAnchorElement;
		expect(link.getAttribute("href")).toBe("/app/watchdog?project=project-1");
	});

	it("uses a compact session fallback when journals have not synced yet", () => {
		const telemetry = createTelemetry();
		telemetry.trackedDrawings = [];

		render(
			<MemoryRouter>
				<ProjectTelemetryPanel
					projectId="project-1"
					telemetry={telemetry}
				/>
			</MemoryRouter>,
		);

		expect(
			screen.getByText(
				/drawing journals have not synced yet, but recent autocad sessions are already attributed to this project/i,
			),
		).toBeTruthy();
		expect(screen.getByText(/started/i)).toBeTruthy();
	});

	it("saves edited rule values through the shared project watchdog service", async () => {
		const telemetry = createTelemetry();
		const saveRuleSpy = vi.mocked(saveSharedProjectWatchdogRule).mockResolvedValue({
			projectId: "project-1",
			roots: ["C:/Projects/Alpha", "C:/Projects/Beta"],
			includeGlobs: ["**/*.dwg"],
			excludeGlobs: ["**/archive/**"],
			drawingPatterns: ["SHT-*.dwg"],
			metadata: {},
			updatedAt: Date.now(),
		});
		const syncSpy = vi
			.mocked(syncSharedProjectWatchdogRulesToLocalRuntime)
			.mockResolvedValue({
				ok: true,
				rules: [],
				count: 0,
				deletedProjectIds: [],
			});
		const onRootPathChange = vi.fn();

		render(
			<MemoryRouter>
				<ProjectTelemetryPanel
					projectId="project-1"
					telemetry={telemetry}
					onRootPathChange={onRootPathChange}
				/>
			</MemoryRouter>,
		);

		fireEvent.click(screen.getByRole("button", { name: /edit rules/i }));
		fireEvent.change(screen.getByLabelText("Roots"), {
			target: { value: "C:/Projects/Alpha\nC:/Projects/Beta" },
		});
		fireEvent.change(screen.getByLabelText("Exclude globs"), {
			target: { value: "**/archive/**" },
		});
		fireEvent.change(screen.getByLabelText("Drawing patterns"), {
			target: { value: "SHT-*.dwg" },
		});
		fireEvent.click(screen.getByRole("button", { name: /save rules/i }));

		await waitFor(() => expect(saveRuleSpy).toHaveBeenCalledTimes(1));
		expect(saveRuleSpy).toHaveBeenCalledWith("project-1", {
			roots: ["C:/Projects/Alpha", "C:/Projects/Beta"],
			includeGlobs: ["**/*.dwg"],
			excludeGlobs: ["**/archive/**"],
			drawingPatterns: ["SHT-*.dwg"],
			metadata: {},
		});
		await waitFor(() => expect(syncSpy).toHaveBeenCalledTimes(1));
		expect(onRootPathChange).toHaveBeenCalledWith("C:/Projects/Alpha");
		expect(screen.getByText(/C:\/Projects\/Beta/)).toBeTruthy();
	});

	it("cancels rule edits without saving", () => {
		const telemetry = createTelemetry();
		const saveRuleSpy = vi.mocked(saveSharedProjectWatchdogRule);

		render(
			<MemoryRouter>
				<ProjectTelemetryPanel projectId="project-1" telemetry={telemetry} />
			</MemoryRouter>,
		);

		fireEvent.click(screen.getByRole("button", { name: /edit rules/i }));
		fireEvent.change(screen.getByLabelText("Roots"), {
			target: { value: "C:/Projects/Changed" },
		});
		fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

		expect(saveRuleSpy).not.toHaveBeenCalled();
		expect(screen.getAllByText("C:/Projects/Alpha").length).toBeGreaterThan(0);
	});
});

