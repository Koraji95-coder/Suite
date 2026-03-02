import { type ColorScheme, hexToRgba } from "@/lib/palette";

interface CoordinatesGrabberHeaderProps {
	palette: ColorScheme;
}

export function CoordinatesGrabberHeader({
	palette,
}: CoordinatesGrabberHeaderProps) {
	return (
		<div
			className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between"
			style={{ borderBottomColor: hexToRgba(palette.primary, 0.1) }}
		>
			<div>
				<h1
					style={{
						margin: "0 0 4px 0",
						fontSize: "20px",
						fontWeight: "600",
						color: palette.text,
					}}
				>
					Coordinates Grabber
				</h1>
				<p
					style={{
						margin: "0",
						fontSize: "12px",
						color: palette.textMuted,
					}}
				>
					Extract coordinate points from CAD drawings
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-1">
				<div
					title="Coming soon: Presets"
					style={{
						padding: "6px 8px",
						borderRadius: "4px",
						border: `1px dashed ${hexToRgba(palette.primary, 0.3)}`,
						background: hexToRgba(palette.primary, 0.05),
						color: palette.textMuted,
						fontSize: "11px",
						cursor: "not-allowed",
						opacity: 0.5,
					}}
				>
					Presets (coming soon)
				</div>
				<div
					style={{
						fontSize: "24px",
						fontWeight: "700",
						color: palette.primary,
						opacity: 0.7,
						marginLeft: "6px",
					}}
				>
					📍
				</div>
			</div>
		</div>
	);
}
