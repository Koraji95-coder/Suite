import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "@/auth/NotificationContext";
import type {
	WatchdogCollector,
	WatchdogCollectorEvent,
	WatchdogSessionSummary,
} from "@/services/watchdogService";
import WatchdogRoutePage from "./WatchdogRoutePage";

const authState = vi.hoisted(() => ({
	user: {
		id: "user-1",
		email: "customer@example.com",
		app_metadata: {},
	},
	allowCommandCenter: false,
}));
const mockGetUser = vi.hoisted(() => vi.fn());
const mockProjectOrder = vi.hoisted(() => vi.fn());
const mockGetOverview = vi.hoisted(() => vi.fn());
const mockListEvents = vi.hoisted(() => vi.fn());
const mockListSessions = vi.hoisted(() => vi.fn());
const mockListCollectors = vi.hoisted(() => vi.fn());
const mockFetchIssueSet = vi.hoisted(() => vi.fn());
const mockOpenRuntimeControlShell = vi.hoisted(() => vi.fn());

vi.mock("@/auth/useAuth", () => ({
	useAuth: () => ({
		user: authState.user,
	}),
}));

vi.mock("@/lib/devAccess", () => ({
	isCommandCenterAuthorized: () => authState.allowCommandCenter,
}));

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

vi.mock("@/features/project-workflow/issueSetService", () => ({
	projectIssueSetService: {
		fetchIssueSet: mockFetchIssueSet,
	},
}));

vi.mock("@/services/runtimeControlService", () => ({
	openRuntimeControlShell: mockOpenRuntimeControlShell,
}));

