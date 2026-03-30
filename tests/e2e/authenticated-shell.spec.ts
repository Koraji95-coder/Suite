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

test.describe("authenticated shell routes", () => {
	test.describe.configure({ mode: "default" });
	test.skip(!hasStorageState, "Run `npm run auth:playwright:bootstrap` first.");

	const customerRoutes = [
		{ path: "/app/calendar", title: "Calendar" },
		{ path: "/app/dashboard", title: "Dashboard" },
		{ path: "/app/apps/drawing-list-manager", title: "Drawing List Manager" },
		{ path: "/app/knowledge", title: "Knowledge" },
		{ path: "/app/projects", title: "Projects" },
		{ path: "/app/settings", title: "Settings" },
		{ path: "/app/apps/standards-checker", title: "Standards Checker" },
		{ path: "/app/apps/transmittal-builder", title: "Transmittal Builder" },
		{ path: "/app/watchdog", title: "Watchdog" },
	] as const;

	const devRoutes = [
		"/app/agent",
		"/app/developer/automation-studio",
		"/app/apps/autowire",
		"/app/changelog",
		"/app/command-center",
		"/app/operations",
		"/app/developer",
	] as const;

	for (const route of customerRoutes) {
		test(`${route.path} renders shell-owned page identity`, async ({
			page,
		}) => {
			await page.goto(route.path, { waitUntil: "domcontentloaded" });

			await expect(
				page.getByRole("heading", { level: 1, name: route.title }),
			).toBeVisible({ timeout: 15_000 });
			await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
			await expect(
				page.getByText("Suite workspace", { exact: true }).first(),
			).toBeVisible();
			await expect(
				page.getByText("Area", { exact: true }).first(),
			).toBeVisible();
			await expect(
				page.getByRole("button", { name: /Diagnostics/i }),
			).toBeVisible();
			expect(
				await page.locator("[data-page-context-band]").count(),
			).toBeLessThanOrEqual(1);
			await expect(page.getByText("Loading...", { exact: true })).toHaveCount(
				0,
			);
			await expect(
				page.getByText("One moment while we assemble the workspace view.", {
					exact: true,
				}),
			).toHaveCount(0);
			await expect(
				page.getByRole("heading", { name: "Thanks for signing up!" }),
			).toHaveCount(0);
			await expect(page.getByPlaceholder("Enter your name")).toHaveCount(0);
		});
	}

	for (const route of devRoutes) {
		test(`${route} redirects customer audience away from developer pages`, async ({
			page,
		}) => {
			await page.goto(route, { waitUntil: "domcontentloaded" });
			await page.waitForURL("**/app/dashboard");

			await expect(
				page.getByRole("heading", { level: 1, name: "Dashboard" }),
			).toBeVisible({ timeout: 15_000 });
			await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
		});
	}
});
