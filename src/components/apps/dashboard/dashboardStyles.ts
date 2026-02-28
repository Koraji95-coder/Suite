import type { ColorScheme } from "@/lib/palette";
import { hexToRgba } from "@/lib/palette";

export function bubbleStyle(
	palette: ColorScheme,
	tint: string = palette.primary,
): React.CSSProperties {
	return {
		background: `linear-gradient(180deg, ${hexToRgba(palette.surface, 0.68)} 0%, ${hexToRgba(tint, 0.1)} 100%)`,
		border: `1px solid ${hexToRgba(palette.text, 0.07)}`,
		borderRadius: "1rem",
		boxShadow: `0 10px 24px ${hexToRgba("#000000", 0.16)}, inset 0 1px 0 ${hexToRgba("#ffffff", 0.07)}`,
	};
}

export function softButtonStyle(
	palette: ColorScheme,
	tint: string = palette.primary,
): React.CSSProperties {
	return {
		background: hexToRgba(tint, 0.13),
		border: `1px solid ${hexToRgba(tint, 0.27)}`,
		borderRadius: "0.9rem",
		boxShadow: `inset 0 1px 0 ${hexToRgba("#ffffff", 0.1)}`,
	};
}