function createCollector(
	overrides: Partial<WatchdogCollector> = {},
): WatchdogCollector {
	return {
		collectorId: "collector-cad",
		name: "AutoCAD Collector",
		collectorType: "autocad_state",
		workstationId: "DEV-HOME",
		capabilities: ["autocad", "drawing_sessions", "commands"],
		metadata: {
			sourceAvailable: true,
			activeDrawingPath:
				"C:/Projects/MyProject/PROJ-00001-E0-0006 - BESS DRAWING INDEX.dwg",
			activeDrawingName: "PROJ-00001-E0-0006 - BESS DRAWING INDEX.dwg",
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
		workstationId: "DEV-HOME",
		eventType: "drawing_opened",
		sourceType: "autocad",
		timestamp: Date.now(),
		projectId: "project-1",
		sessionId: "session-1",
		drawingPath:
			"C:/Projects/MyProject/PROJ-00001-E0-0006 - BESS DRAWING INDEX.dwg",
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
		workstationId: "DEV-HOME",
		projectId: "project-1",
		drawingPath:
			"C:/Projects/MyProject/PROJ-00001-E0-0006 - BESS DRAWING INDEX.dwg",
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

function renderWatchdog(initialEntry: string) {
	return render(
		<NotificationProvider>
			<MemoryRouter initialEntries={[initialEntry]}>
				<Routes>
					<Route
						path="/app/developer/control/watchdog"
						element={<WatchdogRoutePage />}
					/>
				</Routes>
			</MemoryRouter>
		</NotificationProvider>,
	);
}

describe("WatchdogRoutePage", () => {
	beforeEach(() => {
		authState.user = {
			id: "user-1",
			email: "customer@example.com",
			app_metadata: {},
		};
		authState.allowCommandCenter = false;
		mockGetUser.mockResolvedValue({
			data: {
				user: {
					id: "user-1",
				},
			},
			error: null,
		});
		mockProjectOrder.mockResolvedValue({
			data: [{ id: "project-1", name: "MyProject" }],
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
					drawingPath: "C:/Projects/MyProject/Drawing-02.dwg",
					eventType: "drawing_opened",
					sessionId: "session-2",
					metadata: {},
				}),
				createEvent({
					eventId: 5,
					drawingPath: "C:/Projects/MyProject/Drawing-02.dwg",
					eventType: "command_executed",
					sessionId: "session-2",
					metadata: { commandName: "QSAVE" },
				}),
				createEvent({
					eventId: 6,
					collectorId: "collector-filesystem",
					collectorType: "filesystem",
					sourceType: "filesystem",
					eventType: "modified",
					projectId: null,
					sessionId: null,
					drawingPath: null,
					path: "C:/Suite/output/test-failed-1.png",
					metadata: {},
				}),
			],
			count: 6,
			afterEventId: 0,
			lastEventId: 6,
			nextEventId: 7,
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
					drawingPath: "C:/Projects/MyProject/Drawing-02.dwg",
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
		mockFetchIssueSet.mockResolvedValue({
			data: {
				id: "issue-set-1",
				projectId: "project-1",
				name: "MyProject IFC package",
				issueTag: "IFC-01",
				status: "review",
				targetDate: "2026-03-31",
				transmittalNumber: "XMTL-001",
				transmittalDocumentName: "IFC package",
				summary: "Ready for package review.",
				notes: null,
				selectedDrawingPaths: [
					"C:/Projects/MyProject/PROJ-00001-E0-0006 - BESS DRAWING INDEX.dwg",
				],
				snapshot: {
					drawingCount: 2,
					selectedDrawingCount: 1,
					reviewItemCount: 1,
					titleBlockReviewCount: 1,
					standardsReviewCount: 0,
					unresolvedRevisionCount: 0,
					setupBlockerCount: 0,
					trackedDrawingCount: 1,
					acceptedTitleBlockCount: 0,
					waivedStandardsCount: 0,
				},
				createdAt: "2026-03-23T00:00:00.000Z",
				updatedAt: "2026-03-23T00:00:00.000Z",
				issuedAt: null,
			},
			error: null,
		});
		mockOpenRuntimeControlShell.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("scopes customer reporting to the selected issue-set drawings", async () => {
		renderWatchdog(
			"/app/developer/control/watchdog?project=project-1&issueSet=issue-set-1",
		);

		await waitFor(() =>
			expect(screen.getAllByText(/Package IFC-01/i).length).toBeGreaterThan(0),
		);
		expect(
			screen.getAllByText(/PROJ-00001-E0-0006 - BESS DRAWING INDEX/i).length,
		).toBeGreaterThan(0);
		expect(screen.queryByText("Drawing-02.dwg")).toBeNull();
	});

	it("loads scoped watchdog data and renders the cleaned operator feed", async () => {
		renderWatchdog(
			"/app/developer/control/watchdog?project=project-1&collector=collector-cad&window=4",
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
					limit: 60,
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

		expect(
			(await screen.findAllByText("Live CAD sessions")).length,
		).toBeGreaterThanOrEqual(1);
		expect(
			screen.getAllByText("Project drawing list").length,
		).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("Recent activity").length).toBeGreaterThanOrEqual(
			1,
		);
		expect(screen.queryByText("Attention")).toBeNull();
		expect(screen.getAllByText("Coverage").length).toBeGreaterThanOrEqual(1);
		expect(screen.queryByText("Technical stream")).toBeNull();
		expect(screen.queryByText("Updated file")).toBeNull();
		expect(screen.getAllByText("Saved drawing").length).toBeGreaterThanOrEqual(
			1,
		);
		expect(screen.getAllByText("Opened drawing").length).toBeGreaterThanOrEqual(
			1,
		);
		expect(
			screen.getAllByRole("button", { name: /open project/i }).length,
		).toBeGreaterThanOrEqual(1);
		expect(screen.getByDisplayValue("MyProject")).toBeTruthy();
	});

	it("uses the same cleaned activity stream for dev users", async () => {
		authState.user = {
			id: "user-1",
			email: "dev@example.com",
			app_metadata: {
				role: "admin",
			},
		};
		authState.allowCommandCenter = true;

		renderWatchdog("/app/developer/control/watchdog");

		expect(await screen.findAllByText("Recent activity")).toBeTruthy();
		expect(screen.queryByText("Technical stream")).toBeNull();
		expect(screen.queryByText("Operator view")).toBeNull();
		expect(screen.queryByText("Filesystem â€¢ Modified")).toBeNull();
		expect(screen.getAllByText("Saved drawing").length).toBeGreaterThanOrEqual(1);
	});

	it("keeps the standard operator surfaces even when a stale drawing filter is present", async () => {
		renderWatchdog(
			"/app/developer/control/watchdog?project=project-1&collector=collector-cad&window=4&drawing=c:/projects/myproject/drawing-02.dwg",
		);

		expect(await screen.findAllByText("Recent activity")).toBeTruthy();
		expect(screen.queryByText("Focused drawing")).toBeNull();
		expect(
			screen.queryByRole("button", { name: /clear drawing focus/i }),
		).toBeNull();
		expect(screen.queryByText("Technical stream")).toBeNull();
		expect(screen.getAllByText("Drawing-02.dwg").length).toBeGreaterThanOrEqual(
			2,
		);
	});

	it("opens Runtime Control from the coverage alert", async () => {
		mockListCollectors.mockResolvedValue({
			ok: true,
			count: 1,
			collectors: [
				createCollector({
					metadata: {
						sourceAvailable: false,
						activeDrawingPath: null,
						activeDrawingName: null,
						currentSessionId: null,
						trackerUpdatedAt: Date.now(),
						pendingCount: 0,
					},
				}),
			],
		});
		mockListSessions.mockResolvedValue({
			ok: true,
			generatedAt: Date.now(),
			timeWindowMs: 4 * 60 * 60 * 1000,
			projectId: "project-1",
			collectorId: "collector-cad",
			count: 1,
			sessions: [
				createSession({
					projectId: null,
					active: false,
					status: "completed",
				}),
			],
		});
		mockListEvents.mockResolvedValue({
			ok: true,
			events: [
				createEvent({
					projectId: null,
					sessionId: null,
				}),
			],
			count: 1,
			afterEventId: 0,
			lastEventId: 1,
			nextEventId: 2,
		});

		renderWatchdog("/app/developer/control/watchdog");

		const button = await screen.findByRole("button", {
			name: "Open Runtime Control",
		});
		fireEvent.click(button);

		await waitFor(() => {
			expect(mockOpenRuntimeControlShell).toHaveBeenCalledTimes(1);
		});
	});
});

