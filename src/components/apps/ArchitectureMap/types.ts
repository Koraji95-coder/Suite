import type { SimulationLinkDatum, SimulationNodeDatum } from "d3";

// ── Node & Link Types ────────────────────────────────────────────

export type BuildStatus =
	| "success"
	| "warning"
	| "error"
	| "pending"
	| "unknown";

export interface TicketInfo {
	count: number;
	url?: string;
	provider?: "jira" | "linear" | "github";
}

export interface ArchNode extends SimulationNodeDatum {
	id: string;
	type: "major" | "minor";
	group: string;
	r: number;
	color: string;
	icon?: string;
	sub?: string;
	// Phase 4: dynamic data
	buildStatus?: BuildStatus;
	issues?: TicketInfo;
	filePath?: string;
}

export interface ArchLink extends SimulationLinkDatum<ArchNode> {
	type: "orchestrator" | "subfeature" | "overlap";
}

// ── Phase 4: Data Integration Types ─────────────────────────────

export interface GraphSnapshot {
	id: string;
	label: string;
	timestamp: number;
	positions: Record<string, { x: number; y: number }>;
	camera: { tx: number; ty: number; scale: number };
}

export interface SavedLayout {
	version: number;
	timestamp: number;
	camera: { tx: number; ty: number; scale: number };
	positions: Record<string, { x: number; y: number }>;
}

export interface DynamicGraphData {
	timestamp: number;
	components: Record<
		string,
		{
			filePath: string;
			lines: number;
			imports: string[];
			group?: string;
		}
	>;
}

// ── Visual Effect Types ──────────────────────────────────────────

// Link-following flow particle (Phase 2.1 / 2.5)
export interface FlowParticle {
	link: ArchLink;
	t: number; // 0..1 along source->target
	speed: number; // fraction per second
	size: number;
	alpha: number;
	tint: number; // 0xRRGGBB
	// cached last position (for trail segments)
	lastX?: number;
	lastY?: number;
}

// Fading line-segment trail (Phase 2.5)
export interface TrailSegment {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	w: number; // thickness in world units
	life: number; // 0..1
	tint: number; // 0xRRGGBB
	alpha: number; // base alpha multiplier
}

export interface Star {
	x: number;
	y: number;
	r: number;
	phase: number;
	speed: number;
	hue: number;
}

export interface Nebula {
	x: number;
	y: number;
	r: number;
	hue: number;
	phase: number;
	drift: number;
}

// ── LOD Cluster Type (render-only) ───────────────────────────────

export interface Cluster {
	id: string;
	x: number;
	y: number;
	r: number;
	color: string; // hex color (#RRGGBB)
	count: number;
	group?: string;
}

// ── Camera State ─────────────────────────────────────────────────

export interface Camera {
	tx: number;
	ty: number;
	scale: number;
}
