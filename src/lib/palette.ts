// src/lib/palette.ts
import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
} from "react";

export interface ColorScheme {
	name: string;
	description: string;
	background: string;
	surface: string;
	surfaceLight: string;
	primary: string;
	secondary: string;
	tertiary: string;
	accent: string;
	text: string;
	textMuted: string;
	glow: string;
}

export const DEFAULT_SCHEME_KEY = "suiteDark";

export const COLOR_SCHEMES: Record<string, ColorScheme> = {
	[DEFAULT_SCHEME_KEY]: {
		name: "Suite Dark",
		description: "Graphite and brass control-room theme",
		background: "#090d12",
		surface: "#121821",
		surfaceLight: "#1a2230",
		primary: "#c7a05c",
		secondary: "#6a7788",
		tertiary: "#8a5f51",
		accent: "#86663a",
		text: "#ece7dc",
		textMuted: "#a79f92",
		glow: "rgba(115, 144, 255, 0.2)",
	},
};

// --- Helpers (pure functions) ---
export function hexToRgba(hex: string, alpha: number): string {
	const normalized = hex.replace("#", "");
	if (normalized.length !== 6) return `rgba(0, 0, 0, ${alpha})`;
	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getContrastText(
	hex: string,
	light = "#ffffff",
	dark = "#0b1020",
): string {
	const normalized = hex.replace("#", "");
	if (normalized.length !== 6) return light;

	const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
	const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
	const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;

	const toLinear = (v: number) =>
		v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

	const lum =
		0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

	return lum > 0.6 ? dark : light;
}

/** Lighten a hex color by a percentage */
function lightenHex(hex: string, percent: number): string {
	const normalized = hex.replace("#", "");
	if (normalized.length !== 6) return hex;

	const r = Math.min(
		255,
		Math.floor(Number.parseInt(normalized.slice(0, 2), 16) * (1 + percent)),
	);
	const g = Math.min(
		255,
		Math.floor(Number.parseInt(normalized.slice(2, 4), 16) * (1 + percent)),
	);
	const b = Math.min(
		255,
		Math.floor(Number.parseInt(normalized.slice(4, 6), 16) * (1 + percent)),
	);

	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function glassCardStyle(
	palette: ColorScheme,
	tint: string = palette.primary,
): React.CSSProperties {
	return {
		background: `linear-gradient(135deg, ${hexToRgba(tint, 0.12)} 0%, ${hexToRgba(palette.surface, 0.5)} 50%, ${hexToRgba(tint, 0.06)} 100%)`,
		backdropFilter: "blur(24px) saturate(1.4)",
		WebkitBackdropFilter: "blur(24px) saturate(1.4)",
		border: `1px solid ${hexToRgba(tint, 0.18)}`,
		borderRadius: "1rem",
		boxShadow: [
			`0 8px 32px ${hexToRgba(tint, 0.1)}`,
			`inset 1px 1px 0 ${hexToRgba("#ffffff", 0.06)}`,
			`inset -1px -1px 0 ${hexToRgba("#000000", 0.12)}`,
		].join(", "),
		position: "relative" as const,
		overflow: "clip" as const,
	};
}

export function glassCardInnerStyle(
	palette: ColorScheme,
	tint: string = palette.primary,
): React.CSSProperties {
	return {
		background: `linear-gradient(135deg, ${hexToRgba(tint, 0.06)} 0%, ${hexToRgba(palette.surface, 0.25)} 100%)`,
		border: `1px solid ${hexToRgba(tint, 0.1)}`,
		borderRadius: "0.75rem",
		boxShadow: `inset 1px 1px 0 ${hexToRgba("#ffffff", 0.04)}, inset -1px -1px 0 ${hexToRgba("#000000", 0.08)}`,
		transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
	};
}

export const GLASS_SPECULAR_GRADIENT = `linear-gradient(135deg, ${hexToRgba(
	"#ffffff",
	0.12,
)} 0%, transparent 50%)`;

// --- Theme Context ---
interface ThemeContextValue {
	palette: ColorScheme;
	schemeKey: string;
	setScheme: (key: string) => void;
	schemeKeys: string[];
}

const ThemeContext = createContext<ThemeContextValue>({
	palette: COLOR_SCHEMES[DEFAULT_SCHEME_KEY],
	schemeKey: DEFAULT_SCHEME_KEY,
	setScheme: () => undefined,
	schemeKeys: Object.keys(COLOR_SCHEMES),
});

export function useTheme() {
	return useContext(ThemeContext);
}

interface ThemeProviderProps {
	children: React.ReactNode;
	defaultScheme?: string;
}

function applyThemeTokens(palette: ColorScheme, schemeKey: string) {
	const rootStyle = document.documentElement.style;

	document.documentElement.dataset.theme = schemeKey;

	// ═══════════════════════════════════════════════════════════════════════════
	// BACKGROUNDS
	// ═══════════════════════════════════════════════════════════════════════════
	rootStyle.setProperty("--bg", palette.background);
	rootStyle.setProperty("--bg-subtle", palette.background);
	rootStyle.setProperty("--surface-0", palette.background);

	// ═══════════════════════════════════════════════════════════════════════════
	// SURFACES
	// ═══════════════════════════════════════════════════════════════════════════
	rootStyle.setProperty("--surface", palette.surface);
	rootStyle.setProperty("--surface-2", palette.surfaceLight);
	rootStyle.setProperty("--surface-elevated", lightenHex(palette.surfaceLight, 0.12));
	rootStyle.setProperty("--surface-strong", lightenHex(palette.surfaceLight, 0.2));

	// ═══════════════════════════════════════════════════════════════════════════
	// BORDERS
	// ═══════════════════════════════════════════════════════════════════════════
	rootStyle.setProperty("--border", hexToRgba(palette.text, 0.08));
	rootStyle.setProperty("--border-subtle", hexToRgba(palette.text, 0.04));
	rootStyle.setProperty("--border-strong", hexToRgba(palette.text, 0.14));

	// ═══════════════════════════════════════════════════════════════════════════
	// TEXT
	// ═══════════════════════════════════════════════════════════════════════════
	rootStyle.setProperty("--text", palette.text);
	rootStyle.setProperty("--text-muted", palette.textMuted);
	rootStyle.setProperty("--text-strong", getContrastText(palette.background, "#f7f1e5", "#111"));

	// ═══════════════════════════════════════════════════════════════════════════
	// BRAND COLORS
	// ═══════════════════════════════════════════════════════════════════════════
	rootStyle.setProperty("--primary", palette.primary);
	rootStyle.setProperty("--primary-hover", lightenHex(palette.primary, 0.15));
	rootStyle.setProperty("--primary-contrast", getContrastText(palette.primary));

	rootStyle.setProperty("--accent", palette.accent);
	rootStyle.setProperty("--brand-gold", lightenHex(palette.primary, 0.08));
	rootStyle.setProperty("--secondary", palette.secondary);
	rootStyle.setProperty("--tertiary", palette.tertiary);

	// ═══════════════════════════════════════════════════════════════════════════
	// STATUS COLORS
	// ═══════════════════════════════════════════════════════════════════════════
	rootStyle.setProperty("--success", "#4ea972");
	rootStyle.setProperty("--warning", "#c89a4d");
	rootStyle.setProperty("--danger", "#cf6a5b");
	rootStyle.setProperty("--info", "#7390ff");

	// ═══════════════════════════════════════════════════════════════════════════
	// EFFECTS
	// ═══════════════════════════════════════════════════════════════════════════
	rootStyle.setProperty("--glow", palette.glow);
	rootStyle.setProperty("--focus-ring", hexToRgba("#7390ff", 0.28));

	// ═══════════════════════════════════════════════════════════════════════════
	// SHADOWS
	// ═══════════════════════════════════════════════════════════════════════════
	rootStyle.setProperty(
		"--shadow-sm",
		"0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)",
	);
	rootStyle.setProperty("--shadow-md", "0 4px 12px rgba(0,0,0,0.35)");
	rootStyle.setProperty("--shadow-lg", "0 8px 30px rgba(0,0,0,0.4)");
}

export function ThemeProvider({ children, defaultScheme }: ThemeProviderProps) {
	const resolvedScheme =
		defaultScheme && COLOR_SCHEMES[defaultScheme]
			? defaultScheme
			: DEFAULT_SCHEME_KEY;
	const palette = COLOR_SCHEMES[resolvedScheme];
	const schemeKeys = useMemo(() => Object.keys(COLOR_SCHEMES), []);

	const setScheme = useCallback((_key: string) => {
		// Intentionally no-op: Suite now uses one unified fixed theme.
	}, []);

	useEffect(() => {
		applyThemeTokens(palette, resolvedScheme);
	}, [palette, resolvedScheme]);

	const value = useMemo<ThemeContextValue>(
		() => ({
			palette,
			schemeKey: resolvedScheme,
			setScheme,
			schemeKeys,
		}),
		[palette, resolvedScheme, setScheme, schemeKeys],
	);

	return React.createElement(ThemeContext.Provider, { value }, children);
}
