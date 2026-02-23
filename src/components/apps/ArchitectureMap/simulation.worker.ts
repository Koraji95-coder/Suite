// ── D3 Force Simulation Web Worker ──────────────────────────────
// Runs the physics simulation off the main thread so rendering
// and input handling stay at 60 fps.

import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from "d3";
import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
} from "d3";
import type { SimConfig, ToWorkerMessage } from "./workerTypes";

// ── Internal node/link types (D3 mutates these in place) ────────

interface WNode extends SimulationNodeDatum {
	id: string;
	type: "major" | "minor";
	group: string;
	r: number;
}

interface WLink extends SimulationLinkDatum<WNode> {
	type: "orchestrator" | "subfeature" | "overlap";
}

// ── State ───────────────────────────────────────────────────────

let sim: Simulation<WNode, WLink> | null = null;
let nodes: WNode[] = [];
let tickCount = 0;

// ── Helpers ─────────────────────────────────────────────────────

function postPositions() {
	// Flat array: [x0, y0, x1, y1, …]
	const buf = new Float64Array(nodes.length * 2);
	for (let i = 0; i < nodes.length; i++) {
		const x = nodes[i].x;
		const y = nodes[i].y;
		buf[i * 2] = typeof x === "number" && Number.isFinite(x) ? x : 0;
		buf[i * 2 + 1] = typeof y === "number" && Number.isFinite(y) ? y : 0;
	}
	// Transfer the buffer for zero-copy
	(self as unknown as Worker).postMessage({ type: "tick", positions: buf }, [
		buf.buffer,
	] as unknown as Transferable[]);
}

function buildSim(config: SimConfig) {
	if (sim) sim.stop();

	sim = forceSimulation<WNode>(nodes)
		.force(
			"link",
			forceLink<WNode, WLink>()
				.id((d) => d.id)
				.distance((d) =>
					d.type === "orchestrator"
						? config.linkDistance.orchestrator
						: d.type === "overlap"
							? config.linkDistance.overlap
							: config.linkDistance.subfeature,
				)
				.strength((d) =>
					d.type === "orchestrator"
						? config.linkStrength.orchestrator
						: d.type === "overlap"
							? config.linkStrength.overlap
							: config.linkStrength.subfeature,
				),
		)
		.force(
			"charge",
			forceManyBody<WNode>().strength((d) =>
				d.type === "major"
					? config.chargeStrength.major
					: config.chargeStrength.minor,
			),
		)
		.force("center", forceCenter(0, 0))
		.force(
			"collision",
			forceCollide<WNode>().radius((d) => d.r + config.collisionPadding),
		)
		.alphaDecay(config.alphaDecay)
		.velocityDecay(config.velocityDecay);

	return sim;
}

// ── Message Handler ─────────────────────────────────────────────

self.onmessage = (e: MessageEvent<ToWorkerMessage>) => {
	const msg = e.data;

	switch (msg.type) {
		case "init": {
			// Hydrate nodes (D3 will mutate x/y/vx/vy in place)
			nodes = msg.nodes.map((n) => ({ ...n }));
			const links: WLink[] = msg.links.map((l) => ({ ...l }));

			const s = buildSim(msg.config);
			// Attach links after sim is created so forceLink resolves IDs
			(s.force("link") as ReturnType<typeof forceLink<WNode, WLink>>).links(
				links,
			);

			tickCount = 0;
			s.on("tick", () => {
				tickCount++;
				// Throttle to ~30 fps (every other tick)
				if (tickCount % 2 === 0) postPositions();
			});

			s.on("end", () => {
				postPositions(); // final positions
				(self as unknown as Worker).postMessage({
					type: "settled",
					alpha: s.alpha(),
				});
			});
			break;
		}

		case "pin": {
			const n = nodes[msg.nodeIndex];
			if (n) {
				n.fx = msg.fx;
				n.fy = msg.fy;
			}
			break;
		}

		case "alphaTarget":
			sim?.alphaTarget(msg.value);
			break;

		case "alpha":
			sim?.alpha(msg.value);
			break;

		case "restart":
			sim?.alpha(0.3).restart();
			break;

		case "stop":
			sim?.stop();
			break;
	}
};
