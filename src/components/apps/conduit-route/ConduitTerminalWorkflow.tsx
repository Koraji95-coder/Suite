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
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Panel, Stack, Text } from "@/components/primitives";
import { cn } from "@/lib/utils";
import styles from "./ConduitTerminalWorkflow.module.css";
import { DEFAULT_WIRE_FUNCTIONS, OBSTACLE_STYLE, WIRE_COLORS } from "./conduitRouteData";
import type {
	CableSystemType,
	ConduitObstacleScanMeta,
	Obstacle,
	Point2D,
} from "./conduitRouteTypes";
import {
	buildTerminalLayout,
	routeTerminalPath,
	terminalBendCount,
	terminalLeadPoint,
	terminalPathLength,
	toTerminalRouteSvg,
} from "./conduitTerminalEngine";
import { conduitRouteService } from "./conduitRouteService";
import { conduitTerminalService } from "./conduitTerminalService";
import type {
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
		.filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index);
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
	terminalTagKeys: ["PANEL_ID", "PANEL_NAME", "SIDE", "STRIP_ID", "TERMINAL_COUNT"],
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

function firstPathSegment(path: Point2D[]): { start: Point2D; end: Point2D } | null {
	for (let index = 1; index < path.length; index += 1) {
		const start = path[index - 1];
		const end = path[index];
		if (Math.hypot(end.x - start.x, end.y - start.y) >= 0.5) {
			return { start, end };
		}
	}
	return null;
}

