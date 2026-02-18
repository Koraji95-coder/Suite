/**
 * palette.ts -- Centralized color theme system
 *
 * Replaces the former lib/three/emberPalette.ts. Provides:
 *   - ColorScheme type and 11 built-in schemes (including new default "Graphite Cyan")
 *   - ThemeProvider / useTheme() React context for reactive theme switching
 *   - Pure helper functions: hexToRgba, glassCardStyle, glassCardInnerStyle
 *
 * All components should import from here instead of the old path.
 */
import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

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

// --- 11 Built-in Schemes ---

export const COLOR_SCHEMES: Record<string, ColorScheme> = {
  graphiteCyan: {
    name: "Graphite Cyan",
    description: "Cool graphite base with teal-cyan accent -- modern engineering IDE",
    background: "#0E1117",
    surface: "#161B22",
    surfaceLight: "#21262D",
    primary: "#2DD4BF",
    secondary: "#64748B",
    tertiary: "#F59E0B",
    accent: "#F43F5E",
    text: "#F0F6FC",
    textMuted: "#8B949E",
    glow: "rgba(45, 212, 191, 0.15)",
  },
  frostSteel: {
    name: "Frost & Steel",
    description: "Cool, professional, modern -- like a high-tech control room",
    background: "#0B0E14",
    surface: "#141A24",
    surfaceLight: "#1E2633",
    primary: "#4A90E2",
    secondary: "#50C878",
    tertiary: "#9B59B6",
    accent: "#E67E22",
    text: "#E8ECF2",
    textMuted: "#8F9BB3",
    glow: "rgba(74, 144, 226, 0.20)",
  },
  twilightNebula: {
    name: "Twilight Nebula",
    description: "Purple-blue, moody, rich -- futuristic and immersive",
    background: "#0C0717",
    surface: "#1E1530",
    surfaceLight: "#2E2347",
    primary: "#7B2CBF",
    secondary: "#3A86FF",
    tertiary: "#FF006E",
    accent: "#8338EC",
    text: "#F8F0FC",
    textMuted: "#B8B0D0",
    glow: "rgba(123, 44, 191, 0.20)",
  },
  slateCoral: {
    name: "Slate & Coral",
    description: "Neutral base + warm accent -- clean and editorial",
    background: "#121212",
    surface: "#1E1E1E",
    surfaceLight: "#2C2C2C",
    primary: "#FF6B6B",
    secondary: "#4ECDC4",
    tertiary: "#FFD93D",
    accent: "#A8DADC",
    text: "#F5F5F5",
    textMuted: "#A0A0A0",
    glow: "rgba(255, 107, 107, 0.20)",
  },
  oceanDepths: {
    name: "Ocean Depths",
    description: "Blue-green, calm, trustworthy -- deep sea engineering",
    background: "#0A1929",
    surface: "#1E3A5F",
    surfaceLight: "#2B4C7C",
    primary: "#00B4D8",
    secondary: "#48CAE4",
    tertiary: "#F9C74F",
    accent: "#F9844A",
    text: "#EDF2F7",
    textMuted: "#9CB4D4",
    glow: "rgba(0, 180, 216, 0.20)",
  },
  midnightEmerald: {
    name: "Midnight Emerald",
    description: "Green-gold, luxury, natural -- organic and memorable",
    background: "#0F2417",
    surface: "#1A3A24",
    surfaceLight: "#26592F",
    primary: "#F4D03F",
    secondary: "#E67E22",
    tertiary: "#3498DB",
    accent: "#9B59B6",
    text: "#ECF0F1",
    textMuted: "#95A5A6",
    glow: "rgba(244, 208, 63, 0.20)",
  },
  carbonCrimson: {
    name: "Carbon Crimson",
    description: "Dark carbon fiber with crimson edge -- high-performance racing",
    background: "#0D0D0F",
    surface: "#1A1A1E",
    surfaceLight: "#27272D",
    primary: "#DC2626",
    secondary: "#F97316",
    tertiary: "#FACC15",
    accent: "#06B6D4",
    text: "#FAFAFA",
    textMuted: "#A1A1AA",
    glow: "rgba(220, 38, 38, 0.20)",
  },
  arcticAurora: {
    name: "Arctic Aurora",
    description: "Northern lights over dark skies -- ethereal and luminous",
    background: "#070B14",
    surface: "#0F1A2E",
    surfaceLight: "#182D4A",
    primary: "#22D3EE",
    secondary: "#34D399",
    tertiary: "#C084FC",
    accent: "#F472B6",
    text: "#F0F9FF",
    textMuted: "#94A3B8",
    glow: "rgba(34, 211, 238, 0.20)",
  },
  copperCircuit: {
    name: "Copper Lattice",
    description: "Deep charcoal with warm copper metallics -- industrial lattice",
    background: "#111014",
    surface: "#1C1A1F",
    surfaceLight: "#2A272E",
    primary: "#CD7F32",
    secondary: "#DDA15E",
    tertiary: "#BC6C25",
    accent: "#606C38",
    text: "#FEFAE0",
    textMuted: "#9C9590",
    glow: "rgba(205, 127, 50, 0.20)",
  },
  neonMatrix: {
    name: "Neon Matrix",
    description: "Cyberpunk neon green on black -- hacker terminal vibes",
    background: "#030712",
    surface: "#0A1120",
    surfaceLight: "#111B2E",
    primary: "#00FF88",
    secondary: "#00D4FF",
    tertiary: "#FF2E97",
    accent: "#BF00FF",
    text: "#E0FFE0",
    textMuted: "#6B8F71",
    glow: "rgba(0, 255, 136, 0.20)",
  },
  desertDusk: {
    name: "Desert Dusk",
    description: "Warm terracotta and sand -- earthy, inviting, and grounded",
    background: "#1A1410",
    surface: "#2A2118",
    surfaceLight: "#3D3024",
    primary: "#E07A5F",
    secondary: "#F2CC8F",
    tertiary: "#81B29A",
    accent: "#3D405B",
    text: "#F4F1DE",
    textMuted: "#B5A898",
    glow: "rgba(224, 122, 95, 0.20)",
  },
};

