import { type ColorScheme, hexToRgba } from "@/lib/palette";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";

interface CoordinatesGrabberHistoryTabProps {
	state: CoordinatesGrabberState;
	palette: ColorScheme;
}

export function CoordinatesGrabberHistoryTab({
	state,
	palette,
}: CoordinatesGrabberHistoryTabProps) {
	return (
		<div
			style={{
				flex: 1,
				overflow: "auto",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "12px",
					padding: "12px",
				}}
			>
				{state.performanceMetrics && (
					<div
						style={{
							padding: "12px",
							borderRadius: "8px",
							background: hexToRgba(palette.primary, 0.1),
							border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
						}}
					>
						<h3
							style={{
								margin: "0 0 8px 0",
								fontSize: "13px",
								fontWeight: "600",
								color: palette.text,
								textTransform: "uppercase",
								letterSpacing: "0.5px",
							}}
						>
							Latest Metrics
						</h3>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: "8px",
								fontSize: "12px",
								color: palette.textMuted,
							}}
						>
							<div>
								Points:{" "}
								<strong>{state.performanceMetrics.pointsCreated}</strong>
							</div>
							<div>
								Duration:{" "}
								<strong>{state.performanceMetrics.duration.toFixed(2)}s</strong>
							</div>
							<div>
								Rate:{" "}
								<strong>{state.performanceMetrics.pointsPerSecond}</strong>
								/s
							</div>
							<div>
								Time:{" "}
								<strong>
									{new Date(
										state.performanceMetrics.startTime,
									).toLocaleTimeString()}
								</strong>
							</div>
						</div>
					</div>
				)}

				{state.executionHistory.length === 0 ? (
					<p
						style={{
							color: palette.textMuted,
							fontSize: "12px",
							textAlign: "center",
							margin: "20px 0",
						}}
					>
						No execution history yet. Start extraction to see results here.
					</p>
				) : (
					state.executionHistory.map((entry, idx) => (
						<div
							key={idx}
							style={{
								padding: "12px",
								borderRadius: "8px",
								background: entry.success
									? hexToRgba("#51cf66", 0.05)
									: hexToRgba("#ff6b6b", 0.05),
								border: `1px solid ${
									entry.success
										? hexToRgba("#51cf66", 0.2)
										: hexToRgba("#ff6b6b", 0.2)
								}`,
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "8px",
									marginBottom: "8px",
								}}
							>
								<span
									style={{
										fontSize: "14px",
										color: entry.success ? "#51cf66" : "#ff6b6b",
									}}
								>
									{entry.success ? "OK" : "FAIL"}
								</span>
								<span
									style={{
										color: palette.text,
										fontSize: "12px",
										fontWeight: "600",
									}}
								>
									{entry.config.layerName || entry.config.mode}
								</span>
								<span
									style={{
										color: palette.textMuted,
										fontSize: "11px",
										marginLeft: "auto",
									}}
								>
									{new Date(entry.timestamp).toLocaleTimeString()}
								</span>
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: "8px",
									fontSize: "11px",
									color: palette.textMuted,
								}}
							>
								<div>Extracted: {entry.pointsCreated || "-"}</div>
								<div>Duration: {entry.duration.toFixed(2)}s</div>
							</div>
							{entry.message && !entry.success && (
								<div
									style={{
										marginTop: "8px",
										fontSize: "11px",
										color: "#ff6b6b",
										fontStyle: "italic",
									}}
								>
									{entry.message}
								</div>
							)}
						</div>
					))
				)}
			</div>
		</div>
	);
}
