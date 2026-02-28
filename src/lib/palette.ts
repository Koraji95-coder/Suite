// src/lib/palette.ts
/**
 * palette.ts -- Centralized color theme system
 *
 * Provides:
 *   - ColorScheme type and built-in schemes
 *   - ThemeProvider / useTheme()
 *   - Helper functions: hexToRgba, getContrastText,
 *     glassCardStyle, glassCardInnerStyle, GLASS_SPECULAR_GRADIENT
 *
 * Theme animation:
 *   - Adds `html.theme-animating` briefly during setScheme to avoid global perf costs.
 */
import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

// --- Color Scheme Type ---
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

// --- Schemes ---
export const COLOR_SCHEMES: Record<string, ColorScheme> = {
	graphiteCyan: {
		name: "Graphite Cyan",
		description: "Cool graphite base with teal-cyan accent",
		background: "#0E1117",
		surface: "#161B22",
		surfaceLight: "#21262D",
		primary: "#2DD4BF",
		secondary: "#64748B",
		tertiary: "#F59E0B",
		accent: "#60A5FA",
		text: "#F0F6FC",
		textMuted: "#8B949E",
		glow: "rgba(45, 212, 191, 0.15)",
	},
	slateCoral: {
		name: "Slate & Coral",
		description: "Neutral base + warm accent",
		background: "#121212",
		surface: "#1E1E1E",
		surfaceLight: "#2C2C2C",
		primary: "#FF6B6B",
		secondary: "#4ECDC4",
		tertiary: "#FFD93D",
		accent: "#2563EB",
		text: "#F5F5F5",
		textMuted: "#A0A0A0",
		glow: "rgba(255, 107, 107, 0.20)",
	},
	oceanDepths: {
		name: "Ocean Depths",
		description: "Blue-green, calm, trustworthy",
		background: "#0A1929",
		surface: "#0F2743",
		surfaceLight: "#153356",
		primary: "#00B4D8",
		secondary: "#48CAE4",
		tertiary: "#F9C74F",
		accent: "#22C55E",
		text: "#EDF2F7",
		textMuted: "#9CB4D4",
		glow: "rgba(0, 180, 216, 0.20)",
	},
	twilightNebula: {
		name: "Twilight Nebula",
		description: "Purple-blue, moody, rich",
		background: "#0C0717",
		surface: "#1E1530",
		surfaceLight: "#2E2347",
		primary: "#7B2CBF",
		secondary: "#3A86FF",
		tertiary: "#FF006E",
		accent: "#F472B6",
		text: "#F8F0FC",
		textMuted: "#B8B0D0",
		glow: "rgba(123, 44, 191, 0.20)",
	},
	desertDusk: {
		name: "Desert Dusk",
		description: "Warm terracotta and sand",
		background: "#1A1410",
		surface: "#2A2118",
		surfaceLight: "#3D3024",
		primary: "#E07A5F",
		secondary: "#F2CC8F",
		tertiary: "#81B29A",
		accent: "#F59E0B",
		text: "#F4F1DE",
		textMuted: "#B5A898",
		glow: "rgba(224, 122, 95, 0.20)",
	},
	steelMint: {
		name: "Steel Mint",
		description: "Cool steel + mint accent",
		background: "#0B1320",
		surface: "#101F33",
		surfaceLight: "#162A45",
		primary: "#34D399",
		secondary: "#93C5FD",
		tertiary: "#F59E0B",
		accent: "#93C5FD",
		text: "#EAF2FF",
		textMuted: "#9AA9C0",
		glow: "rgba(52, 211, 153, 0.16)",
	},
	indigoFog: {
		name: "Indigo Fog",
		description: "Indigo base + soft violet",
		background: "#0D1024",
		surface: "#141A36",
		surfaceLight: "#1B2450",
		primary: "#A78BFA",
		secondary: "#60A5FA",
		tertiary: "#F472B6",
		accent: "#60A5FA",
		text: "#EFF2FF",
		textMuted: "#A8ACD8",
		glow: "rgba(167, 139, 250, 0.16)",
	},
	forestSignal: {
		name: "Forest Signal",
		description: "Deep green + signal lime",
		background: "#071613",
		surface: "#0B221D",
		surfaceLight: "#103129",
		primary: "#A3E635",
		secondary: "#22C55E",
		tertiary: "#60A5FA",
		accent: "#22C55E",
		text: "#EAFBF5",
		textMuted: "#98B8AE",
		glow: "rgba(163, 230, 53, 0.16)",
	},
	copperSlate: {
		name: "Copper Slate",
		description: "Warm slate + copper metallic",
		background: "#0F1116",
		surface: "#171A22",
		surfaceLight: "#222633",
		primary: "#FB923C",
		secondary: "#FBBF24",
		tertiary: "#60A5FA",
		accent: "#FBBF24",
		text: "#F4F7FF",
		textMuted: "#A5AEC2",
		glow: "rgba(251, 146, 60, 0.16)",
	},
};

