import { useCallback, useEffect, useRef, useState } from "react";
import { AGENT_PAIRING_STATE_EVENT } from "@/services/agent/types";
import { agentService } from "@/services/agentService";

export const AGENT_POLL_VISIBLE_MS = 30_000;
export const AGENT_POLL_HIDDEN_MS = 90_000;
const AGENT_MAX_RETRY_AFTER_SECONDS = 120;
const AGENT_TRANSIENT_RETRY_BACKOFF_MS = [2_000, 5_000, 10_000, 20_000, 30_000];
const AGENT_STATUS_CACHE_TTL_MS = 5 * 60_000;
const AGENT_MOUNT_HEALTH_REFRESH_TTL_MS = 60_000;

interface AgentRefreshOptions {
	includeHealth: boolean;
	showLoading: boolean;
}

export interface UseAgentConnectionStatusOptions {
	userId?: string | null;
}

export interface AgentConnectionStatusState {
	healthy: boolean | null;
	paired: boolean;
	loading: boolean;
	error: string;
	refreshNow: () => Promise<void>;
}

function resolveBasePollIntervalMs(): number {
	if (
		typeof document !== "undefined" &&
		document.visibilityState === "hidden"
	) {
		return AGENT_POLL_HIDDEN_MS;
	}
	return AGENT_POLL_VISIBLE_MS;
}

function resolvePairingCacheKey(userId: string | null): string {
	const endpoint =
		typeof (agentService as { getEndpoint?: () => string }).getEndpoint ===
		"function"
			? (agentService as { getEndpoint: () => string }).getEndpoint()
			: "default-endpoint";
	return `suite:agent:paired:${userId || "anonymous"}:${endpoint}`;
}

function resolveHealthCacheKey(userId: string | null): string {
	const endpoint =
		typeof (agentService as { getEndpoint?: () => string }).getEndpoint ===
		"function"
			? (agentService as { getEndpoint: () => string }).getEndpoint()
			: "default-endpoint";
	return `suite:agent:healthy:${userId || "anonymous"}:${endpoint}`;
}

function readCachedPairedValue(cacheKey: string): boolean {
	try {
		return localStorage.getItem(cacheKey) === "1";
	} catch {
		return false;
	}
}

function writeCachedPairedValue(cacheKey: string, nextPaired: boolean) {
	try {
		localStorage.setItem(cacheKey, nextPaired ? "1" : "0");
	} catch {
		/* noop */
	}
}

function readCachedHealthSnapshot(cacheKey: string): {
	value: boolean;
	updatedAt: number;
} | null {
	try {
		const raw = localStorage.getItem(cacheKey);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as {
			value?: boolean;
			updatedAt?: number;
		};
		if (
			typeof parsed?.value !== "boolean" ||
			typeof parsed?.updatedAt !== "number"
		) {
			return null;
		}
		if (Date.now() - parsed.updatedAt > AGENT_STATUS_CACHE_TTL_MS) {
			return null;
		}
		return {
			value: parsed.value,
			updatedAt: parsed.updatedAt,
		};
	} catch {
		return null;
	}
}

function readCachedHealthValue(cacheKey: string): boolean | null {
	return readCachedHealthSnapshot(cacheKey)?.value ?? null;
}

function writeCachedHealthValue(cacheKey: string, nextHealthy: boolean) {
	try {
		localStorage.setItem(
			cacheKey,
			JSON.stringify({
				value: nextHealthy,
				updatedAt: Date.now(),
			}),
		);
	} catch {
		/* noop */
	}
}

interface SharedAgentRefreshResult {
	paired: boolean;
	healthy: boolean | null;
	error: string;
	retryAfterUntilMs: number;
	transientRetryCount: number;
}

const sharedRefreshByKey = new Map<string, Promise<SharedAgentRefreshResult>>();

function resolveSharedRefreshKey(
	pairingCacheKey: string,
	healthCacheKey: string,
	includeHealth: boolean,
): string {
	return `${pairingCacheKey}|${healthCacheKey}|${includeHealth ? "health" : "paired"}`;
}

