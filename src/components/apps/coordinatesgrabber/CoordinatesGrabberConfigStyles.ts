import type { CSSProperties } from "react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";

export function configCardStyle(palette: ColorScheme): CSSProperties {
	return {
		padding: "12px",
		borderRadius: "8px",
		background: hexToRgba(palette.surface, 0.5),
		border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
	};
}

export function configTitleStyle(palette: ColorScheme): CSSProperties {
	return {
		margin: "0 0 12px 0",
		fontSize: "13px",
		fontWeight: "600",
		color: palette.text,
		textTransform: "uppercase",
		letterSpacing: "0.5px",
	};
}

export function configInputStyle(palette: ColorScheme): CSSProperties {
	return {
		marginTop: "4px",
		width: "100%",
		padding: "8px",
		borderRadius: "4px",
		border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
		background: hexToRgba(palette.background, 0.8),
		color: palette.text,
		fontSize: "12px",
		boxSizing: "border-box",
	};
}