export const DEFAULT_SCHEME_KEY = "graphiteCyan";

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

/**
 * ✅ RESTORED EXPORTS (so PanelInfoDialog.tsx and others keep working)
 */
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

const STORAGE_KEY = "app-theme-scheme";
const LEGACY_BLOCKFLOW_STORAGE_KEY = "blockflow-theme";

/**
 * Legacy mapping:
 * If older builds stored "v5/ember/noir/aurora", map them to modern keys.
 */
const LEGACY_THEME_TO_SCHEME: Record<string, string> = {
	v5: "graphiteCyan",
	ember: "desertDusk",
	noir: "graphiteCyan",
	aurora: "oceanDepths",
};

function normalizeSchemeKey(raw: string | null | undefined): string | null {
	if (!raw) return null;
	if (COLOR_SCHEMES[raw]) return raw;
	return LEGACY_THEME_TO_SCHEME[raw] ?? null;
}

interface ThemeProviderProps {
	children: React.ReactNode;
	defaultScheme?: string;
}

function applyThemeTokens(palette: ColorScheme, schemeKey: string) {
	const rootStyle = document.documentElement.style;

	document.documentElement.dataset.theme = schemeKey;

	rootStyle.setProperty("--bg", palette.background);
	rootStyle.setProperty("--bg-base", palette.background);
	rootStyle.setProperty("--bg-mid", hexToRgba(palette.background, 0.72));
	rootStyle.setProperty("--bg-heavy", hexToRgba(palette.background, 0.86));

	rootStyle.setProperty("--surface", palette.surface);
	rootStyle.setProperty("--surface-2", palette.surfaceLight);

	rootStyle.setProperty("--border", hexToRgba(palette.text, 0.1));

	rootStyle.setProperty("--text", palette.text);
	rootStyle.setProperty("--text-muted", palette.textMuted);

	rootStyle.setProperty("--primary", palette.primary);
	rootStyle.setProperty("--primary-contrast", getContrastText(palette.primary));

	rootStyle.setProperty("--accent", palette.accent);

	rootStyle.setProperty("--success", "#22c55e");
	rootStyle.setProperty("--danger", "#ef4444");
}

function startThemeAnimation(durationMs = 220) {
	const el = document.documentElement;
	el.classList.add("theme-animating");
	window.setTimeout(() => el.classList.remove("theme-animating"), durationMs);
}

export function ThemeProvider({ children, defaultScheme }: ThemeProviderProps) {
	const [schemeKey, setSchemeKey] = useState<string>(() => {
		try {
			const stored = normalizeSchemeKey(localStorage.getItem(STORAGE_KEY));
			if (stored) return stored;

			const legacy = normalizeSchemeKey(
				localStorage.getItem(LEGACY_BLOCKFLOW_STORAGE_KEY),
			);
			if (legacy) return legacy;
		} catch {
			/* noop */
		}
		return normalizeSchemeKey(defaultScheme) || DEFAULT_SCHEME_KEY;
	});

	const schemeKeys = useMemo(() => Object.keys(COLOR_SCHEMES), []);

	const schemeKeyRef = useRef(schemeKey);
	useEffect(() => {
		schemeKeyRef.current = schemeKey;
	}, [schemeKey]);

	const setScheme = useCallback((key: string) => {
		if (!COLOR_SCHEMES[key]) return;
		if (key === schemeKeyRef.current) return;

		startThemeAnimation();
		setSchemeKey(key);

		try {
			localStorage.setItem(STORAGE_KEY, key);
		} catch {
			/* noop */
		}
	}, []);

	useEffect(() => {
		const p = COLOR_SCHEMES[schemeKey];
		applyThemeTokens(p, schemeKey);

		try {
			localStorage.setItem(STORAGE_KEY, schemeKey);
		} catch {
			/* noop */
		}
	}, [schemeKey]);

	const value = useMemo<ThemeContextValue>(
		() => ({
			palette: COLOR_SCHEMES[schemeKey],
			schemeKey,
			setScheme,
			schemeKeys,
		}),
		[schemeKey, setScheme, schemeKeys],
	);

	return React.createElement(ThemeContext.Provider, { value }, children);
}