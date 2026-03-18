import type { AgentMarkState } from "./agentMarkState";
import type { AgentProfileId } from "./agentProfiles";

export type CrestDetailLevel = "micro" | "standard" | "hero";

type CrestPaint = {
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	opacity?: number;
	strokeLinecap?: "round" | "square" | "butt";
	strokeLinejoin?: "round" | "miter" | "bevel";
};

export type CrestVectorElement =
	| ({
			type: "path";
			d: string;
	  } & CrestPaint)
	| ({
			type: "circle";
			cx: number;
			cy: number;
			r: number;
	  } & CrestPaint)
	| ({
			type: "rect";
			x: number;
			y: number;
			width: number;
			height: number;
			rx?: number;
	  } & CrestPaint)
	| ({
			type: "line";
			x1: number;
			y1: number;
			x2: number;
			y2: number;
	  } & CrestPaint);

type CrestPalette = {
	shell: string;
	shellDeep: string;
	core: string;
	line: string;
	ink: string;
	accent: string;
	glow: string;
};

export interface AgentCrestDefinition {
	palette: CrestPalette;
	symbol: CrestVectorElement[];
	microSymbol: CrestVectorElement[];
	engraving: CrestVectorElement[];
}

export const CREST_SHELL_PATH =
	"M36 6C46.5 6 55.2 9.3 60 14.1V31.2C60 45.7 50.6 57 36 66C21.4 57 12 45.7 12 31.2V14.1C16.8 9.3 25.5 6 36 6Z";
export const CREST_CORE_PATH =
	"M36 14C43 14 48.8 16.1 52 19.4V31C52 40.7 46.5 48 36 54C25.5 48 20 40.7 20 31V19.4C23.2 16.1 29 14 36 14Z";

export const CREST_STATE_PHASES: Record<AgentMarkState, number[]> = {
	idle: [0],
	thinking: [0, 1, 2, 1],
	speaking: [0, 1, 2, 3],
	running: [0, 1, 2, 3],
	waiting: [0, 1],
	success: [0, 1, 2, 1],
	warning: [0, 1, 2],
	error: [0, 1, 2],
	focus: [0, 1, 2, 3, 2, 1],
};