export const DEFAULT_SCHEME_KEY = "copperCircuit";

// --- Helpers (pure functions) ---

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function glassCardStyle(
  palette: ColorScheme,
  tint: string = palette.primary
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
  tint: string = palette.primary
): React.CSSProperties {
  return {
    background: `linear-gradient(135deg, ${hexToRgba(tint, 0.06)} 0%, ${hexToRgba(palette.surface, 0.25)} 100%)`,
    border: `1px solid ${hexToRgba(tint, 0.1)}`,
    borderRadius: "0.75rem",
    boxShadow: `inset 1px 1px 0 ${hexToRgba("#ffffff", 0.04)}, inset -1px -1px 0 ${hexToRgba("#000000", 0.08)}`,
    transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
  };
}

export const GLASS_SPECULAR_GRADIENT = `linear-gradient(135deg, ${hexToRgba("#ffffff", 0.12)} 0%, transparent 50%)`;

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
  setScheme: () => {},
  schemeKeys: Object.keys(COLOR_SCHEMES),
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "app-theme-scheme";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultScheme?: string;
}

export function ThemeProvider({ children, defaultScheme }: ThemeProviderProps) {
  const [schemeKey, setSchemeKey] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && COLOR_SCHEMES[stored]) return stored;
    } catch { /* noop */ }
    return defaultScheme || DEFAULT_SCHEME_KEY;
  });

  const setScheme = useCallback((key: string) => {
    if (!COLOR_SCHEMES[key]) return;
    setSchemeKey(key);
    try { localStorage.setItem(STORAGE_KEY, key); } catch { /* noop */ }
  }, []);

  const schemeKeys = useMemo(() => Object.keys(COLOR_SCHEMES), []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      palette: COLOR_SCHEMES[schemeKey],
      schemeKey,
      setScheme,
      schemeKeys,
    }),
    [schemeKey, setScheme, schemeKeys]
  );

  return React.createElement(ThemeContext.Provider, { value }, children);
}

