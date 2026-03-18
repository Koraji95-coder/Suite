import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { watchdogService, type WatchdogSessionSummary } from "@/services/watchdogService";
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
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("ProjectTelemetryPanel", () => {
	it("renders recent session summaries and a dashboard link", () => {
		render(
			<MemoryRouter>
				<ProjectTelemetryPanel
					projectId="project-1"
					telemetry={createTelemetry()}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByText("Recent CAD sessions")).toBeTruthy();
		expect(screen.getAllByText("Drawing1.dwg").length).toBeGreaterThan(0);
	expect(screen.getByText("Commands in window")).toBeTruthy();
		expect(screen.getByText("Project mapping rules")).toBeTruthy();
		expect(screen.getByText("C:/Projects/Alpha")).toBeTruthy();
		const link = screen.getByRole("link", {
			name: /open full telemetry/i,
		}) as HTMLAnchorElement;
		expect(link.getAttribute("href")).toBe(
			"/app/dashboard?focus=watchdog&project=project-1",
		);
	});

	it("saves edited rule values", async () => {
		const telemetry = createTelemetry();
		const putRuleSpy = vi.spyOn(watchdogService, "putProjectRule").mockResolvedValue({
			ok: true,
			rule: {
				projectId: "project-1",
				roots: ["C:/Projects/Alpha", "C:/Projects/Beta"],
				includeGlobs: ["**/*.dwg"],
				excludeGlobs: ["**/archive/**"],
				drawingPatterns: ["SHT-*.dwg"],
				metadata: {},
				updatedAt: Date.now(),
			},
		});

		render(
			<MemoryRouter>
				<ProjectTelemetryPanel projectId="project-1" telemetry={telemetry} />
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

		await waitFor(() => expect(putRuleSpy).toHaveBeenCalledTimes(1));
		expect(putRuleSpy).toHaveBeenCalledWith("project-1", {
			roots: ["C:/Projects/Alpha", "C:/Projects/Beta"],
			includeGlobs: ["**/*.dwg"],
			excludeGlobs: ["**/archive/**"],
			drawingPatterns: ["SHT-*.dwg"],
			metadata: {},
		});
		await waitFor(() =>
			expect(
				screen.queryByRole("button", { name: /save rules/i }),
			).toBeNull(),
		);
		expect(screen.getByText(/C:\/Projects\/Beta/)).toBeTruthy();
	});

	it("cancels rule edits without saving", () => {
		const telemetry = createTelemetry();
		const putRuleSpy = vi.spyOn(watchdogService, "putProjectRule");

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

		expect(putRuleSpy).not.toHaveBeenCalled();
		expect(screen.getByText("C:/Projects/Alpha")).toBeTruthy();
	});
});