function routeInlineAnchor(path: Point2D[]): {
	x: number;
	y: number;
	angleDeg: number;
} | null {
	const segment = firstPathSegment(path);
	if (!segment) return null;

	const dx = segment.end.x - segment.start.x;
	const dy = segment.end.y - segment.start.y;
	const length = Math.hypot(dx, dy);
	if (length < 0.5) return null;

	const ux = dx / length;
	const uy = dy / length;
	const distance = clamp(length * 0.58, 18, Math.max(18, length - 6));
	let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
	if (angleDeg > 90 || angleDeg < -90) {
		angleDeg += 180;
	}

	return {
		x: segment.start.x + ux * distance,
		y: segment.start.y + uy * distance,
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

function buildJumperRoutes(
	scanData: TerminalScanData,
	layout: TerminalLayoutResult,
): { routes: TerminalRouteRecord[]; unresolved: number; nextRef: number } {
	const jumpers = Array.isArray(scanData.jumpers) ? scanData.jumpers : [];
	if (jumpers.length === 0) {
		return { routes: [], unresolved: 0, nextRef: 1 };
	}

	const terminalById = new Map(layout.terminals.map((terminal) => [terminal.id, terminal]));
	const dedupe = new Set<string>();
	const routes: TerminalRouteRecord[] = [];
	let unresolved = 0;
	let maxNumericRef = 0;
	let autoIndex = 1;

	for (const jumper of jumpers) {
		const fromTerm = Math.max(1, Math.trunc(Number(jumper.fromTerminal) || 0));
		const toTerm = Math.max(1, Math.trunc(Number(jumper.toTerminal) || 0));
		const fromId = terminalIdFor(jumper.fromStripId, fromTerm);
		const toId = terminalIdFor(jumper.toStripId, toTerm);
		const from = terminalById.get(fromId);
		const to = terminalById.get(toId);
		if (!from || !to) {
			unresolved += 1;
			continue;
		}

		const signature = `${from.id}|${to.id}`;
		if (dedupe.has(signature)) {
			continue;
		}
		dedupe.add(signature);

		const fromLead = terminalLeadPoint(from, to, 36);
		const toLead = terminalLeadPoint(to, from, 36);
		const trunkPath = routeTerminalPath(
			fromLead,
			toLead,
			layout.strips,
			layout.canvasWidth,
			layout.canvasHeight,
		);
		const path = dedupePath([from, fromLead, ...trunkPath, toLead, to]);
		const bends = terminalBendCount(path);
		const rawRef = String(jumper.jumperId || "").trim();
		const ref = rawRef.length > 0 ? rawRef : `JMP-${String(autoIndex).padStart(3, "0")}`;
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
			length: terminalPathLength(path),
			bendCount: bends,
			bendDegrees: bends * 90,
			createdAt: Date.now(),
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
	const [overlayMeta, setOverlayMeta] = useState<ConduitObstacleScanMeta | null>(
		null,
	);
	const [overlayMessage, setOverlayMessage] = useState("");
	const [statusMessage, setStatusMessage] = useState(
		"Offline. Run Connect & Scan to load terminal strips.",
	);
	const [fromTerminalId, setFromTerminalId] = useState<string | null>(null);
	const [hoverTerminalId, setHoverTerminalId] = useState<string | null>(null);
	const [routes, setRoutes] = useState<TerminalRouteRecord[]>([]);
	const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
	const [routeType, setRouteType] = useState<"conductor" | "jumper">("conductor");
	const [cableType, setCableType] = useState<CableSystemType>("DC");
	const [wireFunction, setWireFunction] = useState<string>(
		DEFAULT_WIRE_FUNCTIONS.DC,
	);
	const [nextRef, setNextRef] = useState<Record<CableSystemType, number>>({
		AC: 1,
		DC: 1,
	});
	const [nextJumperRef, setNextJumperRef] = useState(1);

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
		};
	}, [routes]);

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
			length: Math.round(route.length),
		}));

	const syncObstacleOverlay = async (
		targetLayout: TerminalLayoutResult,
	): Promise<{ success: boolean; count: number; message: string }> => {
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
				};
			}

			setOverlayObstacles([]);
			setOverlayMeta(response.meta ?? null);
			setOverlayMessage(response.message || "Obstacle overlay unavailable.");
			return {
				success: false,
				count: 0,
				message: response.message || "Obstacle overlay unavailable.",
			};
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Obstacle overlay sync request failed.";
			setOverlayObstacles([]);
			setOverlayMeta(null);
			setOverlayMessage(message);
			return { success: false, count: 0, message };
		} finally {
			setOverlaySyncing(false);
		}
	};

	const runScan = async (messagePrefix: string) => {
		if (scanning) return;
		setScanning(true);
		setStatusMessage(messagePrefix);
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
			const jumperSeed = buildJumperRoutes(response.data, nextLayout);
			setRoutes(jumperSeed.routes);
			setNextJumperRef(jumperSeed.nextRef);
			setNextRef({ AC: 1, DC: 1 });
			const obstacleResult = await syncObstacleOverlay(nextLayout);
			const baseMessage =
				response.message ||
				`Scan loaded ${panelCount} panel(s) and ${terminalCount} terminal(s).`;
			const jumperSuffix =
				jumperSeed.routes.length > 0
					? ` Loaded ${jumperSeed.routes.length} jumper route(s).`
					: "";
			const unresolvedSuffix =
				jumperSeed.unresolved > 0
					? ` ${jumperSeed.unresolved} jumper definition(s) could not map to scanned terminals.`
					: "";
			const overlaySuffix = obstacleResult.success
				? ` Obstacle overlay: ${obstacleResult.count}.`
				: " Obstacle overlay unavailable.";
			setStatusMessage(
				`${baseMessage}${jumperSuffix}${unresolvedSuffix}${overlaySuffix}`,
			);
			return;
		}

		if (response.data) {
			// Keep connectivity true when backend responded but returned no strips.
			setConnected(true);
			setScanData(response.data);
			setScanMeta(response.meta ?? null);
			setRoutes([]);
			setSelectedRouteId(null);
			setOverlayObstacles([]);
			setOverlayMeta(null);
			setOverlayMessage("");
			setStatusMessage(
				response.message ||
					"No terminal strips detected. Check block naming and attributes.",
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
		setStatusMessage(response.message || "Terminal scan failed.");
	};

	useEffect(() => {
		if (!AUTO_CONNECT_ON_MOUNT) {
			return;
		}
		void runScan("Auto-connecting bridge and scanning terminal strips...");
		// Intentionally run once on mount to avoid repeated auto-scans.
		// biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
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

	const disconnect = () => {
		setConnected(false);
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
		setRoutes([]);
		setSelectedRouteId(null);
		setFromTerminalId(null);
		setStatusMessage("Terminal route history cleared.");
	};

	const undoRoute = () => {
		if (routes.length === 0) {
			setStatusMessage("Nothing to undo.");
			return;
		}
		setRoutes((current) => current.slice(1));
		setSelectedRouteId(null);
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

		const fromLead = terminalLeadPoint(from, terminal, 36);
		const toLead = terminalLeadPoint(terminal, from, 36);
		const trunkPath = routeTerminalPath(
			fromLead,
			toLead,
			layout.strips,
			layout.canvasWidth,
			layout.canvasHeight,
		);
		const path = dedupePath([from, fromLead, ...trunkPath, toLead, terminal]);
		const bends = terminalBendCount(path);
		const isJumper = routeType === "jumper";
		const routeRef = isJumper
			? `JMP-${String(nextJumperRef).padStart(3, "0")}`
			: `${cableType}-${String(nextRef[cableType]).padStart(3, "0")}`;
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
			length: terminalPathLength(path),
			bendCount: bends,
			bendDegrees: bends * 90,
			createdAt: Date.now(),
		};

		setRoutes((current) => [route, ...current]);
		setSelectedRouteId(route.id);
		setFromTerminalId(null);
		if (isJumper) {
			setNextJumperRef((current) => current + 1);
		} else {
			setNextRef((current) => ({
				...current,
				[cableType]: current[cableType] + 1,
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
							<Badge color="default" variant="outline" size="sm">
								{overlayObstacles.length} obstacles
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
								const inlineTag = routeInlineAnchor(route.path);
								const fallbackTagPoint = midPoint(route.path);

								return (
									<g key={route.id}>
										<path d={routeSvg} className={styles.routeShadow} />
										<path
											d={routeSvg}
											className={styles.routeStroke}
											stroke={route.color.stroke}
											strokeWidth={selected ? 4.2 : 3.2}
											strokeDasharray={
												route.routeType === "jumper" ? "11 7" : undefined
											}
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
												transform={`translate(${inlineTag.x} ${inlineTag.y}) rotate(${inlineTag.angleDeg})`}
											>
												{route.routeType === "jumper" ? (
													<path
														d="M -24 2 Q -19 -7 -14 2 M -14 2 L -9 2"
														className={styles.jumperGlyph}
													/>
												) : null}
												<text
													x={route.routeType === "jumper" ? -4 : 0}
													y={-2}
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
								return (
									<g key={terminal.id}>
										<circle
											cx={terminal.x}
											cy={terminal.y}
											r={isFrom ? 8.6 : 6.1}
											className={styles.terminalDot}
											fill={terminal.panelColor}
											onMouseEnter={() => setHoverTerminalId(terminal.id)}
											onMouseLeave={() => setHoverTerminalId(null)}
											onClick={() => handleTerminalClick(terminal)}
										/>
										{isFrom || isHover ? (
											<circle
												cx={terminal.x}
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
										<span>{route.color.code}</span>
									</div>
									<div className={styles.routeMeta}>
										{route.fromLabel}
										{" -> "}
										{route.toLabel}
									</div>
									<div className={styles.routeMeta}>
										{route.routeType === "jumper" ? "Jumper" : "Conductor"}
									</div>
									<div className={styles.routeMeta}>
										{formatLength(route.length)} | {route.bendDegrees} deg
									</div>
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
				</Panel>
			</div>
		</div>
	);
}
