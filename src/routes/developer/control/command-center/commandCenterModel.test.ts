import { describe, expect, it } from "vitest";
import {
	COMMAND_GROUPS,
	parseCommandCenterHistory,
} from "./commandCenterModel";

describe("commandCenterModel", () => {
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

	it("keeps command groups focused on diagnostics, hosted push, and evidence", () => {
		const titles = COMMAND_GROUPS.map((group) => group.title);
		expect(titles).toContain("Diagnostics");
		expect(titles).toContain("Hosted Push");
		expect(titles).toContain("Evidence & Logs");
		expect(titles).not.toContain("Repository");
		expect(titles).not.toContain("Quality");
	});

	it("keeps runtime workstation controls out of copied command presets", () => {
		const ids = COMMAND_GROUPS.flatMap((group) =>
			group.presets.map((preset) => preset.id),
		);
		expect(ids).not.toContain("workstation-control-panel");
		expect(ids).not.toContain("watchdog-autocad-doctor");
	});

	it("keeps workstation start/stop commands out of diagnostic presets", () => {
		const ids = COMMAND_GROUPS.flatMap((group) =>
			group.presets.map((preset) => preset.id),
		);
		expect(ids).not.toContain("flask");
		expect(ids).not.toContain("build");
		expect(ids).not.toContain("check");
	});

	it("includes the guarded hosted Supabase workflow presets", () => {
		const supabaseGroup = COMMAND_GROUPS.find(
			(group) => group.title === "Hosted Push",
		);
		const ids = (supabaseGroup?.presets || []).map((preset) => preset.id);
		expect(ids).toContain("supabase-remote-login");
		expect(ids).toContain("supabase-remote-target-auto");
		expect(ids).toContain("supabase-remote-preflight");
		expect(ids).toContain("supabase-remote-push-dry");
		expect(ids).toContain("supabase-remote-push");
		expect(ids).toContain("supabase-remote-task-install");
	});

	it("keeps only probe-safe diagnostics in command presets", () => {
		const diagnosticsGroup = COMMAND_GROUPS.find(
			(group) => group.title === "Diagnostics",
		);
		const ids = (diagnosticsGroup?.presets || []).map((preset) => preset.id);
		expect(ids).not.toContain("suite-runtime-status");
		expect(ids).toContain("frontend-health-probe");
		expect(ids).toContain("backend-health-probe");
		expect(ids).toContain("backend-runtime-status");
	});
});