export const CREST_VARIANTS: Record<AgentProfileId, AgentCrestDefinition> = {
	koro: {
		palette: {
			shell: "#2d3d62",
			shellDeep: "#1f2b46",
			core: "#32486f",
			line: "#7f96ba",
			ink: "#dce7fb",
			accent: "#4f7cff",
			glow: "#628cff",
		},
		microSymbol: [
			{ type: "circle", cx: 36, cy: 36, r: 7, fill: "var(--crest-accent)" },
			{ type: "circle", cx: 36, cy: 36, r: 3, fill: "var(--crest-ink)" },
		],
		symbol: [
			{
				type: "path",
				d: "M36 22L40.6 31.4L50 36L40.6 40.6L36 50L31.4 40.6L22 36L31.4 31.4Z",
				fill: "var(--crest-accent)",
				opacity: 0.95,
			},
			{
				type: "circle",
				cx: 36,
				cy: 36,
				r: 4.4,
				fill: "var(--crest-ink)",
				opacity: 0.92,
			},
		],
		engraving: [
			{
				type: "line",
				x1: 36,
				y1: 20,
				x2: 36,
				y2: 52,
				stroke: "var(--crest-line)",
				strokeWidth: 1,
				opacity: 0.45,
			},
			{
				type: "line",
				x1: 20,
				y1: 36,
				x2: 52,
				y2: 36,
				stroke: "var(--crest-line)",
				strokeWidth: 1,
				opacity: 0.45,
			},
		],
	},
	devstral: {
		palette: {
			shell: "#324057",
			shellDeep: "#222f44",
			core: "#314962",
			line: "#90a4c6",
			ink: "#e2ebf9",
			accent: "#7d96d6",
			glow: "#9baee1",
		},
		microSymbol: [
			{
				type: "path",
				d: "M28 28L22 36L28 44",
				stroke: "var(--crest-accent)",
				strokeWidth: 2.4,
				strokeLinecap: "round",
				strokeLinejoin: "round",
			},
			{
				type: "path",
				d: "M44 28L50 36L44 44",
				stroke: "var(--crest-accent)",
				strokeWidth: 2.4,
				strokeLinecap: "round",
				strokeLinejoin: "round",
			},
		],
		symbol: [
			{
				type: "path",
				d: "M27 23L20 36L27 49",
				stroke: "var(--crest-accent)",
				strokeWidth: 3,
				strokeLinecap: "round",
				strokeLinejoin: "round",
			},
			{
				type: "path",
				d: "M45 23L52 36L45 49",
				stroke: "var(--crest-accent)",
				strokeWidth: 3,
				strokeLinecap: "round",
				strokeLinejoin: "round",
			},
			{
				type: "path",
				d: "M41 21L31 51",
				stroke: "var(--crest-ink)",
				strokeWidth: 2.6,
				strokeLinecap: "round",
			},
		],
		engraving: [
			{
				type: "rect",
				x: 22,
				y: 20,
				width: 28,
				height: 32,
				rx: 8,
				stroke: "var(--crest-line)",
				strokeWidth: 1,
				opacity: 0.36,
			},
		],
	},
	sentinel: {
		palette: {
			shell: "#31495d",
			shellDeep: "#213546",
			core: "#345367",
			line: "#94b3c8",
			ink: "#e5f4f8",
			accent: "#7f9fb4",
			glow: "#9abfd4",
		},
		microSymbol: [
			{
				type: "path",
				d: "M23 36C26 31 31 28 36 28C41 28 46 31 49 36C46 41 41 44 36 44C31 44 26 41 23 36Z",
				fill: "var(--crest-accent)",
				opacity: 0.88,
			},
			{ type: "circle", cx: 36, cy: 36, r: 4, fill: "var(--crest-ink)" },
		],
		symbol: [
			{
				type: "path",
				d: "M20 36C24.4 28.3 29.8 24 36 24C42.2 24 47.6 28.3 52 36C47.6 43.7 42.2 48 36 48C29.8 48 24.4 43.7 20 36Z",
				stroke: "var(--crest-accent)",
				strokeWidth: 2.4,
				fill: "color-mix(in srgb, var(--crest-accent) 22%, transparent)",
				opacity: 0.92,
			},
			{ type: "circle", cx: 36, cy: 36, r: 6.2, fill: "var(--crest-ink)" },
			{ type: "circle", cx: 36, cy: 36, r: 2.4, fill: "var(--crest-shell-deep)" },
		],
		engraving: [
			{
				type: "line",
				x1: 24,
				y1: 24,
				x2: 48,
				y2: 48,
				stroke: "var(--crest-line)",
				strokeWidth: 1,
				opacity: 0.25,
			},
			{
				type: "line",
				x1: 48,
				y1: 24,
				x2: 24,
				y2: 48,
				stroke: "var(--crest-line)",
				strokeWidth: 1,
				opacity: 0.25,
			},
		],
	},
	forge: {
		palette: {
			shell: "#4d3f31",
			shellDeep: "#3a2e24",
			core: "#57442f",
			line: "#bca58c",
			ink: "#f3e8d8",
			accent: "#d2a24c",
			glow: "#deb772",
		},
		microSymbol: [
			{ type: "rect", x: 24, y: 34, width: 24, height: 7, rx: 2, fill: "var(--crest-accent)" },
			{ type: "rect", x: 30, y: 27, width: 12, height: 5, rx: 2, fill: "var(--crest-ink)" },
		],
		symbol: [
			{ type: "rect", x: 23, y: 34, width: 26, height: 8, rx: 2, fill: "var(--crest-accent)" },
			{
				type: "path",
				d: "M27 34L31 27H45V34Z",
				fill: "var(--crest-ink)",
				opacity: 0.95,
			},
			{
				type: "rect",
				x: 33.5,
				y: 22,
				width: 5,
				height: 7,
				rx: 1.5,
				fill: "var(--crest-ink)",
				opacity: 0.88,
			},
		],
		engraving: [
			{
				type: "line",
				x1: 24,
				y1: 46,
				x2: 48,
				y2: 46,
				stroke: "var(--crest-line)",
				strokeWidth: 1.1,
				opacity: 0.42,
			},
			{
				type: "line",
				x1: 28,
				y1: 50,
				x2: 44,
				y2: 50,
				stroke: "var(--crest-line)",
				strokeWidth: 1.1,
				opacity: 0.35,
			},
		],
	},
	draftsmith: {
		palette: {
			shell: "#4a3847",
			shellDeep: "#372a35",
			core: "#533c4f",
			line: "#b99cb2",
			ink: "#f2e5ef",
			accent: "#c46d8f",
			glow: "#d18aa6",
		},
		microSymbol: [
			{
				type: "path",
				d: "M24 42L40 26L46 32L30 48L24 48Z",
				fill: "var(--crest-accent)",
				opacity: 0.95,
			},
			{ type: "circle", cx: 44, cy: 30, r: 2.4, fill: "var(--crest-ink)" },
		],
		symbol: [
			{
				type: "path",
				d: "M23 43L40 26L47 33L30 50L23 50Z",
				fill: "var(--crest-accent)",
				opacity: 0.95,
			},
			{
				type: "path",
				d: "M39 27L44 22L51 29L46 34Z",
				fill: "var(--crest-ink)",
				opacity: 0.95,
			},
			{
				type: "line",
				x1: 27,
				y1: 47,
				x2: 42,
				y2: 32,
				stroke: "var(--crest-shell-deep)",
				strokeWidth: 1.4,
				opacity: 0.7,
			},
		],
		engraving: [
			{
				type: "line",
				x1: 22,
				y1: 28,
				x2: 50,
				y2: 28,
				stroke: "var(--crest-line)",
				strokeWidth: 1,
				opacity: 0.4,
			},
			{
				type: "line",
				x1: 22,
				y1: 31,
				x2: 46,
				y2: 31,
				stroke: "var(--crest-line)",
				strokeWidth: 1,
				opacity: 0.3,
			},
		],
	},
	gridsage: {
		palette: {
			shell: "#2f3f4b",
			shellDeep: "#22313d",
			core: "#334b58",
			line: "#8fb0bd",
			ink: "#e3f1f6",
			accent: "#6b93a4",
			glow: "#8ab4c7",
		},
		microSymbol: [
			{ type: "rect", x: 25, y: 25, width: 22, height: 22, rx: 3, stroke: "var(--crest-accent)", strokeWidth: 2 },
			{ type: "line", x1: 36, y1: 25, x2: 36, y2: 47, stroke: "var(--crest-accent)", strokeWidth: 1.8 },
			{ type: "line", x1: 25, y1: 36, x2: 47, y2: 36, stroke: "var(--crest-accent)", strokeWidth: 1.8 },
		],
		symbol: [
			{ type: "rect", x: 23, y: 23, width: 26, height: 26, rx: 4, stroke: "var(--crest-accent)", strokeWidth: 2.1 },
			{ type: "line", x1: 32, y1: 23, x2: 32, y2: 49, stroke: "var(--crest-accent)", strokeWidth: 1.6 },
			{ type: "line", x1: 40, y1: 23, x2: 40, y2: 49, stroke: "var(--crest-accent)", strokeWidth: 1.6 },
			{ type: "line", x1: 23, y1: 32, x2: 49, y2: 32, stroke: "var(--crest-accent)", strokeWidth: 1.6 },
			{ type: "line", x1: 23, y1: 40, x2: 49, y2: 40, stroke: "var(--crest-accent)", strokeWidth: 1.6 },
			{ type: "circle", cx: 32, cy: 32, r: 1.8, fill: "var(--crest-ink)" },
			{ type: "circle", cx: 40, cy: 40, r: 1.8, fill: "var(--crest-ink)" },
		],
		engraving: [
			{
				type: "line",
				x1: 20,
				y1: 36,
				x2: 52,
				y2: 36,
				stroke: "var(--crest-line)",
				strokeWidth: 0.9,
				opacity: 0.28,
			},
		],
	},
};
