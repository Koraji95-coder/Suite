import {
	buildDashboardWatchdogHref,
	buildWatchdogHref,
} from "./watchdogNavigation";
import { describe, expect, it } from "vitest";

describe("watchdogNavigation", () => {
	it("builds a watchdog href without a project", () => {
		expect(buildWatchdogHref()).toBe("/app/watchdog");
	});

	it("builds a watchdog href with a project", () => {
		expect(buildWatchdogHref("project-1")).toBe(
			"/app/watchdog?project=project-1",
		);
	});

	it("builds a watchdog href with project and issue-set scope", () => {
		expect(buildWatchdogHref("project-1", "issue-set-1")).toBe(
			"/app/watchdog?project=project-1&issueSet=issue-set-1",
		);
	});

	it("keeps the legacy dashboard helper mapped to the dedicated watchdog page", () => {
		expect(buildDashboardWatchdogHref("project-1")).toBe(
			"/app/watchdog?project=project-1",
		);
	});
});
