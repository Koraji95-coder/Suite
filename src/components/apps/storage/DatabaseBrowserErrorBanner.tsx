import { AlertTriangle } from "lucide-react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";

interface DatabaseBrowserErrorBannerProps {
	palette: ColorScheme;
	error: string | null;
	onDismiss: () => void;
}

export function DatabaseBrowserErrorBanner({
	palette,
	error,
	onDismiss,
}: DatabaseBrowserErrorBannerProps) {
	if (!error) return null;

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "10px 14px",
				marginBottom: 12,
				borderRadius: 8,
				background: hexToRgba(palette.accent, 0.12),
				border: `1px solid ${hexToRgba(palette.accent, 0.3)}`,
				color: palette.accent,
				fontSize: 13,
			}}
		>
			<AlertTriangle className="w-4 h-4" style={{ flexShrink: 0 }} />
			<span style={{ flex: 1 }}>{error}</span>
			<button
				onClick={onDismiss}
				style={{
					background: "none",
					border: "none",
					cursor: "pointer",
					color: palette.accent,
					fontWeight: 600,
					fontSize: 13,
				}}
			>
				Dismiss
			</button>
		</div>
	);
}
