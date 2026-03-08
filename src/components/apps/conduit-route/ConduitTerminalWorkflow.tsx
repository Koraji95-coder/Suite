import {
	Cable,
	CheckCircle2,
	Link2,
	LoaderCircle,
	PlugZap,
	PowerOff,
	RefreshCw,
	Route,
	Rows3,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Panel, Stack, Text } from "@/components/primitives";
import { cn } from "@/lib/utils";
import styles from "./ConduitTerminalWorkflow.module.css";
import {
	DEFAULT_WIRE_FUNCTIONS,
	OBSTACLE_STYLE,
	WIRE_COLORS,
} from "./conduitRouteData";
import { conduitRouteService } from "./conduitRouteService";
import type {
	CableSystemType,
	ConduitObstacleScanMeta,
	Obstacle,
	Point2D,
} from "./conduitRouteTypes";
import {
	buildTerminalLayout,
	canvasPointToWorld,
	routeTerminalPath,
	smoothTerminalPath,
	terminalBendCount,
	terminalLeadFromEdge,
	terminalPathLength,
	terminalStripEdgePoint,
	toTerminalRouteSvg,
	worldPointToCanvas,
} from "./conduitTerminalEngine";
import { conduitTerminalService } from "./conduitTerminalService";
import type {
	EtapCleanupCommand,
	TerminalCadRouteRecord,
	TerminalCadRuntimeStatus,
	TerminalCadSyncDiagnostic,
	TerminalJumperDefinition,
	TerminalLabelSyncRequest,
	TerminalLayoutResult,
	TerminalNode,
	TerminalRouteRecord,
	TerminalScanData,
	TerminalScanMeta,
	TerminalScanProfile,
} from "./conduitTerminalTypes";

const EMPTY_LAYOUT: TerminalLayoutResult = {
	canvasWidth: 940,
	canvasHeight: 620,
	transform: {
		worldMinX: 0,
		worldMaxX: 940,
		worldMinY: 0,
		worldMaxY: 620,
		padding: 0,
		usableWidth: 940,
		usableHeight: 620,
		orientation: "native",
		sourceWorldMinX: 0,
		sourceWorldMaxX: 940,
		sourceWorldMinY: 0,
		sourceWorldMaxY: 620,
		rotationCenterX: 470,
		rotationCenterY: 310,
	},
	orientation: "native",
	strips: [],
	terminals: [],
};

function parseEnvBoolean(raw: unknown, fallback: boolean): boolean {
	if (typeof raw !== "string") return fallback;
	const normalized = raw.trim().toLowerCase();
	if (normalized === "true" || normalized === "1" || normalized === "yes") {
		return true;
	}
	if (normalized === "false" || normalized === "0" || normalized === "no") {
		return false;
	}
	return fallback;
}

function parseCsvEnv(raw: unknown): string[] {
	if (typeof raw !== "string") return [];
	return raw
		.split(",")
		.map((entry) => entry.trim().toUpperCase())
		.filter(
			(entry, index, all) => entry.length > 0 && all.indexOf(entry) === index,
		);
}

const AUTO_CONNECT_ON_MOUNT = parseEnvBoolean(
	import.meta.env.VITE_TERMINAL_AUTO_CONNECT,
	true,
);

const TERMINAL_BLOCK_ALLOW_LIST = parseCsvEnv(
	import.meta.env.VITE_TERMINAL_BLOCK_ALLOW_LIST ?? "TB_STRIP_META_SIDE",
);

const DEFAULT_TERMINAL_SCAN_PROFILE: TerminalScanProfile = {
	panelIdKeys: ["PANEL_ID"],
	panelNameKeys: ["PANEL_NAME"],
	sideKeys: ["SIDE"],
	stripIdKeys: ["STRIP_ID"],
	stripNumberKeys: ["STRIP_NO", "STRIP_NUM", "STRIP_NUMBER", "NUMBER", "NO"],
	terminalCountKeys: ["TERMINAL_COUNT"],
	terminalTagKeys: [
		"PANEL_ID",
		"PANEL_NAME",
		"SIDE",
		"STRIP_ID",
		"TERMINAL_COUNT",
	],
	terminalNameTokens: ["TERMINAL", "TB", "TS"],
	blockNameAllowList: TERMINAL_BLOCK_ALLOW_LIST,
	requireStripId: true,
	requireTerminalCount: true,
	requireSide: true,
	defaultPanelPrefix: "PANEL",
	defaultTerminalCount: 12,
};

const JUMPER_COLOR = {
	code: "JMP",
	hex: "#f97316",
	stroke: "#fb923c",
	aci: 30,
} as const;

const ETAP_CLEANUP_COMMANDS: readonly EtapCleanupCommand[] = [
	"ETAPFIX",
	"ETAPTEXT",
	"ETAPBLOCKS",
	"ETAPLAYERFIX",
	"ETAPOVERLAP",
	"ETAPIMPORT",
];

const CAD_SYNC_MAX_RETRIES = 2;
const CAD_SYNC_RETRY_BASE_DELAY_MS = 250;
const CAD_DIAGNOSTIC_HISTORY_MAX = 30;

