import { type ColorScheme, hexToRgba } from "@/lib/palette";
import {
	configCardStyle,
	configTitleStyle,
} from "./CoordinatesGrabberConfigStyles";
import type { LiveBackendStatus } from "./CoordinatesGrabberModels";

interface CoordinatesGrabberBackendStatusPanelProps {
	palette: ColorScheme;
	backendConnected: boolean;
	wsConnected: boolean;
	liveBackendStatus: LiveBackendStatus;
	liveStatusStamp: string;
	addLog: (message: string) => void;
}

export function CoordinatesGrabberBackendStatusPanel({
	palette,
	backendConnected,
	wsConnected,
	liveBackendStatus,
	liveStatusStamp,
	addLog,
}: CoordinatesGrabberBackendStatusPanelProps) {
	return (
		<div style={{ ...configCardStyle(palette), gridColumn: "1 / -1" }}>
			<h3 style={configTitleStyle(palette)}>Backend Status</h3>
			<div
				style={{
					padding: backendConnected ? "8px 12px" : "12px",
					borderRadius: "6px",
					background: backendConnected
						? hexToRgba("#51cf66", 0.1)
						: hexToRgba("#ffa94d", 0.06),
					border: `1px solid ${
						backendConnected
							? hexToRgba("#51cf66", 0.3)
							: hexToRgba("#ffa94d", 0.2)
					}`,
					fontSize: "11px",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: "8px",
						marginBottom: backendConnected ? "6px" : "10px",
					}}
				>
					<span style={{ color: palette.textMuted, fontSize: "10px" }}>
						WebSocket stream
					</span>
					<span
						style={{
							color: wsConnected ? "#51cf66" : "#ffa94d",
							fontSize: "10px",
							fontWeight: 600,
						}}
					>
						{wsConnected ? "● LIVE" : "○ OFFLINE"}
					</span>
				</div>
				{backendConnected ? (
					<div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
						<span style={{ color: "#51cf66" }}>● Connected to AutoCAD</span>
						<span style={{ color: palette.textMuted, fontSize: "10px" }}>
							Drawing:{" "}
							{liveBackendStatus.drawingOpen
								? (liveBackendStatus.drawingName ?? "Open")
								: "No drawing open"}
						</span>
						<span style={{ color: palette.textMuted, fontSize: "10px" }}>
							Last live update: {liveStatusStamp}
						</span>
					</div>
				) : (
					<div
						style={{ display: "flex", flexDirection: "column", gap: "10px" }}
					>
						<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
							<span style={{ color: "#ffa94d" }}>○ Backend not detected</span>
							<span style={{ color: palette.textMuted, fontSize: "10px" }}>
								(live stream + 10s polling fallback)
							</span>
						</div>
						{liveBackendStatus.error ? (
							<div style={{ color: "#ffa94d", fontSize: "10px" }}>
								Last backend error: {liveBackendStatus.error}
							</div>
						) : null}
						<div
							style={{
								color: palette.textMuted,
								fontSize: "11px",
								lineHeight: "1.6",
							}}
						>
							<div
								style={{
									fontWeight: "600",
									color: palette.text,
									marginBottom: "6px",
									fontSize: "12px",
								}}
							>
								How to start the backend:
							</div>
							<div
								style={{ display: "flex", flexDirection: "column", gap: "8px" }}
							>
								<div>
									<span style={{ color: palette.text, fontWeight: "500" }}>
										Option 1
									</span>
									<span style={{ color: palette.textMuted }}>
										{" "}
										-- From the project folder, run:
									</span>
									<div
										onClick={() => {
											navigator.clipboard.writeText("npm run backend:coords");
											addLog("[INFO] Copied startup command to clipboard");
										}}
										style={{
											marginTop: "4px",
											padding: "6px 10px",
											borderRadius: "4px",
											background: hexToRgba(palette.background, 0.8),
											border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
											fontFamily: "monospace",
											fontSize: "11px",
											color: palette.primary,
											cursor: "pointer",
											display: "flex",
											justifyContent: "space-between",
											alignItems: "center",
										}}
									>
										<span>npm run backend:coords</span>
										<span
											style={{ fontSize: "10px", color: palette.textMuted }}
										>
											click to copy
										</span>
									</div>
								</div>
								<div>
									<span style={{ color: palette.text, fontWeight: "500" }}>
										Option 2
									</span>
									<span style={{ color: palette.textMuted }}>
										{" "}
										-- Double-click{" "}
									</span>
									<code
										style={{
											padding: "1px 5px",
											borderRadius: "3px",
											background: hexToRgba(palette.background, 0.8),
											border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
											fontFamily: "monospace",
											fontSize: "10px",
											color: palette.text,
										}}
									>
										start_api_server.bat
									</code>
								</div>
								<div
									style={{
										fontSize: "10px",
										color: palette.textMuted,
										borderTop: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
										paddingTop: "6px",
									}}
								>
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
