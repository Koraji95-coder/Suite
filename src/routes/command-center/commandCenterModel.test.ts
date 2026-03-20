import { describe, expect, it } from "vitest";
import {
	COMMAND_GROUPS,
	coerceActiveCommandCenterTab,
	parseCommandCenterHistory,
} from "./commandCenterModel";

describe("commandCenterModel", () => {
	it("normalizes unsupported tabs back to commands", () => {
		expect(coerceActiveCommandCenterTab("architecture")).toBe("architecture");
		expect(coerceActiveCommandCenterTab("commands")).toBe("commands");
		expect(coerceActiveCommandCenterTab(null)).toBe("commands");
	});

	it("normalizes and deduplicates persisted history", () => {
		const history = parseCommandCenterHistory([
			{
				id: "entry-1",
				timestamp: 5,
				category: "Watchdog",
				action: "watchdog_refreshed",
				title: "Watchdog refresh",
				detailsText: "ok",
			},
			{
				id: "entry-1",
				timestamp: 10,
				category: "Commands",
				action: "command_copied",
				title: "Duplicate id",
				detailsText: "ignored",
			},
			{
				id: "entry-2",
				timestamp: 12,
				category: "Commands",
				action: "",
				title: "",
				detailsText: "details",
			},
			{
				id: "entry-3",
				timestamp: 4,
				category: "Unknown",
				action: "ignored",
				title: "ignored",
				detailsText: "",
			},
		]);

		expect(history).toHaveLength(2);
		expect(history[0]).toMatchObject({
			id: "entry-2",
			category: "Commands",
			action: "action",
			title: "Command Center",
		});
		expect(history[1]).toMatchObject({
			id: "entry-1",
			category: "System",
			action: "watchdog_refreshed",
			title: "Watchdog refresh",
		});
	});

	it("includes the expected local workflow command groups", () => {
		const titles = COMMAND_GROUPS.map((group) => group.title);
		expect(titles).toContain("Supabase");
		expect(titles).toContain("Watchdog");
		expect(titles).toContain("Worktale");
	});

	it("includes the workstation runtime control presets", () => {
		const watchdogGroup = COMMAND_GROUPS.find(
			(group) => group.title === "Watchdog",
		);
		const ids = (watchdogGroup?.presets || []).map((preset) => preset.id);
		expect(ids).toContain("workstation-bootstrap");
		expect(ids).toContain("workstation-stop");
		expect(ids).toContain("workstation-control-panel");
		expect(ids).toContain("workstation-startup-install");
	});

	it("includes the guarded hosted Supabase workflow presets", () => {
		const supabaseGroup = COMMAND_GROUPS.find(
			(group) => group.title === "Supabase",
		);
		const ids = (supabaseGroup?.presets || []).map((preset) => preset.id);
		expect(ids).toContain("supabase-mode-local");
		expect(ids).toContain("supabase-mode-hosted");
		expect(ids).toContain("supabase-mail-gmail");
		expect(ids).toContain("supabase-mail-mailpit");
		expect(ids).toContain("supabase-remote-login");
		expect(ids).toContain("supabase-remote-target-auto");
		expect(ids).toContain("supabase-remote-preflight");
		expect(ids).toContain("supabase-remote-push-dry");
		expect(ids).toContain("supabase-remote-push");
		expect(ids).toContain("supabase-remote-task-install");
	});
});
