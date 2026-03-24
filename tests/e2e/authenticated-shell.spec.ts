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
	test.skip(!hasStorageState, "Run `npm run auth:playwright:bootstrap` first.");

	const routes = [
		{ path: "/app/agent", title: "Agents" },
		{ path: "/app/apps/autowire", title: "AutoWire" },
		{ path: "/app/calendar", title: "Calendar" },
		{ path: "/app/changelog", title: "Changelog" },
		{ path: "/app/command-center", title: "Command Center" },
		{ path: "/app/dashboard", title: "Dashboard" },
		{ path: "/app/knowledge", title: "Knowledge" },
		{ path: "/app/projects", title: "Projects" },
		{ path: "/app/settings", title: "Settings" },
		{ path: "/app/watchdog", title: "Watchdog" },
	] as const;

	for (const route of routes) {
		test(`${route.path} renders shell-owned page identity`, async ({
			page,
		}) => {
			await page.goto(route.path);

			await expect(
				page.getByRole("heading", { level: 1, name: route.title }),
			).toBeVisible();
			await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
			await expect(
				page.getByText("Operations shell", { exact: true }).first(),
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
});
