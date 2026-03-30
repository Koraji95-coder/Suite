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
const mockFetchWorktaleReadiness = vi.hoisted(() => vi.fn());
const mockListPublishJobs = vi.hoisted(() => vi.fn());
const mockFetchDraftSuggestions = vi.hoisted(() => vi.fn());
const mockUseDashboardOverviewData = vi.hoisted(() => vi.fn());
const mockUseDashboardDeliverySummary = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
	user: {
		id: "user-1",
		email: "admin@example.com",
		app_metadata: {
			role: "admin",
		},
	},
}));

vi.mock("@/auth/useAuth", () => ({
	useAuth: () => ({
		user: authState.user,
	}),
}));

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
		fetchWorktaleReadiness: mockFetchWorktaleReadiness,
		listPublishJobs: mockListPublishJobs,
		fetchDraftSuggestions: mockFetchDraftSuggestions,
	},
}));

vi.mock("./useDashboardOverviewData", () => ({
	useDashboardOverviewData: mockUseDashboardOverviewData,
}));

vi.mock("./useDashboardDeliverySummary", () => ({
	useDashboardDeliverySummary: mockUseDashboardDeliverySummary,
	summarizeDashboardDeliveryProjects: vi.fn(
		(
			projects: Array<{
				reviewItemCount: number;
				state: string;
				issueSetStatus: string | null;
				transmittalNumber: string | null;
				transmittalPendingReviewCount: number;
				needsSetup: boolean;
				dueSoon: boolean;
				overdue: boolean;
				openTaskCount: number;
			}>,
		) =>
			projects.reduce(
				(acc, project) => {
					acc.totalProjects += 1;
					acc.reviewPressureCount += project.reviewItemCount;
					acc.openTaskCount += project.openTaskCount;
					if (project.reviewItemCount > 0) {
						acc.reviewProjectCount += 1;
					}
					if (project.issueSetStatus === "ready") {
						acc.readyCount += 1;
					}
					if (project.issueSetStatus === "issued") {
						acc.issuedCount += 1;
					}
					if (
						project.issueSetStatus === "draft" ||
						project.issueSetStatus === "review"
					) {
						acc.packagesInProgressCount += 1;
					}
					if (
						(project.transmittalNumber &&
							project.issueSetStatus !== "issued") ||
						project.transmittalPendingReviewCount > 0
					) {
						acc.transmittalQueueCount += 1;
					}
					if (project.needsSetup) {
						acc.setupAttentionCount += 1;
					}
					if (project.dueSoon) {
						acc.dueSoonCount += 1;
					}
					if (project.overdue) {
						acc.overdueCount += 1;
					}
					return acc;
				},
				{
					totalProjects: 0,
					reviewPressureCount: 0,
					reviewProjectCount: 0,
					readyCount: 0,
					issuedCount: 0,
					packagesInProgressCount: 0,
					transmittalQueueCount: 0,
					setupAttentionCount: 0,
					dueSoonCount: 0,
					overdueCount: 0,
					openTaskCount: 0,
				},
			),
	),
}));