async function runSharedAgentRefresh(options: {
	pairingCacheKey: string;
	healthCacheKey: string;
	includeHealth: boolean;
	priorTransientRetryCount: number;
}): Promise<SharedAgentRefreshResult> {
	const dedupeKey = resolveSharedRefreshKey(
		options.pairingCacheKey,
		options.healthCacheKey,
		options.includeHealth,
	);
	const inFlight = sharedRefreshByKey.get(dedupeKey);
	if (inFlight) {
		return inFlight;
	}

	const promise = (async () => {
		let nextPaired = readCachedPairedValue(options.pairingCacheKey);
		let nextHealthy = readCachedHealthValue(options.healthCacheKey);
		let nextError = "";
		let retryAfterUntilMs = 0;
		let transientRetryCount = 0;

		try {
			const result = await agentService.refreshPairingStatusDetailed();
			nextPaired = result.ok
				? result.paired
				: result.transient
					? nextPaired || result.paired
					: result.paired;
			writeCachedPairedValue(options.pairingCacheKey, nextPaired);

			let shouldRunHealthCheck = options.includeHealth;
			if (!result.ok) {
				shouldRunHealthCheck = true;
				const cappedRetryAfterSeconds = Math.min(
					AGENT_MAX_RETRY_AFTER_SECONDS,
					Math.max(0, result.retryAfterSeconds),
				);
				if (cappedRetryAfterSeconds > 0) {
					retryAfterUntilMs = Date.now() + cappedRetryAfterSeconds * 1000;
				}
				if (result.transient) {
					transientRetryCount = Math.min(
						options.priorTransientRetryCount + 1,
						AGENT_TRANSIENT_RETRY_BACKOFF_MS.length,
					);
				}
				nextError = result.message || "Unable to refresh agent session.";
			}

			if (shouldRunHealthCheck) {
				nextHealthy = await agentService.healthCheck();
				writeCachedHealthValue(options.healthCacheKey, nextHealthy);
			}

			return {
				paired: nextPaired,
				healthy: nextHealthy,
				error: nextError,
				retryAfterUntilMs,
				transientRetryCount,
			};
		} catch (cause) {
			transientRetryCount = Math.min(
				options.priorTransientRetryCount + 1,
				AGENT_TRANSIENT_RETRY_BACKOFF_MS.length,
			);
			nextError =
				cause instanceof Error
					? cause.message
					: "Unable to refresh agent status.";
			nextHealthy = await agentService.healthCheck();
			writeCachedHealthValue(options.healthCacheKey, nextHealthy);
			return {
				paired: nextPaired,
				healthy: nextHealthy,
				error: nextError,
				retryAfterUntilMs,
				transientRetryCount,
			};
		}
	})().finally(() => {
		sharedRefreshByKey.delete(dedupeKey);
	});

	sharedRefreshByKey.set(dedupeKey, promise);
	return promise;
}

