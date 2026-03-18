import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardOverviewPanel } from "./DashboardOverviewPanel";

const mockGetOverview = vi.hoisted(() => vi.fn());
const mockListEvents = vi.hoisted(() => vi.fn());
const mockListSessions = vi.hoisted(() => vi.fn());
const mockListCollectors = vi.hoisted(() => vi.fn());
const mockLoadMemories = vi.hoisted(() => vi.fn());
const mockFetchWorkLedgerEntries = vi.hoisted(() => vi.fn());
const mockUseDashboardOverviewData = vi.hoisted(() => vi.fn());

vi.mock("@/services/watchdogService", () => ({
	watchdogService: {
		getOverview: mockGetOverview,
		listEvents: mockListEvents,
		listSessions: mockListSessions,
		listCollectors: mockListCollectors,
	},
}));

vi.mock("@/lib/agent-memory/service", () => ({
	loadMemories: mockLoadMemories,
}));

vi.mock("@/services/workLedgerService", () => ({
	workLedgerService: {
		fetchEntries: mockFetchWorkLedgerEntries,
	},
}));

vi.mock("./useDashboardOverviewData", () => ({
	useDashboardOverviewData: mockUseDashboardOverviewData,
}));

describe("DashboardOverviewPanel", () => {
	const scrollIntoViewMock = vi.fn();
	const project = {
		id: "project-1",
		name: "Project Alpha",
		status: "active",
		priority: "high",
		category: "Coding",
	};

	beforeEach(() => {
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		Object.defineProperty(Element.prototype, "scrollIntoView", {
			configurable: true,
			value: scrollIntoViewMock,
		});

		mockUseDashboardOverviewData.mockReturnValue({
			projects: [project],
			activities: [],
			storageUsed: 2048,
			isLoading: false,
			loadMessage: "ready",
			loadProgress: 100,
			projectTaskCounts: new Map([
				[
					"project-1",
					{
						total: 3,
						completed: 1,
						nextDue: null,
						hasOverdue: false,
					},
				],
			]),
			allProjectsMap: new Map([["project-1", project]]),
		});

		mockGetOverview.mockResolvedValue({
			generatedAt: Date.now(),
			timeWindowMs: 4 * 60 * 60 * 1000,
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
				byType: { file_modified: 1, drawing_opened: 1 },
				bySourceType: { filesystem: 2 },
				latest: [],
			},
			projects: { top: [{ projectId: "project-1", eventCount: 2 }] },
			trendBuckets: [{ bucketStartMs: Date.now(), eventCount: 2 }],
		});
		mockListEvents.mockResolvedValue({
			events: [
				{
					eventId: 1,
					collectorId: "collector-a",
					collectorType: "filesystem",
					workstationId: "DUSTIN-HOME",
					eventType: "file_modified",
					sourceType: "filesystem",
					timestamp: Date.now(),
					projectId: "project-1",
					path: "C:/repo/a.txt",
					metadata: {},
				},
				{
					eventId: 2,
					collectorId: "collector-cad",
					collectorType: "autocad_state",
					workstationId: "DUSTIN-HOME",
					eventType: "drawing_opened",
					sourceType: "autocad",
					timestamp: Date.now(),
					projectId: "project-1",
					drawingPath: "C:/Projects/Alpha/Drawing1.dwg",
					metadata: {},
				},
			],
		});
		mockListSessions.mockResolvedValue({
			count: 1,
			generatedAt: Date.now(),
			timeWindowMs: 4 * 60 * 60 * 1000,
			projectId: "project-1",
			collectorId: "collector-cad",
			sessions: [
				{
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
				},
			],
		});
		mockListCollectors.mockResolvedValue({
			count: 2,
			collectors: [
				{
					collectorId: "collector-a",
					name: "Desktop Collector",
					collectorType: "filesystem",
					workstationId: "DUSTIN-HOME",
					capabilities: ["filesystem"],
					metadata: {},
					status: "online",
					createdAt: 1,
					updatedAt: 1,
					lastHeartbeatAt: Date.now(),
					lastEventAt: Date.now(),
					eventCount: 2,
					lastSequence: 2,
				},
				{
					collectorId: "collector-cad",
					name: "AutoCAD Collector",
					collectorType: "autocad_state",
					workstationId: "DUSTIN-HOME",
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
					eventCount: 5,
					lastSequence: 5,
				},
			],
		});
		mockLoadMemories.mockResolvedValue([
			{
				id: "memory-1",
				memory_type: "knowledge",
				content: "Project Alpha uses the collector-backed Watchdog flow.",
				connections: [],
				strength: 0.9,
				created_at: "2026-03-18T00:00:00.000Z",
				scope: "shared",
				project_id: "project-1",
				agent_profile_id: "koro",
			},
		]);
		mockFetchWorkLedgerEntries.mockResolvedValue({
			data: [
				{
					id: "ledger-1",
					title: "Refactor agent service facade",
					summary: "Split orchestration and catalog concerns behind stable facade calls.",
					source_kind: "git_checkpoint",
					commit_refs: ["efc4560"],
					project_id: "project-1",
					app_area: "agent",
					architecture_paths: ["src/services/agentService.ts"],
					hotspot_ids: [],
					publish_state: "ready",
					external_reference: null,
					external_url: null,
					user_id: "local",
					created_at: "2026-03-18T00:00:00.000Z",
					updated_at: "2026-03-18T00:00:00.000Z",
				},
			],
			error: null,
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("loads focused watchdog telemetry from the collector endpoints", async () => {
		render(
			<MemoryRouter
				initialEntries={[
					"/app/dashboard?focus=watchdog&project=project-1&collector=collector-cad&window=4",
				]}
			>
				<Routes>
					<Route path="/app/dashboard" element={<DashboardOverviewPanel />} />
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
			expect(mockListEvents).toHaveBeenCalled();
		});
		await waitFor(() => {
			expect(mockListSessions).toHaveBeenCalledWith({
				projectId: "project-1",
				collectorId: "collector-cad",
				limit: 8,
				timeWindowMs: 4 * 60 * 60 * 1000,
			});
		});
		await waitFor(() => {
			expect(scrollIntoViewMock).toHaveBeenCalled();
		});

		expect(mockListEvents.mock.calls[0]?.[0]).toMatchObject({
			projectId: "project-1",
			collectorId: "collector-cad",
			limit: 8,
		});
		expect(screen.getByText("Operations and Watchdog")).toBeTruthy();
		expect(screen.getByText("Live AutoCAD sessions")).toBeTruthy();
		expect(screen.getByText("Session timeline")).toBeTruthy();
		expect(screen.getByText("Seq 1")).toBeTruthy();
		expect(screen.getByText("Telemetry hotspots")).toBeTruthy();
		expect(screen.getByText("Work Ledger")).toBeTruthy();
		expect(screen.getByText("Refactor agent service facade")).toBeTruthy();
		expect(screen.getAllByText("Drawing1.dwg").length).toBeGreaterThan(0);
	});
});
