import { renderHook } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STATE } from "./CoordinatesGrabberModels";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";
import { useCoordinatesGrabberExecutionController } from "./useCoordinatesGrabberExecutionController";

const serviceMocks = vi.hoisted(() => ({
	getSelectionCountMock: vi.fn<() => Promise<number>>(),
	executeMock: vi.fn<(config: unknown, options?: { runId?: string }) => Promise<unknown>>(),
}));

vi.mock("@/features/cad-runtime/coordinatesGrabberService", () => ({
	coordinatesGrabberService: {
		getSelectionCount: serviceMocks.getSelectionCountMock,
		execute: serviceMocks.executeMock,
	},
}));

const VALID_STATE: CoordinatesGrabberState = {
	...DEFAULT_STATE,
	layerName: "E-GRID",
	selectedLayers: ["E-GRID"],
};

const VALID_EXECUTION_RESULT = {
	success: true,
	message: "Extracted 3 points",
	points_created: 3,
	blocks_inserted: 0,
	excel_path: "",
	points: [],
	block_errors: null,
};

function buildOptions(
	stateOverride: Partial<CoordinatesGrabberState> = {},
	hookOverride: Record<string, unknown> = {},
) {
	const logs: string[] = [];
	const stateRef = { current: { ...VALID_STATE, ...stateOverride } };
	const options = {
		addLog: (msg: string) => {
			logs.push(msg);
		},
		backendConnected: true,
		setState: vi.fn(),
		stateRef,
		inFlightRunRef: { current: false },
		activeRunIdRef: { current: null as string | null },
		hasAttemptedRunRef: { current: false },
		wsConnected: false,
		startProgressSimulation: vi.fn(),
		finishProgress: vi.fn(),
		queueProgressReset: vi.fn(),
		setProgress: vi.fn(),
		setProgressStage: vi.fn(),
		...hookOverride,
	};
	return { logs, options };
}

