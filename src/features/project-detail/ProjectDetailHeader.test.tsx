import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { WatchdogSessionSummary } from "@/services/watchdogService";
import { ProjectDetailHeader } from "./ProjectDetailHeader";
import type { Project, Task } from "@/features/project-core";
import type { ProjectWatchdogTelemetry } from "@/features/project-watchdog";

const project = {
	id: "project-1",
	name: "Project Alpha",
	description: "Telemetry rollout",
	status: "active",
	deadline: "2026-03-31",
	category: "Coding",
} as Project;

const tasks = [
	{
		id: "task-1",
		name: "Collector setup",
		completed: false,
		due_date: "2026-03-25",
	},
] as Task[];

const baseSession = {
	sessionId: "session-1",
	collectorId: "collector-cad",
	collectorType: "autocad_state",
	workstationId: "DEV-HOME",
	projectId: "project-1",
	drawingPath: "C:/Projects/Alpha/Drawing1.dwg",
	status: "live",
	active: true,
	startedAt: Date.now() - 60_000,
	endedAt: null,
	latestEventAt: Date.now(),
	lastActivityAt: Date.now(),
	lastEventType: "command_executed",
	eventCount: 2,
	commandCount: 2,
	idleCount: 0,
	activationCount: 1,
	durationMs: 45_000,
	sourceAvailable: true,
	pendingCount: 0,
	trackerUpdatedAt: Date.now(),
} satisfies WatchdogSessionSummary;

const telemetry = {
	loading: false,
	error: null,
	overview: {
		ok: true,
		generatedAt: Date.now(),
		timeWindowMs: 24 * 60 * 60 * 1000,
		projectId: "project-1",
		collectors: {
			total: 1,
			online: 1,
			offline: 0,
		},
		events: {
			retained: 2,
			inWindow: 2,
			latestEventAt: Date.now(),
			byType: { drawing_opened: 1, command_executed: 1 },
			bySourceType: { autocad: 2 },
			latest: [],
		},
		projects: { top: [] },
		trendBuckets: [],
	},
	recentEvents: [],
	recentAutoCadEvents: [
		{
			eventId: 1,
			collectorId: "collector-cad",
			collectorType: "autocad_state",
			workstationId: "DEV-HOME",
			eventType: "drawing_opened",
			sourceType: "autocad",
			timestamp: Date.now(),
			projectId: "project-1",
			drawingPath: "C:/Projects/Alpha/Drawing1.dwg",
			metadata: {},
		},
	],
	sessions: [baseSession],
	liveSessions: [baseSession],
	autoCadCollectors: [
		{
			collectorId: "collector-cad",
			name: "AutoCAD Collector",
			collectorType: "autocad_state",
			workstationId: "DEV-HOME",
			capabilities: ["autocad", "drawing_sessions", "commands"],
			metadata: {
				sourceAvailable: true,
				activeDrawingPath: "C:/Projects/Alpha/Drawing1.dwg",
				activeDrawingName: "Drawing1.dwg",
				currentSessionId: "session-1",
				trackerUpdatedAt: Date.now(),
			},
			status: "online",
			createdAt: 1,
			updatedAt: 1,
			lastHeartbeatAt: Date.now(),
			lastEventAt: Date.now(),
			eventCount: 2,
			lastSequence: 2,
		},
	],
	liveAutoCadCollectors: [
		{
			collectorId: "collector-cad",
			name: "AutoCAD Collector",
			collectorType: "autocad_state",
			workstationId: "DEV-HOME",
			capabilities: ["autocad", "drawing_sessions", "commands"],
			metadata: {
				sourceAvailable: true,
				activeDrawingPath: "C:/Projects/Alpha/Drawing1.dwg",
				activeDrawingName: "Drawing1.dwg",
				currentSessionId: "session-1",
				trackerUpdatedAt: Date.now(),
			},
			status: "online",
			createdAt: 1,
			updatedAt: 1,
			lastHeartbeatAt: Date.now(),
			lastEventAt: Date.now(),
			eventCount: 2,
			lastSequence: 2,
		},
	],
	activeCadSessionCount: 1,
	onlineCollectorCount: 1,
	latestAutoCadEvent: {
		eventId: 1,
		collectorId: "collector-cad",
		collectorType: "autocad_state",
		workstationId: "DEV-HOME",
		eventType: "drawing_opened",
		sourceType: "autocad",
		timestamp: Date.now(),
		projectId: "project-1",
		drawingPath: "C:/Projects/Alpha/Drawing1.dwg",
		metadata: {},
	},
	latestSession: baseSession,
	totalCommandsInWindow: 2,
	latestTrackerUpdatedAt: Date.now(),
	rule: {
		projectId: "project-1",
		roots: ["C:/Projects/Alpha", "C:/Projects/Alpha/Issued"],
		includeGlobs: ["**/*.dwg"],
		excludeGlobs: [],
		drawingPatterns: ["Drawing*.dwg"],
		metadata: {},
		updatedAt: Date.now(),
	},
	ruleConfigured: true,
	ruleUpdatedAt: Date.now(),
	trackedDrawings: [],
} satisfies ProjectWatchdogTelemetry;

describe("ProjectDetailHeader", () => {
	it("links project telemetry to the dedicated watchdog page", () => {
		render(
			<MemoryRouter>
				<ProjectDetailHeader
					project={project}
					tasks={tasks}
					telemetry={telemetry}
					onToggleArchive={vi.fn()}
					onExportMarkdown={vi.fn()}
				/>
			</MemoryRouter>,
		);

		const link = screen.getByRole("link", {
			name: /open watchdog/i,
		}) as HTMLAnchorElement;
		expect(link.getAttribute("href")).toBe(
			"/app/developer/control/watchdog?project=project-1",
		);
	});

	it("renders compact watchdog activity for the current project", () => {
		render(
			<MemoryRouter>
				<ProjectDetailHeader
					project={{
						...project,
						watchdog_root_path: "C:/Projects/Alpha",
					}}
					tasks={tasks}
					telemetry={telemetry}
					onToggleArchive={vi.fn()}
					onExportMarkdown={vi.fn()}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByText(/project activity/i)).toBeTruthy();
		expect(screen.getByText(/Drawing1\.dwg/i)).toBeTruthy();
		expect(screen.getByText(/1 online/i)).toBeTruthy();
		expect(screen.getByText(/2 roots \| 2 patterns/i)).toBeTruthy();
		expect(
			screen.getByRole("link", { name: /open watchdog/i }),
		).toBeTruthy();
	});

	it("surfaces setup guidance when the project root is not configured", () => {
		render(
			<MemoryRouter>
				<ProjectDetailHeader
					project={{
						...project,
						watchdog_root_path: null,
					}}
					tasks={[]}
					telemetry={{
						...telemetry,
						rule: null,
						ruleConfigured: false,
						sessions: [],
						liveSessions: [],
						activeCadSessionCount: 0,
						latestSession: null,
						latestAutoCadEvent: null,
					}}
					onToggleArchive={vi.fn()}
					onExportMarkdown={vi.fn()}
				/>
			</MemoryRouter>,
		);

		expect(
			screen.getByText(/configure the project root before package work can begin/i),
		).toBeTruthy();
		expect(
			screen.getByText(
				/no project root is configured yet\. set it in setup so watchdog can map activity to this project/i,
			),
		).toBeTruthy();
		expect(screen.getByText(/setup needed/i)).toBeTruthy();
	});
});


