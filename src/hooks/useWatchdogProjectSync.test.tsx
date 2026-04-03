import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWatchdogProjectSync } from "./useWatchdogProjectSync";

const mockUseAuth = vi.hoisted(() => vi.fn());
const mockSyncSharedProjectWatchdogRulesToLocalRuntime = vi.hoisted(() =>
	vi.fn(),
);
const mockSyncSharedDrawingActivityFromLocalRuntime = vi.hoisted(() => vi.fn());

vi.mock("@/auth/useAuth", () => ({
	useAuth: mockUseAuth,
}));

vi.mock("@/services/projectWatchdogService", () => ({
	syncSharedProjectWatchdogRulesToLocalRuntime:
		mockSyncSharedProjectWatchdogRulesToLocalRuntime,
	syncSharedDrawingActivityFromLocalRuntime:
		mockSyncSharedDrawingActivityFromLocalRuntime,
}));

function HookHarness() {
	useWatchdogProjectSync();
	return null;
}

const STORAGE_KEY = "watchdog-project-sync:last-completed:user-1";
const INITIAL_SYNC_DELAY_MS = 1_200;
const MIN_SYNC_INTERVAL_MS = 15_000;

function createStorageMock(): Storage {
	const values = new Map<string, string>();

	return {
		get length() {
			return values.size;
		},
		clear() {
			values.clear();
		},
		getItem(key: string) {
			return values.has(key) ? values.get(key) ?? null : null;
		},
		key(index: number) {
			return Array.from(values.keys())[index] ?? null;
		},
		removeItem(key: string) {
			values.delete(key);
		},
		setItem(key: string, value: string) {
			values.set(key, String(value));
		},
	} as Storage;
}

const storageMock = createStorageMock();
const originalLocalStorage = window.localStorage;
const originalRequestIdleCallback = window.requestIdleCallback;
const originalCancelIdleCallback = window.cancelIdleCallback;

async function flushEffects(): Promise<void> {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}

async function advanceTime(ms: number): Promise<void> {
	await act(async () => {
		vi.advanceTimersByTime(ms);
		await Promise.resolve();
		await Promise.resolve();
	});
}

describe("useWatchdogProjectSync", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-03T03:30:00.000Z"));
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			value: storageMock,
		});
		storageMock.clear();
		mockUseAuth.mockReset();
		mockUseAuth.mockReturnValue({
			user: { id: "user-1" },
		});
		mockSyncSharedProjectWatchdogRulesToLocalRuntime.mockReset();
		mockSyncSharedProjectWatchdogRulesToLocalRuntime.mockResolvedValue({
			ok: true,
		});
		mockSyncSharedDrawingActivityFromLocalRuntime.mockReset();
		mockSyncSharedDrawingActivityFromLocalRuntime.mockResolvedValue({
			ok: true,
		});
		Object.defineProperty(window, "requestIdleCallback", {
			configurable: true,
			value: undefined,
		});
		Object.defineProperty(window, "cancelIdleCallback", {
			configurable: true,
			value: undefined,
		});
	});

	afterEach(() => {
		storageMock.clear();
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			value: originalLocalStorage,
		});
		Object.defineProperty(window, "requestIdleCallback", {
			configurable: true,
			value: originalRequestIdleCallback,
		});
		Object.defineProperty(window, "cancelIdleCallback", {
			configurable: true,
			value: originalCancelIdleCallback,
		});
		vi.useRealTimers();
	});

	it("defers the initial sync until after the startup delay", async () => {
		render(<HookHarness />);

		await flushEffects();
		expect(mockSyncSharedProjectWatchdogRulesToLocalRuntime).not.toHaveBeenCalled();
		expect(mockSyncSharedDrawingActivityFromLocalRuntime).not.toHaveBeenCalled();

		await advanceTime(INITIAL_SYNC_DELAY_MS - 1);
		expect(mockSyncSharedProjectWatchdogRulesToLocalRuntime).not.toHaveBeenCalled();
		expect(mockSyncSharedDrawingActivityFromLocalRuntime).not.toHaveBeenCalled();

		await advanceTime(1);
		expect(mockSyncSharedProjectWatchdogRulesToLocalRuntime).toHaveBeenCalledTimes(
			1,
		);
		expect(mockSyncSharedDrawingActivityFromLocalRuntime).toHaveBeenCalledTimes(1);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(String(Date.now()));
	});

	it("honors the persisted cooldown across reloads", async () => {
		window.localStorage.setItem(STORAGE_KEY, String(Date.now()));

		render(<HookHarness />);

		await flushEffects();
		await advanceTime(INITIAL_SYNC_DELAY_MS);
		expect(mockSyncSharedProjectWatchdogRulesToLocalRuntime).not.toHaveBeenCalled();
		expect(mockSyncSharedDrawingActivityFromLocalRuntime).not.toHaveBeenCalled();

		await act(async () => {
			window.dispatchEvent(new Event("focus"));
			await Promise.resolve();
		});
		expect(mockSyncSharedProjectWatchdogRulesToLocalRuntime).not.toHaveBeenCalled();
		expect(mockSyncSharedDrawingActivityFromLocalRuntime).not.toHaveBeenCalled();

		await advanceTime(MIN_SYNC_INTERVAL_MS);
		await act(async () => {
			window.dispatchEvent(new Event("focus"));
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(mockSyncSharedProjectWatchdogRulesToLocalRuntime).toHaveBeenCalledTimes(
			1,
		);
		expect(mockSyncSharedDrawingActivityFromLocalRuntime).toHaveBeenCalledTimes(1);
	});

	it("retries immediately when the previous sync did not fully succeed", async () => {
		mockSyncSharedProjectWatchdogRulesToLocalRuntime
			.mockRejectedValueOnce(new Error("rules sync failed"))
			.mockResolvedValue({ ok: true });

		render(<HookHarness />);

		await flushEffects();
		await advanceTime(INITIAL_SYNC_DELAY_MS);
		expect(mockSyncSharedProjectWatchdogRulesToLocalRuntime).toHaveBeenCalledTimes(
			1,
		);
		expect(mockSyncSharedDrawingActivityFromLocalRuntime).toHaveBeenCalledTimes(1);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(null);

		await act(async () => {
			window.dispatchEvent(new Event("focus"));
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(mockSyncSharedProjectWatchdogRulesToLocalRuntime).toHaveBeenCalledTimes(
			2,
		);
		expect(mockSyncSharedDrawingActivityFromLocalRuntime).toHaveBeenCalledTimes(2);
	});
});