describe("useCoordinatesGrabberExecutionController – error handling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("handleLayerSearch – guard conditions", () => {
		it("logs INFO and skips execution when extraction is already in-flight", async () => {
			const { logs, options } = buildOptions();
			options.inFlightRunRef.current = true;

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			expect(logs).toContain("[INFO] Extraction is already running");
			expect(serviceMocks.executeMock).not.toHaveBeenCalled();
		});

		it("logs ERROR and skips execution when backend is not connected", async () => {
			const { logs, options } = buildOptions({}, { backendConnected: false });

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			expect(logs).toContain("[ERROR] Not connected to AutoCAD backend");
			expect(serviceMocks.executeMock).not.toHaveBeenCalled();
		});

		it("logs VALIDATION errors and stops execution without calling service", async () => {
			const { logs, options } = buildOptions({
				selectedLayers: [],
				layerName: "",
				startNumber: 0,
			});

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			const validationLogs = logs.filter((l) => l.startsWith("[VALIDATION]"));
			expect(validationLogs.length).toBeGreaterThan(0);
			expect(logs).toContain("[ERROR] Configuration validation failed");
			expect(serviceMocks.executeMock).not.toHaveBeenCalled();
		});

		it("VALIDATION error messages do not contain raw exception text or stack traces", async () => {
			const { logs, options } = buildOptions({
				selectedLayers: [],
				layerName: "",
			});

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			for (const log of logs) {
				// Stack traces appear as newline-indented "at" lines – single-line messages are safe
				expect(log).not.toContain("\n    at ");
				expect(log).not.toMatch(/\n\s+at /);
			}
		});
	});

	describe("handleLayerSearch – selection preflight", () => {
		it("logs ERROR and stops when selection count is zero and modelspace is disabled", async () => {
			const { logs, options } = buildOptions({
				scanSelection: true,
				includeModelspace: false,
			});
			serviceMocks.getSelectionCountMock.mockResolvedValue(0);

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			expect(logs).toContain(
				"[ERROR] Selection-only scan is enabled but no objects are selected. Select objects in AutoCAD first.",
			);
			expect(serviceMocks.executeMock).not.toHaveBeenCalled();
		});

		it("logs WARNING and continues when selection count is zero but modelspace is enabled", async () => {
			const { logs, options } = buildOptions({
				scanSelection: true,
				includeModelspace: true,
			});
			serviceMocks.getSelectionCountMock.mockResolvedValue(0);
			serviceMocks.executeMock.mockResolvedValue(VALID_EXECUTION_RESULT);

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			const warningLogs = logs.filter(
				(l) => l.startsWith("[WARNING]") && l.includes("no objects selected"),
			);
			expect(warningLogs.length).toBeGreaterThan(0);
			expect(serviceMocks.executeMock).toHaveBeenCalledOnce();
		});

		it("logs ERROR (not stack trace) when getSelectionCount throws and modelspace is disabled", async () => {
			const { logs, options } = buildOptions({
				scanSelection: true,
				includeModelspace: false,
			});
			serviceMocks.getSelectionCountMock.mockRejectedValue(
				new Error("Connection refused"),
			);

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			const errorLogs = logs.filter((l) => l.startsWith("[ERROR]"));
			expect(errorLogs.length).toBeGreaterThan(0);
			expect(errorLogs[0]).toContain("Connection refused");
			expect(errorLogs[0]).not.toMatch(/\s+at /);
			expect(serviceMocks.executeMock).not.toHaveBeenCalled();
		});

		it("logs WARNING when getSelectionCount throws and modelspace is enabled, then continues", async () => {
			const { logs, options } = buildOptions({
				scanSelection: true,
				includeModelspace: true,
			});
			serviceMocks.getSelectionCountMock.mockRejectedValue(
				new Error("Timeout"),
			);
			serviceMocks.executeMock.mockResolvedValue(VALID_EXECUTION_RESULT);

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			const warningLogs = logs.filter((l) => l.startsWith("[WARNING]"));
			expect(warningLogs.some((l) => l.includes("Timeout"))).toBe(true);
			expect(warningLogs[0]).not.toMatch(/\s+at /);
			expect(serviceMocks.executeMock).toHaveBeenCalledOnce();
		});

		it("uses 'Unknown error' when getSelectionCount throws a non-Error value", async () => {
			const { logs, options } = buildOptions({
				scanSelection: true,
				includeModelspace: true,
			});
			serviceMocks.getSelectionCountMock.mockRejectedValue("raw string");
			serviceMocks.executeMock.mockResolvedValue(VALID_EXECUTION_RESULT);

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			const warningLogs = logs.filter((l) => l.startsWith("[WARNING]"));
			expect(warningLogs.some((l) => l.includes("Unknown error"))).toBe(true);
		});
	});

	describe("handleLayerSearch – execution result errors", () => {
		it("logs ERROR from result.message when execution returns success=false", async () => {
			serviceMocks.executeMock.mockResolvedValue({
				success: false,
				message: "No matching layers found",
			});
			const { logs, options } = buildOptions();

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			expect(logs).toContain("[ERROR] No matching layers found");
		});

		it("logs error_details when provided in a failed result", async () => {
			serviceMocks.executeMock.mockResolvedValue({
				success: false,
				message: "Extraction failed",
				error_details: "Layer E-GRID has 0 matching objects",
			});
			const { logs, options } = buildOptions();

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			expect(logs).toContain("[ERROR] Extraction failed");
			expect(logs).toContain(
				"[ERROR] Details: Layer E-GRID has 0 matching objects",
			);
		});

		it("does not log a Details line when error_details is absent", async () => {
			serviceMocks.executeMock.mockResolvedValue({
				success: false,
				message: "Extraction failed",
			});
			const { logs, options } = buildOptions();

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			expect(logs.every((l) => !l.startsWith("[ERROR] Details:"))).toBe(true);
		});

		it("saves a failed history entry when execution returns success=false", async () => {
			serviceMocks.executeMock.mockResolvedValue({
				success: false,
				message: "Layer not found",
			});
			const { options } = buildOptions();

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			const setStateCalls = vi.mocked(options.setState).mock.calls;
			const historyCall = setStateCalls.find((call) => {
				const updater = call[0];
				if (typeof updater !== "function") return false;
				const next = updater({ ...VALID_STATE, executionHistory: [] });
				return next.executionHistory?.[0]?.success === false;
			});
			expect(historyCall).toBeDefined();
		});
	});

	describe("handleLayerSearch – thrown exceptions", () => {
		it("logs safe message when execute throws an Error, without stack trace", async () => {
			serviceMocks.executeMock.mockRejectedValue(
				new Error("ECONNREFUSED 127.0.0.1:5000"),
			);
			const { logs, options } = buildOptions();

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			const errorLogs = logs.filter((l) =>
				l.startsWith("[ERROR] Execution failed:"),
			);
			expect(errorLogs).toHaveLength(1);
			expect(errorLogs[0]).toContain("ECONNREFUSED 127.0.0.1:5000");
			expect(errorLogs[0]).not.toMatch(/\n\s+at /);
		});

		it("uses 'Unknown error' when execute throws a non-Error object", async () => {
			serviceMocks.executeMock.mockRejectedValue(null);
			const { logs, options } = buildOptions();

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			expect(logs).toContain("[ERROR] Execution failed: Unknown error");
		});

		it("resets isRunning to false after a thrown execution error", async () => {
			serviceMocks.executeMock.mockRejectedValue(new Error("Network error"));
			const { options } = buildOptions();

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			const setStateCalls = vi.mocked(options.setState).mock.calls;
			const finalStateCall = setStateCalls[setStateCalls.length - 1]?.[0];
			if (typeof finalStateCall === "function") {
				const next = finalStateCall({ ...VALID_STATE, isRunning: true });
				expect(next.isRunning).toBe(false);
			} else {
				expect(finalStateCall).toMatchObject({ isRunning: false });
			}
		});

		it("releases inFlightRunRef after a thrown execution error", async () => {
			serviceMocks.executeMock.mockRejectedValue(new Error("Crash"));
			const { options } = buildOptions();

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleLayerSearch();
			});

			expect(options.inFlightRunRef.current).toBe(false);
		});
	});

	describe("handleSelectionRefresh – error handling", () => {
		it("logs WARNING with message when getSelectionCount throws an Error", async () => {
			serviceMocks.getSelectionCountMock.mockRejectedValue(
				new Error("Request timeout"),
			);
			const { logs, options } = buildOptions();

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleSelectionRefresh();
			});

			expect(logs).toContain(
				"[WARNING] Could not get selection count: Request timeout",
			);
		});

		it("does not expose stack trace in selection-refresh warning", async () => {
			serviceMocks.getSelectionCountMock.mockRejectedValue(
				new Error("Network failure"),
			);
			const { logs, options } = buildOptions();

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleSelectionRefresh();
			});

			for (const log of logs) {
				expect(log).not.toMatch(/\s+at /);
			}
		});

		it("uses 'Unknown error' when getSelectionCount throws a non-Error during refresh", async () => {
			serviceMocks.getSelectionCountMock.mockRejectedValue(undefined);
			const { logs, options } = buildOptions();

			const { result } = renderHook(() =>
				useCoordinatesGrabberExecutionController(options),
			);
			await act(async () => {
				await result.current.handleSelectionRefresh();
			});

			expect(logs).toContain(
				"[WARNING] Could not get selection count: Unknown error",
			);
		});
	});
});
