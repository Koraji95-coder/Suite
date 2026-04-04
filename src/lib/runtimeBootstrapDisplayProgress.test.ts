import { beforeAll, describe, expect, test } from "vitest";

type BootstrapDisplayApi = {
	computeBootstrapDisplayProgress: (
		previousState: Record<string, unknown> | null,
		bootstrap: Record<string, unknown> | null,
		nowMs?: number,
	) => {
		percent: number;
		percentExact: number;
		floorPercent: number;
		ceilingPercent: number;
		pulse: boolean;
		currentStepId: string | null;
		timestampMs: number;
	};
};

declare global {
	// eslint-disable-next-line no-var
	var SuiteRuntimeControlBootstrapDisplayProgress: BootstrapDisplayApi | undefined;
}

let api: BootstrapDisplayApi;

beforeAll(async () => {
	// @ts-ignore - JS runtime asset is loaded for side effects in tests.
	await import("../../dotnet/Suite.RuntimeControl/Assets/bootstrapDisplayProgress.js");
	api = globalThis.SuiteRuntimeControlBootstrapDisplayProgress as BootstrapDisplayApi;
});

describe("runtime bootstrap display progress", () => {
	test("animates forward within the active milestone band", () => {
		const bootstrap = {
			showCard: true,
			running: true,
			done: false,
			ok: false,
			currentStepId: "watchdog-filesystem",
			completedStepIds: ["docker-ready", "supabase-start", "supabase-env"],
			failedStepIds: [],
			percent: 45,
		};

		const first = api.computeBootstrapDisplayProgress(null, bootstrap, 1_000);
		const second = api.computeBootstrapDisplayProgress(first, bootstrap, 1_750);

		expect(first.floorPercent).toBe(45);
		expect(first.ceilingPercent).toBe(54);
		expect(first.percent).toBeGreaterThanOrEqual(45);
		expect(first.percent).toBeLessThanOrEqual(54);
		expect(second.percent).toBeGreaterThanOrEqual(first.percent);
		expect(second.percent).toBeLessThanOrEqual(54);
	});

	test("does not regress during a retry of the same active step", () => {
		const bootstrap = {
			showCard: true,
			running: true,
			done: false,
			ok: false,
			currentStepId: "watchdog-filesystem",
			completedStepIds: ["docker-ready", "supabase-start", "supabase-env"],
			failedStepIds: [],
			percent: 45,
		};

		const seeded = {
			percent: 53,
			percentExact: 53.4,
			floorPercent: 45,
			ceilingPercent: 54,
			pulse: false,
			currentStepId: "watchdog-filesystem",
			timestampMs: 2_000,
		};

		const retried = api.computeBootstrapDisplayProgress(seeded, bootstrap, 2_600);
		expect(retried.percent).toBeGreaterThanOrEqual(53);
		expect(retried.percent).toBeLessThanOrEqual(54);
	});

	test("snaps forward when a milestone completes and the next step starts", () => {
		const previous = {
			percent: 53,
			percentExact: 53.7,
			floorPercent: 45,
			ceilingPercent: 54,
			pulse: false,
			currentStepId: "watchdog-filesystem",
			timestampMs: 3_000,
		};

		const bootstrap = {
			showCard: true,
			running: true,
			done: false,
			ok: false,
			currentStepId: "watchdog-autocad-startup",
			completedStepIds: [
				"docker-ready",
				"supabase-start",
				"supabase-env",
				"watchdog-filesystem",
			],
			failedStepIds: [],
			percent: 55,
		};

		const next = api.computeBootstrapDisplayProgress(previous, bootstrap, 3_300);
		expect(next.floorPercent).toBe(55);
		expect(next.percent).toBeGreaterThanOrEqual(55);
		expect(next.currentStepId).toBe("watchdog-autocad-startup");
	});

	test("reaches 100 only when every core milestone is complete", () => {
		const notDone = api.computeBootstrapDisplayProgress(
			null,
			{
				showCard: true,
				running: false,
				done: true,
				ok: true,
				currentStepId: null,
				completedStepIds: [
					"docker-ready",
					"supabase-start",
					"supabase-env",
					"watchdog-filesystem",
					"watchdog-autocad-startup",
					"watchdog-autocad-plugin",
					"backend",
				],
				failedStepIds: [],
				percent: 99,
			},
			4_000,
		);

		const complete = api.computeBootstrapDisplayProgress(
			null,
			{
				showCard: true,
				running: false,
				done: true,
				ok: true,
				currentStepId: null,
				completedStepIds: [
					"docker-ready",
					"supabase-start",
					"supabase-env",
					"watchdog-filesystem",
					"watchdog-autocad-startup",
					"watchdog-autocad-plugin",
					"backend",
					"frontend",
				],
				failedStepIds: [],
				percent: 100,
			},
			4_500,
		);

		expect(notDone.percent).toBeLessThan(100);
		expect(complete.percent).toBe(100);
	});

	test("freezes below the next milestone ceiling on failure", () => {
		const previous = {
			percent: 52,
			percentExact: 52.8,
			floorPercent: 45,
			ceilingPercent: 54,
			pulse: false,
			currentStepId: "watchdog-filesystem",
			timestampMs: 5_000,
		};

		const failed = api.computeBootstrapDisplayProgress(
			previous,
			{
				showCard: true,
				running: false,
				done: true,
				ok: false,
				currentStepId: "watchdog-filesystem",
				completedStepIds: ["docker-ready", "supabase-start", "supabase-env"],
				failedStepIds: ["watchdog-filesystem"],
				percent: 45,
			},
			5_500,
		);

		expect(failed.percent).toBeGreaterThanOrEqual(52);
		expect(failed.percent).toBeLessThan(55);
	});
});
