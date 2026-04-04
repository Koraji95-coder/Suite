import {
	clearAppDiagnostics,
	recordAppDiagnostic,
} from "@/lib/appDiagnostics";
import { installSuiteDevConsoleApis } from "@/lib/devConsoleApi";
import { logger } from "@/lib/logger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("devConsoleApi", () => {
	beforeEach(() => {
		const noop = () => undefined;
		vi.spyOn(console, "debug").mockImplementation(noop);
		vi.spyOn(console, "error").mockImplementation(noop);
		vi.spyOn(console, "info").mockImplementation(noop);
		vi.spyOn(console, "log").mockImplementation(noop);
		vi.spyOn(console, "warn").mockImplementation(noop);

		logger.clearHistory();
		clearAppDiagnostics();
		delete window.__suiteLogs;
		delete window.__suiteDiagnostics;
	});

	afterEach(() => {
		logger.clearHistory();
		clearAppDiagnostics();
		delete window.__suiteLogs;
		delete window.__suiteDiagnostics;
		vi.restoreAllMocks();
	});

	it("installs dev-only Suite log and diagnostics helpers on window", () => {
		installSuiteDevConsoleApis({ enabled: true });

		expect(window.__suiteLogs).toBeDefined();
		expect(window.__suiteDiagnostics).toBeDefined();

		logger.debug("Debug message", "DevConsoleApiTest", { stage: "log" });
		recordAppDiagnostic({
			source: "runtime",
			severity: "warning",
			title: "Runtime warning",
			message: "Doctor found a warning",
			context: "/app/test",
		});

		expect(window.__suiteLogs?.get()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					context: "DevConsoleApiTest",
					message: "Debug message",
				}),
			]),
		);
		expect(window.__suiteLogs?.get("debug")).toHaveLength(1);
		expect(window.__suiteLogs?.export("DEBUG")).toContain("Debug message");

		expect(window.__suiteDiagnostics?.get()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					context: "/app/test",
					message: "Doctor found a warning",
					title: "Runtime warning",
				}),
			]),
		);
		expect(window.__suiteDiagnostics?.export()).toContain("Runtime warning");
	});

	it("clears exposed Suite log and diagnostics history", () => {
		installSuiteDevConsoleApis({ enabled: true });

		logger.warn("Warn message", "DevConsoleApiTest");
		recordAppDiagnostic({
			source: "fetch",
			severity: "error",
			title: "Network error",
			message: "Backend request failed",
		});

		expect(window.__suiteLogs?.get().length).toBeGreaterThan(0);
		expect(window.__suiteDiagnostics?.get().length).toBeGreaterThan(0);

		window.__suiteLogs?.clear();
		window.__suiteDiagnostics?.clear();

		expect(window.__suiteLogs?.get()).toEqual([]);
		expect(window.__suiteDiagnostics?.get()).toEqual([]);
	});

	it("throws for unknown Suite log levels", () => {
		installSuiteDevConsoleApis({ enabled: true });

		expect(() => window.__suiteLogs?.get("trace")).toThrow(
			"Unknown Suite log level",
		);
	});
});
