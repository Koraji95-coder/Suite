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

test.describe("agent workspace setup", () => {
	test.skip(!hasStorageState, "Run `npm run auth:playwright:bootstrap` first.");

	test("keeps direct routing explicit and seeds the composer from a quick prompt", async ({
		page,
	}) => {
		await page.addInitScript(() => {
			const keysToRemove: string[] = [];
			for (let index = 0; index < window.localStorage.length; index += 1) {
				const key = window.localStorage.key(index);
				if (
					key &&
					(key.startsWith("agent-conversations:") ||
						key === "agent-active-profile" ||
						key === "agent-channel-scope")
				) {
					keysToRemove.push(key);
				}
			}
			for (const key of keysToRemove) {
				window.localStorage.removeItem(key);
			}
		});

		await page.goto("/app/agent");

		await expect(
			page.getByRole("heading", { level: 1, name: "Agents" }),
		).toBeVisible();
		await expect(
			page.getByRole("combobox", { name: "Direct replies" }),
		).toHaveValue("koro");
		await expect(
			page.getByRole("button", { name: /research standards/i }),
		).toBeVisible();

		await page.getByRole("button", { name: /research standards/i }).click();

		await expect(page.locator('textarea[name="agent_message"]')).toHaveValue(
			"Research IEEE electrical standards, best practices, and compliance requirements relevant to this project. Summarize key requirements and flag any areas needing attention.",
		);
	});
});
