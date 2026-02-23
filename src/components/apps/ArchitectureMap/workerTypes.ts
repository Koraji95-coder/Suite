// ── Serializable types for worker boundary ──────────────────────

/** Minimal node data sent to worker (no circular refs, no DOM). */
export interface WorkerNode {
	id: string;
	type: "major" | "minor";
	group: string;
	r: number;
	x?: number;
	y?: number;
	vx?: number;
	vy?: number;
	fx?: number | null;
	fy?: number | null;
}

/** Minimal link data sent to worker (IDs only, no object refs). */
export interface WorkerLink {
	source: string;
	target: string;
	type: "orchestrator" | "subfeature" | "overlap";
}

/** Simulation configuration constants. */
export interface SimConfig {
	linkDistance: { orchestrator: number; subfeature: number; overlap: number };
	linkStrength: { orchestrator: number; subfeature: number; overlap: number };
	chargeStrength: { major: number; minor: number };
	collisionPadding: number;
	alphaDecay: number;
	velocityDecay: number;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
	linkDistance: { orchestrator: 380, overlap: 400, subfeature: 230 },
	linkStrength: { orchestrator: 0.6, overlap: 0.08, subfeature: 0.32 },
	chargeStrength: { major: -2400, minor: -600 },
	collisionPadding: 22,
	alphaDecay: 0.011,
	velocityDecay: 0.35,
};

// ── Messages: Main → Worker ─────────────────────────────────────

export type ToWorkerMessage =
	| {
			type: "init";
			nodes: WorkerNode[];
			links: WorkerLink[];
			config: SimConfig;
	  }
	| { type: "reheat"; alpha: number }
	| { type: "config"; config: Partial<SimConfig> }
	| { type: "pin"; nodeIndex: number; fx: number | null; fy: number | null }
	| { type: "unpin"; nodeId: string }
	| { type: "alphaTarget"; value: number }
	| { type: "alpha"; value: number }
	| { type: "restart" }
	| { type: "stop" };

// ── Messages: Worker → Main ─────────────────────────────────────

export type FromWorkerMessage =
	| { type: "tick"; positions: Float64Array; alpha?: number }
	| { type: "settled"; alpha: number };
