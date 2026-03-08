// src/lib/tokens.ts
// Design system utilities backed by CSS variables

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type Size = "xs" | "sm" | "md" | "lg" | "xl";
export type Color =
	| "default"
	| "primary"
	| "accent"
	| "success"
	| "warning"
	| "danger"
	| "info";
export type Variant = "solid" | "soft" | "outline" | "ghost";

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const layout = {
	sidebarWidth: 240,
	sidebarCollapsed: 64,
	headerHeight: 56,
	maxContentWidth: 1400,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Z-INDEX SCALE
// ═══════════════════════════════════════════════════════════════════════════

export const zIndex = {
	base: 0,
	dropdown: 45,
	sticky: 48,
	sheet: 50,
	toast: 60,
	modal: 70,
	command: 80,
	tooltip: 90,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/** Convert hex to rgba */
export function hexToRgba(hex: string, alpha: number): string {
	const clean = hex.replace("#", "");
	if (clean.length !== 6) return `rgba(0,0,0,${alpha})`;
	const r = parseInt(clean.slice(0, 2), 16);
	const g = parseInt(clean.slice(2, 4), 16);
	const b = parseInt(clean.slice(4, 6), 16);
	return `rgba(${r},${g},${b},${alpha})`;
}

/** Get contrasting text color */
export function contrastText(
	hex: string,
	light = "#ffffff",
	dark = "#0a0f1a",
): string {
	const clean = hex.replace("#", "");
	if (clean.length !== 6) return light;
	const r = parseInt(clean.slice(0, 2), 16) / 255;
	const g = parseInt(clean.slice(2, 4), 16) / 255;
	const b = parseInt(clean.slice(4, 6), 16) / 255;
	const toLinear = (v: number) =>
		v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	const luminance =
		0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
	return luminance > 0.5 ? dark : light;
}
