import { useEffect } from "react";
import { useAuth } from "@/auth/useAuth";
import { logger } from "@/lib/logger";
import {
	syncSharedDrawingActivityFromLocalRuntime,
	syncSharedProjectWatchdogRulesToLocalRuntime,
} from "@/services/projectWatchdogService";

const MIN_SYNC_INTERVAL_MS = 15_000;
const INITIAL_SYNC_DELAY_MS = 1_200;
const INITIAL_SYNC_IDLE_TIMEOUT_MS = 5_000;
const WATCHDOG_PROJECT_SYNC_STORAGE_KEY_PREFIX =
	"watchdog-project-sync:last-completed:";

const inFlightSyncJobs = new Map<string, Promise<void>>();

function buildLastCompletedStorageKey(userId: string): string {
	return `${WATCHDOG_PROJECT_SYNC_STORAGE_KEY_PREFIX}${userId}`;
}

function readLastCompletedAt(userId: string): number {
	if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
		return 0;
	}

	try {
		const raw = window.localStorage.getItem(buildLastCompletedStorageKey(userId));
		const parsed = Number.parseInt(String(raw ?? ""), 10);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
	} catch {
		return 0;
	}
}

function writeLastCompletedAt(userId: string, timestamp: number): void {
	if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(
			buildLastCompletedStorageKey(userId),
			String(timestamp),
		);
	} catch {
		// Ignore storage failures and keep sync scheduling non-fatal.
	}
}

function scheduleInitialSync(callback: () => void): () => void {
	if (typeof window === "undefined") {
		return () => undefined;
	}

	if (typeof window.requestIdleCallback === "function") {
		const idleHandle = window.requestIdleCallback(
			() => {
				callback();
			},
			{ timeout: INITIAL_SYNC_IDLE_TIMEOUT_MS },
		);

		return () => {
			if (typeof window.cancelIdleCallback === "function") {
				window.cancelIdleCallback(idleHandle);
			}
		};
	}

	const timeoutHandle = window.setTimeout(() => {
		callback();
	}, INITIAL_SYNC_DELAY_MS);

	return () => {
		window.clearTimeout(timeoutHandle);
	};
}

export function useWatchdogProjectSync(): void {
	const { user } = useAuth();

	useEffect(() => {
		const userId = String(user?.id ?? "").trim();
		if (!userId) {
			return;
		}

		const runSync = async () => {
			if (!userId) {
				return;
			}

			const now = Date.now();
			if (now - readLastCompletedAt(userId) < MIN_SYNC_INTERVAL_MS) {
				return;
			}

			const existingJob = inFlightSyncJobs.get(userId);
			if (existingJob) {
				return existingJob;
			}

			const job = (async () => {
				let syncFailed = false;

				try {
					await syncSharedProjectWatchdogRulesToLocalRuntime();
				} catch (error) {
					syncFailed = true;
					logger.warn(
						"Shared watchdog project rule sync failed.",
						"useWatchdogProjectSync",
						error,
					);
				}

				try {
					await syncSharedDrawingActivityFromLocalRuntime();
				} catch (error) {
					syncFailed = true;
					logger.warn(
						"Shared watchdog drawing activity sync failed.",
						"useWatchdogProjectSync",
						error,
					);
				}

				if (!syncFailed) {
					writeLastCompletedAt(userId, Date.now());
				}
			})().finally(() => {
				if (inFlightSyncJobs.get(userId) === job) {
					inFlightSyncJobs.delete(userId);
				}
			});

			inFlightSyncJobs.set(userId, job);
			return job;
		};

		const cancelInitialSync = scheduleInitialSync(() => {
			void runSync();
		});

		const handleFocus = () => {
			void runSync();
		};
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				void runSync();
			}
		};

		window.addEventListener("focus", handleFocus);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			cancelInitialSync();
			window.removeEventListener("focus", handleFocus);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [user?.id]);
}
