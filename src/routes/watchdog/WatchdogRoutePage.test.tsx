import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	WatchdogCollector,
	WatchdogCollectorEvent,
	WatchdogSessionSummary,
} from "@/services/watchdogService";
import WatchdogRoutePage from "./WatchdogRoutePage";

const mockGetUser = vi.hoisted(() => vi.fn());
const mockProjectOrder = vi.hoisted(() => vi.fn());
const mockGetOverview = vi.hoisted(() => vi.fn());
const mockListEvents = vi.hoisted(() => vi.fn());
const mockListSessions = vi.hoisted(() => vi.fn());
const mockListCollectors = vi.hoisted(() => vi.fn());

vi.mock("@/supabase/client", () => ({
	supabase: {
		auth: {
			getUser: mockGetUser,
		},
		from: () => ({
			select: () => ({
				eq: () => ({
					order: mockProjectOrder,
				}),
			}),
		}),
	},
}));

vi.mock("@/services/watchdogService", () => ({
	watchdogService: {
		getOverview: mockGetOverview,
		listEvents: mockListEvents,
		listSessions: mockListSessions,
		listCollectors: mockListCollectors,
	},
}));

function createCollector(
	overrides: Partial<WatchdogCollector> = {},
): WatchdogCollector {
	return {
		collectorId: "collector-cad",
		name: "AutoCAD Collector",
		collectorType: "autocad_state",
		workstationId: "DUSTIN-HOME",
		capabilities: ["autocad", "drawing_sessions", "commands"],
		metadata: {
			sourceAvailable: true,
			activeDrawingPath:
				"C:/Projects/Nanulak/R3P-25074-E0-0006 - BESS DRAWING INDEX.dwg",
			activeDrawingName: "R3P-25074-E0-0006 - BESS DRAWING INDEX.dwg",
			currentSessionId: "session-1",
			trackerUpdatedAt: Date.now(),
			pendingCount: 0,
		},
		status: "online",
		createdAt: 1,
		updatedAt: 1,
		lastHeartbeatAt: Date.now(),
		lastEventAt: Date.now(),
		eventCount: 3,
		lastSequence: 3,
		...overrides,
	};
}

function createEvent(
	overrides: Partial<WatchdogCollectorEvent> = {},
): WatchdogCollectorEvent {
	return {
		eventId: 1,
		collectorId: "collector-cad",
		collectorType: "autocad_state",
		workstationId: "DUSTIN-HOME",
		eventType: "drawing_opened",
		sourceType: "autocad",
		timestamp: Date.now(),
		projectId: "project-1",
		sessionId: "session-1",
		drawingPath:
			"C:/Projects/Nanulak/R3P-25074-E0-0006 - BESS DRAWING INDEX.dwg",
		path: null,
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
		workstationId: "DUSTIN-HOME",
		projectId: "project-1",
		drawingPath:
			"C:/Projects/Nanulak/R3P-25074-E0-0006 - BESS DRAWING INDEX.dwg",
		status: "live",
		active: true,
		startedAt: Date.now() - 15 * 60 * 1000,
		endedAt: null,
		latestEventAt: Date.now(),
		lastActivityAt: Date.now(),
		lastEventType: "command_executed",
		eventCount: 3,
		commandCount: 1,
		idleCount: 0,
		activationCount: 1,
		durationMs: 15 * 60 * 1000,
		sourceAvailable: true,
		pendingCount: 0,
		trackerUpdatedAt: Date.now(),
		...overrides,
	};
}

