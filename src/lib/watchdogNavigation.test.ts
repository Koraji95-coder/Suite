import { buildDashboardWatchdogHref, parseCommandCenterTab } from "./watchdogNavigation";
import { describe, expect, it } from "vitest";

describe("watchdogNavigation", () => {
	it("builds a dashboard watchdog href without a project", () => {
		expect(buildDashboardWatchdogHref()).toBe("/app/dashboard?focus=watchdog");
	});

	it("builds a dashboard watchdog href with a project", () => {
		expect(buildDashboardWatchdogHref("project-1")).toBe(
			"/app/dashboard?focus=watchdog&project=project-1",
		);
	});

	it("parses supported command center tabs", () => {
		expect(parseCommandCenterTab("commands")).toBe("commands");
		expect(parseCommandCenterTab("architecture")).toBe("architecture");
		expect(parseCommandCenterTab("unknown")).toBeNull();
	});
});
