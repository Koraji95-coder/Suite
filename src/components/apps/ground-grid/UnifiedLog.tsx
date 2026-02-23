import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { type LogEntry, useGroundGrid } from "./GroundGridContext";

const SOURCE_COLORS: Record<LogEntry["source"], string> = {
	grabber: "#3b82f6",
	generator: "#f59e0b",
	system: "#94a3b8",
};

const SOURCE_LABELS: Record<LogEntry["source"], string> = {
	grabber: "GRABBER",
	generator: "GRID",
	system: "SYSTEM",
};

function getMessageColor(
	msg: string,
	palette: { textMuted: string; primary: string },
): string {
	if (msg.includes("[ERROR]")) return "#ef4444";
	if (msg.includes("[SUCCESS]")) return "#22c55e";
	if (msg.includes("[WARNING]")) return "#f59e0b";
	if (msg.includes("[PROCESSING]")) return palette.primary;
	return palette.textMuted;
}

export function UnifiedLog() {
	const { palette } = useTheme();
	const { logs, clearLogs } = useGroundGrid();
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [logs.length]);

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100%",
				padding: 16,
				gap: 8,
			}}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<div style={{ fontSize: 13, fontWeight: 600, color: palette.text }}>
					Unified Log
					<span
						style={{
							fontSize: 11,
							fontWeight: 400,
							color: palette.textMuted,
							marginLeft: 8,
						}}
					>
						{logs.length} entries
					</span>
				</div>
				<button
					onClick={clearLogs}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 4,
						padding: "4px 10px",
						borderRadius: 4,
						border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
						background: "transparent",
						color: palette.textMuted,
						fontSize: 11,
						cursor: "pointer",
					}}
				>
					<Trash2 size={12} /> Clear
				</button>
			</div>

			<div
				style={{
					display: "flex",
					gap: 12,
					fontSize: 10,
					color: palette.textMuted,
				}}
			>
				{Object.entries(SOURCE_LABELS).map(([key, label]) => (
					<span
						key={key}
						style={{ display: "flex", alignItems: "center", gap: 4 }}
					>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: 2,
								background: SOURCE_COLORS[key as LogEntry["source"]],
								display: "inline-block",
							}}
						/>
						{label}
					</span>
				))}
			</div>

			<div
				ref={scrollRef}
				style={{
					flex: 1,
					overflow: "auto",
					padding: 12,
					borderRadius: 6,
					background: hexToRgba(palette.background, 0.5),
					border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
					fontFamily: "monospace",
					fontSize: 11,
				}}
			>
				{logs.length === 0 ? (
					<div
						style={{
							color: palette.textMuted,
							textAlign: "center",
							padding: 40,
						}}
					>
						No log entries yet. Activity from Coordinate Grabber and Grid
						Generator will appear here.
					</div>
				) : (
					logs.map((entry, idx) => (
						<div
							key={idx}
							style={{
								padding: "3px 0",
								display: "flex",
								gap: 8,
								color: getMessageColor(entry.message, palette),
							}}
						>
							<span style={{ color: palette.textMuted, flexShrink: 0 }}>
								{entry.timestamp}
							</span>
							<span
								style={{
									fontSize: 9,
									fontWeight: 700,
									flexShrink: 0,
									padding: "1px 4px",
									borderRadius: 2,
									background: hexToRgba(SOURCE_COLORS[entry.source], 0.15),
									color: SOURCE_COLORS[entry.source],
									lineHeight: "16px",
								}}
							>
								{SOURCE_LABELS[entry.source]}
							</span>
							<span>{entry.message}</span>
						</div>
					))
				)}
			</div>
		</div>
	);
}