describe("WatchdogRoutePage", () => {
	beforeEach(() => {
		mockGetUser.mockResolvedValue({
			data: {
				user: {
					id: "user-1",
				},
			},
			error: null,
		});
		mockProjectOrder.mockResolvedValue({
			data: [{ id: "project-1", name: "Nanulak" }],
			error: null,
		});
		mockGetOverview.mockResolvedValue({
			ok: true,
			generatedAt: Date.now(),
			timeWindowMs: 4 * 60 * 60 * 1000,
			projectId: "project-1",
			collectors: {
				total: 1,
				online: 1,
				offline: 0,
			},
			events: {
				retained: 3,
				inWindow: 3,
				latestEventAt: Date.now(),
				byType: {
					drawing_opened: 1,
					command_executed: 2,
				},
				bySourceType: {
					autocad: 3,
				},
				latest: [],
			},
			projects: {
				top: [{ projectId: "project-1", eventCount: 3 }],
			},
			trendBuckets: [{ bucketStartMs: Date.now(), eventCount: 3 }],
		});
		mockListEvents.mockResolvedValue({
			ok: true,
			events: [
				createEvent(),
				createEvent({
					eventId: 2,
					eventType: "command_executed",
					metadata: { commandName: "COMMANDMACROSCLOSE" },
				}),
				createEvent({
					eventId: 3,
					eventType: "command_executed",
					metadata: { commandName: "QSAVE" },
				}),
				createEvent({
					eventId: 4,
					drawingPath: "C:/Projects/Nanulak/Drawing-02.dwg",
					eventType: "drawing_opened",
					sessionId: "session-2",
					metadata: {},
				}),
				createEvent({
					eventId: 5,
					drawingPath: "C:/Projects/Nanulak/Drawing-02.dwg",
					eventType: "command_executed",
					sessionId: "session-2",
					metadata: { commandName: "QSAVE" },
				}),
			],
			count: 5,
			afterEventId: 0,
			lastEventId: 5,
			nextEventId: 6,
		});
		mockListSessions.mockResolvedValue({
			ok: true,
			generatedAt: Date.now(),
			timeWindowMs: 4 * 60 * 60 * 1000,
			projectId: "project-1",
			collectorId: "collector-cad",
			count: 2,
			sessions: [
				createSession(),
				createSession({
					sessionId: "session-2",
					drawingPath: "C:/Projects/Nanulak/Drawing-02.dwg",
					status: "completed",
					active: false,
				}),
			],
		});
		mockListCollectors.mockResolvedValue({
			ok: true,
			count: 1,
			collectors: [createCollector()],
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("loads scoped watchdog data and renders the cleaned operator feed", async () => {
		render(
			<MemoryRouter
				initialEntries={[
					"/app/watchdog?project=project-1&collector=collector-cad&window=4",
				]}
			>
				<Routes>
					<Route path="/app/watchdog" element={<WatchdogRoutePage />} />
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(mockGetOverview).toHaveBeenCalledWith({
				projectId: "project-1",
				timeWindowMs: 4 * 60 * 60 * 1000,
			});
		});
		await waitFor(() => {
			expect(mockListEvents).toHaveBeenCalledWith(
				expect.objectContaining({
					projectId: "project-1",
					collectorId: "collector-cad",
					limit: 18,
				}),
			);
		});
		await waitFor(() => {
			expect(mockListSessions).toHaveBeenCalledWith({
				projectId: "project-1",
				collectorId: "collector-cad",
				limit: 14,
				timeWindowMs: 4 * 60 * 60 * 1000,
			});
		});

		expect(await screen.findByText("Live CAD sessions")).toBeTruthy();
		expect(screen.getByText("Project daybook")).toBeTruthy();
		expect(screen.getByText("Operator feed")).toBeTruthy();
		expect(screen.getAllByText("Saved drawing").length).toBeGreaterThanOrEqual(
			1,
		);
		expect(screen.getAllByText("Opened drawing").length).toBeGreaterThanOrEqual(
			1,
		);
		expect(
			screen.getAllByRole("button", { name: /open project/i }).length,
		).toBeGreaterThanOrEqual(1);
		expect(screen.getByDisplayValue("Nanulak")).toBeTruthy();
	});

	it("scopes the operator surfaces to the selected drawing", async () => {
		render(
			<MemoryRouter
				initialEntries={[
					"/app/watchdog?project=project-1&collector=collector-cad&window=4&drawing=c:/projects/nanulak/drawing-02.dwg",
				]}
			>
				<Routes>
					<Route path="/app/watchdog" element={<WatchdogRoutePage />} />
				</Routes>
			</MemoryRouter>,
		);

		expect(await screen.findByText("Drawing focus")).toBeTruthy();
		expect(
			screen.getByText("Cleaned actions for Drawing-02.dwg."),
		).toBeTruthy();
		expect(
			screen.getByText("Raw collector detail scoped to Drawing-02.dwg."),
		).toBeTruthy();
		expect(
			screen.getAllByRole("button", { name: /clear drawing focus/i }).length,
		).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("Drawing-02.dwg").length).toBeGreaterThanOrEqual(
			2,
		);
	});
});
