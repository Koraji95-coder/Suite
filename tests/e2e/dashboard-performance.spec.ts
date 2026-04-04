import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const storageStatePath = path.resolve(
	process.cwd(),
	"output",
	"playwright",
	"auth-state.json",
);
const hasStorageState = fs.existsSync(storageStatePath);

test.use(hasStorageState ? { storageState: storageStatePath } : {});

test.describe("home performance snapshot", () => {
	test.skip(!hasStorageState, "Run `npm run auth:playwright:bootstrap` first.");

	test("captures home stage timings", async ({ page }, testInfo) => {
		await page.goto("/app/home", { waitUntil: "domcontentloaded" });

		await expect(
			page.getByRole("heading", { level: 1, name: "Home" }),
		).toBeVisible({ timeout: 20_000 });

		await page.waitForFunction(
			() => {
				const suiteWindow = window as Window & {
					__suiteDashboardPerf?: {
						latest?: Record<string, { status?: string }>;
					};
				};
				const latest = suiteWindow.__suiteDashboardPerf?.latest;
				return Boolean(latest?.["dashboard.overview.load"]?.status === "ok");
			},
			undefined,
			{ timeout: 45_000 },
		);

		const snapshot = await page.evaluate(() => {
			const suiteWindow = window as Window & {
				__suiteDashboardPerf?: {
					history?: unknown[];
					latest?: Record<string, unknown>;
				};
			};
			const navigation = performance.getEntriesByType("navigation")[0];
			const resources = performance
				.getEntriesByType("resource")
				.filter((entry) => {
					const name = entry.name || "";
					return (
						name.includes("/api/dashboard/load") ||
						name.includes("/api/watchdog/")
					);
				})
				.map((entry) => ({
					durationMs: Math.round(entry.duration),
					initiatorType: entry.initiatorType,
					name: entry.name,
					startTimeMs: Math.round(entry.startTime),
				}));

			return {
				capturedAt: new Date().toISOString(),
				dashboardPerf: suiteWindow.__suiteDashboardPerf?.latest ?? {},
				dashboardPerfHistory:
					suiteWindow.__suiteDashboardPerf?.history ?? [],
				navigation: navigation
					? {
							domContentLoadedMs: Math.round(
								navigation.domContentLoadedEventEnd,
							),
							loadEventMs: Math.round(navigation.loadEventEnd),
							responseEndMs: Math.round(navigation.responseEnd),
						}
					: null,
				resources,
				url: window.location.href,
			};
		});

		await testInfo.attach("dashboard-performance.json", {
			body: JSON.stringify(snapshot, null, 2),
			contentType: "application/json",
		});

		console.log(JSON.stringify(snapshot, null, 2));

		expect(snapshot.dashboardPerf["dashboard.overview.load"]).toBeTruthy();
		expect(snapshot.dashboardPerf["dashboard.overview.load"]?.status).toBe("ok");
	});
});
