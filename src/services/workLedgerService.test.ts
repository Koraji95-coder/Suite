import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildWorktalePublishPayload,
	workLedgerService,
} from "./workLedgerService";

const mockGetUser = vi.hoisted(() => vi.fn());
const mockGetSession = vi.hoisted(() => vi.fn());
const mockRemoveChannel = vi.hoisted(() => vi.fn());
const mockChannelSubscribe = vi.hoisted(() => vi.fn());
const mockChannelOn = vi.hoisted(() => vi.fn());
const mockSafeSupabaseQuery = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("@/supabase/client", () => ({
	supabase: {
		auth: {
			getUser: mockGetUser,
			getSession: mockGetSession,
		},
		channel: vi.fn(() => ({
			on: mockChannelOn.mockReturnThis(),
			subscribe: mockChannelSubscribe,
		})),
		removeChannel: mockRemoveChannel,
	},
}));

vi.mock("@/supabase/utils", () => ({
	isSupabaseConfigured: () => false,
	safeSupabaseQuery: mockSafeSupabaseQuery,
}));

describe("workLedgerService", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.stubGlobal("fetch", mockFetch);
		mockGetUser.mockResolvedValue({
			data: { user: null },
			error: new Error("missing-user"),
		});
		mockGetSession.mockResolvedValue({
			data: { session: null },
			error: null,
		});
		mockSafeSupabaseQuery.mockReset();
		mockFetch.mockReset();
	});

	afterEach(() => {
		localStorage.clear();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("creates, filters, and updates local work ledger entries when no Supabase user is available", async () => {
		const created = await workLedgerService.createEntry({
			title: "Ground grid controller split",
			summary: "Moved placement and history logic behind focused controllers.",
			sourceKind: "git_checkpoint",
			commitRefs: ["abc123"],
			projectId: "project-1",
			appArea: "ground-grid-generator",
			architecturePaths: ["src/components/apps/ground-grid-generator/useGridGeneratorState.ts"],
			hotspotIds: ["ground-grid-generator/useGridGeneratorState.ts"],
			lifecycleState: "planned",
			publishState: "draft",
		});

		expect(created).not.toBeNull();
		expect(created?.lifecycle_state).toBe("planned");
		expect(created?.publish_state).toBe("draft");

		const filtered = await workLedgerService.fetchEntries({
			projectId: "project-1",
			pathQuery: "ground-grid-generator",
			lifecycleState: "planned",
			publishState: "draft",
			search: "placement",
			limit: 10,
		});

		expect(filtered.error).toBeNull();
		expect(filtered.data).toHaveLength(1);
		expect(filtered.data[0]?.title).toBe("Ground grid controller split");

		const updated = await workLedgerService.updateEntry(created?.id ?? "", {
			publishState: "ready",
			externalReference: "worktale draft",
		});

		expect(updated).not.toBeNull();
		expect(updated?.publish_state).toBe("ready");
		expect(updated?.external_reference).toBe("worktale draft");

		const readyEntries = await workLedgerService.fetchEntries({
			publishState: "ready",
			limit: 10,
		});
		expect(readyEntries.data).toHaveLength(1);
		expect(readyEntries.data[0]?.publish_state).toBe("ready");
	});

	it("builds a Worktale-ready payload from a work ledger entry", () => {
		const payload = buildWorktalePublishPayload({
			id: "ledger-1",
			title: "Agent service split checkpoint",
			summary: "Separated orchestration, pairing, and catalog flows behind the stable facade.",
			source_kind: "git_checkpoint",
			commit_refs: ["efc4560", "abc1234"],
			project_id: "project-1",
			app_area: "agent",
			architecture_paths: ["src/services/agentService.ts"],
			hotspot_ids: ["agentService"],
			lifecycle_state: "active",
			publish_state: "ready",
			published_at: null,
			external_reference: "worktale draft",
			external_url: null,
			user_id: "local",
			created_at: "2026-03-18T00:00:00.000Z",
			updated_at: "2026-03-18T01:00:00.000Z",
		});

		expect(payload.title).toBe("Agent service split checkpoint");
		expect(payload.markdown).toContain("# Agent service split checkpoint");
		expect(payload.markdown).toContain("- Source: git_checkpoint");
		expect(payload.markdown).toContain("- Paths: src/services/agentService.ts");
		expect(payload.json).toMatchObject({
			id: "ledger-1",
			sourceKind: "git_checkpoint",
			lifecycleState: "active",
			publishState: "ready",
			appArea: "agent",
		});
	});

	it("loads readiness and triggers publish APIs for authenticated users", async () => {
		mockGetUser.mockResolvedValue({
			data: { user: { id: "user-1" } },
			error: null,
		});
		mockGetSession.mockResolvedValue({
			data: { session: { access_token: "token-1" } },
			error: null,
		});

		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					ok: true,
					publisher: "worktale",
					workstationId: "DUSTIN-HOME",
					ready: true,
					checks: {
						cliInstalled: true,
						cliPath: "C:\\tools\\worktale.exe",
						repoPath: "C:\\repo",
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
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					ok: true,
					entry: {
						id: "ledger-1",
						title: "Ledger entry",
						summary: "Summary",
						source_kind: "manual",
						commit_refs: [],
						project_id: null,
						app_area: null,
						architecture_paths: [],
						hotspot_ids: [],
						lifecycle_state: "completed",
						publish_state: "published",
						published_at: "2026-03-18T03:00:00.000Z",
						external_reference: "worktale:note:job-1",
						external_url: null,
						user_id: "user-1",
						created_at: "2026-03-18T02:00:00.000Z",
						updated_at: "2026-03-18T03:00:00.000Z",
					},
					job: {
						id: "job-1",
						entry_id: "ledger-1",
						user_id: "user-1",
						publisher: "worktale",
						mode: "note",
						status: "succeeded",
						workstation_id: "DUSTIN-HOME",
						repo_path: "C:\\repo",
						artifact_dir: "C:\\artifacts\\job-1",
						stdout_excerpt: "",
						stderr_excerpt: "",
						error_text: null,
						external_reference: "worktale:note:job-1",
						external_url: null,
						published_at: "2026-03-18T03:00:00.000Z",
						created_at: "2026-03-18T03:00:00.000Z",
						updated_at: "2026-03-18T03:00:00.000Z",
					},
					artifacts: {
						artifactDir: "C:\\artifacts\\job-1",
						markdownPath: "C:\\artifacts\\job-1\\entry.md",
						jsonPath: "C:\\artifacts\\job-1\\entry.json",
					},
					publisher: "worktale",
					workstationId: "DUSTIN-HOME",
					ready: true,
					checks: {
						cliInstalled: true,
						cliPath: "C:\\tools\\worktale.exe",
						repoPath: "C:\\repo",
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
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					ok: true,
					jobs: [
						{
							id: "job-1",
							entry_id: "ledger-1",
							user_id: "user-1",
							publisher: "worktale",
							mode: "note",
							status: "succeeded",
							workstation_id: "DUSTIN-HOME",
							repo_path: "C:\\repo",
							artifact_dir: "C:\\artifacts\\job-1",
							stdout_excerpt: "",
							stderr_excerpt: "",
							error_text: null,
							external_reference: "worktale:note:job-1",
							external_url: null,
							published_at: "2026-03-18T03:00:00.000Z",
							created_at: "2026-03-18T03:00:00.000Z",
							updated_at: "2026-03-18T03:00:00.000Z",
						},
					],
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					ok: true,
					entryId: "ledger-1",
					jobId: "job-1",
					artifactDir: "C:\\artifacts\\job-1",
				}),
			});

		const readiness = await workLedgerService.fetchWorktaleReadiness();
		expect(readiness.error).toBeNull();
		expect(readiness.data?.ready).toBe(true);

		const publish = await workLedgerService.publishEntryToWorktale("ledger-1");
		expect(publish.error).toBeNull();
		expect(publish.data?.entry.publish_state).toBe("published");

		const jobs = await workLedgerService.listPublishJobs("ledger-1");
		expect(jobs.error).toBeNull();
		expect(jobs.data).toHaveLength(1);

		const openArtifact = await workLedgerService.openPublishJobArtifactFolder(
			"ledger-1",
			"job-1",
		);
		expect(openArtifact.error).toBeNull();
		expect(openArtifact.data?.artifactDir).toBe("C:\\artifacts\\job-1");
		expect(mockFetch).toHaveBeenCalledTimes(4);
	});

	it("loads draft suggestions from the backend route for authenticated users", async () => {
		mockGetUser.mockResolvedValue({
			data: { user: { id: "user-1" } },
			error: null,
		});
		mockGetSession.mockResolvedValue({
			data: { session: { access_token: "token-1" } },
			error: null,
		});
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				ok: true,
				count: 1,
				sources: {
					git: 1,
					agent: 0,
					watchdog: 0,
				},
				suggestions: [
					{
						suggestionId: "suggest-git-1",
						sourceKey: "git:abc123",
						sourceKind: "git_checkpoint",
						title: "Recent git checkpoint",
						summary: "Generated from git history.",
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
			}),
		});

		const result = await workLedgerService.fetchDraftSuggestions();
		expect(result.error).toBeNull();
		expect(result.sources).toEqual({
			git: 1,
			agent: 0,
			watchdog: 0,
		});
		expect(result.data).toHaveLength(1);
		expect(result.data[0]?.sourceKind).toBe("git_checkpoint");
	});

	it("auto-ingests missing draft suggestions into local work ledger storage", async () => {
		const existing = await workLedgerService.createEntry({
			title: "Existing draft",
			summary: "Already tracked.",
			sourceKind: "git_checkpoint",
			commitRefs: ["abc123"],
			projectId: null,
			appArea: "agent",
			architecturePaths: ["src/services/agentService.ts"],
			hotspotIds: ["agentService"],
			lifecycleState: "completed",
			publishState: "draft",
			externalReference: "suggestion:git:abc123",
		});

		expect(existing).not.toBeNull();

		const syncResult = await workLedgerService.syncDraftSuggestions(
			[existing!],
			[
				{
					suggestionId: "suggest-git-1",
					sourceKey: "git:abc123",
					sourceKind: "git_checkpoint",
					title: "Existing draft",
					summary: "Already tracked.",
					commitRefs: ["abc123"],
					projectId: null,
					appArea: "agent",
					architecturePaths: ["src/services/agentService.ts"],
					hotspotIds: ["agentService"],
					lifecycleState: "completed",
					publishState: "draft",
					externalReference: "suggestion:git:abc123",
					createdAt: "2026-03-18T00:00:00.000Z",
				},
				{
					suggestionId: "suggest-agent-1",
					sourceKey: "agent:run-1",
					sourceKind: "agent_run",
					title: "Auto-created draft",
					summary: "Generated from agent history.",
					commitRefs: [],
					projectId: null,
					appArea: "agent",
					architecturePaths: ["src/routes/agent/AgentRoutePage.tsx"],
					hotspotIds: ["AgentRoutePage"],
					lifecycleState: "active",
					publishState: "draft",
					externalReference: "suggestion:agent:run-1",
					createdAt: "2026-03-18T01:00:00.000Z",
				},
			],
		);

		expect(syncResult.skipped).toBe(1);
		expect(syncResult.created).toHaveLength(1);
		expect(syncResult.created[0]?.title).toBe("Auto-created draft");

		const entries = await workLedgerService.fetchEntries({ limit: 10 });
		expect(entries.data.some((entry) => entry.title === "Auto-created draft")).toBe(
			true,
		);
	});

	it("returns a friendly readiness error when publisher routes are unavailable", async () => {
		mockGetUser.mockResolvedValue({
			data: { user: { id: "user-1" } },
			error: null,
		});
		mockGetSession.mockResolvedValue({
			data: { session: { access_token: "token-1" } },
			error: null,
		});
		mockFetch.mockResolvedValue({
			ok: false,
			status: 404,
			json: async () => ({
				ok: false,
				error: "Not Found",
				code: "NOT_FOUND",
			}),
		});

		const readiness = await workLedgerService.fetchWorktaleReadiness();
		expect(readiness.data).toBeNull();
		expect(readiness.error?.message).toContain(
			"publisher routes are unavailable",
		);
	});
});
