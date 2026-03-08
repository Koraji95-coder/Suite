import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentConnectionStatus } from "./useAgentConnectionStatus";

const mockRefreshPairingStatusDetailed = vi.hoisted(
	() => vi.fn<() => Promise<Record<string, unknown>>>(),
);
const mockHealthCheck = vi.hoisted(() => vi.fn<() => Promise<boolean>>());

vi.mock("@/services/agentService", () => ({
	AGENT_PAIRING_STATE_EVENT: "suite:agent-pairing-state-changed",
	agentService: {
		refreshPairingStatusDetailed: mockRefreshPairingStatusDetailed,
		healthCheck: mockHealthCheck,
	},
}));

function HookHarness() {
	useAgentConnectionStatus({ userId: "user-1" });
	return null;
}

const okResult = {
	paired: false,
	ok: true,
	transient: false,
	terminal: false,
	status: 200,
	code: "OK",
	message: "",
	retryAfterSeconds: 0,
	kind: "none",
};

async function advanceTime(ms: number): Promise<void> {
	await act(async () => {
		vi.advanceTimersByTime(ms);
		await Promise.resolve();
	});
}

async function flushEffects(): Promise<void> {
	await act(async () => {
		await Promise.resolve();
	});
}

describe("useAgentConnectionStatus", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockRefreshPairingStatusDetailed.mockReset();
		mockHealthCheck.mockReset();
		mockHealthCheck.mockResolvedValue(true);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("polls agent session every 30s when visible", async () => {
		mockRefreshPairingStatusDetailed.mockResolvedValue(okResult);

		render(<HookHarness />);

		await flushEffects();
		expect(mockRefreshPairingStatusDetailed).toHaveBeenCalledTimes(1);
		expect(mockHealthCheck).toHaveBeenCalledTimes(1);

		await advanceTime(29_999);
		expect(mockRefreshPairingStatusDetailed).toHaveBeenCalledTimes(1);

		await advanceTime(1);
		expect(mockRefreshPairingStatusDetailed).toHaveBeenCalledTimes(2);
		expect(mockHealthCheck).toHaveBeenCalledTimes(1);
	});

	it("honors Retry-After and pauses polling after 429", async () => {
		mockRefreshPairingStatusDetailed
			.mockResolvedValueOnce(okResult)
			.mockResolvedValueOnce({
				paired: false,
				ok: false,
				transient: true,
				terminal: false,
				status: 429,
				code: "AGENT_SESSION_RATE_LIMITED",
				message: "Retry later",
				retryAfterSeconds: 90,
				kind: "rate-limited",
			})
			.mockResolvedValue(okResult);

		render(<HookHarness />);

		await flushEffects();
		expect(mockRefreshPairingStatusDetailed).toHaveBeenCalledTimes(1);

		await advanceTime(30_000);
		expect(mockRefreshPairingStatusDetailed).toHaveBeenCalledTimes(2);

		await advanceTime(89_000);
		expect(mockRefreshPairingStatusDetailed).toHaveBeenCalledTimes(2);

		await advanceTime(1_000);
		expect(mockRefreshPairingStatusDetailed).toHaveBeenCalledTimes(3);
		expect(mockHealthCheck).toHaveBeenCalledTimes(2);
	});

	it("retries transient auth timeout with 2s then 5s backoff", async () => {
		const timeoutResult = {
			paired: true,
			ok: false,
			transient: true,
			terminal: false,
			status: 503,
			code: "AUTH_PROVIDER_TIMEOUT",
			message: "Provider timeout",
			retryAfterSeconds: 0,
			kind: "provider-timeout",
		};
		mockRefreshPairingStatusDetailed
			.mockResolvedValueOnce(okResult)
			.mockResolvedValueOnce(timeoutResult)
			.mockResolvedValueOnce(timeoutResult)
			.mockResolvedValue(okResult);

		render(<HookHarness />);

		await flushEffects();
		expect(mockRefreshPairingStatusDetailed).toHaveBeenCalledTimes(1);

		await advanceTime(30_000);
		expect(mockRefreshPairingStatusDetailed).toHaveBeenCalledTimes(2);

		await advanceTime(1_999);
		expect(mockRefreshPairingStatusDetailed).toHaveBeenCalledTimes(2);

		await advanceTime(1);
		expect(mockRefreshPairingStatusDetailed).toHaveBeenCalledTimes(3);

		await advanceTime(4_999);
		expect(mockRefreshPairingStatusDetailed).toHaveBeenCalledTimes(3);

		await advanceTime(1);
		expect(mockRefreshPairingStatusDetailed).toHaveBeenCalledTimes(4);
	});
});
