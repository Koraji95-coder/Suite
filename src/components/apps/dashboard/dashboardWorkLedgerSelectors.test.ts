import { describe, expect, it } from "vitest";
import { buildDashboardWorkLedgerViewModel } from "./dashboardWorkLedgerSelectors";

describe("buildDashboardWorkLedgerViewModel", () => {
	it("summarizes ready, published, hotspot-linked, and successful receipt data", () => {
		const viewModel = buildDashboardWorkLedgerViewModel({
			entries: [
				{
					id: "entry-ready",
					title: "Ready milestone",
					summary: "Ready summary",
					source_kind: "git_checkpoint",
					commit_refs: ["abc123"],
					project_id: "project-1",
					app_area: "agent",
					architecture_paths: ["src/services/agentService.ts"],
					hotspot_ids: [],
					publish_state: "ready",
					published_at: null,
					external_reference: null,
					external_url: null,
					user_id: "user-1",
					created_at: "2026-03-18T00:00:00.000Z",
					updated_at: "2026-03-18T01:00:00.000Z",
				},
				{
					id: "entry-published",
					title: "Published milestone",
					summary: "Published summary",
					source_kind: "project",
					commit_refs: ["def456"],
					project_id: "project-1",
					app_area: "dashboard",
					architecture_paths: [],
					hotspot_ids: ["architecture:agent-service"],
					publish_state: "published",
					published_at: "2026-03-18T03:00:00.000Z",
					external_reference: "worktale:note:job-1",
					external_url: null,
					user_id: "user-1",
					created_at: "2026-03-18T02:00:00.000Z",
					updated_at: "2026-03-18T03:00:00.000Z",
				},
			],
			jobsByEntry: {
				"entry-published": [
					{
						id: "job-1",
						entry_id: "entry-published",
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
			},
			readiness: {
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
				},
				issues: [],
				recommendedActions: [],
			},
			readinessError: null,
		});

		expect(viewModel.readyCount).toBe(1);
		expect(viewModel.publishedCount).toBe(1);
		expect(viewModel.blockerCount).toBe(0);
		expect(viewModel.hotspotLinkedCount).toBe(2);
		expect(viewModel.readinessLabel).toBe("Worktale ready");
		expect(viewModel.readinessTone).toBe("success");
		expect(viewModel.latestReadyEntry?.id).toBe("entry-ready");
		expect(viewModel.latestPublishedEntry?.id).toBe("entry-published");
		expect(viewModel.latestSuccessfulReceipt?.job.id).toBe("job-1");
		expect(viewModel.latestFailedReceipt).toBeNull();
	});

	it("surfaces the latest publish blocker over readiness", () => {
		const viewModel = buildDashboardWorkLedgerViewModel({
			entries: [
				{
					id: "entry-ready",
					title: "Ready milestone",
					summary: "Ready summary",
					source_kind: "git_checkpoint",
					commit_refs: [],
					project_id: null,
					app_area: "agent",
					architecture_paths: [],
					hotspot_ids: [],
					publish_state: "ready",
					published_at: null,
					external_reference: null,
					external_url: null,
					user_id: "user-1",
					created_at: "2026-03-18T00:00:00.000Z",
					updated_at: "2026-03-18T01:00:00.000Z",
				},
			],
			jobsByEntry: {
				"entry-ready": [
					{
						id: "job-failed",
						entry_id: "entry-ready",
						user_id: "user-1",
						publisher: "worktale",
						mode: "note",
						status: "failed",
						workstation_id: "DUSTIN-HOME",
						repo_path: "C:/repo",
						artifact_dir: "C:/artifacts/job-failed",
						stdout_excerpt: "",
						stderr_excerpt: "missing git email",
						error_text: "missing git email",
						external_reference: null,
						external_url: null,
						published_at: null,
						created_at: "2026-03-18T02:30:00.000Z",
						updated_at: "2026-03-18T02:30:00.000Z",
					},
				],
			},
			readiness: null,
			readinessError: "Sign in to use Worktale publishing.",
		});

		expect(viewModel.blockerCount).toBe(1);
		expect(viewModel.readinessLabel).toBe("Publish blockers");
		expect(viewModel.readinessTone).toBe("danger");
		expect(viewModel.readinessDetail).toContain("missing git email");
		expect(viewModel.latestFailedReceipt?.job.id).toBe("job-failed");
	});
});