export function useAgentConnectionStatus(
	options: UseAgentConnectionStatusOptions,
): AgentConnectionStatusState {
	const { userId = null } = options;
	const pairingCacheKey = resolvePairingCacheKey(userId);
	const healthCacheKey = resolveHealthCacheKey(userId);
	const [healthy, setHealthy] = useState<boolean | null>(() =>
		readCachedHealthValue(healthCacheKey),
	);
	const [paired, setPaired] = useState(() =>
		readCachedPairedValue(pairingCacheKey),
	);
	const [loading, setLoading] = useState(
		() => readCachedHealthValue(healthCacheKey) === null,
	);
	const [error, setError] = useState("");
	const pollTimerRef = useRef<number | null>(null);
	const retryAfterUntilMsRef = useRef(0);
	const transientRetryCountRef = useRef(0);
	const mountedRef = useRef(true);

	const readCachedPaired = useCallback((): boolean => {
		return readCachedPairedValue(pairingCacheKey);
	}, [pairingCacheKey]);

	const readCachedHealthySnapshot = useCallback(
		() => readCachedHealthSnapshot(healthCacheKey),
		[healthCacheKey],
	);

	const clearPollTimer = useCallback(() => {
		if (pollTimerRef.current !== null) {
			window.clearTimeout(pollTimerRef.current);
			pollTimerRef.current = null;
		}
	}, []);

	const refreshState = useCallback(
		async (refreshOptions: AgentRefreshOptions): Promise<void> => {
			if (refreshOptions.showLoading) {
				setLoading(true);
			}
			try {
				const result = await runSharedAgentRefresh({
					pairingCacheKey,
					healthCacheKey,
					includeHealth: refreshOptions.includeHealth,
					priorTransientRetryCount: transientRetryCountRef.current,
				});
				if (!mountedRef.current) return;
				setPaired(result.paired);
				if (result.healthy !== null) {
					setHealthy(result.healthy);
				}
				retryAfterUntilMsRef.current = result.retryAfterUntilMs;
				transientRetryCountRef.current = result.transientRetryCount;
				setError(result.error);
			} catch (cause) {
				if (!mountedRef.current) return;
				setError(
					cause instanceof Error
						? cause.message
						: "Unable to refresh agent status.",
				);
			} finally {
				if (mountedRef.current && refreshOptions.showLoading) {
					setLoading(false);
				}
			}
		},
		[healthCacheKey, pairingCacheKey],
	);

	const scheduleNextPoll = useCallback(() => {
		clearPollTimer();
		const baseIntervalMs = resolveBasePollIntervalMs();
		const transientRetryCount = transientRetryCountRef.current;
		const transientRetryDelayMs =
			transientRetryCount > 0
				? AGENT_TRANSIENT_RETRY_BACKOFF_MS[
						Math.min(
							transientRetryCount - 1,
							AGENT_TRANSIENT_RETRY_BACKOFF_MS.length - 1,
						)
					]
				: baseIntervalMs;
		const retryAfterDelayMs = Math.max(
			0,
			retryAfterUntilMsRef.current - Date.now(),
		);
		const nextDelayMs = Math.max(transientRetryDelayMs, retryAfterDelayMs);

		pollTimerRef.current = window.setTimeout(() => {
			void refreshState({ includeHealth: false, showLoading: false }).then(
				() => {
					if (!mountedRef.current) return;
					scheduleNextPoll();
				},
			);
		}, nextDelayMs);
	}, [clearPollTimer, refreshState]);

	const refreshNow = useCallback(async (): Promise<void> => {
		await refreshState({ includeHealth: true, showLoading: true });
		scheduleNextPoll();
	}, [refreshState, scheduleNextPoll]);

	useEffect(() => {
		const cachedHealthSnapshot = readCachedHealthySnapshot();
		const cachedHealthy = cachedHealthSnapshot?.value ?? null;
		const shouldRefreshHealth =
			!cachedHealthSnapshot ||
			Date.now() - cachedHealthSnapshot.updatedAt >
				AGENT_MOUNT_HEALTH_REFRESH_TTL_MS;
		mountedRef.current = true;
		retryAfterUntilMsRef.current = 0;
		transientRetryCountRef.current = 0;
		setHealthy(cachedHealthy);
		setPaired(readCachedPaired());
		setError("");
		setLoading(cachedHealthy === null);

		void refreshState({
			includeHealth: shouldRefreshHealth,
			showLoading: cachedHealthy === null,
		}).then(() => {
			if (!mountedRef.current) return;
			scheduleNextPoll();
		});

		return () => {
			mountedRef.current = false;
			clearPollTimer();
		};
	}, [
		clearPollTimer,
		readCachedHealthySnapshot,
		readCachedPaired,
		refreshState,
		scheduleNextPoll,
	]);

	useEffect(() => {
		const handleFocus = () => {
			void refreshState({ includeHealth: false, showLoading: false }).then(
				() => {
					if (!mountedRef.current) return;
					scheduleNextPoll();
				},
			);
		};
		window.addEventListener("focus", handleFocus);
		return () => {
			window.removeEventListener("focus", handleFocus);
		};
	}, [refreshState, scheduleNextPoll]);

	useEffect(() => {
		const handleVisibilityChange = () => {
			scheduleNextPoll();
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [scheduleNextPoll]);

	useEffect(() => {
		const handlePairingStateChanged = () => {
			void refreshState({ includeHealth: false, showLoading: false }).then(
				() => {
					if (!mountedRef.current) return;
					scheduleNextPoll();
				},
			);
		};
		window.addEventListener(
			AGENT_PAIRING_STATE_EVENT,
			handlePairingStateChanged as EventListener,
		);
		return () => {
			window.removeEventListener(
				AGENT_PAIRING_STATE_EVENT,
				handlePairingStateChanged as EventListener,
			);
		};
	}, [refreshState, scheduleNextPoll]);

	return {
		healthy,
		paired,
		loading,
		error,
		refreshNow,
	};
}
