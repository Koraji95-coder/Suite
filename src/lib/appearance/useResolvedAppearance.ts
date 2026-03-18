import { useEffect, useMemo, useState } from "react";

export interface ResolvedAppearance {
	background: string;
	surface: string;
	surfaceElevated: string;
	primary: string;
	accent: string;
	tertiary: string;
	secondary: string;
	text: string;
	textMuted: string;
	success: string;
	warning: string;
	danger: string;
	info: string;
}

export const DEFAULT_RESOLVED_APPEARANCE: ResolvedAppearance = {
	background: "#0b0f17",
	surface: "#141b26",
	surfaceElevated: "#1c2533",
	primary: "#4f7cff",
	accent: "#d2a24c",
	tertiary: "#c46d52",
	secondary: "#72829a",
	text: "#e8edf6",
	textMuted: "#93a1b7",
	success: "#4ea972",
	warning: "#d2a24c",
	danger: "#cf6a5b",
	info: "#6f8dff",
};

const VARIABLE_MAP = {
	background: "--bg",
	surface: "--surface",
	surfaceElevated: "--surface-2",
	primary: "--primary",
	accent: "--accent",
	tertiary: "--tertiary",
	secondary: "--secondary",
	text: "--text",
	textMuted: "--text-muted",
	success: "--success",
	warning: "--warning",
	danger: "--danger",
	info: "--info",
} as const;

function readResolvedAppearance(): ResolvedAppearance {
	if (typeof window === "undefined") {
		return DEFAULT_RESOLVED_APPEARANCE;
	}

	const root = window.getComputedStyle(document.documentElement);
	return {
		background:
			root.getPropertyValue(VARIABLE_MAP.background).trim() ||
			DEFAULT_RESOLVED_APPEARANCE.background,
		surface:
			root.getPropertyValue(VARIABLE_MAP.surface).trim() ||
			DEFAULT_RESOLVED_APPEARANCE.surface,
		surfaceElevated:
			root.getPropertyValue(VARIABLE_MAP.surfaceElevated).trim() ||
			DEFAULT_RESOLVED_APPEARANCE.surfaceElevated,
		primary:
			root.getPropertyValue(VARIABLE_MAP.primary).trim() ||
			DEFAULT_RESOLVED_APPEARANCE.primary,
		accent:
			root.getPropertyValue(VARIABLE_MAP.accent).trim() ||
			DEFAULT_RESOLVED_APPEARANCE.accent,
		tertiary:
			root.getPropertyValue(VARIABLE_MAP.tertiary).trim() ||
			DEFAULT_RESOLVED_APPEARANCE.tertiary,
		secondary:
			root.getPropertyValue(VARIABLE_MAP.secondary).trim() ||
			DEFAULT_RESOLVED_APPEARANCE.secondary,
		text:
			root.getPropertyValue(VARIABLE_MAP.text).trim() ||
			DEFAULT_RESOLVED_APPEARANCE.text,
		textMuted:
			root.getPropertyValue(VARIABLE_MAP.textMuted).trim() ||
			DEFAULT_RESOLVED_APPEARANCE.textMuted,
		success:
			root.getPropertyValue(VARIABLE_MAP.success).trim() ||
			DEFAULT_RESOLVED_APPEARANCE.success,
		warning:
			root.getPropertyValue(VARIABLE_MAP.warning).trim() ||
			DEFAULT_RESOLVED_APPEARANCE.warning,
		danger:
			root.getPropertyValue(VARIABLE_MAP.danger).trim() ||
			DEFAULT_RESOLVED_APPEARANCE.danger,
		info:
			root.getPropertyValue(VARIABLE_MAP.info).trim() ||
			DEFAULT_RESOLVED_APPEARANCE.info,
	};
}

export function useResolvedAppearance(): ResolvedAppearance {
	const [appearance, setAppearance] = useState<ResolvedAppearance>(() =>
		readResolvedAppearance(),
	);

	useEffect(() => {
		setAppearance(readResolvedAppearance());
	}, []);

	return useMemo(() => appearance, [appearance]);
}
