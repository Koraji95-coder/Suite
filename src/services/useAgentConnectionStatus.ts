import { useCallback, useEffect, useRef, useState } from "react";
import {
	AGENT_PAIRING_STATE_EVENT,
	agentService,
} from "@/services/agentService";

export const AGENT_POLL_VISIBLE_MS = 30_000;
export const AGENT_POLL_HIDDEN_MS = 90_000;
const AGENT_MAX_RETRY_AFTER_SECONDS = 120;
const AGENT_TRANSIENT_RETRY_BACKOFF_MS = [2_000, 5_000, 10_000, 20_000, 30_000];

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
	if (typeof document !== "undefined" && document.visibilityState === "hidden") {
		return AGENT_POLL_HIDDEN_MS;
	}
	return AGENT_POLL_VISIBLE_MS;
}

export function useAgentConnectionStatus(
	options: UseAgentConnectionStatusOptions,
): AgentConnectionStatusState {
	const { userId = null } = options;
	const [healthy, setHealthy] = useState<boolean | null>(null);
	const [paired, setPaired] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const pollTimerRef = useRef<number | null>(null);
	const retryAfterUntilMsRef = useRef(0);
	const transientRetryCountRef = useRef(0);
	const mountedRef = useRef(true);

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
				const result = await agentService.refreshPairingStatusDetailed();
				if (!mountedRef.current) return;

				setPaired(result.paired);

				let shouldRunHealthCheck = refreshOptions.includeHealth;
				if (!result.ok) {
					shouldRunHealthCheck = true;
					const cappedRetryAfterSeconds = Math.min(
						AGENT_MAX_RETRY_AFTER_SECONDS,
						Math.max(0, result.retryAfterSeconds),
					);
					if (cappedRetryAfterSeconds > 0) {
						retryAfterUntilMsRef.current =
							Date.now() + cappedRetryAfterSeconds * 1000;
					}
					if (result.transient) {
						transientRetryCountRef.current = Math.min(
							transientRetryCountRef.current + 1,
							AGENT_TRANSIENT_RETRY_BACKOFF_MS.length,
						);
					} else {
						transientRetryCountRef.current = 0;
					}
					setError(result.message || "Unable to refresh agent session.");
				} else {
					retryAfterUntilMsRef.current = 0;
					transientRetryCountRef.current = 0;
					setError("");
				}

				if (shouldRunHealthCheck) {
					const isHealthy = await agentService.healthCheck();
					if (!mountedRef.current) return;
					setHealthy(isHealthy);
				}
			} catch (cause) {
				if (!mountedRef.current) return;
				transientRetryCountRef.current = Math.min(
					transientRetryCountRef.current + 1,
					AGENT_TRANSIENT_RETRY_BACKOFF_MS.length,
				);
				const message =
					cause instanceof Error
						? cause.message
						: "Unable to refresh agent status.";
				setError(message);
				const isHealthy = await agentService.healthCheck();
				if (!mountedRef.current) return;
				setHealthy(isHealthy);
			} finally {
				if (!mountedRef.current) return;
				if (refreshOptions.showLoading) {
					setLoading(false);
				}
			}
		},
		[],
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
		const retryAfterDelayMs = Math.max(0, retryAfterUntilMsRef.current - Date.now());
		const nextDelayMs = Math.max(transientRetryDelayMs, retryAfterDelayMs);

		pollTimerRef.current = window.setTimeout(() => {
			void refreshState({ includeHealth: false, showLoading: false }).then(() => {
				if (!mountedRef.current) return;
				scheduleNextPoll();
			});
		}, nextDelayMs);
	}, [clearPollTimer, refreshState]);

	const refreshNow = useCallback(async (): Promise<void> => {
		await refreshState({ includeHealth: true, showLoading: true });
		scheduleNextPoll();
	}, [refreshState, scheduleNextPoll]);

	useEffect(() => {
		mountedRef.current = true;
		retryAfterUntilMsRef.current = 0;
		transientRetryCountRef.current = 0;
		setHealthy(null);
		setPaired(false);
		setError("");
		setLoading(true);

		void refreshState({ includeHealth: true, showLoading: true }).then(() => {
			if (!mountedRef.current) return;
			scheduleNextPoll();
		});

		return () => {
			mountedRef.current = false;
			clearPollTimer();
		};
	}, [clearPollTimer, refreshState, scheduleNextPoll, userId]);

	useEffect(() => {
		const handleFocus = () => {
			void refreshState({ includeHealth: false, showLoading: false }).then(() => {
				if (!mountedRef.current) return;
				scheduleNextPoll();
			});
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
			void refreshState({ includeHealth: false, showLoading: false }).then(() => {
				if (!mountedRef.current) return;
				scheduleNextPoll();
			});
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
