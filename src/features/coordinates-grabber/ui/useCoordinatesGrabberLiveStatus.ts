import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { coordinatesGrabberService } from "@/features/cad-runtime/coordinatesGrabberService";
import { useCadRuntime } from "@/features/cad-runtime/CadRuntimeContext";
import type { LiveBackendStatus } from "./CoordinatesGrabberModels";

interface UseCoordinatesGrabberLiveStatusOptions {
	addLog: (message: string) => void;
	activeRunIdRef: MutableRefObject<string | null>;
}

export function useCoordinatesGrabberLiveStatus({
	addLog,
	activeRunIdRef,
}: UseCoordinatesGrabberLiveStatusOptions) {
	const {
		liveBackendStatus: sharedLiveBackendStatus,
		reconnectBackend,
		wsLastUpdate,
		wsLive,
	} = useCadRuntime();
	const [wsConnected, setWsConnected] = useState(wsLive);
	const [lastWsEventAt, setLastWsEventAt] = useState<number | null>(null);
	const [liveBackendStatus, setLiveBackendStatus] = useState<LiveBackendStatus>(
		sharedLiveBackendStatus,
	);
	const [progress, setProgress] = useState(0);
	const [progressStage, setProgressStage] = useState<string>("");
	const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const progressResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	const startProgressSimulation = useCallback(() => {
		setProgress(5);
		setProgressStage("processing");
		let current = 5;
		if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
		progressIntervalRef.current = setInterval(() => {
			current += Math.random() * 3 + 0.5;
			if (current >= 90) current = 90;
			setProgress(Math.round(current));
		}, 400);
	}, []);

	const clearProgressResetTimeout = useCallback(() => {
		if (progressResetTimeoutRef.current) {
			clearTimeout(progressResetTimeoutRef.current);
			progressResetTimeoutRef.current = null;
		}
	}, []);

	const queueProgressReset = useCallback(
		(delayMs = 600) => {
			clearProgressResetTimeout();
			progressResetTimeoutRef.current = setTimeout(() => {
				setProgress(0);
				setProgressStage("");
				progressResetTimeoutRef.current = null;
			}, delayMs);
		},
		[clearProgressResetTimeout],
	);

	const finishProgress = useCallback(() => {
		if (progressIntervalRef.current) {
			clearInterval(progressIntervalRef.current);
			progressIntervalRef.current = null;
		}
		setProgress(100);
		queueProgressReset(600);
	}, [queueProgressReset]);

	const reconnectLiveStream = useCallback(async () => {
		const ok = await reconnectBackend();
		if (ok) {
			setLastWsEventAt(Date.now());
			addLog("[INFO] Reconnected WebSocket live stream");
		} else {
			addLog("[WARNING] WebSocket reconnect failed");
		}
	}, [addLog, reconnectBackend]);

	useEffect(() => {
		setWsConnected(wsLive);
	}, [wsLive]);

	useEffect(() => {
		setLiveBackendStatus(sharedLiveBackendStatus);
	}, [sharedLiveBackendStatus]);

	useEffect(() => {
		if (!wsLastUpdate) return;
		setLastWsEventAt((prev) => (prev && prev > wsLastUpdate ? prev : wsLastUpdate));
	}, [wsLastUpdate]);

	useEffect(() => {
		let mounted = true;

		const unsubscribeProgress = coordinatesGrabberService.on(
			"progress",
			(event) => {
				if (!mounted || event.type !== "progress") return;
				const activeRunId = activeRunIdRef.current;
				const eventRunId = event.run_id ? String(event.run_id) : null;
				if (activeRunId && eventRunId && activeRunId !== eventRunId) return;
				const next = Math.max(0, Math.min(100, Math.round(event.progress)));
				setProgress(next);
				setProgressStage(event.stage);
				setLastWsEventAt(Date.now());
			},
		);

		const unsubscribeComplete = coordinatesGrabberService.on(
			"complete",
			(event) => {
				if (!mounted || event.type !== "complete") return;
				const activeRunId = activeRunIdRef.current;
				const eventRunId = event.run_id ? String(event.run_id) : null;
				if (activeRunId && eventRunId && activeRunId !== eventRunId) return;
				finishProgress();
			},
		);

		const unsubscribeWsError = coordinatesGrabberService.on(
			"error",
			(event) => {
				if (!mounted || event.type !== "error") return;
				const activeRunId = activeRunIdRef.current;
				const eventRunId = event.run_id ? String(event.run_id) : null;
				if (activeRunId && eventRunId && activeRunId !== eventRunId) return;
				finishProgress();
			},
		);

		return () => {
			mounted = false;
			unsubscribeProgress();
			unsubscribeComplete();
			unsubscribeWsError();
		};
	}, [activeRunIdRef, finishProgress]);

	useEffect(() => {
		return () => {
			if (progressIntervalRef.current) {
				clearInterval(progressIntervalRef.current);
			}
			if (progressResetTimeoutRef.current) {
				clearTimeout(progressResetTimeoutRef.current);
				progressResetTimeoutRef.current = null;
			}
		};
	}, []);

	const liveStatusStamp = liveBackendStatus.lastUpdated
		? new Date(liveBackendStatus.lastUpdated).toLocaleTimeString()
		: "--";
	const wsLastEventStamp = lastWsEventAt
		? new Date(lastWsEventAt).toLocaleTimeString()
		: "--";

	return {
		finishProgress,
		liveBackendStatus,
		liveStatusStamp,
		progress,
		progressStage,
		queueProgressReset,
		reconnectLiveStream,
		setProgress,
		setProgressStage,
		startProgressSimulation,
		wsConnected,
		wsLastEventStamp,
		setLastWsEventAt,
	};
}
