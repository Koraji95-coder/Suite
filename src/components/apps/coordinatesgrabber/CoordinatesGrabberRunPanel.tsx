import { Loader } from "lucide-react";
import { ProgressBar } from "@/data/ProgressBar";
import type { ColorScheme } from "@/lib/palette";
import { configCardStyle } from "./CoordinatesGrabberConfigStyles";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";

interface CoordinatesGrabberRunPanelProps {
	state: CoordinatesGrabberState;
	palette: ColorScheme;
	progress: number;
	backendConnected: boolean;
	handleLayerSearch: () => Promise<void>;
	handleSelectionRefresh: () => Promise<void>;
}

export function CoordinatesGrabberRunPanel({
	state,
	palette,
	progress,
	backendConnected,
	handleLayerSearch,
	handleSelectionRefresh,
}: CoordinatesGrabberRunPanelProps) {
	return (
		<div style={{ ...configCardStyle(palette), gridColumn: "1 / -1" }}>
			{state.isRunning && (
				<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
					<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
						<Loader
							size={14}
							className="animate-spin"
							style={{ color: palette.primary }}
						/>
						<span
							style={{
								fontSize: "12px",
								color: palette.textMuted,
								fontWeight: 500,
							}}
						>
							{progress < 30
								? "Scanning layers..."
								: progress < 60
									? "Extracting vertices..."
									: progress < 90
										? "Building Excel..."
										: "Finalizing..."}
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
					{state.isRunning ? "⏳ Running..." : "▶ Run Layer Search"}
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
						🔄 Refresh
					</button>
				)}
			</div>
		</div>
	);
}
