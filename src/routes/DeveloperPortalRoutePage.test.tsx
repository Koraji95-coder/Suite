import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import DeveloperPortalRoutePage from "./DeveloperPortalRoutePage";

const routeState = vi.hoisted(() => ({
	isDev: false,
}));

vi.mock("@/auth/useAuth", () => ({
	useAuth: () => ({
		user: {
			id: "dev-1",
			email: "dev@example.com",
			app_metadata: {
				role: "admin",
			},
		},
	}),
}));

vi.mock("@/lib/audience", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/audience")>();
	return {
		...actual,
		canAccessAudience: (_user: unknown, audience: "customer" | "dev") =>
			audience === "customer" || routeState.isDev,
		isDevAudience: () => routeState.isDev,
	};
});

vi.mock("@/services/useAgentConnectionStatus", () => ({
	useAgentConnectionStatus: () => ({
		healthy: true,
		paired: true,
		loading: false,
		error: "",
		refreshNow: vi.fn(),
	}),
}));

vi.mock("@/hooks/useSuiteRuntimeDoctor", () => ({
	useSuiteRuntimeDoctor: () => ({
		report: {
			schemaVersion: "suite.doctor.v1",
			checkedAt: "2026-03-23T23:06:00.000Z",
			overallState: "ready",
			actionableIssueCount: 0,
			ok: true,
			checks: [],
			groupedChecks: [],
			severityCounts: {
				ready: 4,
				background: 0,
				"needs-attention": 0,
				unavailable: 0,
			},
			recommendations: [],
		},
		loading: false,
		refreshing: false,
		refreshNow: vi.fn(),
	}),
}));

vi.mock("./useDeveloperPortalOverviewData", () => ({
	useDeveloperPortalOverviewData: () => ({
		loading: false,
		refreshing: false,
		refreshNow: vi.fn(),
		data: {
			publishing: {
				readiness: {
					ok: true,
					publisher: "worktale",
					workstationId: "DUSTIN",
					ready: true,
					checks: {
						cliPath: "C:/tools/worktale.exe",
						cliInstalled: true,
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
				readinessError: null,
				draftCount: 2,
				readyCount: 1,
				publishedCount: 4,
				suggestionCount: 3,
				suggestionSources: {
					git: 1,
					agent: 1,
					watchdog: 1,
				},
				latestEntry: {
					id: "entry-1",
					user_id: "dev-1",
					title: "Checkpoint runtime cleanup",
					summary: "Updated startup flow",
					source_kind: "manual",
					commit_refs: [],
					project_id: null,
					app_area: "runtime",
					architecture_paths: [],
					hotspot_ids: [],
					lifecycle_state: "completed",
					publish_state: "ready",
					external_reference: null,
					external_url: null,
					created_at: "2026-03-23T23:00:00.000Z",
					updated_at: "2026-03-23T23:05:00.000Z",
				},
			},
			agents: {
				brokerEnabled: true,
				profileCount: 6,
				awaitingReviewCount: 2,
				activeTaskCount: 1,
				activityCount: 7,
				latestActivity: {
					activityId: "activity-1",
					source: "task",
					eventType: "task.awaiting_review",
					runId: "run-1",
					requestId: "req-1",
					message: "Draftsmith needs a review decision.",
					createdAt: "2026-03-23T23:04:00.000Z",
				},
				error: null,
			},
			automation: {
				health: {
					ok: true,
					mode: "local",
					dotnet: {
						configured: true,
						reachable: true,
						base_url: "http://127.0.0.1:5020",
						error: null,
					},
				},
				ruleCount: 14,
				error: null,
			},
		},
	}),
}));

describe("DeveloperPortalRoutePage", () => {
	it("renders the developer workshop for dev users", () => {
		routeState.isDev = true;

		render(
			<MemoryRouter>
				<DeveloperPortalRoutePage />
			</MemoryRouter>,
		);

		expect(screen.getByText("Developer workshop")).toBeTruthy();
		expect(screen.getByText("Workshop pulse")).toBeTruthy();
		expect(screen.getByText("Developer workbenches")).toBeTruthy();
		expect(screen.getByText("Publishing & Evidence")).toBeTruthy();
		expect(screen.getAllByText("Suite doctor").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Agent lab").length).toBeGreaterThan(0);
		expect(screen.getByText("Automation Studio")).toBeTruthy();
		expect(screen.getByText("AutoDraft Studio")).toBeTruthy();
		expect(screen.getByText("Command Center")).toBeTruthy();
	});

	it("labels staged future tools as developer beta or lab", () => {
		routeState.isDev = true;

		render(
			<MemoryRouter>
				<DeveloperPortalRoutePage />
			</MemoryRouter>,
		);

		expect(screen.getAllByText("Developer beta").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Future product").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Open Command Center").length).toBeGreaterThan(
			0,
		);
	});
});