describe("DashboardOverviewPanel", () => {
	const scrollIntoViewMock = vi.fn();
	const project = {
		id: "project-1",
		name: "Project Alpha",
		status: "active",
		priority: "high",
		category: "Coding",
		watchdog_root_path: "C:/Projects/Alpha",
	};

	beforeEach(() => {
		authState.user = {
			id: "user-1",
			email: "admin@example.com",
			app_metadata: {
				role: "admin",
			},
		};
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
		mockUseDashboardDeliverySummary.mockReturnValue({
			loading: false,
			error: null,
			projects: [
				{
					projectId: "project-1",
					name: "Project Alpha",
					deadline: "2026-03-25",
					nextDue: null,
					openTaskCount: 2,
					watchdogRootConfigured: true,
					needsSetup: false,
					issueSetId: "issue-1",
					issueSetName: "Alpha issue set",
					issueTag: "ISSUE-01",
					issueSetStatus: "ready",
					reviewItemCount: 0,
					selectedDrawingCount: 12,
					trackedDrawingCount: 8,
					unresolvedRevisionCount: 0,
					transmittalReceiptCount: 1,
					transmittalPendingReviewCount: 0,
					transmittalNumber: "TR-100",
					lastReceiptAt: "2026-03-18T03:00:00.000Z",
					state: "ready",
					stateLabel: "Ready for issue",
					summary: "ISSUE-01 is ready to move into issue.",
					detail: "Transmittal TR-100 is linked to the current package draft.",
					dueSoon: true,
					overdue: false,
				},
			],
			metrics: {
				totalProjects: 1,
				reviewPressureCount: 0,
				reviewProjectCount: 0,
				readyCount: 1,
				issuedCount: 0,
				packagesInProgressCount: 0,
				transmittalQueueCount: 1,
				setupAttentionCount: 0,
				dueSoonCount: 1,
				overdueCount: 0,
				openTaskCount: 2,
			},
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
					summary:
						"Split orchestration and catalog concerns behind stable facade calls.",
					source_kind: "git_checkpoint",
					commit_refs: ["efc4560"],
					project_id: "project-1",
					app_area: "agent",
					architecture_paths: ["src/services/agentService.ts"],
					hotspot_ids: [],
					lifecycle_state: "completed",
					publish_state: "ready",
					published_at: null,
					external_reference: "worktale:note:job-1",
					external_url: null,
					user_id: "user-1",
					created_at: "2026-03-18T00:00:00.000Z",
					updated_at: "2026-03-18T00:00:00.000Z",
				},
			],
			error: null,
		});
		mockFetchWorktaleReadiness.mockResolvedValue({
			data: {
				ok: true,
				publisher: "worktale",
				workstationId: "DUSTIN-HOME",
				ready: true,
				checks: {
					cliInstalled: true,
					cliPath: "C:/tools/worktale.exe",
					repoPath: "C:/repo",
					repoExists: true,
					gitRepository: true,
					gitEmailConfigured: true,
					gitEmail: "user@example.com",
					bootstrapped: true,
					postCommitHookInstalled: true,
					postPushHookInstalled: true,
				},
				issues: [],
				recommendedActions: [],
			},
			error: null,
		});
		mockListPublishJobs.mockResolvedValue({
			data: [
				{
					id: "job-1",
					entry_id: "ledger-1",
					user_id: "user-1",
					publisher: "worktale",
					mode: "note",
					status: "succeeded",
					workstation_id: "DUSTIN-HOME",
					repo_path: "C:/repo",
					artifact_dir: "C:/artifacts/job-1",
					stdout_excerpt: "ok",
					stderr_excerpt: "",
					error_text: null,
					external_reference: "worktale:note:job-1",
					external_url: null,
					published_at: "2026-03-18T03:00:00.000Z",
					created_at: "2026-03-18T03:00:00.000Z",
					updated_at: "2026-03-18T03:00:00.000Z",
				},
			],
			error: null,
		});
		mockFetchDraftSuggestions.mockResolvedValue({
			data: [
				{
					suggestionId: "suggest-git-1",
					sourceKey: "git:abc123",
					sourceKind: "git_checkpoint",
					title: "Recent git checkpoint",
					summary: "Pulled from recent git history.",
					commitRefs: ["abc123"],
					projectId: "project-1",
					appArea: "agent",
					architecturePaths: ["src/services/agentService.ts"],
					hotspotIds: ["src/services/agentService.ts"],
					lifecycleState: "completed",
					publishState: "draft",
					externalReference: "suggestion:git:abc123",
					createdAt: "2026-03-18T00:00:00.000Z",
				},
			],
			error: null,
			sources: {
				git: 1,
				agent: 0,
				watchdog: 0,
			},
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("loads focused watchdog telemetry into the delivery dashboard", async () => {
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
		expect(screen.getByText("Watchdog summary")).toBeTruthy();
		expect(screen.getByText("Delivery board")).toBeTruthy();
		expect(screen.getByText("Live CAD sessions")).toBeTruthy();
		expect(screen.getByText("Session timeline")).toBeTruthy();
		expect(screen.getByText("Seq 1")).toBeTruthy();
		expect(screen.getAllByText("Project rollup").length).toBeGreaterThan(0);
		expect(screen.queryByText("Work Ledger")).toBeNull();
		expect(screen.queryByText("Worktale ready")).toBeNull();
		expect(screen.queryByText("Open latest receipt")).toBeNull();
		expect(screen.getAllByText("Drawing1.dwg").length).toBeGreaterThan(0);
	});

	it("keeps developer-only ledger and publisher state out of the dashboard even for dev users", async () => {
		mockFetchWorktaleReadiness.mockResolvedValueOnce({
			data: null,
			error: new Error("Sign in to use Worktale publishing."),
		});

		render(
			<MemoryRouter initialEntries={["/app/dashboard?focus=ledger"]}>
				<Routes>
					<Route path="/app/dashboard" element={<DashboardOverviewPanel />} />
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Delivery board")).toBeTruthy();
		});
		expect(screen.queryByText("Work Ledger")).toBeNull();
		expect(screen.queryByText("Worktale unavailable")).toBeNull();
		expect(screen.queryByText("Architecture pressure")).toBeNull();
		expect(mockLoadMemories).not.toHaveBeenCalled();
		expect(mockFetchWorkLedgerEntries).not.toHaveBeenCalled();
		expect(mockFetchWorktaleReadiness).not.toHaveBeenCalled();
	});

	it("hides workshop-only architecture, work ledger, and memory surfaces for customer users", async () => {
		authState.user = {
			id: "user-2",
			email: "user@example.com",
			app_metadata: { role: "user" },
		};

		render(
			<MemoryRouter initialEntries={["/app/dashboard?focus=architecture"]}>
				<Routes>
					<Route path="/app/dashboard" element={<DashboardOverviewPanel />} />
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Watchdog summary")).toBeTruthy();
		});
		expect(screen.queryByText("Work Ledger")).toBeNull();
		expect(screen.queryByText("Architecture pressure")).toBeNull();
		expect(screen.queryByText("Agent memory")).toBeNull();
		expect(screen.getByText("Delivery board")).toBeTruthy();
		expect(screen.getAllByText("Packages ready").length).toBeGreaterThan(0);
		expect(
			screen.queryByRole("button", { name: "Architecture Map" }),
		).toBeNull();
		expect(screen.queryByText("Repo area")).toBeNull();
		expect(screen.queryByText("Agent")).toBeNull();
		expect(mockLoadMemories).not.toHaveBeenCalled();
		expect(mockFetchWorkLedgerEntries).not.toHaveBeenCalled();
		expect(mockFetchWorktaleReadiness).not.toHaveBeenCalled();
	});
});
