import { expect, test } from "@playwright/test";

test.describe("public-route smoke", () => {
	test("landing renders primary navigation actions", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator('a[href="/login"]').first()).toBeVisible();
		await expect(page.locator('a[href="/signup"]').first()).toBeVisible();
		await expect(page.getByText("Projects, planning, and execution in")).toBeVisible();
	});

	test("login and signup pages load", async ({ page }) => {
		await page.goto("/login");
		await expect(page).toHaveURL(/\/login$/);
		await expect(page.getByText("Welcome back")).toBeVisible();
		await expect(page.getByRole("button", { name: "Send sign-in link" })).toBeVisible();

		await page.goto("/signup");
		await expect(page).toHaveURL(/\/signup$/);
		await expect(page.getByText("Get started")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Send get-started link" }),
		).toBeVisible();
	});
});
