import type { ColorScheme } from "@/lib/palette";
import { cn } from "@/lib/utils";
import styles from "./CoordinatesGrabberBackendStatusPanel.module.css";
import type { LiveBackendStatus } from "./CoordinatesGrabberModels";

interface CoordinatesGrabberBackendStatusPanelProps {
	palette: ColorScheme;
	backendConnected: boolean;
	wsConnected: boolean;
	liveBackendStatus: LiveBackendStatus;
	liveStatusStamp: string;
	wsLastEventStamp: string;
	reconnectLiveStream: () => Promise<void>;
	addLog: (message: string) => void;
}

export function CoordinatesGrabberBackendStatusPanel({
	palette: _palette,
	backendConnected,
	wsConnected,
	liveBackendStatus,
	liveStatusStamp,
	wsLastEventStamp,
	reconnectLiveStream,
	addLog,
}: CoordinatesGrabberBackendStatusPanelProps) {
	return (
		<div className={styles.root}>
			<h3 className={styles.title}>Backend Status</h3>
			<div
				className={cn(
					styles.statusCard,
					backendConnected ? styles.statusCardOnline : styles.statusCardOffline,
				)}
			>
				<div className={styles.streamRow}>
					<span className={styles.streamLabel}>WebSocket stream</span>
					<span
						className={wsConnected ? styles.liveState : styles.offlineState}
					>
						{wsConnected ? "LIVE" : "OFFLINE"}
					</span>
				</div>
				<div className={styles.streamRow}>
					<span className={styles.streamLabel}>
						Last stream event: {wsLastEventStamp}
					</span>
					<button
						onClick={() => void reconnectLiveStream()}
						className={styles.reconnectButton}
					>
						Reconnect Stream
					</button>
				</div>
				{backendConnected ? (
					<div className={styles.infoStack}>
						<span className={styles.onlineText}>Connected to AutoCAD</span>
						<span className={styles.mutedText}>
							Drawing:{" "}
							{liveBackendStatus.drawingOpen
								? (liveBackendStatus.drawingName ?? "Open")
								: "No drawing open"}
						</span>
						<span className={styles.mutedText}>
							Last live update: {liveStatusStamp}
						</span>
					</div>
				) : (
					<div className={styles.offlineStack}>
						<div className={styles.inlineRow}>
							<span className={styles.warningText}>Backend not detected</span>
							<span className={styles.mutedText}>
								(live stream + 10s polling fallback)
							</span>
						</div>
						{liveBackendStatus.error ? (
							<div className={styles.warningText}>
								Last backend error: {liveBackendStatus.error}
							</div>
						) : null}
						<div className={styles.instructions}>
							<div className={styles.instructionsTitle}>
								How to start the backend:
							</div>
							<div className={styles.infoStack}>
								<div>
									<span className={styles.sectionLabel}>Option 1</span>
									<span className={styles.mutedText}>
										{" "}
										-- From the project folder, run:
									</span>
									<div
										onClick={() => {
											navigator.clipboard.writeText("npm run backend:coords");
											addLog("[INFO] Copied startup command to clipboard");
										}}
										className={styles.commandLine}
									>
										<span>npm run backend:coords</span>
										<span className={styles.commandHint}>click to copy</span>
									</div>
								</div>
								<div>
									<span className={styles.sectionLabel}>Option 2</span>
									<span className={styles.mutedText}> -- Double-click </span>
									<code className={styles.inlineCode}>
										start_api_server.bat
									</code>
								</div>
								<div className={styles.requirements}>
									Requires: Python 3.9+, AutoCAD, and Windows
								</div>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
