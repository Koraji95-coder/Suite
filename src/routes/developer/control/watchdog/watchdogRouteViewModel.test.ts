import { describe, expect, it } from "vitest";
import type {
	WatchdogCollector,
	WatchdogCollectorEvent,
	WatchdogSessionSummary,
} from "@/services/watchdogService";
import {
	buildAttentionRows,
	buildDaybookRows,
	buildProjectRollupRows,
	buildWorkstationRows,
} from "./watchdogRouteViewModel";

const PROJECT_MAP = new Map([["project-1", { name: "MyProject" }]]);

function createCollector(
	overrides: Partial<WatchdogCollector> = {},
): WatchdogCollector {
	return {
		collectorId: "collector-1",
		name: "Dustin CAD",
		collectorType: "autocad_state",
		workstationId: "DEV-WORKSTATION",
		capabilities: ["autocad", "drawing_sessions", "commands"],
		metadata: {
			sourceAvailable: true,
			isPaused: false,
			activeDrawingName: "Drawing1.dwg",
			trackerUpdatedAt: 1000,
			pendingCount: 0,
		},
		status: "online",
		createdAt: 0,
		updatedAt: 0,
		lastHeartbeatAt: 0,
		lastEventAt: 0,
		eventCount: 0,
		lastSequence: 0,
		...overrides,
	};
}

function createSession(
	overrides: Partial<WatchdogSessionSummary> = {},
): WatchdogSessionSummary {
	return {
		sessionId: "session-1",
		collectorId: "collector-1",
		collectorType: "autocad_state",
		workstationId: "DEV-WORKSTATION",
		projectId: "project-1",
		drawingPath: "C:/Projects/MyProject/Drawing1.dwg",
		status: "live",
		active: true,
		startedAt: 100,
		latestEventAt: 500,
		lastActivityAt: 500,
		lastEventType: "drawing_opened",
		eventCount: 2,
		commandCount: 1,
		idleCount: 0,
		activationCount: 1,
		durationMs: 400,
		sourceAvailable: true,
		pendingCount: 0,
		trackerUpdatedAt: 500,
		...overrides,
	};
}

function createEvent(
	overrides: Partial<WatchdogCollectorEvent> = {},
): WatchdogCollectorEvent {
	return {
		eventId: 1,
		collectorId: "collector-1",
		collectorType: "autocad_state",
		workstationId: "DEV-WORKSTATION",
		eventType: "command_executed",
		sourceType: "autocad",
		timestamp: 700,
		projectId: "project-1",
		sessionId: "session-1",
		drawingPath: "C:/Projects/MyProject/Drawing1.dwg",
		metadata: {
			commandName: "QSAVE",
		},
		...overrides,
	};
}

describe("watchdogRouteViewModel", () => {
	it("builds one drawing row with project and latest action context", () => {
		const rows = buildDaybookRows({
			collectors: [createCollector()],
			events: [createEvent()],
			sessions: [createSession()],
			projectNameMap: PROJECT_MAP,
		});

		expect(rows).toHaveLength(1);
		expect(rows[0].projectLabel).toBe("MyProject");
		expect(rows[0].drawingLabel).toBe("Drawing1.dwg");
		expect(rows[0].sessionCount).toBe(1);
		expect(rows[0].latestActionLabel).toMatch(/saved|qsave/i);
	});

	it("ignores non-drawing collector paths in the drawing rollup", () => {
		const rows = buildDaybookRows({
			collectors: [createCollector()],
			events: [
				createEvent(),
				createEvent({
					eventId: 2,
					collectorType: "filesystem",
					sourceType: "filesystem",
					eventType: "modified",
					drawingPath: null,
					path: "C:/Suite/logs/api_server.log",
					projectId: null,
					sessionId: null,
				}),
			],
			sessions: [createSession()],
			projectNameMap: PROJECT_MAP,
		});

		expect(rows).toHaveLength(1);
		expect(rows[0].drawingLabel).toBe("Drawing1.dwg");
	});

	it("builds workstation and attention rows from collector health", () => {
		const collectors = [
			createCollector({
				metadata: {
					sourceAvailable: false,
					isPaused: true,
					activeDrawingName: "Drawing1.dwg",
					trackerUpdatedAt: 1200,
					pendingCount: 2,
				},
			}),
		];
		const sessions = [createSession()];
		const workstationRows = buildWorkstationRows({
			collectors,
			projectNameMap: PROJECT_MAP,
			sessions,
		});
		const attentionRows = buildAttentionRows({
			cadCollectorsOnline: 1,
			collectorAttentionCount: 1,
			unassignedCadCount: 0,
			visibleLiveSessionCount: 0,
		});

		expect(workstationRows[0].needsAttention).toBe(true);
		expect(workstationRows[0].projectLabels).toContain("MyProject");
		expect(attentionRows.map((row) => row.key)).toEqual(
			expect.arrayContaining(["collectors", "idle"]),
		);
		expect(
			attentionRows.find((row) => row.key === "collectors")?.actionKey,
		).toBe("runtime-control");
	});

	it("marks unlinked drawing activity with a project-setup action", () => {
		const attentionRows = buildAttentionRows({
			cadCollectorsOnline: 1,
			collectorAttentionCount: 0,
			unassignedCadCount: 1,
			visibleLiveSessionCount: 0,
		});

	expect(attentionRows.find((row) => row.key === "unassigned")).toMatchObject({
		actionKey: "project-setup",
		actionLabel: "Review project link",
	});
	});

	it("builds project rollups from daybook rows", () => {
		const daybookRows = buildDaybookRows({
			collectors: [createCollector()],
			events: [
				createEvent(),
				createEvent({
					eventId: 2,
					drawingPath: "C:/Projects/MyProject/Drawing2.dwg",
					sessionId: "session-2",
				}),
			],
			sessions: [
				createSession(),
				createSession({
					sessionId: "session-2",
					drawingPath: "C:/Projects/MyProject/Drawing2.dwg",
					commandCount: 2,
					durationMs: 600,
					lastActivityAt: 650,
					latestEventAt: 650,
				}),
			],
			projectNameMap: PROJECT_MAP,
		});

		const rollups = buildProjectRollupRows({ daybookRows });

		expect(rollups).toHaveLength(1);
		expect(rollups[0].projectLabel).toBe("MyProject");
		expect(rollups[0].drawingCount).toBe(2);
		expect(rollups[0].activeDrawingCount).toBe(2);
		expect(rollups[0].totalCommands).toBe(3);
	});
});
