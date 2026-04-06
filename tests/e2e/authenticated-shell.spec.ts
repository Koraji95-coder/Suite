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
		{ path: "/app/home", title: "Home" },
		{ path: "/app/projects", title: "Projects" },
		{ path: "/app/draft", title: "Draft" },
		{ path: "/app/draft/drawing-list-manager", title: "Drawing List Manager" },
		{ path: "/app/draft/block-library", title: "Block Library" },
		{ path: "/app/review", title: "Review" },
		{ path: "/app/review/standards-checker", title: "Standards Checker" },
		{ path: "/app/projects/transmittal-builder", title: "Transmittal Builder" },
		{ path: "/app/settings", title: "Settings" },
	] as const;

	const devRoutes = [
		"/app/developer",
		"/app/developer/control/watchdog",
		"/app/developer/control/changelog",
		"/app/developer/control/command-center",
		"/app/developer/architecture/map",
		"/app/developer/labs/automation-studio",
		"/app/developer/labs/autowire",
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
				page.getByText("Suite board", { exact: true }).first(),
			).toBeVisible();
			await expect(
				page.getByText("Family", { exact: true }).first(),
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
			await page.waitForURL("**/app/home");

			await expect(
				page.getByRole("heading", { level: 1, name: "Home" }),
			).toBeVisible({ timeout: 15_000 });
			await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
		});
	}
});
