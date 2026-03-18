import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { WatchdogSessionSummary } from "@/services/watchdogService";
import { ProjectTelemetryPanel } from "./ProjectTelemetryPanel";
import type { ProjectWatchdogTelemetry } from "./useProjectWatchdogTelemetry";

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

const telemetry = {
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
} satisfies ProjectWatchdogTelemetry;

describe("ProjectTelemetryPanel", () => {
	it("renders recent session summaries and a dashboard link", () => {
		render(
			<MemoryRouter>
				<ProjectTelemetryPanel projectId="project-1" telemetry={telemetry} />
			</MemoryRouter>,
		);

		expect(screen.getByText("Recent CAD sessions")).toBeTruthy();
		expect(screen.getByText("Drawing1.dwg")).toBeTruthy();
		expect(screen.getByText("Commands in range")).toBeTruthy();
		const link = screen.getByRole("link", {
			name: /open full telemetry/i,
		}) as HTMLAnchorElement;
		expect(link.getAttribute("href")).toBe(
			"/app/dashboard?focus=watchdog&project=project-1",
		);
	});
});
