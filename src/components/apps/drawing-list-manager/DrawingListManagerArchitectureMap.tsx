import { type ColorScheme, hexToRgba } from "@/lib/palette";
import type { DrawingListManagerArchitectureMap } from "./useDrawingListManagerState";

interface DrawingListManagerArchitectureMapProps {
	palette: ColorScheme;
	architectureMap: DrawingListManagerArchitectureMap;
}

export function DrawingListManagerArchitectureMap({
	palette,
	architectureMap,
}: DrawingListManagerArchitectureMapProps) {
	return (
		<div
			style={{
				padding: 18,
				borderRadius: 16,
				border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
				background: `linear-gradient(120deg, ${hexToRgba(palette.surfaceLight, 0.2)} 0%, ${hexToRgba(palette.surface, 0.7)} 100%)`,
			}}
		>
			<h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
				Architecture Map
			</h3>
			<p style={{ margin: "6px 0 0", fontSize: 12, color: palette.textMuted }}>
				Summarized by sheet type for quick reporting.
			</p>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
					gap: 12,
					marginTop: 12,
				}}
			>
				{architectureMap.map(([type, count]) => (
					<div
						key={type}
						style={{
							padding: 12,
							borderRadius: 12,
							border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
							background: hexToRgba(palette.surfaceLight, 0.35),
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
						}}
					>
						<div style={{ fontSize: 12, color: palette.textMuted }}>{type}</div>
						<div style={{ fontSize: 16, fontWeight: 700 }}>{count}</div>
					</div>
				))}
			</div>
		</div>
	);
}
