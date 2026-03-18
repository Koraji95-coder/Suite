import { describe, expect, it } from "vitest";
import type {
	WatchdogCollector,
	WatchdogCollectorEvent,
	WatchdogSessionSummary,
} from "@/services/watchdogService";
import { buildDashboardWatchdogViewModel } from "./dashboardWatchdogSelectors";

function createCollector(
	overrides: Partial<WatchdogCollector> = {},
): WatchdogCollector {
	return {
		collectorId: "collector-a",
		name: "Collector A",
		collectorType: "filesystem",
		workstationId: "DUSTINWARD",
		capabilities: ["filesystem"],
		metadata: {},
		status: "online",
		createdAt: 1,
		updatedAt: 1,
		lastHeartbeatAt: 1,
		lastEventAt: 1,
		eventCount: 0,
		lastSequence: 0,
		...overrides,
	};
}

function createEvent(
	overrides: Partial<WatchdogCollectorEvent> = {},
): WatchdogCollectorEvent {
	return {
		eventId: 1,
		collectorId: "collector-a",
		collectorType: "filesystem",
		workstationId: "DUSTINWARD",
		eventType: "file_modified",
		sourceType: "filesystem",
		timestamp: 1000,
		projectId: "project-1",
		metadata: {},
		...overrides,
	};
}

function createSession(
	overrides: Partial<WatchdogSessionSummary> = {},
): WatchdogSessionSummary {
	return {
		sessionId: "session-1",
		collectorId: "collector-cad",
		collectorType: "autocad_state",
		workstationId: "DUSTINWARD",
		projectId: "project-1",
		drawingPath: "C:/Projects/Alpha/Main.dwg",
		status: "live",
		active: true,
		startedAt: 1000,
		endedAt: null,
		latestEventAt: 3000,
		lastActivityAt: 2800,
		lastEventType: "command_executed",
		eventCount: 3,
		commandCount: 2,
		idleCount: 0,
		activationCount: 1,
		durationMs: 2000,
		sourceAvailable: true,
		pendingCount: 0,
		trackerUpdatedAt: 2900,
		...overrides,
	};
}

describe("buildDashboardWatchdogViewModel", () => {
	it("scopes collector options to the selected project and collector filter", () => {
		const filesystemCollector = createCollector({
			collectorId: "collector-fs",
			name: "Filesystem",
		});
		const cadCollector = createCollector({
			collectorId: "collector-cad",
			name: "AutoCAD",
			collectorType: "autocad_state",
			capabilities: ["autocad", "drawing_sessions", "commands"],
		});
		const unrelatedCollector = createCollector({
			collectorId: "collector-other",
			name: "Other",
		});

		const viewModel = buildDashboardWatchdogViewModel({
			allProjectsMap: new Map(),
			collectors: [filesystemCollector, cadCollector, unrelatedCollector],
			selectedCollectorId: "collector-cad",
			selectedProjectId: "project-1",
			selectedWindowMs: 60_000,
			watchdogEvents: [
				createEvent({
					collectorId: "collector-fs",
					projectId: "project-1",
				}),
			],
			watchdogSessions: [
				createSession({
					collectorId: "collector-cad",
					projectId: "project-1",
				}),
			],
			nowMs: 10_000,
		});

		expect(
			viewModel.filteredCollectorOptions.map((collector) => collector.collectorId),
		).toEqual(["collector-fs", "collector-cad"]);
		expect(
			viewModel.visibleCollectors.map((collector) => collector.collectorId),
		).toEqual(["collector-cad"]);
	});

	it("builds live session cards with collector status and tracker fallbacks", () => {
		const cadCollector = createCollector({
			collectorId: "collector-cad",
			name: "AutoCAD Collector",
			collectorType: "autocad_state",
			capabilities: ["autocad", "drawing_sessions", "commands"],
			lastHeartbeatAt: 4500,
			metadata: {
				trackerUpdatedAt: 4300,
				activeDrawingPath: "C:/Projects/Alpha/Main.dwg",
			},
		});

		const viewModel = buildDashboardWatchdogViewModel({
			allProjectsMap: new Map(),
			collectors: [cadCollector],
			selectedCollectorId: "all",
			selectedProjectId: "all",
			selectedWindowMs: 60_000,
			watchdogEvents: [],
			watchdogSessions: [
				createSession({
					collectorId: "collector-cad",
					trackerUpdatedAt: null,
					latestEventAt: 4000,
				}),
				createSession({
					sessionId: "session-complete",
					status: "completed",
					active: false,
				}),
			],
			nowMs: 10_000,
		});

		expect(viewModel.liveSessionCards).toHaveLength(1);
		expect(viewModel.activeCadSessionCount).toBe(1);
		expect(viewModel.liveSessionCards[0]).toMatchObject({
			collectorName: "AutoCAD Collector",
			collectorStatus: "online",
			collectorStatusTone: "success",
			trackingLabel: "Live",
			trackingTone: "primary",
			drawingLabel: "Main.dwg",
			trackerAt: 4300,
		});
	});

	it("clamps session timeline rows to the selected time window", () => {
		const viewModel = buildDashboardWatchdogViewModel({
			allProjectsMap: new Map([["project-1", { name: "Project Alpha" }]]),
			collectors: [
				createCollector({
					collectorId: "collector-cad",
					name: "AutoCAD Collector",
					collectorType: "autocad_state",
					capabilities: ["autocad", "drawing_sessions", "commands"],
					lastHeartbeatAt: 9200,
				}),
			],
			selectedCollectorId: "all",
			selectedProjectId: "all",
			selectedWindowMs: 4000,
			watchdogEvents: [],
			watchdogSessions: [
				createSession({
					collectorId: "collector-cad",
					startedAt: 4000,
					latestEventAt: 10_500,
					durationMs: 7000,
					trackerUpdatedAt: null,
				}),
			],
			nowMs: 10_000,
		});

		expect(viewModel.sessionTimelineRows).toHaveLength(1);
		expect(viewModel.sessionTimelineRows[0]).toMatchObject({
			collectorName: "AutoCAD Collector",
			projectName: "Project Alpha",
			drawingLabel: "Main.dwg",
			leftPercent: 0,
			widthPercent: 100,
			trackerAt: 9200,
			statusTone: "primary",
		});
	});
});
