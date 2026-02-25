import type { ColorScheme } from "@/lib/palette";
import { hexToRgba } from "@/lib/palette";

export function bubbleStyle(
	palette: ColorScheme,
	tint: string = palette.primary,
): React.CSSProperties {
	return {
		background: `linear-gradient(180deg, ${hexToRgba(palette.surface, 0.7)} 0%, ${hexToRgba(tint, 0.08)} 100%)`,
		border: `1px solid ${hexToRgba(palette.text, 0.08)}`,
		borderRadius: "1rem",
		boxShadow: `0 6px 18px ${hexToRgba("#000000", 0.18)}, inset 0 1px 0 ${hexToRgba("#ffffff", 0.06)}`,
	};
}

export function softButtonStyle(
	palette: ColorScheme,
	tint: string = palette.primary,
): React.CSSProperties {
	return {
		background: hexToRgba(tint, 0.12),
		border: `1px solid ${hexToRgba(tint, 0.25)}`,
		borderRadius: "0.9rem",
		boxShadow: `inset 0 1px 0 ${hexToRgba("#ffffff", 0.08)}`,
	};
}
