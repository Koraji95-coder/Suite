import { describe, expect, it } from "vitest";
import type { SuiteRuntimeDoctorReport } from "@/lib/runtimeDoctor";
import {
	buildDeveloperWorkshopDesks,
	buildDeveloperWorkshopSignals,
} from "./developerWorkshopPresentation";
import type { DeveloperPortalOverviewSnapshot } from "./useDeveloperPortalOverviewData";

const BASE_OVERVIEW: DeveloperPortalOverviewSnapshot = {
	publishing: {
		readiness: {
			ok: true,
			publisher: "worktale",
			workstationId: "DEV",
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
			watchdog: 1,
		},
		latestEntry: {
			id: "entry-1",
			user_id: "user-1",
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
			published_at: null,
			external_reference: null,
			external_url: null,
			created_at: "2026-03-24T01:00:00.000Z",
			updated_at: "2026-03-24T01:05:00.000Z",
		},
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
};

const READY_DOCTOR_REPORT: SuiteRuntimeDoctorReport = {
	schemaVersion: "suite.doctor.v1",
	checkedAt: "2026-03-24T01:06:00.000Z",
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
};

describe("developerWorkshopPresentation", () => {
	it("builds workshop signals from overview and doctor data", () => {
		const signals = buildDeveloperWorkshopSignals({
			data: BASE_OVERVIEW,
			loading: false,
			suiteDoctorReport: READY_DOCTOR_REPORT,
			suiteDoctorLoading: false,
		});

		expect(signals.map((signal) => signal.label)).toEqual([
			"Publish queue",
			"Published notes",
			"Automation rules",
			"Actionable issues",
		]);
		expect(signals[3]).toMatchObject({
			value: "0",
		});
	});

	it("marks workshop desks with product-facing trust states", () => {
		const desks = buildDeveloperWorkshopDesks({
			data: BASE_OVERVIEW,
			loading: false,
		});

		expect(desks.find((desk) => desk.id === "publishing")?.state).toBe("ready");
		expect(desks.find((desk) => desk.id === "automation")?.state).toBe("ready");
	});
});
