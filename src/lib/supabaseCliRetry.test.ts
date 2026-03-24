import { describe, expect, it, vi } from "vitest";

import {
	isRetriableSupabaseStartFailure,
	runSupabaseStartWithRetry,
} from "../../scripts/lib/supabase-cli.mjs";

describe("isRetriableSupabaseStartFailure", () => {
	it("matches transient Docker container-name conflicts", () => {
		expect(
			isRetriableSupabaseStartFailure(
				'failed to create docker container: Error response from daemon: Conflict. The container name "/supabase_vector_Suite" is already in use by container "abc123".',
			),
		).toBe(true);
	});

	it("matches transient Supabase edge runtime 502 failures", () => {
		expect(
			isRetriableSupabaseStartFailure(
				"Waiting for health checks...\nsupabase_edge_runtime_Suite container logs:\nStopping containers...\nError status 502:",
			),
		).toBe(true);
	});

	it("ignores non-transient startup failures", () => {
		expect(isRetriableSupabaseStartFailure("Docker Desktop is not running.")).toBe(false);
	});
});

describe("runSupabaseStartWithRetry", () => {
	it("retries a transient start failure once and returns the succeeding result", async () => {
		const runOnce = vi
			.fn()
			.mockResolvedValueOnce({
				status: 1,
				stdout: "",
				stderr:
					'failed to create docker container: Error response from daemon: Conflict. The container name "/supabase_vector_Suite" is already in use by container "abc123".',
			})
			.mockResolvedValueOnce({
				status: 0,
				stdout: "Started supabase local development setup.\n",
				stderr: "",
			});
		const onRetry = vi.fn();

		const result = await runSupabaseStartWithRetry(runOnce, {
			delayMs: 0,
			onRetry,
		});

		expect(runOnce).toHaveBeenCalledTimes(2);
		expect(onRetry).toHaveBeenCalledTimes(1);
		expect(result.attempts).toBe(2);
		expect(result.result?.status).toBe(0);
	});

	it("does not retry non-transient failures", async () => {
		const runOnce = vi.fn().mockResolvedValue({
			status: 1,
			stdout: "",
			stderr: "Docker Desktop is not running.",
		});
		const onRetry = vi.fn();

		const result = await runSupabaseStartWithRetry(runOnce, {
			delayMs: 0,
			onRetry,
		});

		expect(runOnce).toHaveBeenCalledTimes(1);
		expect(onRetry).not.toHaveBeenCalled();
		expect(result.attempts).toBe(1);
		expect(result.result?.status).toBe(1);
	});
});
