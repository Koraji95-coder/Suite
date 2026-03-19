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
});
