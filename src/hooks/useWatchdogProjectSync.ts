import { useEffect, useRef } from "react";
import { useAuth } from "@/auth/useAuth";
import { logger } from "@/lib/logger";
import {
	syncSharedDrawingActivityFromLocalRuntime,
	syncSharedProjectWatchdogRulesToLocalRuntime,
} from "@/services/projectWatchdogService";

const MIN_SYNC_INTERVAL_MS = 15_000;

export function useWatchdogProjectSync(): void {
	const { user } = useAuth();
	const inFlightRef = useRef<Promise<void> | null>(null);
	const lastCompletedAtRef = useRef(0);

	useEffect(() => {
		if (!user?.id) {
			lastCompletedAtRef.current = 0;
			inFlightRef.current = null;
			return;
		}

		const runSync = async (force: boolean = false) => {
			if (!user?.id) {
				return;
			}
			const now = Date.now();
			if (!force && now - lastCompletedAtRef.current < MIN_SYNC_INTERVAL_MS) {
				return;
			}
			if (inFlightRef.current) {
				return inFlightRef.current;
			}

			const job = (async () => {
				try {
					await syncSharedProjectWatchdogRulesToLocalRuntime();
				} catch (error) {
					logger.warn(
						"Shared watchdog project rule sync failed.",
						"useWatchdogProjectSync",
						error,
					);
				}

				try {
					await syncSharedDrawingActivityFromLocalRuntime();
				} catch (error) {
					logger.warn(
						"Shared watchdog drawing activity sync failed.",
						"useWatchdogProjectSync",
						error,
					);
				}

				lastCompletedAtRef.current = Date.now();
			})().finally(() => {
				inFlightRef.current = null;
			});

			inFlightRef.current = job;
			return job;
		};

		void runSync(true);

		const handleFocus = () => {
			void runSync(false);
		};
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				void runSync(false);
			}
		};

		window.addEventListener("focus", handleFocus);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			window.removeEventListener("focus", handleFocus);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [user?.id]);
}
