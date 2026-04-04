import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { type LogEntry, useGroundGrid } from "./GroundGridContext";
import styles from "./UnifiedLog.module.css";

const SOURCE_LABELS: Record<LogEntry["source"], string> = {
	grabber: "GRABBER",
	generator: "GRID",
	system: "SYSTEM",
};

const SOURCE_CLASS_MAP: Record<LogEntry["source"], string> = {
	grabber: styles.sourceGrabber,
	generator: styles.sourceGenerator,
	system: styles.sourceSystem,
};

function getMessageToneClass(message: string): string {
	if (message.includes("[ERROR]")) return styles.messageError;
	if (message.includes("[SUCCESS]")) return styles.messageSuccess;
	if (message.includes("[WARNING]")) return styles.messageWarning;
	if (message.includes("[PROCESSING]")) return styles.messageProcessing;
	return styles.messageDefault;
}

function isNearBottom(element: HTMLElement, thresholdPx = 64): boolean {
	const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
	return remaining <= thresholdPx;
}

export function UnifiedLog() {
	const { logs, clearLogs, wsLastUpdate, wsLive } = useGroundGrid();

	const scrollRef = useRef<HTMLDivElement>(null);
	const shouldAutoScrollRef = useRef(true);

	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;

		const onScroll = () => {
			shouldAutoScrollRef.current = isNearBottom(element);
		};

		element.addEventListener("scroll", onScroll, { passive: true });
		shouldAutoScrollRef.current = isNearBottom(element);
		return () => element.removeEventListener("scroll", onScroll);
	}, []);

	useEffect(() => {
		const element = scrollRef.current;
		if (!element || !shouldAutoScrollRef.current || logs.length === 0) return;
		element.scrollTop = element.scrollHeight;
	}, [logs]);

	const wsLiveStamp = wsLastUpdate
		? new Date(wsLastUpdate).toLocaleTimeString()
		: "--";

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<div className={styles.headerMeta}>
					<div className={styles.title}>
						Unified Log
						<span className={styles.entryCount}>{logs.length} entries</span>
					</div>
					<div
						className={cn(
							styles.wsStatus,
							wsLive ? styles.wsStatusLive : styles.wsStatusOffline,
						)}
						title={`Last WebSocket update: ${wsLiveStamp}`}
					>
						<span
							className={cn(
								styles.wsIndicator,
								wsLive ? styles.wsIndicatorLive : styles.wsIndicatorOffline,
							)}
						/>
						<span>{wsLive ? "WS Live" : "WS Offline"}</span>
					</div>
				</div>

				<button type="button" onClick={clearLogs} className={styles.clearButton}>
					<Trash2 size={12} />
					Clear
				</button>
			</div>

			<div className={styles.legend}>
				{Object.entries(SOURCE_LABELS).map(([key, label]) => (
					<span key={key} className={styles.legendItem}>
						<span
							className={cn(
								styles.legendSwatch,
								SOURCE_CLASS_MAP[key as LogEntry["source"]],
							)}
						/>
						{label}
					</span>
				))}
			</div>

			<div ref={scrollRef} className={styles.logViewport}>
				{logs.length === 0 ? (
					<div className={styles.emptyState}>
						No log entries yet. Activity from Coordinate Grabber and Grid
						Generator will appear here.
					</div>
				) : (
					logs.map((entry, index) => (
						<div
							key={`${entry.timestamp}-${index}`}
							className={cn(styles.logRow, getMessageToneClass(entry.message))}
						>
							<span className={styles.timestamp}>{entry.timestamp}</span>
							<span
								className={cn(
									styles.sourceBadge,
									SOURCE_CLASS_MAP[entry.source],
								)}
							>
								{SOURCE_LABELS[entry.source]}
							</span>
							<span className={styles.message}>{entry.message}</span>
						</div>
					))
				)}
			</div>
		</div>
	);
}
