import { Loader } from "lucide-react";
import { ProgressBar } from "@/data/ProgressBar";
import type { ColorScheme } from "@/lib/palette";
import { cn } from "@/lib/utils";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";
import styles from "./CoordinatesGrabberRunPanel.module.css";

interface CoordinatesGrabberRunPanelProps {
	state: CoordinatesGrabberState;
	palette: ColorScheme;
	progress: number;
	progressStage: string;
	backendConnected: boolean;
	handleLayerSearch: () => Promise<void>;
	handleSelectionRefresh: () => Promise<void>;
}

export function CoordinatesGrabberRunPanel({
	state,
	palette: _palette,
	progress,
	progressStage,
	backendConnected,
	handleLayerSearch,
	handleSelectionRefresh,
}: CoordinatesGrabberRunPanelProps) {
	const getStageLabel = (stage: string, pct: number): string => {
		switch (stage) {
			case "initializing":
				return "Initializing AutoCAD connection...";
			case "preparing":
				return "Preparing extraction...";
			case "scanning":
				return "Scanning entities...";
			case "inserting_blocks":
				return "Inserting blocks and labels...";
			case "exporting_excel":
				return "Exporting Excel...";
			case "completed":
				return "Finalizing...";
			case "failed":
				return "Run failed";
			default:
				return pct < 30
					? "Scanning layers..."
					: pct < 60
						? "Extracting vertices..."
						: pct < 90
							? "Building Excel..."
							: "Finalizing...";
		}
	};

	return (
		<div className={styles.root}>
			{state.isRunning && (
				<div className={styles.progressWrap}>
					<div className={styles.progressHeader}>
						<Loader size={14} className={styles.spinner} />
						<span className={styles.progressLabel}>
							{getStageLabel(progressStage, progress)}
						</span>
					</div>
					<ProgressBar progress={progress} />
				</div>
			)}
			<div className={styles.actions}>
				<button
					onClick={() => void handleLayerSearch()}
					disabled={state.isRunning || !backendConnected}
					className={cn(
						styles.primaryAction,
						(state.isRunning || !backendConnected) &&
							styles.primaryActionDisabled,
					)}
				>
					{state.isRunning ? "Extracting..." : "Start Extraction"}
				</button>
				{state.scanSelection && (
					<button
						onClick={() => void handleSelectionRefresh()}
						disabled={!backendConnected || state.isRunning}
						className={cn(
							styles.secondaryAction,
							(!backendConnected || state.isRunning) &&
								styles.secondaryActionDisabled,
						)}
					>
						Refresh Selection
					</button>
				)}
			</div>
		</div>
	);
}