function makeCadSessionId(): string {
	try {
		if (
			typeof crypto !== "undefined" &&
			typeof crypto.randomUUID === "function"
		) {
			return `cad-session-${crypto.randomUUID()}`;
		}
	} catch {
		// Ignore and use timestamp fallback.
	}
	return `cad-session-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function makeRouteId(): string {
	return `troute_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatLength(length: number): string {
	return `${Math.round(length)} px`;
}

function dedupePath(path: Point2D[]): Point2D[] {
	if (path.length <= 1) return path;
	const output: Point2D[] = [path[0]];
	for (let index = 1; index < path.length; index += 1) {
		const prev = output[output.length - 1];
		const current = path[index];
		if (Math.hypot(current.x - prev.x, current.y - prev.y) >= 0.5) {
			output.push(current);
		}
	}
	return output;
}

/**
 * BUG 2 FIX: Snap adjacent cadPath points that are nearly axis-aligned.
 *
 * The A* router outputs grid-aligned points (8px step) but terminal
 * edge/lead points sit at exact sub-pixel positions. Where these meet,
 * segments have a 1–6px offset in both axes that canvasPointToWorld
 * turns into a world-space diagonal. The backend's AXIS_TOLERANCE=0.005
 * can't catch these (they're 0.02–0.08 world units), so it draws a
 * visible kink instead of a clean corner.
 *
 * Fix: if two adjacent points differ by ≤ snapThreshold in one axis,
 * force them to share that axis. This preserves exact positions for
 * the outer edge/lead points while cleaning up the grid transitions.
 */
function snapCadPathToGrid(path: Point2D[], snapThreshold = 8): Point2D[] {
	if (path.length <= 2) return path;
	const output = path.map((p) => ({ x: p.x, y: p.y }));
	const first = output[0];
	const last = output[output.length - 1];

	for (let i = 1; i < output.length; i += 1) {
		const prev = output[i - 1];
		const curr = output[i];
		const dx = Math.abs(curr.x - prev.x);
		const dy = Math.abs(curr.y - prev.y);

		// If one axis is "nearly zero" relative to the other, snap it
		if (dx > 0.5 && dy <= snapThreshold && dy < dx * 0.3) {
			// Nearly horizontal — snap Y to match previous point
			curr.y = prev.y;
		} else if (dy > 0.5 && dx <= snapThreshold && dx < dy * 0.3) {
			// Nearly vertical — snap X to match previous point
			curr.x = prev.x;
		}
	}

	// Keep terminal edge anchors exact.
	output[0] = first;
	output[output.length - 1] = last;
	return output;
}

/**
 * BUG 1 FIX: Compute a fillet radius that's proportional to the actual
 * world-coordinate segment lengths instead of the hardcoded 0.1.
 *
 * Strategy: find the 25th-percentile non-trivial segment length and use
 * ~18% of it as the fillet radius, clamped to [0.05, 3.0] world units.
 * This produces visible rounded corners regardless of drawing scale.
 */
function computeWorldFilletRadius(worldPath: Point2D[]): number {
	if (worldPath.length < 3) return 0.1;

	const lengths: number[] = [];
	for (let i = 1; i < worldPath.length; i += 1) {
		const len = Math.hypot(
			worldPath[i].x - worldPath[i - 1].x,
			worldPath[i].y - worldPath[i - 1].y,
		);
		if (len > 0.01) lengths.push(len);
	}
	if (lengths.length === 0) return 0.1;

	lengths.sort((a, b) => a - b);
	// Use the 25th-percentile segment length as the reference —
	// this avoids letting one very long segment inflate the radius
	// beyond what short segments can accommodate.
	const refIndex = Math.max(0, Math.floor(lengths.length * 0.25));
	const refLength = lengths[refIndex];
	const radius = refLength * 0.18;

	// Clamp to reasonable bounds
	return Math.max(0.05, Math.min(3.0, radius));
}

function midPoint(path: Point2D[]): Point2D {
	if (path.length === 0) return { x: 0, y: 0 };
	if (path.length === 1) return path[0];
	const middle = Math.floor((path.length - 1) / 2);
	const a = path[middle];
	const b = path[Math.min(path.length - 1, middle + 1)];
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function terminalIdFor(stripId: string, terminalIndex: number): string {
	const normalizedIndex = Math.max(1, Math.trunc(terminalIndex));
	return `${stripId}:T${String(normalizedIndex).padStart(2, "0")}`;
}

function firstPathSegment(
	path: Point2D[],
): { start: Point2D; end: Point2D } | null {
	for (let index = 1; index < path.length; index += 1) {
		const start = path[index - 1];
		const end = path[index];
		if (Math.hypot(end.x - start.x, end.y - start.y) >= 0.5) {
			return { start, end };
		}
	}
	return null;
}

function routeCenterAnchor(path: Point2D[]): {
	x: number;
	y: number;
	angleDeg: number;
} | null {
	if (path.length < 2) return null;

	type Segment = { start: Point2D; end: Point2D; length: number };
	const segments: Segment[] = [];
	let totalLength = 0;
	for (let index = 1; index < path.length; index += 1) {
		const start = path[index - 1];
		const end = path[index];
		const length = Math.hypot(end.x - start.x, end.y - start.y);
		if (length < 0.5) continue;
		segments.push({ start, end, length });
		totalLength += length;
	}
	if (segments.length === 0 || totalLength < 0.5) return null;

	const targetDistance = totalLength * 0.5;
	let walked = 0;
	for (const segment of segments) {
		if (walked + segment.length < targetDistance) {
			walked += segment.length;
			continue;
		}
		const dx = segment.end.x - segment.start.x;
		const dy = segment.end.y - segment.start.y;
		const remaining = targetDistance - walked;
		const t = clamp(remaining / segment.length, 0, 1);
		let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
		if (angleDeg > 90) {
			angleDeg -= 180;
		} else if (angleDeg <= -90) {
			angleDeg += 180;
		}
		return {
			x: segment.start.x + dx * t,
			y: segment.start.y + dy * t,
			angleDeg,
		};
	}

	const tail = segments[segments.length - 1];
	const dx = tail.end.x - tail.start.x;
	const dy = tail.end.y - tail.start.y;
	let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
	if (angleDeg > 90) {
		angleDeg -= 180;
	} else if (angleDeg <= -90) {
		angleDeg += 180;
	}
	return {
		x: (tail.start.x + tail.end.x) * 0.5,
		y: (tail.start.y + tail.end.y) * 0.5,
		angleDeg,
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function parseTrailingNumber(value: string): number {
	const match = String(value || "").match(/(\d+)\s*$/);
	if (!match) return 0;
	const parsed = Number.parseInt(match[1], 10);
	return Number.isFinite(parsed) ? parsed : 0;
}

function conductorRouteRefKey(
	cableType: CableSystemType,
	wireFunction: string,
): string {
	return `${cableType}:${String(wireFunction || "").trim().toUpperCase()}`;
}

function terminalOutwardDirection(
	side: string,
	from: Point2D,
	target: Point2D,
): number {
	if (side === "L") {
		return -1;
	}
	if (side === "R") {
		return 1;
	}
	return target.x >= from.x ? 1 : -1;
}

function buildJumperCadPath(
	from: TerminalNode,
	to: TerminalNode,
	layout: TerminalLayoutResult,
): Point2D[] {
	const fromEdge = terminalStripEdgePoint(from, layout.strips, to);
	const toEdge = terminalStripEdgePoint(to, layout.strips, from);
	const dx = toEdge.x - fromEdge.x;
	const dy = toEdge.y - fromEdge.y;
	const fromDir = terminalOutwardDirection(from.side, fromEdge, toEdge);
	const toDir = terminalOutwardDirection(to.side, toEdge, fromEdge);
	const runBase = clamp(
		Math.min(layout.canvasWidth, layout.canvasHeight) * 0.024,
		9,
		22,
	);

	if (Math.abs(dy) >= Math.abs(dx)) {
		const sameOutward = fromDir === toDir;
		const trunkX = sameOutward
			? fromDir > 0
				? Math.max(fromEdge.x, toEdge.x) + runBase
				: Math.min(fromEdge.x, toEdge.x) - runBase
			: (fromEdge.x + toEdge.x) * 0.5;
		const verticalDelta = Math.abs(dy);
		const maxLift = Math.max(1.25, verticalDelta * 0.38 - 1);
		const lift = Math.min(
			maxLift,
			clamp(verticalDelta * 0.16, 2.5, 9),
		);
		const directionY = dy >= 0 ? 1 : -1;
		const fromDiag = { x: trunkX, y: fromEdge.y + directionY * lift };
		const toDiag = { x: trunkX, y: toEdge.y - directionY * lift };
		return dedupePath([fromEdge, fromDiag, toDiag, toEdge]);
	}

	const trunkY = (fromEdge.y + toEdge.y) * 0.5;
	const horizontalDelta = Math.abs(dx);
	const run = Math.min(
		Math.max(3, horizontalDelta * 0.30 - 1),
		clamp(horizontalDelta * 0.12, 3, 10),
	);
	const fromDiag = {
		x: fromEdge.x + fromDir * run,
		y: trunkY,
	};
	const toDiag = {
		x: toEdge.x + toDir * run,
		y: trunkY,
	};
	return dedupePath([fromEdge, fromDiag, toDiag, toEdge]);
}

function nextJumperRefFromDefinitions(scanData: TerminalScanData): number {
	const jumpers = Array.isArray(scanData.jumpers) ? scanData.jumpers : [];
	if (jumpers.length === 0) {
		return 1;
	}
	let maxId = 0;
	for (const jumper of jumpers) {
		maxId = Math.max(maxId, parseTrailingNumber(String(jumper.jumperId || "")));
	}
	return Math.max(1, maxId + 1);
}

function buildTerminalLabelSyncRequest(
	scanData: TerminalScanData,
): TerminalLabelSyncRequest {
	const strips: NonNullable<TerminalLabelSyncRequest["strips"]> = [];
	for (const panel of Object.values(scanData.panels)) {
		for (const sideData of Object.values(panel.sides)) {
			for (const strip of sideData.strips) {
				const terminalCount = Math.max(1, Math.trunc(strip.terminalCount || 1));
				const labels = Array.from(
					{ length: terminalCount },
					(_, index) => String(index + 1),
				);
				strips.push({
					stripId: strip.stripId,
					terminalCount,
					labels,
				});
			}
		}
	}
	return {
		selectionOnly: false,
		includeModelspace: true,
		maxEntities: 50000,
		terminalProfile: DEFAULT_TERMINAL_SCAN_PROFILE,
		strips,
	};
}

function delayMs(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function makeDiagnosticId(): string {
	return `cad-diag-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function resolveCadProviderPath(meta?: {
	providerPath?: unknown;
	source?: unknown;
} | null): string {
	const explicit =
		typeof meta?.providerPath === "string" ? meta.providerPath.trim() : "";
	if (explicit.length > 0) {
		return explicit;
	}
	if (meta?.source === "dotnet") {
		return "dotnet";
	}
	if (meta?.source === "autocad") {
		return "com";
	}
	return "unknown";
}

function cadLayerForRoute(route: TerminalRouteRecord): string {
	if (route.routeType === "jumper") {
		return "SUITE_WIRE_JUMPER";
	}
	const colorCode =
		String(route.color.code || "")
			.trim()
			.toUpperCase() || "WIRE";
	return `SUITE_WIRE_${route.cableType}_${colorCode}`;
}

function stripCenterPoint(
	strip: TerminalLayoutResult["strips"][number],
): Point2D {
	return {
		x: strip.px + strip.width / 2,
		y: strip.py + strip.height / 2,
	};
}

function nearestTerminalByY(
	terminals: TerminalNode[],
	targetY: number,
): TerminalNode | null {
	if (terminals.length === 0) return null;
	let best: TerminalNode | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const terminal of terminals) {
		const distance = Math.abs(terminal.y - targetY);
		if (distance < bestDistance) {
			best = terminal;
			bestDistance = distance;
		}
	}
	return best;
}

function resolvePositionalJumperPair(
	jumper: TerminalJumperDefinition,
	layout: TerminalLayoutResult,
): { from: TerminalNode; to: TerminalNode } | null {
	const rawX = Number(jumper.x);
	const rawY = Number(jumper.y);
	if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
		return null;
	}
	if (layout.strips.length < 2) {
		return null;
	}

	const candidatePoint = worldPointToCanvas(
		{ x: rawX, y: rawY },
		layout.transform,
	);
	const strips = layout.strips.slice();
	const stripById = new Map(strips.map((strip) => [strip.stripId, strip]));
	const terminalsByStrip = new Map<string, TerminalNode[]>();
	for (const terminal of layout.terminals) {
		const bucket = terminalsByStrip.get(terminal.stripId) ?? [];
		bucket.push(terminal);
		terminalsByStrip.set(terminal.stripId, bucket);
	}

	const firstStrip = strips.slice().sort((a, b) => {
		const ac = stripCenterPoint(a);
		const bc = stripCenterPoint(b);
		return (
			Math.hypot(ac.x - candidatePoint.x, ac.y - candidatePoint.y) -
			Math.hypot(bc.x - candidatePoint.x, bc.y - candidatePoint.y)
		);
	})[0];
	if (!firstStrip) {
		return null;
	}

	const secondStrip = strips
		.filter((strip) => strip.stripId !== firstStrip.stripId)
		.sort((a, b) => {
			const ac = stripCenterPoint(a);
			const bc = stripCenterPoint(b);
			const panelPenaltyA = a.panelId === firstStrip.panelId ? 0 : 180;
			const panelPenaltyB = b.panelId === firstStrip.panelId ? 0 : 180;
			const sidePenaltyA = a.side !== firstStrip.side ? 0 : 40;
			const sidePenaltyB = b.side !== firstStrip.side ? 0 : 40;
			const scoreA =
				Math.hypot(ac.x - candidatePoint.x, ac.y - candidatePoint.y) +
				panelPenaltyA +
				sidePenaltyA;
			const scoreB =
				Math.hypot(bc.x - candidatePoint.x, bc.y - candidatePoint.y) +
				panelPenaltyB +
				sidePenaltyB;
			return scoreA - scoreB;
		})[0];
	if (!secondStrip) {
		return null;
	}

	const firstStripTerminals = terminalsByStrip.get(firstStrip.stripId) ?? [];
	const secondStripTerminals = terminalsByStrip.get(secondStrip.stripId) ?? [];
	const from =
		nearestTerminalByY(firstStripTerminals, candidatePoint.y) ??
		layout.terminals.find(
			(terminal) => terminal.stripId === firstStrip.stripId,
		) ??
		null;
	const to =
		nearestTerminalByY(secondStripTerminals, candidatePoint.y) ??
		layout.terminals.find(
			(terminal) => terminal.stripId === secondStrip.stripId,
		) ??
		null;

	if (!from || !to) {
		return null;
	}

	const strictFrom = stripById.get(from.stripId);
	const strictTo = stripById.get(to.stripId);
	if (!strictFrom || !strictTo || strictFrom.stripId === strictTo.stripId) {
		return null;
	}
	return { from, to };
}

function buildJumperRoutes(
	scanData: TerminalScanData,
	layout: TerminalLayoutResult,
	obstacles: Obstacle[] = [],
): { routes: TerminalRouteRecord[]; unresolved: number; nextRef: number } {
	const jumpers = Array.isArray(scanData.jumpers) ? scanData.jumpers : [];
	if (jumpers.length === 0) {
		return { routes: [], unresolved: 0, nextRef: 1 };
	}

	const terminalById = new Map(
		layout.terminals.map((terminal) => [terminal.id, terminal]),
	);
	const dedupe = new Set<string>();
	const routes: TerminalRouteRecord[] = [];
	let unresolved = 0;
	let maxNumericRef = 0;
	let autoIndex = 1;

	for (const jumper of jumpers) {
		let from: TerminalNode | undefined;
		let to: TerminalNode | undefined;
		const fromTerm = Math.max(1, Math.trunc(Number(jumper.fromTerminal) || 0));
		const toTerm = Math.max(1, Math.trunc(Number(jumper.toTerminal) || 0));
		const hasExplicit =
			String(jumper.fromStripId || "").trim().length > 0 &&
			String(jumper.toStripId || "").trim().length > 0;
		if (hasExplicit) {
			const fromId = terminalIdFor(jumper.fromStripId, fromTerm);
			const toId = terminalIdFor(jumper.toStripId, toTerm);
			from = terminalById.get(fromId);
			to = terminalById.get(toId);
		}
		if (!from || !to) {
			const positionalPair = resolvePositionalJumperPair(jumper, layout);
			if (positionalPair) {
				from = positionalPair.from;
				to = positionalPair.to;
			}
		}
		if (!from || !to) {
			unresolved += 1;
			continue;
		}

		const signature = `${from.id}|${to.id}`;
		if (dedupe.has(signature)) {
			continue;
		}
		dedupe.add(signature);

		const fromEdge = terminalStripEdgePoint(from, layout.strips, to);
		const toEdge = terminalStripEdgePoint(to, layout.strips, from);
		const fromLead = terminalLeadFromEdge(fromEdge, from.side, toEdge, 36);
		const toLead = terminalLeadFromEdge(toEdge, to.side, fromEdge, 36);
		const trunkPath = routeTerminalPath(
			fromLead,
			toLead,
			layout.strips,
			layout.canvasWidth,
			layout.canvasHeight,
			obstacles,
		);
		const cadPath = snapCadPathToGrid(
			dedupePath([fromEdge, fromLead, ...trunkPath, toLead, toEdge]),
		);
		const path = smoothTerminalPath(cadPath, 11, 5);
		const bends = terminalBendCount(path);
		const rawRef = String(jumper.jumperId || "").trim();
		const ref =
			rawRef.length > 0 ? rawRef : `JMP-${String(autoIndex).padStart(3, "0")}`;
		autoIndex += 1;
		maxNumericRef = Math.max(maxNumericRef, parseTrailingNumber(ref));

		routes.push({
			id: makeRouteId(),
			ref,
			routeType: "jumper",
			cableType: "DC",
			wireFunction: "Jumper",
			color: JUMPER_COLOR,
			fromTerminalId: from.id,
			toTerminalId: to.id,
			fromLabel: from.label,
			toLabel: to.label,
			path,
			cadPath,
			length: terminalPathLength(path),
			bendCount: bends,
			bendDegrees: bends * 90,
			createdAt: Date.now(),
			cadSyncStatus: "local",
			cadSyncAttempts: 0,
			cadLastError: "",
			cadEntityHandles: [],
		});
	}

	const nextRef = Math.max(1, maxNumericRef + 1, routes.length + 1);
	return { routes, unresolved, nextRef };
}

export function ConduitTerminalWorkflow() {
	const [connected, setConnected] = useState(false);
	const [scanning, setScanning] = useState(false);
	const [scanData, setScanData] = useState<TerminalScanData | null>(null);
	const [scanMeta, setScanMeta] = useState<TerminalScanMeta | null>(null);
	const [overlayEnabled, setOverlayEnabled] = useState(true);
	const [overlaySyncing, setOverlaySyncing] = useState(false);
	const [overlayObstacles, setOverlayObstacles] = useState<Obstacle[]>([]);
	const [overlayMeta, setOverlayMeta] =
		useState<ConduitObstacleScanMeta | null>(null);
	const [overlayMessage, setOverlayMessage] = useState("");
	const [statusMessage, setStatusMessage] = useState(
		"Offline. Run Connect & Scan to load terminal strips.",
	);
	const [fromTerminalId, setFromTerminalId] = useState<string | null>(null);
	const [hoverTerminalId, setHoverTerminalId] = useState<string | null>(null);
	const [routes, setRoutes] = useState<TerminalRouteRecord[]>([]);
	const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
	const [routeType, setRouteType] = useState<"conductor" | "jumper">(
		"conductor",
	);
	const [cableType, setCableType] = useState<CableSystemType>("DC");
	const [wireFunction, setWireFunction] = useState<string>(
		DEFAULT_WIRE_FUNCTIONS.DC,
	);
	const [nextRef, setNextRef] = useState<Record<string, number>>({});
	const [nextJumperRef, setNextJumperRef] = useState(1);
	const [syncingTerminalLabels, setSyncingTerminalLabels] = useState(false);
	const [etapCleanupRunning, setEtapCleanupRunning] = useState(false);
	const [etapCleanupCommand, setEtapCleanupCommand] =
		useState<EtapCleanupCommand>("ETAPFIX");
	const [etapCleanupPluginDllPath, setEtapCleanupPluginDllPath] = useState("");
	const [etapCleanupWaitForCompletion, setEtapCleanupWaitForCompletion] =
		useState(true);
	const [etapCleanupSaveDrawing, setEtapCleanupSaveDrawing] = useState(false);
	const [etapCleanupTimeoutMs, setEtapCleanupTimeoutMs] = useState(90000);
	const [resyncingFailed, setResyncingFailed] = useState(false);
	const [preflightChecking, setPreflightChecking] = useState(false);
	const [cadStatus, setCadStatus] = useState<TerminalCadRuntimeStatus | null>(
		null,
	);
	const [cadDiagnostics, setCadDiagnostics] = useState<
		TerminalCadSyncDiagnostic[]
	>([]);
	const cadSessionId = useMemo(() => makeCadSessionId(), []);
	const routesRef = useRef<TerminalRouteRecord[]>([]);
	const autoScanStartedRef = useRef(false);
	const runScanRef = useRef<(messagePrefix: string) => Promise<void>>(() =>
		Promise.resolve(),
	);

	useEffect(() => {
		const palette = WIRE_COLORS[cableType];
		if (!palette[wireFunction]) {
			setWireFunction(DEFAULT_WIRE_FUNCTIONS[cableType]);
		}
	}, [cableType, wireFunction]);

	const availableWireFunctions = useMemo(
		() => Object.keys(WIRE_COLORS[cableType]),
		[cableType],
	);
	const activeColor =
		routeType === "jumper"
			? JUMPER_COLOR
			: (WIRE_COLORS[cableType][wireFunction] ??
				WIRE_COLORS[cableType][DEFAULT_WIRE_FUNCTIONS[cableType]]);

	const layout = useMemo(
		() => (scanData ? buildTerminalLayout(scanData) : EMPTY_LAYOUT),
		[scanData],
	);
	const terminalById = useMemo(
		() => new Map(layout.terminals.map((terminal) => [terminal.id, terminal])),
		[layout.terminals],
	);
	const stripById = useMemo(
		() => new Map(layout.strips.map((strip) => [strip.stripId, strip])),
		[layout.strips],
	);
	const activeFromTerminal = fromTerminalId
		? terminalById.get(fromTerminalId)
		: null;
	const activeHoverTerminal = hoverTerminalId
		? terminalById.get(hoverTerminalId)
		: null;
	const selectedRoute =
		routes.find((route) => route.id === selectedRouteId) ?? null;

	const routeStats = useMemo(() => {
		const totalLength = routes.reduce((sum, route) => sum + route.length, 0);
		return {
			total: routes.length,
			totalLength,
			warnings: routes.filter((route) => route.bendDegrees > 360).length,
			pending: routes.filter((route) => route.cadSyncStatus === "pending")
				.length,
			failed: routes.filter((route) => route.cadSyncStatus === "failed").length,
			synced: routes.filter((route) => route.cadSyncStatus === "synced").length,
		};
	}, [routes]);
	const cadProviderConfigured =
		cadStatus?.conduit_route_provider?.configured || "unknown";
	const cadPreflightReady = Boolean(
		cadStatus?.autocad_running && cadStatus?.drawing_open,
	);
	const cadPreflightLabel = preflightChecking
		? "CAD Check..."
		: cadStatus
			? cadPreflightReady
				? "CAD Drawing Ready"
				: "CAD Not Ready"
			: "CAD Unchecked";

	useEffect(() => {
		routesRef.current = routes;
	}, [routes]);

	const appendCadDiagnostic = (
		entry: Omit<TerminalCadSyncDiagnostic, "id" | "at">,
	) => {
		setCadDiagnostics((current) => {
			const nextEntry: TerminalCadSyncDiagnostic = {
				id: makeDiagnosticId(),
				at: Date.now(),
				...entry,
			};
			return [nextEntry, ...current].slice(0, CAD_DIAGNOSTIC_HISTORY_MAX);
		});
	};

	const refreshCadPreflight =
		async (): Promise<TerminalCadRuntimeStatus | null> => {
			setPreflightChecking(true);
			try {
				const response = await conduitTerminalService.getAutoCadStatus();
				if (response.status) {
					setCadStatus(response.status);
					appendCadDiagnostic({
						operation: "preflight",
						success: response.success,
						code: response.success ? "" : "CAD_PREFLIGHT_FAILED",
						message:
							response.message ||
							(response.success
								? "AutoCAD preflight passed."
								: "AutoCAD preflight check reported unavailable state."),
						providerConfigured:
							response.status.conduit_route_provider?.configured || "unknown",
						providerPath:
							response.status.conduit_route_provider?.configured || "unknown",
					});
				} else {
					appendCadDiagnostic({
						operation: "preflight",
						success: false,
						code: "CAD_PREFLIGHT_FAILED",
						message:
							response.message ||
							`AutoCAD preflight returned ${response.httpStatus || "unknown"} with no status payload.`,
					});
				}
				return response.status ?? null;
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "AutoCAD preflight request failed.";
				appendCadDiagnostic({
					operation: "preflight",
					success: false,
					code: "CAD_PREFLIGHT_NETWORK_FAILED",
					message,
				});
				return null;
			} finally {
				setPreflightChecking(false);
			}
		};

	const panelRows = useMemo(() => {
		if (!scanData) return [];
		return Object.entries(scanData.panels).map(([panelId, panel]) => {
			const stripCount = Object.values(panel.sides).reduce(
				(sum, side) => sum + side.strips.length,
				0,
			);
			return { panelId, color: panel.color, name: panel.fullName, stripCount };
		});
	}, [scanData]);

	const routeRows = routes
		.slice()
		.sort((a, b) => b.createdAt - a.createdAt)
		.map((route) => ({
			id: route.id,
			ref: route.ref,
			from: route.fromLabel,
			to: route.toLabel,
			function: route.wireFunction,
			colorCode: route.color.code,
			sync: route.cadSyncStatus || "local",
			length: Math.round(route.length),
		}));

	const syncObstacleOverlay = async (
		targetLayout: TerminalLayoutResult,
	): Promise<{
		success: boolean;
		count: number;
		message: string;
		obstacles: Obstacle[];
	}> => {
		setOverlaySyncing(true);
		try {
			const response = await conduitRouteService.scanObstacles({
				selectionOnly: false,
				includeModelspace: true,
				maxEntities: 50000,
				canvasWidth: targetLayout.canvasWidth,
				canvasHeight: targetLayout.canvasHeight,
			});

			if (response.success && response.data) {
				const obstacles = response.data.obstacles ?? [];
				setOverlayObstacles(obstacles);
				setOverlayMeta(response.meta ?? null);
				setOverlayMessage("");
				return {
					success: true,
					count: obstacles.length,
					message:
						response.message ||
						`Obstacle overlay synced (${obstacles.length} obstacle(s)).`,
					obstacles,
				};
			}

			setOverlayObstacles([]);
			setOverlayMeta(response.meta ?? null);
			setOverlayMessage(response.message || "Obstacle overlay unavailable.");
			return {
				success: false,
				count: 0,
				message: response.message || "Obstacle overlay unavailable.",
				obstacles: [],
			};
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Obstacle overlay sync request failed.";
			setOverlayObstacles([]);
			setOverlayMeta(null);
			setOverlayMessage(message);
			return { success: false, count: 0, message, obstacles: [] };
		} finally {
			setOverlaySyncing(false);
		}
	};

	const runScan = async (messagePrefix: string) => {
		if (scanning) return;
		setScanning(true);
		setStatusMessage(messagePrefix);
		const preflightStatus = await refreshCadPreflight();
		const response = await conduitTerminalService.scanTerminalStrips({
			selectionOnly: false,
			includeModelspace: true,
			maxEntities: 50000,
			terminalProfile: DEFAULT_TERMINAL_SCAN_PROFILE,
		});
		setScanning(false);

		if (response.success && response.data) {
			setConnected(true);
			setScanData(response.data);
			setScanMeta(response.meta ?? null);
			setFromTerminalId(null);
			setHoverTerminalId(null);
			setSelectedRouteId(null);
			const panelCount = Object.keys(response.data.panels).length;
			const terminalCount = response.meta?.totalTerminals ?? 0;
			const nextLayout = buildTerminalLayout(response.data);
			const obstacleResult = await syncObstacleOverlay(nextLayout);
			const jumperScan = buildJumperRoutes(
				response.data,
				nextLayout,
				obstacleResult.obstacles,
			);
			const detectedJumperDefinitions = Array.isArray(response.data.jumpers)
				? response.data.jumpers.length
				: 0;
			setRoutes([]);
			setNextJumperRef(
				Math.max(
					nextJumperRefFromDefinitions(response.data),
					jumperScan.nextRef,
				),
			);
			setNextRef({});
			const labelSyncResult = await syncTerminalLabelsInCad(response.data);
			const baseMessage =
				response.message ||
				`Scan loaded ${panelCount} panel(s) and ${terminalCount} terminal(s).`;
			const jumperSuffix =
				detectedJumperDefinitions > 0
					? ` Detected ${detectedJumperDefinitions} jumper definition(s); manual jumper mode is active.`
					: "";
			const unresolvedSuffix =
				jumperScan.unresolved > 0
					? ` ${jumperScan.unresolved} detected jumper definition(s) did not map cleanly to scanned terminals.`
					: "";
			const preflightSuffix =
				preflightStatus && preflightStatus.drawing_open
					? " CAD preflight: drawing open."
					: preflightStatus
						? " CAD preflight: drawing not open."
						: "";
			const overlaySuffix = obstacleResult.success
				? ` Obstacle overlay: ${obstacleResult.count}.`
				: " Obstacle overlay unavailable.";
			const labelSyncSuffix = labelSyncResult.success
				? ` Label sync: ${labelSyncResult.updatedStrips}/${Math.max(1, labelSyncResult.targetStrips)} strip(s) updated via ${labelSyncResult.providerPath}.`
				: ` Label sync failed: ${labelSyncResult.message}`;
			setStatusMessage(
				`${baseMessage}${jumperSuffix}${unresolvedSuffix}${preflightSuffix}${overlaySuffix}${labelSyncSuffix}`,
			);
			return;
		}

		if (response.data) {
			// Keep connectivity true when backend responded but returned no strips.
			setConnected(true);
			setScanData(response.data);
			setScanMeta(response.meta ?? null);
			setRoutes([]);
			setNextRef({});
			setNextJumperRef(1);
			setSelectedRouteId(null);
			setOverlayObstacles([]);
			setOverlayMeta(null);
			setOverlayMessage("");
			setStatusMessage(
				`${response.message || "No terminal strips detected. Check block naming and attributes."}${
					preflightStatus && !preflightStatus.drawing_open
						? " CAD preflight indicates no active drawing."
						: ""
				}`,
			);
			return;
		}

		setConnected(false);
		setScanData(null);
		setScanMeta(null);
		setOverlayObstacles([]);
		setOverlayMeta(null);
		setOverlayMessage("");
		setFromTerminalId(null);
		setHoverTerminalId(null);
		setNextRef({});
		setNextJumperRef(1);
		setStatusMessage(
			`${response.message || "Terminal scan failed."}${
				preflightStatus && !preflightStatus.drawing_open
					? " CAD preflight indicates no active drawing."
					: ""
			}`,
		);
	};
	runScanRef.current = runScan;

	useEffect(() => {
		if (!AUTO_CONNECT_ON_MOUNT || autoScanStartedRef.current) {
			return;
		}
		autoScanStartedRef.current = true;
		void runScanRef.current(
			"Auto-connecting bridge and scanning terminal strips...",
		);
	}, []);

	const connectAndScan = () => {
		void runScan("Connecting bridge and scanning terminal strips...");
	};

	const rescan = () => {
		void runScan("Rescanning terminal strips...");
	};

	const rescanOverlay = () => {
		if (!connected || !scanData || overlaySyncing) {
			return;
		}
		const nextLayout = buildTerminalLayout(scanData);
		void (async () => {
			const result = await syncObstacleOverlay(nextLayout);
			setStatusMessage(
				result.success
					? `Obstacle overlay synced (${result.count} obstacle(s)).`
					: result.message || "Obstacle overlay sync failed.",
			);
		})();
	};

	const syncTerminalLabelsInCad = async (
		targetScanData: TerminalScanData,
	): Promise<{
		success: boolean;
		message: string;
		updatedStrips: number;
		targetStrips: number;
		providerPath: string;
	}> => {
		if (syncingTerminalLabels) {
			return {
				success: false,
				message: "Terminal label sync already in progress.",
				updatedStrips: 0,
				targetStrips: 0,
				providerPath: "client",
			};
		}

		setSyncingTerminalLabels(true);
		try {
			const providerStatus = cadStatus?.conduit_route_provider;
			const response = await conduitTerminalService.syncTerminalLabels(
				buildTerminalLabelSyncRequest(targetScanData),
				{
					mode: "auto",
					providerConfigured:
						typeof providerStatus?.configured === "string"
							? providerStatus.configured
							: "",
					dotnetSenderReady:
						typeof providerStatus?.dotnet_sender_ready === "boolean"
							? providerStatus.dotnet_sender_ready
							: undefined,
				},
			);
			return {
				success: Boolean(response.success),
				message:
					response.message ||
					(response.success
						? "Terminal labels synced to CAD."
						: "Terminal label sync failed."),
				updatedStrips: response.data?.updatedStrips ?? 0,
				targetStrips: response.data?.targetStrips ?? 0,
				providerPath: resolveCadProviderPath(response.meta),
			};
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Terminal label sync failed unexpectedly.";
			return {
				success: false,
				message,
				updatedStrips: 0,
				targetStrips: 0,
				providerPath: "client",
			};
		} finally {
			setSyncingTerminalLabels(false);
		}
	};

	const syncTerminalLabelsNow = () => {
		if (!connected || !scanData) {
			setStatusMessage("Connect and scan before syncing terminal labels.");
			return;
		}
		void (async () => {
			const result = await syncTerminalLabelsInCad(scanData);
			if (result.success) {
				setStatusMessage(
					`Terminal labels synced to CAD (${result.updatedStrips}/${Math.max(1, result.targetStrips)} strip(s) updated via ${result.providerPath}).`,
				);
				return;
			}
			setStatusMessage(`Terminal label sync failed: ${result.message}`);
		})();
	};

	const runEtapCleanupNow = () => {
		if (!connected) {
			setStatusMessage("Connect and scan before running ETAP cleanup.");
			return;
		}
		if (etapCleanupRunning) {
			return;
		}

		const timeoutMs = Math.max(
			1000,
			Math.min(600000, Math.trunc(etapCleanupTimeoutMs || 90000)),
		);
		const pluginDllPath = etapCleanupPluginDllPath.trim();
		setEtapCleanupRunning(true);
		setStatusMessage(`Running ${etapCleanupCommand} through AutoCAD bridge...`);

		void (async () => {
			try {
				const response = await conduitTerminalService.runEtapCleanup({
					command: etapCleanupCommand,
					pluginDllPath: pluginDllPath.length > 0 ? pluginDllPath : undefined,
					waitForCompletion: etapCleanupWaitForCompletion,
					timeoutMs,
					saveDrawing: etapCleanupSaveDrawing,
				});
				const providerPath = resolveCadProviderPath(response.meta);
				const requestId =
					typeof response.meta?.requestId === "string"
						? response.meta.requestId
						: "";
				const bridgeRequestId =
					typeof response.meta?.bridgeRequestId === "string"
						? response.meta.bridgeRequestId
						: "";

				appendCadDiagnostic({
					operation: "etap_cleanup",
					success: Boolean(response.success),
					code: response.code || "",
					message:
						response.message ||
						(response.success
							? `${etapCleanupCommand} completed.`
							: `${etapCleanupCommand} failed.`),
					warnings: response.warnings ?? [],
					requestId,
					bridgeRequestId,
					providerPath,
					providerConfigured:
						typeof response.meta?.providerConfigured === "string"
							? response.meta.providerConfigured
							: providerPath,
				});

				if (response.success) {
					const drawingName = response.data?.drawing?.name || "";
					setStatusMessage(
						drawingName
							? `${etapCleanupCommand} completed for ${drawingName}.`
							: (response.message || `${etapCleanupCommand} completed.`),
					);
					return;
				}

				setStatusMessage(
					`${etapCleanupCommand} failed (${response.code || "unknown"}): ${response.message || "Request failed."}`,
				);
			} finally {
				setEtapCleanupRunning(false);
			}
		})();
	};

	const buildCadRoutePayload = (
		route: TerminalRouteRecord,
	): TerminalCadRouteRecord => {
		const worldPath = (
			route.cadPath && route.cadPath.length >= 2 ? route.cadPath : route.path
		).map((point) => canvasPointToWorld(point, layout.transform));
		const filletRadius =
			route.routeType === "jumper"
				? 0
				: computeWorldFilletRadius(worldPath);
		return {
			ref: route.ref,
			routeType: route.routeType,
			wireFunction: route.wireFunction,
			cableType: route.cableType,
			colorCode: route.color.code,
			colorAci: route.color.aci,
			layerName: cadLayerForRoute(route),
			filletRadius,
			path: worldPath,
		};
	};

	const applyRouteSyncPatch = (
		routeId: string,
		patch: Partial<TerminalRouteRecord>,
	): boolean => {
		let found = false;
		setRoutes((current) =>
			current.map((route) => {
				if (route.id !== routeId) {
					return route;
				}
				found = true;
				return { ...route, ...patch };
			}),
		);
		return found;
	};

	const syncRouteToCad = async (
		route: TerminalRouteRecord,
		attempt = 0,
	): Promise<boolean> => {
		if (!connected || !scanData) {
			return false;
		}
		if (cadStatus && !cadStatus.drawing_open) {
			const preflightError =
				cadStatus.error ||
				"No drawing open in AutoCAD according to preflight status.";
			applyRouteSyncPatch(route.id, {
				cadSyncStatus: "failed",
				cadLastError: preflightError,
				cadLastCode: "CAD_PREFLIGHT_DRAWING_NOT_OPEN",
				cadLastMessage: preflightError,
				cadWarnings: [],
				cadRequestId: "",
				cadBridgeRequestId: "",
				cadProviderPath:
					cadStatus.conduit_route_provider?.configured || "unknown",
				cadLastOperation: "upsert",
			});
			appendCadDiagnostic({
				operation: "upsert",
				success: false,
				routeId: route.id,
				routeRef: route.ref,
				code: "CAD_PREFLIGHT_DRAWING_NOT_OPEN",
				message: preflightError,
				providerPath: cadStatus.conduit_route_provider?.configured || "unknown",
				providerConfigured:
					cadStatus.conduit_route_provider?.configured || "unknown",
			});
			setStatusMessage(
				`${route.ref} routed in app, but CAD sync blocked by preflight (no drawing open).`,
			);
			return false;
		}
		const stillPresent = routesRef.current.some(
			(entry) => entry.id === route.id,
		);
		if (!stillPresent) {
			appendCadDiagnostic({
				operation: "upsert",
				success: false,
				routeId: route.id,
				routeRef: route.ref,
				code: "CAD_ROUTE_NOT_ACTIVE",
				message:
					"Skipped CAD sync because route is no longer active in app state.",
				providerPath: "client",
			});
			return false;
		}

		applyRouteSyncPatch(route.id, {
			cadSyncStatus: "pending",
			cadSyncAttempts: attempt + 1,
			cadLastError: "",
		});

		try {
			const response = await conduitTerminalService.drawTerminalRoutes({
				operation: "upsert",
				sessionId: cadSessionId,
				clientRouteId: route.id,
				route: buildCadRoutePayload(route),
				defaultLayerName: "SUITE_WIRE_AUTO",
				annotateRefs: true,
				textHeight: 0.125,
			});
			const providerPath = resolveCadProviderPath(response.meta);
			const drawnLines = response.data?.drawnLines ?? 0;
			const drawnArcs = response.data?.drawnArcs ?? 0;
			const filletAppliedCorners = response.data?.filletAppliedCorners ?? 0;
			const filletSkippedCorners = response.data?.filletSkippedCorners ?? 0;
			const geometryVersion = response.data?.geometryVersion ?? "";
			const geometrySuffix =
				geometryVersion ||
				drawnLines ||
				drawnArcs ||
				filletAppliedCorners ||
				filletSkippedCorners
					? ` [${geometryVersion || "geom"} ${drawnLines}L/${drawnArcs}A fillet ${filletAppliedCorners}/${filletSkippedCorners}]`
					: "";
			const responseMessage =
				(response.message ||
					`Route ${route.ref} ${response.success ? "synced" : "failed"} in AutoCAD sync.`) +
				geometrySuffix;
			const warnings = response.warnings ?? [];
			const code = response.code || "";
			const requestId = response.meta?.requestId || "";
			const bridgeRequestId = response.meta?.bridgeRequestId || "";
			if (response.success) {
				const handles =
					response.data?.bindings?.[route.id]?.entityHandles ??
					route.cadEntityHandles ??
					[];
				applyRouteSyncPatch(route.id, {
					cadSyncStatus: "synced",
					cadLastError: "",
					cadLastCode: code,
					cadLastMessage: responseMessage,
					cadWarnings: warnings,
					cadRequestId: requestId,
					cadBridgeRequestId: bridgeRequestId,
					cadProviderPath: providerPath,
					cadLastOperation: "upsert",
					cadEntityHandles: handles,
					cadSyncedAt: Date.now(),
				});
				appendCadDiagnostic({
					operation: "upsert",
					success: true,
					routeId: route.id,
					routeRef: route.ref,
					code,
					message: responseMessage,
					warnings,
					requestId,
					bridgeRequestId,
					providerPath,
					providerConfigured: response.meta?.providerConfigured,
					drawnLines: response.data?.drawnLines,
					drawnArcs: response.data?.drawnArcs,
					filletAppliedCorners: response.data?.filletAppliedCorners,
					filletSkippedCorners: response.data?.filletSkippedCorners,
					geometryVersion: response.data?.geometryVersion,
				});
				return true;
			}
			const errorMessage =
				response.message || "AutoCAD route sync failed for committed route.";
			if (attempt < CAD_SYNC_MAX_RETRIES) {
				await delayMs(CAD_SYNC_RETRY_BASE_DELAY_MS * (attempt + 1));
				return syncRouteToCad(route, attempt + 1);
			}
			applyRouteSyncPatch(route.id, {
				cadSyncStatus: "failed",
				cadLastError: errorMessage,
				cadLastCode: code,
				cadLastMessage: responseMessage,
				cadWarnings: warnings,
				cadRequestId: requestId,
				cadBridgeRequestId: bridgeRequestId,
				cadProviderPath: providerPath,
				cadLastOperation: "upsert",
			});
			appendCadDiagnostic({
				operation: "upsert",
				success: false,
				routeId: route.id,
				routeRef: route.ref,
				code,
				message: responseMessage,
				warnings,
				requestId,
				bridgeRequestId,
				providerPath,
				providerConfigured: response.meta?.providerConfigured,
				drawnLines: response.data?.drawnLines,
				drawnArcs: response.data?.drawnArcs,
				filletAppliedCorners: response.data?.filletAppliedCorners,
				filletSkippedCorners: response.data?.filletSkippedCorners,
				geometryVersion: response.data?.geometryVersion,
			});
			setStatusMessage(
				`${route.ref} routed in app, but CAD sync failed (${code || "unknown"}). Use Resync Failed.`,
			);
			return false;
		} catch (error) {
			if (attempt < CAD_SYNC_MAX_RETRIES) {
				await delayMs(CAD_SYNC_RETRY_BASE_DELAY_MS * (attempt + 1));
				return syncRouteToCad(route, attempt + 1);
			}
			const errorMessage =
				error instanceof Error
					? error.message
					: "CAD route sync request failed unexpectedly.";
			applyRouteSyncPatch(route.id, {
				cadSyncStatus: "failed",
				cadLastError: errorMessage,
				cadLastCode: "NETWORK_ERROR",
				cadLastMessage: errorMessage,
				cadWarnings: [],
				cadRequestId: "",
				cadBridgeRequestId: "",
				cadProviderPath: "client",
				cadLastOperation: "upsert",
			});
			appendCadDiagnostic({
				operation: "upsert",
				success: false,
				routeId: route.id,
				routeRef: route.ref,
				code: "NETWORK_ERROR",
				message: errorMessage,
				warnings: [],
				providerPath: "client",
			});
			setStatusMessage(
				`${route.ref} routed in app, but CAD sync failed (NETWORK_ERROR). Use Resync Failed.`,
			);
			return false;
		}
	};

	const deleteRouteFromCad = async (
		routeId: string,
		routeRefLabel: string,
	): Promise<void> => {
		if (!connected || !scanData) {
			return;
		}
		try {
			const response = await conduitTerminalService.drawTerminalRoutes({
				operation: "delete",
				sessionId: cadSessionId,
				clientRouteId: routeId,
			});
			appendCadDiagnostic({
				operation: "delete",
				success: Boolean(response.success),
				routeId,
				routeRef: routeRefLabel,
				code: response.code || "",
				message:
					response.message ||
					`Delete route ${routeRefLabel} ${response.success ? "completed" : "failed"}.`,
				warnings: response.warnings ?? [],
				requestId: response.meta?.requestId,
				bridgeRequestId: response.meta?.bridgeRequestId,
				providerPath: resolveCadProviderPath(response.meta),
				providerConfigured: response.meta?.providerConfigured,
			});
			if (!response.success) {
				setStatusMessage(
					`${response.message || `${routeRefLabel} removed in app but CAD delete failed.`} (${response.code || "unknown"})`,
				);
			}
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: `${routeRefLabel} removed in app but CAD delete failed.`;
			appendCadDiagnostic({
				operation: "delete",
				success: false,
				routeId,
				routeRef: routeRefLabel,
				code: "NETWORK_ERROR",
				message,
				providerPath: "client",
			});
			setStatusMessage(
				`${routeRefLabel} removed in app but CAD delete failed.`,
			);
		}
	};

	const resetCadSessionRoutes = async (): Promise<void> => {
		if (!connected || !scanData) {
			return;
		}
		try {
			const response = await conduitTerminalService.drawTerminalRoutes({
				operation: "reset",
				sessionId: cadSessionId,
			});
			appendCadDiagnostic({
				operation: "reset",
				success: Boolean(response.success),
				code: response.code || "",
				message:
					response.message ||
					`Reset CAD sync session ${response.success ? "completed" : "failed"}.`,
				warnings: response.warnings ?? [],
				requestId: response.meta?.requestId,
				bridgeRequestId: response.meta?.bridgeRequestId,
				providerPath: resolveCadProviderPath(response.meta),
				providerConfigured: response.meta?.providerConfigured,
			});
			if (!response.success) {
				setStatusMessage(
					`${response.message || "Routes cleared in app, but CAD session reset failed."} (${response.code || "unknown"})`,
				);
			}
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Routes cleared in app, but CAD session reset failed.";
			appendCadDiagnostic({
				operation: "reset",
				success: false,
				code: "NETWORK_ERROR",
				message,
				providerPath: "client",
			});
			setStatusMessage("Routes cleared in app, but CAD session reset failed.");
		}
	};

	const resyncFailedRoutes = async () => {
		if (resyncingFailed) {
			return;
		}
		const failedRoutes = routesRef.current.filter(
			(route) => route.cadSyncStatus === "failed",
		);
		if (failedRoutes.length === 0) {
			setStatusMessage("No failed CAD routes to resync.");
			return;
		}

		setResyncingFailed(true);
		let recovered = 0;
		for (const route of failedRoutes) {
			const ok = await syncRouteToCad(route);
			if (ok) {
				recovered += 1;
			}
		}
		setResyncingFailed(false);
		setStatusMessage(
			`Resync complete: ${recovered}/${failedRoutes.length} failed route(s) recovered.`,
		);
	};

	const disconnect = () => {
		if (routesRef.current.length > 0) {
			void resetCadSessionRoutes();
		}
		setEtapCleanupRunning(false);
		setConnected(false);
		setCadStatus(null);
		setScanning(false);
		setScanData(null);
		setScanMeta(null);
		setOverlayObstacles([]);
		setOverlayMeta(null);
		setOverlayMessage("");
		setFromTerminalId(null);
		setHoverTerminalId(null);
		setStatusMessage("Bridge disconnected.");
	};

	const clearRoutes = () => {
		const clearedCount = routesRef.current.length;
		routesRef.current = [];
		setRoutes([]);
		setSelectedRouteId(null);
		setFromTerminalId(null);
		if (clearedCount > 0) {
			void resetCadSessionRoutes();
		}
		setStatusMessage(
			clearedCount > 0
				? "Terminal route history cleared and CAD reset requested."
				: "Terminal route history cleared.",
		);
	};

	const undoRoute = () => {
		if (routes.length === 0) {
			setStatusMessage("Nothing to undo.");
			return;
		}
		const latest = routes[0];
		routesRef.current = routes.slice(1);
		setRoutes((current) => current.slice(1));
		setSelectedRouteId(null);
		if (latest) {
			void deleteRouteFromCad(latest.id, latest.ref);
		}
		setStatusMessage("Latest terminal route removed.");
	};

	const handleTerminalClick = (terminal: TerminalNode) => {
		if (!connected || !scanData) {
			setStatusMessage("Bridge offline. Connect before routing terminals.");
			return;
		}
		if (!fromTerminalId) {
			setFromTerminalId(terminal.id);
			setStatusMessage(
				`Start locked at ${terminal.label}. Click destination terminal to route.`,
			);
			return;
		}
		if (fromTerminalId === terminal.id) {
			setFromTerminalId(null);
			setStatusMessage("Start terminal cleared.");
			return;
		}

		const from = terminalById.get(fromTerminalId);
		if (!from) {
			setFromTerminalId(null);
			setStatusMessage("Start terminal not found. Select again.");
			return;
		}

		const isJumper = routeType === "jumper";
		const cadPath = isJumper
			? buildJumperCadPath(from, terminal, layout)
			: (() => {
					const fromEdge = terminalStripEdgePoint(from, layout.strips, terminal);
					const toEdge = terminalStripEdgePoint(terminal, layout.strips, from);
					const fromLead = terminalLeadFromEdge(fromEdge, from.side, toEdge, 36);
					const toLead = terminalLeadFromEdge(toEdge, terminal.side, fromEdge, 36);
					const trunkPath = routeTerminalPath(
						fromLead,
						toLead,
						layout.strips,
						layout.canvasWidth,
						layout.canvasHeight,
						overlayObstacles,
					);
					return snapCadPathToGrid(
						dedupePath([fromEdge, fromLead, ...trunkPath, toLead, toEdge]),
					);
				})();
		const path = isJumper ? cadPath : smoothTerminalPath(cadPath, 11, 5);
		const bends = terminalBendCount(path);
		const conductorRefKey = conductorRouteRefKey(cableType, wireFunction);
		const conductorRefNumber = nextRef[conductorRefKey] ?? 1;
		const routeRef = isJumper
			? `JMP-${String(nextJumperRef).padStart(3, "0")}`
			: `${cableType}-${String(conductorRefNumber).padStart(3, "0")}`;
		const route: TerminalRouteRecord = {
			id: makeRouteId(),
			ref: routeRef,
			routeType,
			cableType,
			wireFunction: isJumper ? "Jumper" : wireFunction,
			color: activeColor,
			fromTerminalId: from.id,
			toTerminalId: terminal.id,
			fromLabel: from.label,
			toLabel: terminal.label,
			path,
			cadPath,
			length: terminalPathLength(path),
			bendCount: bends,
			bendDegrees: bends * 90,
			createdAt: Date.now(),
			cadSyncStatus: "pending",
			cadSyncAttempts: 0,
			cadLastError: "",
			cadEntityHandles: [],
		};

		routesRef.current = [route, ...routesRef.current];
		setRoutes((current) => [route, ...current]);
		void syncRouteToCad(route);
		setSelectedRouteId(route.id);
		setFromTerminalId(null);
		if (isJumper) {
			setNextJumperRef((current) => current + 1);
		} else {
			setNextRef((current) => ({
				...current,
				[conductorRefKey]: (current[conductorRefKey] ?? 1) + 1,
			}));
		}
		if (route.bendDegrees > 360) {
			setStatusMessage(
				`${route.ref} routed with ${route.bendDegrees} deg total bends. Add pull point in panel field install.`,
			);
			return;
		}
		setStatusMessage(
			`${route.ref} routed ${route.fromLabel} -> ${route.toLabel} (${formatLength(route.length)}).`,
		);
	};

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<div className={styles.titleStack}>
					<Text size="sm" weight="semibold">
						Terminal Strip Routing Workflow
					</Text>
					<Text size="xs" color="muted">
						Connect, scan strips, pick source and destination terminals, then
						commit routed conductors.
					</Text>
				</div>
				<div className={styles.headerBadges}>
					<Badge
						color={connected ? "success" : "default"}
						variant="outline"
						size="sm"
					>
						{connected ? <CheckCircle2 size={12} /> : <PowerOff size={12} />}
						{connected ? "Bridge Connected" : "Bridge Offline"}
					</Badge>
					<Badge color="primary" variant="outline" size="sm">
						<Rows3 size={12} />
						{scanData ? `${layout.terminals.length} Terminals` : "No Scan"}
					</Badge>
					<Badge color="default" variant="outline" size="sm">
						<Route size={12} />
						{cadProviderConfigured}
					</Badge>
					<Badge
						color={cadPreflightReady ? "success" : "warning"}
						variant="outline"
						size="sm"
					>
						{preflightChecking ? (
							<LoaderCircle size={12} />
						) : (
							<Link2 size={12} />
						)}
						{cadPreflightLabel}
					</Badge>
					{scanMeta?.scanMs ? (
						<Badge color="default" variant="outline" size="sm">
							<RefreshCw size={12} />
							{scanMeta.scanMs} ms
						</Badge>
					) : null}
				</div>
			</div>

			<div className={styles.actions}>
				<Button
					variant={connected ? "secondary" : "primary"}
					size="sm"
					iconLeft={
						scanning ? <LoaderCircle size={14} /> : <PlugZap size={14} />
					}
					loading={scanning}
					onClick={connectAndScan}
				>
					Connect & Scan
				</Button>
				<Button
					variant="outline"
					size="sm"
					iconLeft={<RefreshCw size={14} />}
					onClick={rescan}
					disabled={!connected || scanning}
				>
					Rescan
				</Button>
				<Button
					variant="ghost"
					size="sm"
					iconLeft={<X size={14} />}
					onClick={disconnect}
					disabled={!connected && !scanning}
				>
					Disconnect
				</Button>
			</div>

			<div className={styles.layout}>
				<Panel variant="glass" padding="md" className={styles.controlsCard}>
					<Stack gap={3}>
						<div className={styles.controlGroup}>
							<Text size="xs" color="muted">
								Route Type
							</Text>
							<div className={styles.toggleRow}>
								<Button
									variant={routeType === "conductor" ? "primary" : "outline"}
									size="sm"
									onClick={() => setRouteType("conductor")}
								>
									Conductor
								</Button>
								<Button
									variant={routeType === "jumper" ? "primary" : "outline"}
									size="sm"
									onClick={() => setRouteType("jumper")}
								>
									Jumper
								</Button>
							</div>
						</div>

						<div className={styles.controlGroup}>
							<Text size="xs" color="muted">
								Cable System
							</Text>
							<div className={styles.toggleRow}>
								{(["AC", "DC"] as const).map((entry) => (
									<Button
										key={entry}
										variant={cableType === entry ? "primary" : "outline"}
										size="sm"
										onClick={() => setCableType(entry)}
										disabled={routeType === "jumper"}
									>
										{entry}
									</Button>
								))}
							</div>
						</div>

						<div className={styles.controlGroup}>
							<Text size="xs" color="muted">
								Wire Function
							</Text>
							<div className={styles.functionGrid}>
								{availableWireFunctions.map((entry) => (
									<button
										key={entry}
										type="button"
										onClick={() => setWireFunction(entry)}
										disabled={routeType === "jumper"}
										className={cn(
											styles.functionButton,
											wireFunction === entry && styles.functionButtonActive,
											routeType === "jumper" && styles.functionButtonDisabled,
										)}
									>
										<span
											className={styles.swatch}
											style={{ background: WIRE_COLORS[cableType][entry].hex }}
										/>
										<span>{entry}</span>
										<small>{WIRE_COLORS[cableType][entry].code}</small>
									</button>
								))}
							</div>
						</div>

						<div className={styles.controlGroup}>
							<Text size="xs" color="muted">
								Start Terminal
							</Text>
							<div className={styles.startSelection}>
								{activeFromTerminal
									? activeFromTerminal.label
									: "None selected"}
							</div>
						</div>

						<div className={styles.controlGroup}>
							<Text size="xs" color="muted">
								CAD Preflight
							</Text>
							<div className={styles.preflightCard}>
								<div>
									<strong>{cadPreflightLabel}</strong>
									<small>
										Provider: {cadProviderConfigured}
										{cadStatus?.drawing_name
											? ` · ${cadStatus.drawing_name}`
											: ""}
									</small>
								</div>
								{cadStatus?.error ? <small>{cadStatus.error}</small> : null}
							</div>
						</div>

						<div className={styles.controlGroup}>
							<Text size="xs" color="muted">
								ETAP DXF Cleanup
							</Text>
							<div className={styles.etapCard}>
								<label className={styles.etapField}>
									<span>Command</span>
									<select
										className={styles.etapSelect}
										value={etapCleanupCommand}
										onChange={(event) =>
											setEtapCleanupCommand(
												event.target.value as EtapCleanupCommand,
											)
										}
										disabled={etapCleanupRunning || scanning}
									>
										{ETAP_CLEANUP_COMMANDS.map((command) => (
											<option key={command} value={command}>
												{command}
											</option>
										))}
									</select>
								</label>
								<label className={styles.etapField}>
									<span>Plugin DLL (optional)</span>
									<input
										type="text"
										className={styles.etapInput}
										placeholder="C:\\AutoCAD\\Plugins\\EtapDxfCleanup.dll"
										value={etapCleanupPluginDllPath}
										onChange={(event) =>
											setEtapCleanupPluginDllPath(event.target.value)
										}
										disabled={etapCleanupRunning || scanning}
									/>
								</label>
								<label className={styles.etapField}>
									<span>Timeout (ms)</span>
									<input
										type="number"
										min={1000}
										max={600000}
										step={1000}
										className={styles.etapInput}
										value={etapCleanupTimeoutMs}
										onChange={(event) =>
											setEtapCleanupTimeoutMs(Number(event.target.value) || 90000)
										}
										disabled={etapCleanupRunning || scanning}
									/>
								</label>
								<div className={styles.etapToggleRow}>
									<label className={styles.etapToggle}>
										<input
											type="checkbox"
											checked={etapCleanupWaitForCompletion}
											onChange={(event) =>
												setEtapCleanupWaitForCompletion(event.target.checked)
											}
											disabled={etapCleanupRunning || scanning}
										/>
										<span>Wait for completion</span>
									</label>
									<label className={styles.etapToggle}>
										<input
											type="checkbox"
											checked={etapCleanupSaveDrawing}
											onChange={(event) =>
												setEtapCleanupSaveDrawing(event.target.checked)
											}
											disabled={etapCleanupRunning || scanning}
										/>
										<span>Save drawing after run</span>
									</label>
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={runEtapCleanupNow}
									disabled={!connected || scanning || etapCleanupRunning}
									loading={etapCleanupRunning}
									iconLeft={
										etapCleanupRunning ? (
											<LoaderCircle size={14} />
										) : (
											<PlugZap size={14} />
										)
									}
								>
									Run ETAP Cleanup
								</Button>
							</div>
						</div>

						<div className={styles.controlGroup}>
							<Text size="xs" color="muted">
								Panel Snapshot
							</Text>
							<div className={styles.panelList}>
								{panelRows.length === 0 ? (
									<div className={styles.emptyState}>
										Run scan to list panels.
									</div>
								) : (
									panelRows.map((panel) => (
										<div key={panel.panelId} className={styles.panelItem}>
											<span
												className={styles.panelDot}
												style={{ background: panel.color }}
											/>
											<div>
												<strong>{panel.panelId}</strong>
												<small>
													{panel.name} · {panel.stripCount} strips
												</small>
											</div>
										</div>
									))
								)}
							</div>
						</div>

						<div className={styles.actionRow}>
							<Button
								variant="secondary"
								size="sm"
								onClick={resyncFailedRoutes}
								disabled={
									!connected || routeStats.failed === 0 || resyncingFailed
								}
								loading={resyncingFailed}
								iconLeft={
									resyncingFailed ? (
										<LoaderCircle size={14} />
									) : (
										<RefreshCw size={14} />
									)
								}
							>
								Resync Failed
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={syncTerminalLabelsNow}
								disabled={!connected || !scanData || syncingTerminalLabels}
								loading={syncingTerminalLabels}
								iconLeft={
									syncingTerminalLabels ? (
										<LoaderCircle size={14} />
									) : (
										<RefreshCw size={14} />
									)
								}
							>
								Sync Labels
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={clearRoutes}
								disabled={routes.length === 0}
							>
								Clear All
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={undoRoute}
								disabled={routes.length === 0}
							>
								Undo
							</Button>
						</div>
					</Stack>
				</Panel>

				<Panel variant="elevated" padding="md" className={styles.canvasCard}>
					<div className={styles.canvasHeader}>
						<div className={styles.titleStack}>
							<Text size="sm" weight="semibold">
								Terminal Map
							</Text>
							<Text size="xs" color="muted">
								Pick terminals directly on strip rails to create routed
								conductors.
							</Text>
						</div>
						<div className={styles.canvasTools}>
							<Badge color="default" variant="outline" size="sm">
								<Route size={12} />
								{routeStats.total} routes
							</Badge>
							<Badge
								color={routeStats.failed > 0 ? "warning" : "success"}
								variant="outline"
								size="sm"
							>
								<Link2 size={12} />
								{routeStats.synced} synced / {routeStats.pending} pending /{" "}
								{routeStats.failed} failed
							</Badge>
							<Badge color="default" variant="outline" size="sm">
								{overlayObstacles.length} obstacles
							</Badge>
							<Badge color="default" variant="outline" size="sm">
								{layout.orientation === "rotated_cw_90"
									? "Upright (rotated)"
									: "Upright (native)"}
							</Badge>
							<Button
								variant={overlayEnabled ? "secondary" : "outline"}
								size="sm"
								onClick={() => setOverlayEnabled((current) => !current)}
							>
								{overlayEnabled ? "Overlay On" : "Overlay Off"}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={rescanOverlay}
								disabled={!connected || scanning || overlaySyncing || !scanData}
								loading={overlaySyncing}
								iconLeft={
									overlaySyncing ? (
										<LoaderCircle size={12} />
									) : (
										<RefreshCw size={12} />
									)
								}
							>
								Resync Obstacles
							</Button>
						</div>
					</div>

					<div className={styles.canvasWrap}>
						<svg
							viewBox={`0 0 ${layout.canvasWidth} ${layout.canvasHeight}`}
							className={styles.canvas}
							style={{
								minWidth: `${Math.max(520, Math.min(920, layout.canvasWidth))}px`,
							}}
						>
							<defs>
								<pattern
									id="terminal-grid"
									width="38"
									height="38"
									patternUnits="userSpaceOnUse"
								>
									<path d="M 38 0 L 0 0 0 38" className={styles.grid} />
								</pattern>
							</defs>
							<rect
								x="0"
								y="0"
								width={layout.canvasWidth}
								height={layout.canvasHeight}
								className={styles.canvasBg}
							/>
							<rect
								x="0"
								y="0"
								width={layout.canvasWidth}
								height={layout.canvasHeight}
								fill="url(#terminal-grid)"
							/>

							{overlayEnabled
								? overlayObstacles.map((obstacle) => {
										const style = OBSTACLE_STYLE[obstacle.type];
										return (
											<g
												key={`overlay-${obstacle.id}`}
												className={styles.obstacleGroup}
											>
												<rect
													x={obstacle.x}
													y={obstacle.y}
													width={obstacle.w}
													height={obstacle.h}
													rx={obstacle.type === "fence" ? 8 : 4}
													fill={style.fill}
													stroke={style.stroke}
													strokeWidth={obstacle.type === "fence" ? 1.4 : 1.1}
													strokeDasharray={
														obstacle.type === "fence" ? "6,4" : undefined
													}
													className={styles.obstacleRect}
												/>
												{obstacle.label &&
												obstacle.w >= 34 &&
												obstacle.h >= 16 ? (
													<text
														x={obstacle.x + obstacle.w / 2}
														y={obstacle.y + obstacle.h / 2}
														textAnchor="middle"
														className={styles.obstacleLabel}
														fill={style.label}
													>
														{obstacle.label}
													</text>
												) : null}
											</g>
										);
									})
								: null}

							{layout.strips.map((strip) => (
								<g key={strip.stripId}>
									{strip.geometryPx && strip.geometryPx.length > 0 ? (
										<g className={styles.stripGeometryGroup}>
											{strip.geometryPx.map((primitive, index) => {
												if (!primitive.points || primitive.points.length < 2) {
													return null;
												}

												if (
													primitive.kind === "line" ||
													primitive.points.length === 2
												) {
													const [startPoint, endPoint] = primitive.points;
													if (!startPoint || !endPoint) {
														return null;
													}
													return (
														<line
															key={`${strip.stripId}-geom-${index}`}
															x1={startPoint.x}
															y1={startPoint.y}
															x2={endPoint.x}
															y2={endPoint.y}
															className={styles.stripGeometry}
															style={{ stroke: strip.panelColor }}
														/>
													);
												}

												const pathPoints = [...primitive.points];
												if (primitive.closed && primitive.points.length > 2) {
													pathPoints.push(primitive.points[0]);
												}
												const pointsValue = pathPoints
													.map((point) => `${point.x},${point.y}`)
													.join(" ");
												return (
													<polyline
														key={`${strip.stripId}-geom-${index}`}
														points={pointsValue}
														className={styles.stripGeometry}
														style={{ stroke: strip.panelColor }}
													/>
												);
											})}
										</g>
									) : (
										<rect
											x={strip.px}
											y={strip.py}
											width={strip.width}
											height={strip.height}
											className={styles.stripRail}
											style={{ stroke: strip.panelColor }}
										/>
									)}
									<text
										x={strip.xLabel}
										y={strip.yLabel}
										className={styles.stripLabel}
									>
										{strip.stripId}
									</text>
								</g>
							))}

							{routes.map((route) => {
								const selected = selectedRouteId === route.id;
								const routeSvg = toTerminalRouteSvg(route.path);
								const segment = firstPathSegment(route.path);
								const inlineTag = routeCenterAnchor(route.path);
								const fallbackTagPoint = midPoint(route.path);

								return (
									<g key={route.id}>
										<path d={routeSvg} className={styles.routeShadow} />
										<path
											d={routeSvg}
											className={styles.routeStroke}
											stroke={route.color.stroke}
											strokeWidth={selected ? 4.2 : 3.2}
											onClick={() => setSelectedRouteId(route.id)}
										/>
										{segment ? (
											<path
												d={`M ${segment.start.x} ${segment.start.y} L ${segment.end.x} ${segment.end.y}`}
												className={styles.routeLead}
												stroke={route.color.stroke}
											/>
										) : null}
										{inlineTag ? (
											<g
												transform={`translate(${inlineTag.x} ${inlineTag.y}) rotate(${inlineTag.angleDeg + 180})`}
											>
												<text
													x={0}
													y={0}
													textAnchor="middle"
													dominantBaseline="central"
													className={styles.routeTagMask}
												>
													{route.ref}
												</text>
												<text
													x={0}
													y={0}
													textAnchor="middle"
													dominantBaseline="central"
													className={styles.routeTagInline}
												>
													{route.ref}
												</text>
											</g>
										) : (
											<text
												x={fallbackTagPoint.x + 6}
												y={fallbackTagPoint.y - 6}
												className={styles.routeTagInline}
											>
												{route.ref}
											</text>
										)}
									</g>
								);
							})}

							{layout.terminals.map((terminal) => {
								const isFrom = fromTerminalId === terminal.id;
								const isHover = hoverTerminalId === terminal.id;
								const strip = stripById.get(terminal.stripId);
								const terminalVisualOffsetX =
									terminal.side === "L" ? -8 : terminal.side === "R" ? 8 : 0;
								const terminalVisualX = terminal.x + terminalVisualOffsetX;
								const stripMinX = strip ? strip.px : terminalVisualX - 18;
								const stripMaxX = strip
									? strip.px + strip.width
									: terminalVisualX + 18;
								const sideCellLabelRatio = 0.36;
								const labelX =
									terminal.side === "L"
										? stripMinX +
											(terminalVisualX - stripMinX) * sideCellLabelRatio
										: terminal.side === "R"
											? stripMaxX -
												(stripMaxX - terminalVisualX) * sideCellLabelRatio
											: terminalVisualX;
								const labelAnchor = "middle";
								return (
									<g key={terminal.id}>
										<circle
											cx={terminalVisualX}
											cy={terminal.y}
											r={12}
											className={styles.terminalHit}
											onMouseEnter={() => setHoverTerminalId(terminal.id)}
											onMouseLeave={() => setHoverTerminalId(null)}
											onClick={() => handleTerminalClick(terminal)}
										/>
										<circle
											cx={terminalVisualX}
											cy={terminal.y}
											r={isFrom ? 8.6 : 6.4}
											className={styles.terminalDot}
											fill={terminal.panelColor}
											onMouseEnter={() => setHoverTerminalId(terminal.id)}
											onMouseLeave={() => setHoverTerminalId(null)}
											onClick={() => handleTerminalClick(terminal)}
										/>
										<text
											x={labelX}
											y={terminal.y}
											textAnchor={labelAnchor}
											dominantBaseline="central"
											className={styles.terminalValue}
										>
											{terminal.label}
										</text>
										{isFrom || isHover ? (
											<circle
												cx={terminalVisualX}
												cy={terminal.y}
												r={isFrom ? 15.4 : 11.1}
												className={styles.terminalRing}
											/>
										) : null}
									</g>
								);
							})}
						</svg>
					</div>

					<div className={styles.canvasFooter}>
						<span>
							<Link2 size={12} />
							{statusMessage}
						</span>
						{overlayMeta?.scanMs ? (
							<span>
								<RefreshCw size={12} />
								Overlay {overlayMeta.scanMs} ms
							</span>
						) : null}
						{overlayMessage ? (
							<span>
								<X size={12} />
								{overlayMessage}
							</span>
						) : null}
						{activeHoverTerminal ? (
							<span>
								<Cable size={12} />
								Hover: {activeHoverTerminal.label}
							</span>
						) : null}
					</div>
				</Panel>

				<Panel variant="glass" padding="md" className={styles.routesCard}>
					<div className={styles.routesHeader}>
						<Text size="sm" weight="semibold">
							Route Feed & Schedule
						</Text>
						<Badge
							color={routeStats.warnings > 0 ? "warning" : "success"}
							variant="outline"
							size="sm"
						>
							{routeStats.warnings > 0 ? "Bend Warnings" : "Bend Limits OK"}
						</Badge>
					</div>

					<div className={styles.routeFeed}>
						{routes.length === 0 ? (
							<div className={styles.emptyState}>
								No terminal routes committed yet.
							</div>
						) : (
							routes.map((route) => (
								<button
									type="button"
									key={route.id}
									className={cn(
										styles.routeCard,
										selectedRouteId === route.id && styles.routeCardActive,
									)}
									onClick={() => setSelectedRouteId(route.id)}
								>
									<div className={styles.routeTop}>
										<strong>{route.ref}</strong>
										<span
											className={cn(
												styles.syncBadge,
												route.cadSyncStatus === "synced" &&
													styles.syncBadgeSynced,
												route.cadSyncStatus === "pending" &&
													styles.syncBadgePending,
												route.cadSyncStatus === "failed" &&
													styles.syncBadgeFailed,
											)}
										>
											{route.cadSyncStatus || "local"}
										</span>
									</div>
									<div className={styles.routeMeta}>
										{route.fromLabel}
										{" -> "}
										{route.toLabel}
									</div>
									<div className={styles.routeMeta}>
										{route.routeType === "jumper" ? "Jumper" : "Conductor"} ·{" "}
										{route.color.code}
									</div>
									<div className={styles.routeMeta}>
										{formatLength(route.length)} | {route.bendDegrees} deg
									</div>
									{route.cadSyncStatus === "failed" && route.cadLastError ? (
										<div className={styles.routeErrorMeta}>
											{route.cadLastCode ? `${route.cadLastCode}: ` : ""}
											{route.cadLastError}
										</div>
									) : null}
								</button>
							))
						)}
					</div>

					{selectedRoute ? (
						<div className={styles.selectedRoute}>
							<div>
								<span>Selected</span>
								<strong>{selectedRoute.ref}</strong>
							</div>
							<div>
								<span>Type</span>
								<strong>
									{selectedRoute.routeType === "jumper"
										? "Jumper"
										: "Conductor"}
								</strong>
							</div>
							<div>
								<span>From</span>
								<strong>{selectedRoute.fromLabel}</strong>
							</div>
							<div>
								<span>To</span>
								<strong>{selectedRoute.toLabel}</strong>
							</div>
							<div>
								<span>Bends</span>
								<strong>{selectedRoute.bendCount}</strong>
							</div>
							<div>
								<span>CAD Sync</span>
								<strong>{selectedRoute.cadSyncStatus || "local"}</strong>
							</div>
							{selectedRoute.cadProviderPath ? (
								<div>
									<span>Provider</span>
									<strong>{selectedRoute.cadProviderPath}</strong>
								</div>
							) : null}
							{selectedRoute.cadRequestId ? (
								<div>
									<span>Request ID</span>
									<strong>{selectedRoute.cadRequestId}</strong>
								</div>
							) : null}
							{selectedRoute.cadLastCode ? (
								<div>
									<span>CAD Code</span>
									<strong>{selectedRoute.cadLastCode}</strong>
								</div>
							) : null}
							{selectedRoute.cadLastError ? (
								<div className={styles.selectedRouteWide}>
									<span>CAD Error</span>
									<strong>{selectedRoute.cadLastError}</strong>
								</div>
							) : null}
						</div>
					) : null}

					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th>Ref</th>
									<th>From</th>
									<th>To</th>
									<th>Fn</th>
									<th>Color</th>
									<th>Sync</th>
									<th>Len</th>
								</tr>
							</thead>
							<tbody>
								{routeRows.map((row) => (
									<tr key={row.id}>
										<td>{row.ref}</td>
										<td>{row.from}</td>
										<td>{row.to}</td>
										<td>{row.function}</td>
										<td>{row.colorCode}</td>
										<td>{row.sync}</td>
										<td>{row.length}px</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<div className={styles.summaryStrip}>
						<span>
							<Rows3 size={12} />
							{routeStats.total} routed conductors
						</span>
						<span>
							<Route size={12} />
							{Math.round(routeStats.totalLength)} px total
						</span>
					</div>

					<div className={styles.diagnosticsPanel}>
						<Text size="xs" color="muted">
							CAD Sync Diagnostics
						</Text>
						<div className={styles.diagnosticsList}>
							{cadDiagnostics.length === 0 ? (
								<div className={styles.emptyState}>
									No CAD sync diagnostics yet.
								</div>
							) : (
								cadDiagnostics.map((entry) => (
									<div key={entry.id} className={styles.diagnosticItem}>
										<div className={styles.diagnosticHead}>
											<strong>
												{entry.operation.toUpperCase()}
												{entry.routeRef ? ` · ${entry.routeRef}` : ""}
											</strong>
											<span>
												{entry.success ? "OK" : "FAILED"} ·{" "}
												{new Date(entry.at).toLocaleTimeString()}
											</span>
										</div>
										<div className={styles.diagnosticMeta}>
											{entry.providerPath || "unknown"} ·{" "}
											{entry.code || "NO_CODE"} · req {entry.requestId || "n/a"}
										</div>
										{entry.message ? (
											<div className={styles.diagnosticMessage}>
												{entry.message}
											</div>
										) : null}
										{entry.warnings && entry.warnings.length > 0 ? (
											<div className={styles.diagnosticWarnings}>
												{entry.warnings.join(" | ")}
											</div>
										) : null}
									</div>
								))
							)}
						</div>
					</div>
				</Panel>
			</div>
		</div>
	);
}
