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

export const COLOR_SCHEMES: Record<string, ColorScheme> = {
	// ═══════════════════════════════════════════════════════════════════════════
	// NEUTRAL / PROFESSIONAL
	// ═══════════════════════════════════════════════════════════════════════════

	midnight: {
		name: "Midnight",
		description: "Deep navy with cyan accents — focused and modern",
		background: "#0a0f1a",
		surface: "#111827",
		surfaceLight: "#1f2937",
		primary: "#22d3ee",
		secondary: "#64748b",
		tertiary: "#f59e0b",
		accent: "#818cf8",
		text: "#f1f5f9",
		textMuted: "#94a3b8",
		glow: "rgba(34, 211, 238, 0.15)",
	},

	graphite: {
		name: "Graphite",
		description: "Warm neutral gray with teal highlights",
		background: "#0e1117",
		surface: "#161b22",
		surfaceLight: "#21262d",
		primary: "#2dd4bf",
		secondary: "#6b7280",
		tertiary: "#f59e0b",
		accent: "#60a5fa",
		text: "#f0f6fc",
		textMuted: "#8b949e",
		glow: "rgba(45, 212, 191, 0.15)",
	},

	slate: {
		name: "Slate",
		description: "Cool blue-gray with bright blue accent",
		background: "#0f172a",
		surface: "#1e293b",
		surfaceLight: "#334155",
		primary: "#3b82f6",
		secondary: "#64748b",
		tertiary: "#f59e0b",
		accent: "#22d3ee",
		text: "#f8fafc",
		textMuted: "#94a3b8",
		glow: "rgba(59, 130, 246, 0.15)",
	},

	nexusCore: {
		name: "Nexus Core",
		description: "Deep navy command center with teal-cyan highlights",
		background: "#040a15",
		surface: "#0a1326",
		surfaceLight: "#0f1d37",
		primary: "#15e7d5",
		secondary: "#4f6c8d",
		tertiary: "#f2b94e",
		accent: "#4f8cff",
		text: "#eaf5ff",
		textMuted: "#8aa5c7",
		glow: "rgba(21, 231, 213, 0.18)",
	},

	nexusEmber: {
		name: "Nexus Ember",
		description: "Warm graphite command center with ember-amber accents",
		background: "#110a06",
		surface: "#1b110b",
		surfaceLight: "#2a1a11",
		primary: "#ff8a42",
		secondary: "#b09078",
		tertiary: "#ffba52",
		accent: "#ffd18a",
		text: "#fff4ea",
		textMuted: "#cda98d",
		glow: "rgba(255, 138, 66, 0.18)",
	},

	nexusOrchid: {
		name: "Nexus Orchid",
		description: "Midnight indigo command center with orchid-blue glow",
		background: "#07071a",
		surface: "#12122a",
		surfaceLight: "#1b1d3d",
		primary: "#8a7dff",
		secondary: "#7681a8",
		tertiary: "#69b4ff",
		accent: "#b06dff",
		text: "#f4f3ff",
		textMuted: "#a9a5dc",
		glow: "rgba(138, 125, 255, 0.18)",
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// WARM TONES
	// ═══════════════════════════════════════════════════════════════════════════

	ember: {
		name: "Ember",
		description: "Warm charcoal with orange-coral accent",
		background: "#18120e",
		surface: "#231a14",
		surfaceLight: "#2f241c",
		primary: "#f97316",
		secondary: "#a8a29e",
		tertiary: "#22c55e",
		accent: "#fbbf24",
		text: "#fafaf9",
		textMuted: "#a8a29e",
		glow: "rgba(249, 115, 22, 0.15)",
	},

	copper: {
		name: "Copper",
		description: "Dark bronze with warm metallic highlights",
		background: "#0f1116",
		surface: "#171a22",
		surfaceLight: "#222633",
		primary: "#fb923c",
		secondary: "#78716c",
		tertiary: "#60a5fa",
		accent: "#fbbf24",
		text: "#f4f7ff",
		textMuted: "#a5aec2",
		glow: "rgba(251, 146, 60, 0.16)",
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// COOL / NATURE TONES
	// ═══════════════════════════════════════════════════════════════════════════

	forest: {
		name: "Forest",
		description: "Deep green with lime accent — fresh and focused",
		background: "#071310",
		surface: "#0c1f1a",
		surfaceLight: "#132e26",
		primary: "#4ade80",
		secondary: "#6b7280",
		tertiary: "#60a5fa",
		accent: "#22d3ee",
		text: "#ecfdf5",
		textMuted: "#86efac",
		glow: "rgba(74, 222, 128, 0.12)",
	},

	ocean: {
		name: "Ocean",
		description: "Deep sea blue with bright cyan — calm and clear",
		background: "#0a1628",
		surface: "#0f2744",
		surfaceLight: "#163556",
		primary: "#06b6d4",
		secondary: "#64748b",
		tertiary: "#fbbf24",
		accent: "#22c55e",
		text: "#e0f2fe",
		textMuted: "#7dd3fc",
		glow: "rgba(6, 182, 212, 0.15)",
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// ACCENT / CREATIVE
	// ═══════════════════════════════════════════════════════════════════════════

	violet: {
		name: "Violet",
		description: "Deep purple with soft lavender — creative and rich",
		background: "#0d0a1a",
		surface: "#1a1528",
		surfaceLight: "#271f3d",
		primary: "#a78bfa",
		secondary: "#64748b",
		tertiary: "#f472b6",
		accent: "#818cf8",
		text: "#f5f3ff",
		textMuted: "#a5b4fc",
		glow: "rgba(167, 139, 250, 0.15)",
	},

	rose: {
		name: "Rose",
		description: "Deep gray with pink-coral accent — warm and inviting",
		background: "#12080a",
		surface: "#1c1012",
		surfaceLight: "#2a181c",
		primary: "#fb7185",
		secondary: "#78716c",
		tertiary: "#60a5fa",
		accent: "#f472b6",
		text: "#fff1f2",
		textMuted: "#fda4af",
		glow: "rgba(251, 113, 133, 0.15)",
	},
};

export const DEFAULT_SCHEME_KEY = "midnight";

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

	// ═══════════════════════════════════════════════════════════════════════════
	// BACKGROUNDS
	// ═══════════════════════════════════════════════════════════════════════════
	rootStyle.setProperty("--bg", palette.background);
	rootStyle.setProperty("--bg-subtle", palette.background);

	// ═══════════════════════════════════════════════════════════════════════════
	// SURFACES
	// ═══════════════════════════════════════════════════════════════════════════
	rootStyle.setProperty("--surface", palette.surface);
	rootStyle.setProperty("--surface-2", palette.surfaceLight);

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

	// ═══════════════════════════════════════════════════════════════════════════
	// BRAND COLORS
	// ═══════════════════════════════════════════════════════════════════════════
	rootStyle.setProperty("--primary", palette.primary);
	rootStyle.setProperty("--primary-hover", lightenHex(palette.primary, 0.15));
	rootStyle.setProperty("--primary-contrast", getContrastText(palette.primary));

	rootStyle.setProperty("--accent", palette.accent);
	rootStyle.setProperty("--secondary", palette.secondary);
	rootStyle.setProperty("--tertiary", palette.tertiary);

	// ═══════════════════════════════════════════════════════════════════════════
	// STATUS COLORS
	// ═══════════════════════════════════════════════════════════════════════════
	rootStyle.setProperty("--success", "#22c55e");
	rootStyle.setProperty("--warning", "#f59e0b");
	rootStyle.setProperty("--danger", "#ef4444");
	rootStyle.setProperty("--info", "#3b82f6");

	// ═══════════════════════════════════════════════════════════════════════════
	// EFFECTS
	// ═══════════════════════════════════════════════════════════════════════════
	rootStyle.setProperty("--glow", palette.glow);
	rootStyle.setProperty("--focus-ring", hexToRgba(palette.primary, 0.25));

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
