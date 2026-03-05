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
import { DEFAULT_WIRE_FUNCTIONS, WIRE_COLORS } from "./conduitRouteData";
import type { CableSystemType, Point2D } from "./conduitRouteTypes";
import {
	buildTerminalLayout,
	routeTerminalPath,
	terminalAnchorPoint,
	terminalBendCount,
	terminalPathLength,
	toTerminalRouteSvg,
} from "./conduitTerminalEngine";
import { conduitTerminalService } from "./conduitTerminalService";
import type {
	TerminalLayoutResult,
	TerminalNode,
	TerminalRouteRecord,
	TerminalScanData,
	TerminalScanMeta,
} from "./conduitTerminalTypes";

const EMPTY_LAYOUT: TerminalLayoutResult = {
	canvasWidth: 940,
	canvasHeight: 620,
	strips: [],
	terminals: [],
};

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

export function ConduitTerminalWorkflow() {
	const [connected, setConnected] = useState(false);
	const [scanning, setScanning] = useState(false);
	const [scanData, setScanData] = useState<TerminalScanData | null>(null);
	const [scanMeta, setScanMeta] = useState<TerminalScanMeta | null>(null);
	const [statusMessage, setStatusMessage] = useState(
		"Offline. Run Connect & Scan to load terminal strips.",
	);
	const [fromTerminalId, setFromTerminalId] = useState<string | null>(null);
	const [hoverTerminalId, setHoverTerminalId] = useState<string | null>(null);
	const [routes, setRoutes] = useState<TerminalRouteRecord[]>([]);
	const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
	const [cableType, setCableType] = useState<CableSystemType>("DC");
	const [wireFunction, setWireFunction] = useState<string>(
		DEFAULT_WIRE_FUNCTIONS.DC,
	);
	const [nextRef, setNextRef] = useState<Record<CableSystemType, number>>({
		AC: 1,
		DC: 1,
	});

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
		WIRE_COLORS[cableType][wireFunction] ??
		WIRE_COLORS[cableType][DEFAULT_WIRE_FUNCTIONS[cableType]];

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

	const runScan = async (messagePrefix: string) => {
		if (scanning) return;
		setScanning(true);
		setStatusMessage(messagePrefix);
		const response = await conduitTerminalService.scanTerminalStrips({
			selectionOnly: false,
			includeModelspace: true,
			maxEntities: 50000,
		});
		setScanning(false);

		if (response.success && response.data) {
			setConnected(true);
			setScanData(response.data);
			setScanMeta(response.meta ?? null);
			setFromTerminalId(null);
			setHoverTerminalId(null);
			const panelCount = Object.keys(response.data.panels).length;
			const terminalCount = response.meta?.totalTerminals ?? 0;
			setStatusMessage(
				response.message ||
					`Scan loaded ${panelCount} panel(s) and ${terminalCount} terminal(s).`,
			);
			return;
		}

		if (response.data) {
			// Keep connectivity true when backend responded but returned no strips.
			setConnected(true);
			setScanData(response.data);
			setScanMeta(response.meta ?? null);
			setStatusMessage(
				response.message ||
					"No terminal strips detected. Check block naming and attributes.",
			);
			return;
		}

		setConnected(false);
		setScanData(null);
		setScanMeta(null);
		setFromTerminalId(null);
		setHoverTerminalId(null);
		setStatusMessage(response.message || "Terminal scan failed.");
	};

	const connectAndScan = () => {
		void runScan("Connecting bridge and scanning terminal strips...");
	};

	const rescan = () => {
		void runScan("Rescanning terminal strips...");
	};

	const disconnect = () => {
		setConnected(false);
		setScanning(false);
		setScanData(null);
		setScanMeta(null);
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

		const anchors = terminalAnchorPoint(from, terminal, 12);
		const trunkPath = routeTerminalPath(
			anchors.start,
			anchors.end,
			layout.strips,
			layout.canvasWidth,
			layout.canvasHeight,
		);
		const path = dedupePath([from, ...trunkPath, terminal]);
		const bends = terminalBendCount(path);
		const route: TerminalRouteRecord = {
			id: makeRouteId(),
			ref: `${cableType}-${String(nextRef[cableType]).padStart(3, "0")}`,
			cableType,
			wireFunction,
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
		setNextRef((current) => ({
			...current,
			[cableType]: current[cableType] + 1,
		}));
		if (route.bendDegrees > 360) {
			setStatusMessage(
				`${route.ref} routed with ${route.bendDegrees}° total bends. Add pull point in panel field install.`,
			);
			return;
		}
		setStatusMessage(
			`${route.ref} routed ${route.fromLabel} → ${route.toLabel} (${formatLength(route.length)}).`,
		);
	};

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<div>
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
								Cable System
							</Text>
							<div className={styles.toggleRow}>
								{(["AC", "DC"] as const).map((entry) => (
									<Button
										key={entry}
										variant={cableType === entry ? "primary" : "outline"}
										size="sm"
										onClick={() => setCableType(entry)}
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
										className={cn(
											styles.functionButton,
											wireFunction === entry && styles.functionButtonActive,
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
						<div>
							<Text size="sm" weight="semibold">
								Terminal Map
							</Text>
							<Text size="xs" color="muted">
								Pick terminals directly on strip rails to create routed
								conductors.
							</Text>
						</div>
						<Badge color="default" variant="outline" size="sm">
							<Route size={12} />
							{routeStats.total} routes
						</Badge>
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

							{routes.map((route) => {
								const selected = selectedRouteId === route.id;
								const tagPoint = midPoint(route.path);
								return (
									<g key={route.id}>
										<path
											d={toTerminalRouteSvg(route.path)}
											className={styles.routeShadow}
										/>
										<path
											d={toTerminalRouteSvg(route.path)}
											className={styles.routeStroke}
											stroke={route.color.stroke}
											strokeWidth={selected ? 3.8 : 3}
											onClick={() => setSelectedRouteId(route.id)}
										/>
										<text
											x={tagPoint.x + 6}
											y={tagPoint.y - 6}
											className={styles.routeTag}
										>
											{route.ref}
										</text>
									</g>
								);
							})}

							{layout.strips.map((strip) => (
								<g key={strip.stripId}>
									<rect
										x={strip.px}
										y={strip.py}
										width={strip.width}
										height={strip.height}
										className={styles.stripRail}
										style={{ stroke: strip.panelColor }}
									/>
									<text
										x={strip.xLabel}
										y={strip.yLabel}
										className={styles.stripLabel}
									>
										{strip.stripId}
									</text>
								</g>
							))}

							{layout.terminals.map((terminal) => {
								const isFrom = fromTerminalId === terminal.id;
								const isHover = hoverTerminalId === terminal.id;
								return (
									<g key={terminal.id}>
										<circle
											cx={terminal.x}
											cy={terminal.y}
											r={isFrom ? 6 : 4}
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
												r={isFrom ? 11 : 8}
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
										{route.fromLabel} → {route.toLabel}
									</div>
									<div className={styles.routeMeta}>
										{formatLength(route.length)} · {route.bendDegrees}°
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
