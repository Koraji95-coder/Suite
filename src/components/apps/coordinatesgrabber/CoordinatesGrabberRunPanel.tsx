import { Loader } from "lucide-react";
import { ProgressBar } from "@/data/ProgressBar";
import type { ColorScheme } from "@/lib/palette";
import { configCardStyle } from "./CoordinatesGrabberConfigStyles";
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
	palette,
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
		<div style={{ ...configCardStyle(palette), gridColumn: "1 / -1" }}>
			{state.isRunning && (
				<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
					<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
						<Loader
							size={14}
							className={styles.spinner}
							style={{ color: palette.primary }}
						/>
						<span
							style={{
								fontSize: "12px",
								color: palette.textMuted,
								fontWeight: 500,
							}}
						>
							{getStageLabel(progressStage, progress)}
						</span>
					</div>
					<ProgressBar progress={progress} />
				</div>
			)}
			<div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
				<button
					onClick={() => void handleLayerSearch()}
					disabled={state.isRunning || !backendConnected}
					style={{
						flex: 1,
						minWidth: "180px",
						padding: "10px 16px",
						borderRadius: "6px",
						border: "none",
						background: backendConnected ? palette.primary : palette.textMuted,
						color: backendConnected
							? palette.background
							: "rgba(255,255,255,0.5)",
						fontWeight: "600",
						fontSize: "13px",
						cursor:
							backendConnected && !state.isRunning ? "pointer" : "not-allowed",
						opacity: state.isRunning ? 0.6 : 1,
						transition: "opacity 0.2s",
					}}
					onMouseEnter={(e) => {
						if (!state.isRunning && backendConnected) {
							(e.currentTarget as HTMLButtonElement).style.opacity = "0.9";
						}
					}}
					onMouseLeave={(e) => {
						if (!state.isRunning && backendConnected) {
							(e.currentTarget as HTMLButtonElement).style.opacity = "1";
						}
					}}
				>
					{state.isRunning ? "Extracting..." : "Start Extraction"}
				</button>
				{state.mode === "blocks" && (
					<button
						onClick={() => void handleSelectionRefresh()}
						disabled={!backendConnected}
						style={{
							padding: "10px 16px",
							borderRadius: "6px",
							border: `1px solid ${palette.primary}`,
							background: "transparent",
							color: backendConnected ? palette.primary : palette.textMuted,
							fontWeight: "600",
							fontSize: "13px",
							cursor: backendConnected ? "pointer" : "not-allowed",
						}}
					>
						Refresh
					</button>
				)}
			</div>
		</div>
	);
}
