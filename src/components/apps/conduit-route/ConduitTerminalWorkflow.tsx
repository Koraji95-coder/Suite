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
import type {
	EtapCleanupCommand,
	TerminalCadRouteRecord,
	TerminalJumperDefinition,
	TerminalLabelSyncRequest,
	TerminalLayoutResult,
	TerminalNode,
	TerminalRouteRecord,
	TerminalScanData,
	TerminalScanMeta,
} from "./conduitTerminalTypes";
import {
	AUTO_CONNECT_ON_MOUNT,
	DEFAULT_TERMINAL_SCAN_PROFILE,
	EMPTY_LAYOUT,
	ETAP_CLEANUP_COMMANDS,
	JUMPER_COLOR,
	TERMINAL_CAD_BACKCHECK_REQUIRED,
	backcheckStatusLabel,
	backcheckStatusTone,
	cadLayerForRoute,
	createConduitTerminalViewModel,
	formatLength,
	makeCadSessionId,
	makeRouteId,
} from "./conduitTerminalWorkflowModel";
import { useConduitTerminalCadController } from "./useConduitTerminalCadController";

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
			cadBackcheckStatus: "not_run",
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
	const [etapCleanupCommand, setEtapCleanupCommand] =
		useState<EtapCleanupCommand>("ETAPFIX");
	const [etapCleanupPluginDllPath, setEtapCleanupPluginDllPath] = useState("");
	const [etapCleanupWaitForCompletion, setEtapCleanupWaitForCompletion] =
		useState(true);
	const [etapCleanupSaveDrawing, setEtapCleanupSaveDrawing] = useState(false);
	const [etapCleanupTimeoutMs, setEtapCleanupTimeoutMs] = useState(90000);
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
	const layout = useMemo(
		() => (scanData ? buildTerminalLayout(scanData) : EMPTY_LAYOUT),
		[scanData],
	);
	const summarizeJumperScan = (
		nextScanData: TerminalScanData,
		nextLayout: TerminalLayoutResult,
		obstacles: Obstacle[],
	) => {
		const jumperScan = buildJumperRoutes(nextScanData, nextLayout, obstacles);
		return {
			detectedDefinitions: Array.isArray(nextScanData.jumpers)
				? nextScanData.jumpers.length
				: 0,
			nextJumperRef: Math.max(
				nextJumperRefFromDefinitions(nextScanData),
				jumperScan.nextRef,
			),
			unresolved: jumperScan.unresolved,
		};
	};
	const buildCadRoutePayload = (
		route: TerminalRouteRecord,
	): TerminalCadRouteRecord => {
		const worldPath = (
			route.cadPath && route.cadPath.length >= 2 ? route.cadPath : route.path
		).map((point) => canvasPointToWorld(point, layout.transform));
		const filletRadius =
			route.routeType === "jumper" ? 0 : computeWorldFilletRadius(worldPath);
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
	const etapCleanupConfig = useMemo(
		() => ({
			command: etapCleanupCommand,
			pluginDllPath: etapCleanupPluginDllPath,
			saveDrawing: etapCleanupSaveDrawing,
			timeoutMs: etapCleanupTimeoutMs,
			waitForCompletion: etapCleanupWaitForCompletion,
		}),
		[
			etapCleanupCommand,
			etapCleanupPluginDllPath,
			etapCleanupSaveDrawing,
			etapCleanupTimeoutMs,
			etapCleanupWaitForCompletion,
		],
	);
	const {
		cadBackcheckOverrideReason,
		cadDiagnostics,
		cadStatus,
		clearRoutes,
		connectAndScan,
		disconnect,
		etapCleanupRunning,
		preflightChecking,
		rescan,
		rescanOverlay,
		resyncFailedRoutes,
		resyncingFailed,
		runEtapCleanupNow,
		runScan,
		setCadBackcheckOverrideReason,
		syncRouteToCad,
		syncTerminalLabelsNow,
		syncingTerminalLabels,
		undoRoute,
	} = useConduitTerminalCadController({
		buildCadRoutePayload,
		buildTerminalLabelSyncRequest,
		cadSessionId,
		connected,
		etapCleanupConfig,
		overlayObstacles,
		overlaySyncing,
		routes,
		routesRef,
		scanData,
		scanning,
		setConnected,
		setFromTerminalId,
		setHoverTerminalId,
		setNextJumperRef,
		setNextRef,
		setOverlayMessage,
		setOverlayMeta,
		setOverlayObstacles,
		setOverlaySyncing,
		setRoutes,
		setScanData,
		setScanMeta,
		setScanning,
		setSelectedRouteId,
		setStatusMessage,
		summarizeJumperScan,
	});
	const {
		activeColor,
		activeFromTerminal,
		activeHoverTerminal,
		availableWireFunctions,
		cadBackcheckGateLabel,
		cadPreflightLabel,
		cadPreflightReady,
		cadProviderConfigured,
		panelRows,
		routeRows,
		routeStats,
		selectedRoute,
		stripById,
		terminalById,
	} = useMemo(
		() =>
			createConduitTerminalViewModel({
				scanData,
				routeType,
				cableType,
				wireFunction,
				routes,
				selectedRouteId,
				fromTerminalId,
				hoverTerminalId,
				cadStatus,
				preflightChecking,
			}),
		[
			cableType,
			cadStatus,
			fromTerminalId,
			hoverTerminalId,
			preflightChecking,
			routes,
			routeType,
			scanData,
			selectedRouteId,
			wireFunction,
		],
	);

	useEffect(() => {
		routesRef.current = routes;
	}, [routes]);
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
			cadBackcheckStatus: "not_run",
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
								CAD Backcheck Gate
							</Text>
							<div className={styles.preflightCard}>
								<Badge
									color={
										!TERMINAL_CAD_BACKCHECK_REQUIRED
											? "default"
											: routeStats.backcheckFail > 0
												? "danger"
												: routeStats.backcheckWarn > 0
													? "warning"
													: "success"
									}
									variant="outline"
									size="sm"
								>
									{cadBackcheckGateLabel}
								</Badge>
								<small>
									{TERMINAL_CAD_BACKCHECK_REQUIRED
										? `pass/warn/fail: ${routeStats.backcheckPass}/${routeStats.backcheckWarn}/${routeStats.backcheckFail} · pending: ${routeStats.backcheckPending} · overridden: ${routeStats.backcheckOverridden}`
										: "Backcheck gating is disabled for terminal CAD sync."}
								</small>
							</div>
							<label className={styles.etapField} htmlFor="terminal-cad-backcheck-override">
								<span>Override reason (required only when fail findings appear)</span>
								<textarea
									id="terminal-cad-backcheck-override"
									name="terminalCadBackcheckOverrideReason"
									rows={2}
									className={styles.etapInput}
									value={cadBackcheckOverrideReason}
									onChange={(event) =>
										setCadBackcheckOverrideReason(event.target.value)
									}
									placeholder="Document why CAD sync is safe despite fail findings..."
								/>
							</label>
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
									 name="conduitterminalworkflow_select_2002">
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
									name="conduitterminalworkflow_input_2021"
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
									name="conduitterminalworkflow_input_2034"
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
										name="conduitterminalworkflow_input_2049"
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
										name="conduitterminalworkflow_input_2060"
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
									<div className={styles.routeMeta}>
										<Badge
											color={backcheckStatusTone(route.cadBackcheckStatus)}
											variant="outline"
											size="sm"
										>
											{backcheckStatusLabel(route.cadBackcheckStatus)}
										</Badge>
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
							<div>
								<span>Backcheck</span>
								<strong>{backcheckStatusLabel(selectedRoute.cadBackcheckStatus)}</strong>
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
							{selectedRoute.cadBackcheckRequestId ? (
								<div>
									<span>Backcheck Req</span>
									<strong>{selectedRoute.cadBackcheckRequestId}</strong>
								</div>
							) : null}
							{selectedRoute.cadBackcheckMessage ? (
								<div className={styles.selectedRouteWide}>
									<span>Backcheck Note</span>
									<strong>{selectedRoute.cadBackcheckMessage}</strong>
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
