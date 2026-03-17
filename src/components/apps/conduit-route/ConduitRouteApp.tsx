import {
	AlertTriangle,
	Cable,
	CheckCircle2,
	Circle,
	Crosshair,
	Eraser,
	FlaskConical,
	Grid3X3,
	HardDriveDownload,
	Layers,
	LoaderCircle,
	Map as MapIcon,
	MoveRight,
	Rows3,
	Ruler,
	ScanLine,
	Sparkles,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	Badge,
	Button,
	Input,
	Panel,
	Progress,
	Stack,
	Text,
} from "@/components/primitives";
import { cn } from "@/lib/utils";
import { agentService } from "@/services/agentService";
import styles from "./ConduitRouteApp.module.css";
import { ConduitTerminalWorkflow } from "./ConduitTerminalWorkflow";
import {
	CANVAS_HEIGHT,
	CANVAS_WIDTH,
	DEFAULT_WIRE_FUNCTIONS,
	EQUIPMENT_NODES,
	OBSTACLE_STYLE,
	OBSTACLES,
	ROUTE_TABS,
	ROUTING_MODES,
	SECTION_METRICS,
	SECTION_PRESETS,
	WIRE_COLORS,
} from "./conduitRouteData";
import { AUTOWIRE_OBSTACLE_LAYER_PRESET_OPTIONS } from "./autowirePresets";
import {
	bendCount,
	buildCostGrid,
	pathLength,
	routePath,
	routeTagPosition,
	toRoundedPathSvg,
} from "./conduitRouteEngine";
import {
	CONDUCTOR_AREAS,
	CONDUIT_AREAS,
	calculateNec,
	DEFAULT_CONDUCTORS,
} from "./conduitRouteNec";
import { conduitRouteService } from "./conduitRouteService";
import type {
	CableSystemType,
	ConduitObstacleScanMeta,
	ConduitObstacleSource,
	ConduitRouteBackcheckResponse,
	ConduitRouteComputeData,
	ConduitRouteComputeMeta,
	ConduitRouteRecord,
	ConduitRouteTab,
	NecConductorInput,
	Obstacle,
	ObstacleLayerRule,
	ObstacleType,
	Point2D,
	RoutingMode,
	SectionPreset,
} from "./conduitRouteTypes";

type CrewReviewProfile = "draftsmith" | "gridsage";

type CrewReviewEntry = {
	profileId: CrewReviewProfile;
	status: "running" | "completed" | "failed";
	response?: string;
	error?: string;
};

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function formatLength(length: number): string {
	return `${Math.round(length)} px`;
}

function makeRouteId(): string {
	return `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toCsvValue(value: string | number): string {
	const text = String(value ?? "");
	if (/[",\r\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

function colorVariantByPercent(
	percent: number,
): "success" | "warning" | "danger" {
	if (percent <= 60) return "success";
	if (percent <= 85) return "warning";
	return "danger";
}

function getModeBadgeTone(
	mode: RoutingMode,
): "default" | "primary" | "success" | "warning" {
	if (mode === "plan_view") return "success";
	if (mode === "cable_tag") return "primary";
	return "warning";
}

function inferObstacleTypeFromLayer(layerName: string): ObstacleType | null {
	const layer = layerName.trim().toUpperCase();
	if (!layer) return null;
	if (layer.includes("TRENCH")) return "trench";
	if (layer.includes("FENCE")) return "fence";
	if (layer.includes("ROAD")) return "road";
	if (
		layer.includes("FOUND") ||
		layer.includes("FNDN") ||
		layer.startsWith("S-FNDN")
	)
		return "foundation";
	if (layer.includes("KEEPOUT") || layer.includes("KEEP-OUT"))
		return "foundation";
	if (layer.includes("PAD") || layer.includes("S-CONC")) return "equipment_pad";
	if (
		layer.includes("BUILD") ||
		layer.includes("A-WALL") ||
		layer.startsWith("A-WALL") ||
		layer.includes("S-STRU") ||
		layer.includes("S-STEEL")
	)
		return "building";
	if (layer.startsWith("E-CONDUIT") || layer === "E-CONDUIT") return "road";
	return null;
}

function extractAgentResponseText(data: Record<string, unknown> | undefined): string {
	if (!data) return "";
	const directKeys = ["response", "reply", "output", "message"] as const;
	for (const key of directKeys) {
		const value = data[key];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return JSON.stringify(data);
}

function buildCadCrewReviewPrompt(args: {
	profileId: CrewReviewProfile;
	report: ConduitRouteBackcheckResponse;
	draftsmithReview?: string;
}): string {
	const { profileId, report, draftsmithReview } = args;
	const findingDigest = (report.findings || []).slice(0, 12).map((finding) => ({
		route: finding.ref || finding.routeId,
		status: finding.status,
		issues: finding.issues.slice(0, 3).map((issue) => ({
			code: issue.code,
			severity: issue.severity,
			message: issue.message,
		})),
		stats: {
			bend_degrees: finding.stats.bend_degrees,
			collision_count: finding.stats.collision_count,
			diagonal_segment_count: finding.stats.diagonal_segment_count,
		},
	}));
	const roleInstruction =
		profileId === "draftsmith"
			? "You are Draftsmith. Focus on CAD drafting correctness, geometry quality, and buildable route layout."
			: "You are GridSage. Focus on electrical QA, routing safety, and constructability risks.";

	const outputContract =
		"Return exactly three sections: 1) Critical Findings, 2) Fix Plan, 3) Validation Checklist.";
	const draftsmithContext = draftsmithReview?.trim()
		? `Draftsmith prior review:\n${draftsmithReview}`
		: "";

	return [
		roleInstruction,
		outputContract,
		"Prioritize concrete route IDs and deterministic steps. Avoid generic advice.",
		`Backcheck summary: ${JSON.stringify(report.summary || {})}`,
		`Backcheck warnings: ${JSON.stringify(report.warnings || [])}`,
		`Finding digest: ${JSON.stringify(findingDigest)}`,
		draftsmithContext,
	]
		.filter(Boolean)
		.join("\n\n");
}

function SectionSketch({ preset }: { preset: SectionPreset["id"] }) {
	if (preset === "stub_up") {
		return (
			<svg viewBox="0 0 320 170" className={styles.sectionSketch}>
				<rect
					x="0"
					y="90"
					width="320"
					height="80"
					className={styles.sectionSoil}
				/>
				<line x1="0" y1="90" x2="320" y2="90" className={styles.sectionGrade} />
				<rect
					x="92"
					y="56"
					width="130"
					height="38"
					className={styles.sectionConcrete}
				/>
				{[0, 1, 2, 3].map((index) => (
					<g key={index}>
						<rect
							x={108 + index * 28}
							y={22}
							width="12"
							height="68"
							className={styles.sectionConduit}
						/>
						<circle
							cx={114 + index * 28}
							cy={54}
							r="2.8"
							className={styles.sectionCableA}
						/>
					</g>
				))}
			</svg>
		);
	}

	if (preset === "duct_bank") {
		return (
			<svg viewBox="0 0 320 170" className={styles.sectionSketch}>
				<rect
					x="0"
					y="80"
					width="320"
					height="90"
					className={styles.sectionSoil}
				/>
				<line x1="0" y1="80" x2="320" y2="80" className={styles.sectionGrade} />
				<rect
					x="70"
					y="34"
					width="180"
					height="108"
					className={styles.sectionConcrete}
				/>
				{Array.from({ length: 3 }).map((_, row) =>
					Array.from({ length: 4 }).map((__, col) => (
						<circle
							key={`${row}_${col}`}
							cx={96 + col * 44}
							cy={58 + row * 30}
							r="10"
							className={styles.sectionConduitHole}
						/>
					)),
				)}
			</svg>
		);
	}

	if (preset === "trench") {
		return (
			<svg viewBox="0 0 320 170" className={styles.sectionSketch}>
				<rect
					x="0"
					y="56"
					width="320"
					height="114"
					className={styles.sectionSoil}
				/>
				<rect
					x="72"
					y="56"
					width="176"
					height="90"
					className={styles.sectionVoid}
				/>
				<rect
					x="80"
					y="74"
					width="160"
					height="8"
					className={styles.sectionTray}
				/>
				<rect
					x="80"
					y="97"
					width="160"
					height="8"
					className={styles.sectionTray}
				/>
				<rect
					x="80"
					y="120"
					width="160"
					height="8"
					className={styles.sectionTray}
				/>
				{Array.from({ length: 7 }).map((_, index) => (
					<circle
						key={`wire_${index}`}
						cx={94 + index * 18}
						cy="78"
						r="3"
						className={styles.sectionCableA}
					/>
				))}
			</svg>
		);
	}

	return (
		<svg viewBox="0 0 320 170" className={styles.sectionSketch}>
			<rect
				x="0"
				y="94"
				width="320"
				height="76"
				className={styles.sectionSoil}
			/>
			<line x1="0" y1="94" x2="320" y2="94" className={styles.sectionGrade} />
			<rect
				x="124"
				y="18"
				width="18"
				height="152"
				className={styles.sectionWall}
			/>
			{[0, 1, 2].map((index) => (
				<g key={`entry_${index}`}>
					<rect
						x="44"
						y={32 + index * 36}
						width="96"
						height="10"
						className={styles.sectionConduit}
					/>
					<rect
						x="142"
						y={30 + index * 36}
						width="16"
						height="14"
						className={styles.sectionSeal}
					/>
					<rect
						x="160"
						y={32 + index * 36}
						width="70"
						height="10"
						className={styles.sectionConduit}
					/>
				</g>
			))}
		</svg>
	);
}

export function ConduitRouteApp() {
	const [workspace, setWorkspace] = useState<"yard" | "terminal">("yard");
	const [tab, setTab] = useState<ConduitRouteTab>("routes");
	const [mode, setMode] = useState<RoutingMode>("plan_view");
	const [cableType, setCableType] = useState<CableSystemType>("DC");
	const [wireFunction, setWireFunction] = useState<string>(
		DEFAULT_WIRE_FUNCTIONS.DC,
	);
	const [clearance, setClearance] = useState(18);
	const [startPoint, setStartPoint] = useState<Point2D | null>(null);
	const [hoverPoint, setHoverPoint] = useState<Point2D | null>(null);
	const [routes, setRoutes] = useState<ConduitRouteRecord[]>([]);
	const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
	const [nextRef, setNextRef] = useState<Record<CableSystemType, number>>({
		AC: 1,
		DC: 1,
	});
	const [statusMessage, setStatusMessage] = useState(
		"Ready. Click in the canvas to place a route start point.",
	);
	const [routeComputing, setRouteComputing] = useState(false);
	const [lastComputeMeta, setLastComputeMeta] =
		useState<ConduitRouteComputeMeta | null>(null);
	const [activeObstacles, setActiveObstacles] = useState<Obstacle[]>(OBSTACLES);
	const [obstacleSource, setObstacleSource] =
		useState<ConduitObstacleSource>("client");
	const [obstacleSyncing, setObstacleSyncing] = useState(false);
	const [obstacleScanMeta, setObstacleScanMeta] =
		useState<ConduitObstacleScanMeta | null>(null);
	const [routeBackchecking, setRouteBackchecking] = useState(false);
	const [routeBackcheckReport, setRouteBackcheckReport] =
		useState<ConduitRouteBackcheckResponse | null>(null);
	const [crewReviewEntries, setCrewReviewEntries] = useState<CrewReviewEntry[]>(
		[],
	);
	const [crewReviewError, setCrewReviewError] = useState<string | null>(null);
	const [crewReviewLoading, setCrewReviewLoading] = useState(false);
	const [availableCadLayers, setAvailableCadLayers] = useState<string[]>([]);
	const [layerPickerValue, setLayerPickerValue] = useState("");
	const [layerRulesRefreshing, setLayerRulesRefreshing] = useState(false);
	const [obstacleLayerRules, setObstacleLayerRules] = useState<
		ObstacleLayerRule[]
	>([]);
	const [obstacleLayerPreset, setObstacleLayerPreset] = useState<string>("");

	const [necConductors, setNecConductors] =
		useState<NecConductorInput[]>(DEFAULT_CONDUCTORS);
	const [necConduit, setNecConduit] = useState("2 EMT");
	const [ambientTempC, setAmbientTempC] = useState(30);
	const [sectionPreset, setSectionPreset] =
		useState<SectionPreset["id"]>("stub_up");

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

	const obstacleLayerNames = useMemo(
		() => obstacleLayerRules.map((rule) => rule.layerName),
		[obstacleLayerRules],
	);

	const obstacleLayerTypeOverrides = useMemo(() => {
		const overrides: Record<string, ObstacleType> = {};
		for (const rule of obstacleLayerRules) {
			overrides[rule.layerName] = rule.obstacleType;
		}
		return overrides;
	}, [obstacleLayerRules]);

	const costGrid = useMemo(
		() => buildCostGrid(activeObstacles, clearance, mode),
		[activeObstacles, clearance, mode],
	);

	const previewPath = useMemo(() => {
		if (!startPoint || !hoverPoint) {
			return { path: [] as Point2D[], valid: true, fallbackUsed: false };
		}
		return routePath(startPoint, hoverPoint, costGrid, mode);
	}, [startPoint, hoverPoint, costGrid, mode]);

	const selectedRoute = useMemo(
		() => routes.find((route) => route.id === selectedRouteId) ?? null,
		[routes, selectedRouteId],
	);

	const routeStats = useMemo(() => {
		const totalLength = routes.reduce((sum, route) => sum + route.length, 0);
		const totalBends = routes.reduce((sum, route) => sum + route.bendCount, 0);
		const warningCount = routes.filter(
			(route) => route.bendDegrees > 360,
		).length;
		return {
			total: routes.length,
			totalLength,
			totalBends,
			warningCount,
		};
	}, [routes]);
	const routeBackcheckSummary = routeBackcheckReport?.summary ?? null;
	const crewReviewCompletedCount = useMemo(
		() =>
			crewReviewEntries.filter((entry) => entry.status === "completed").length,
		[crewReviewEntries],
	);
	const hasCrewReviewFailures = useMemo(
		() => crewReviewEntries.some((entry) => entry.status === "failed"),
		[crewReviewEntries],
	);
	const cadSyncGate = useMemo(() => {
		if (!routeBackcheckSummary) {
			return {
				color: "warning" as const,
				label: "Backcheck required",
				detail: "Run backcheck before issuing CAD sync decisions.",
			};
		}
		if (routeBackcheckSummary.fail_count <= 0) {
			if (routeBackcheckSummary.warn_count > 0) {
				return {
					color: "warning" as const,
					label: "Ready with warnings",
					detail:
						"Fail findings are clear. Review warnings before final CAD publish.",
				};
			}
			return {
				color: "success" as const,
				label: "Ready for CAD sync",
				detail: "No failing findings in current backcheck report.",
			};
		}
		if (hasCrewReviewFailures) {
			return {
				color: "danger" as const,
				label: "Crew review failed",
				detail: "Resolve agent review errors before proceeding.",
			};
		}
		if (crewReviewCompletedCount < 2) {
			return {
				color: "warning" as const,
				label: "Crew review required",
				detail:
					"Backcheck has failing findings. Run Draftsmith and GridSage review.",
			};
		}
		return {
			color: "danger" as const,
			label: "Manual decision required",
			detail:
				"Fail findings remain after crew review. Apply fixes or document override.",
		};
	}, [routeBackcheckSummary, crewReviewCompletedCount, hasCrewReviewFailures]);

	const necResult = useMemo(
		() => calculateNec(necConductors, necConduit, ambientTempC),
		[necConductors, necConduit, ambientTempC],
	);

	const sectionInfo = SECTION_PRESETS.find(
		(preset) => preset.id === sectionPreset,
	);
	const sectionMetricCards = SECTION_METRICS[sectionPreset];
	const isTerminalWorkspace = workspace === "terminal";
	const heroTitle = isTerminalWorkspace
		? "Terminal Strip Routing Deck"
		: "Conduit Route Command Deck";
	const heroSubtitle = isTerminalWorkspace
		? "Scan terminal strips, click source and destination, and build route + schedule output."
		: "Interactive cable/conduit routing with NEC snapshots, section previews, and bend-limit monitoring.";

	const refreshObstacleLayerList = async (
		options: { silent?: boolean } = {},
	) => {
		const silent = options.silent ?? false;
		setLayerRulesRefreshing(true);
		const layers = await conduitRouteService.listLayers();
		setLayerRulesRefreshing(false);
		setAvailableCadLayers(layers);
		if (!layerPickerValue && layers.length > 0) {
			setLayerPickerValue(layers[0]);
		}
		if (!silent) {
			setStatusMessage(
				layers.length > 0
					? `Loaded ${layers.length} drawing layer(s).`
					: "No layers returned from the active drawing.",
			);
		}
		return layers;
	};

	const addObstacleLayerRule = () => {
		const candidate = layerPickerValue.trim();
		if (!candidate) {
			setStatusMessage("Select or type a layer name before adding.");
			return;
		}
		const normalizedCandidate = candidate.toLowerCase();
		const alreadySelected = obstacleLayerRules.some(
			(rule) => rule.layerName.toLowerCase() === normalizedCandidate,
		);
		if (alreadySelected) {
			setStatusMessage(
				`Layer '${candidate}' is already in the obstacle editor.`,
			);
			return;
		}
		setObstacleLayerRules((prev) => [
			...prev,
			{
				layerName: candidate,
				obstacleType: inferObstacleTypeFromLayer(candidate) ?? "foundation",
			},
		]);
		setStatusMessage(`Added obstacle layer rule for '${candidate}'.`);
	};

	const removeObstacleLayerRule = (layerName: string) => {
		setObstacleLayerRules((prev) =>
			prev.filter((rule) => rule.layerName !== layerName),
		);
	};

	const clearObstacleLayerRules = () => {
		setObstacleLayerRules([]);
		setStatusMessage("Cleared obstacle layer rules.");
	};

	const autoIdentifyObstacleLayers = () => {
		if (availableCadLayers.length === 0) {
			setStatusMessage("Refresh layers first, then run auto-identify.");
			return;
		}
		const existingLayerSet = new Set(
			obstacleLayerRules.map((rule) => rule.layerName.toLowerCase()),
		);
		const additions: ObstacleLayerRule[] = [];
		for (const layerName of availableCadLayers) {
			const inferredType = inferObstacleTypeFromLayer(layerName);
			if (!inferredType) {
				continue;
			}
			if (existingLayerSet.has(layerName.toLowerCase())) {
				continue;
			}
			existingLayerSet.add(layerName.toLowerCase());
			additions.push({ layerName, obstacleType: inferredType });
		}
		if (additions.length === 0) {
			setStatusMessage("No new obstacle layers matched auto-identify rules.");
			return;
		}
		setObstacleLayerRules((prev) => [...prev, ...additions]);
		setStatusMessage(`Auto-identified ${additions.length} obstacle layer(s).`);
	};

	const syncAutocadObstacles = async (options: { silent?: boolean } = {}) => {
		if (obstacleSyncing) {
			return;
		}
		const silent = options.silent ?? false;
		setObstacleSyncing(true);
		if (!silent) {
			setStatusMessage("Syncing obstacles from AutoCAD drawing...");
		}

		const response = await conduitRouteService.scanObstacles({
			selectionOnly: false,
			includeModelspace: true,
			maxEntities: 50000,
			canvasWidth: CANVAS_WIDTH,
			canvasHeight: CANVAS_HEIGHT,
			layerNames: obstacleLayerNames,
			layerTypeOverrides: obstacleLayerTypeOverrides,
			layerPreset: obstacleLayerPreset,
		});
		setObstacleSyncing(false);

		if (response.success && response.data) {
			const obstacleCount = response.data.obstacles.length;
			setActiveObstacles(response.data.obstacles);
			setObstacleSource("autocad");
			setObstacleScanMeta(response.meta ?? null);
			setStatusMessage(
				response.message ||
					`AutoCAD obstacle sync complete. ${obstacleCount} obstacle(s) loaded.`,
			);
			return;
		}

		if (!silent) {
			setStatusMessage(
				response.message ||
					"AutoCAD obstacle sync failed. Continuing with current obstacle map.",
			);
		}
	};

	const useDemoObstacleLayout = () => {
		setActiveObstacles(OBSTACLES);
		setObstacleSource("client");
		setObstacleScanMeta(null);
		setStatusMessage("Switched to demo obstacle layout.");
	};

	useEffect(() => {
		if (workspace !== "yard") {
			return;
		}
		if (availableCadLayers.length > 0) {
			return;
		}

		let cancelled = false;
		setLayerRulesRefreshing(true);
		void conduitRouteService
			.listLayers()
			.then((layers) => {
				if (cancelled) {
					return;
				}
				setAvailableCadLayers(layers);
				if (!layerPickerValue && layers.length > 0) {
					setLayerPickerValue(layers[0]);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLayerRulesRefreshing(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [workspace, availableCadLayers.length, layerPickerValue]);

	useEffect(() => {
		if (workspace !== "yard") {
			return;
		}
		if (obstacleSource === "autocad") {
			return;
		}

		let cancelled = false;
		setObstacleSyncing(true);
		void conduitRouteService
			.scanObstacles({
				selectionOnly: false,
				includeModelspace: true,
				maxEntities: 50000,
				canvasWidth: CANVAS_WIDTH,
				canvasHeight: CANVAS_HEIGHT,
				layerNames: obstacleLayerNames,
				layerTypeOverrides: obstacleLayerTypeOverrides,
				layerPreset: obstacleLayerPreset,
			})
			.then((response) => {
				if (cancelled || !response.success || !response.data) {
					return;
				}
				setActiveObstacles(response.data.obstacles);
				setObstacleSource("autocad");
				setObstacleScanMeta(response.meta ?? null);
				setStatusMessage(
					response.message ||
						`AutoCAD obstacle sync complete. ${response.data.obstacles.length} obstacle(s) loaded.`,
				);
			})
			.finally(() => {
				if (!cancelled) {
					setObstacleSyncing(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [
		workspace,
		obstacleSource,
		obstacleLayerNames,
		obstacleLayerTypeOverrides,
		obstacleLayerPreset,
	]);

	const handleCanvasPoint = (
		event: React.MouseEvent<SVGSVGElement>,
	): Point2D => {
		const rect = event.currentTarget.getBoundingClientRect();
		const x = clamp(event.clientX - rect.left, 0, CANVAS_WIDTH);
		const y = clamp(event.clientY - rect.top, 0, CANVAS_HEIGHT);
		return { x, y };
	};

	const handleCanvasClick = (event: React.MouseEvent<SVGSVGElement>) => {
		const clickPoint = handleCanvasPoint(event);
		if (routeComputing || obstacleSyncing || routeBackchecking) {
			return;
		}
		if (!startPoint) {
			setStartPoint(clickPoint);
			setStatusMessage("Start point locked. Click destination point to route.");
			return;
		}

		const lockedStart = startPoint;
		const ref = `${cableType}-${String(nextRef[cableType]).padStart(3, "0")}`;
		const routeId = makeRouteId();
		const tagText = mode === "cable_tag" ? `${ref} Z01` : "";

		setRouteComputing(true);
		setHoverPoint(null);
		setStatusMessage("Computing route via backend...");

		void (async () => {
			let computeMeta: ConduitRouteComputeMeta | null = null;
			let responseData: ConduitRouteComputeData | null = null;

			try {
				const response = await conduitRouteService.computeRoute({
					start: lockedStart,
					end: clickPoint,
					mode,
					clearance,
					obstacles: activeObstacles,
					obstacleSource,
					obstacleScan:
						obstacleSource === "autocad"
							? {
									selectionOnly: false,
									includeModelspace: true,
									maxEntities: 50000,
									layerNames: obstacleLayerNames,
									layerTypeOverrides: obstacleLayerTypeOverrides,
									layerPreset: obstacleLayerPreset,
								}
							: undefined,
					canvasWidth: CANVAS_WIDTH,
					canvasHeight: CANVAS_HEIGHT,
					gridStep: 8,
					tagText: tagText || undefined,
				});

				computeMeta = {
					...(response.meta ?? {}),
					routeValid:
						response.success && response.data
							? response.meta?.routeValid ?? true
							: false,
				};
				setLastComputeMeta(computeMeta);

				if (!response.success || !response.data) {
					setHoverPoint(null);
					setStartPoint(lockedStart);
					setRouteComputing(false);
					setStatusMessage(
						response.message ||
							`${ref} could not be routed. The dashed line is only a sketch; adjust the destination or obstacle scope.`,
					);
					return;
				}

				responseData = response.data;

				if (
					obstacleSource === "autocad" &&
					Array.isArray(response.data.resolvedObstacles) &&
					response.data.resolvedObstacles.length > 0
				) {
					setActiveObstacles(response.data.resolvedObstacles);
				}
			} catch {
				setLastComputeMeta({
					routeValid: false,
					fallbackUsed: false,
					source: "frontend",
				});
				setHoverPoint(null);
				setStartPoint(lockedStart);
				setStatusMessage(
					`${ref} could not be routed because the compute request failed. Adjust the route or retry the backend request.`,
				);
				setRouteComputing(false);
				return;
			}

			const path = responseData?.path ?? [];
			const bends = responseData?.bendCount ?? bendCount(path);
			const length = responseData?.length ?? pathLength(path);
			const tag =
				responseData?.tag ??
				(mode === "cable_tag" ? routeTagPosition(path, `${ref} Z01`) : null);

			const route: ConduitRouteRecord = {
				id: routeId,
				ref,
				mode,
				cableType,
				wireFunction,
				color: activeColor,
				start: lockedStart,
				end: clickPoint,
				path,
				length,
				bendCount: bends,
				bendDegrees: bends * 90,
				tag,
				createdAt: Date.now(),
			};

			setRoutes((current) => [route, ...current]);
			setRouteBackcheckReport(null);
			setCrewReviewEntries([]);
			setCrewReviewError(null);
			setSelectedRouteId(route.id);
			setNextRef((current) => ({
				...current,
				[cableType]: current[cableType] + 1,
			}));
			setLastComputeMeta(computeMeta);
			setStartPoint(null);
			setHoverPoint(null);
			setRouteComputing(false);

			if (route.bendDegrees > 360) {
				setStatusMessage(
					`${route.ref} routed with ${route.bendDegrees} deg bends. Add a pull point before construction release.`,
				);
				return;
			}

			const computeMs = computeMeta?.computeMs ?? computeMeta?.requestMs;
			const timing = computeMs ? ` in ${computeMs} ms` : "";
			setStatusMessage(
				`${route.ref} routed${timing}: ${formatLength(length)} with ${bends} bends (${route.bendDegrees} deg).`,
			);
		})();
	};

	const clearAllRoutes = () => {
		setRoutes([]);
		setSelectedRouteId(null);
		setStartPoint(null);
		setHoverPoint(null);
		setLastComputeMeta(null);
		setRouteComputing(false);
		setRouteBackcheckReport(null);
		setCrewReviewEntries([]);
		setCrewReviewError(null);
		setStatusMessage("Route history cleared.");
	};

	const undoLastRoute = () => {
		if (routes.length === 0) {
			setStatusMessage("Nothing to undo.");
			return;
		}
		setRoutes((current) => current.slice(1));
		setRouteBackcheckReport(null);
		setCrewReviewEntries([]);
		setCrewReviewError(null);
		setSelectedRouteId(null);
		if (routes.length <= 1) {
			setLastComputeMeta(null);
		}
		setStatusMessage("Removed latest route.");
	};

	const removeRoute = (routeId: string) => {
		setRoutes((current) => current.filter((route) => route.id !== routeId));
		setRouteBackcheckReport(null);
		setCrewReviewEntries([]);
		setCrewReviewError(null);
		if (selectedRouteId === routeId) {
			setSelectedRouteId(null);
		}
		if (routes.length <= 1) {
			setLastComputeMeta(null);
		}
		setStatusMessage("Route removed.");
	};

	const scheduleRows = routes
		.slice()
		.sort((a, b) => b.createdAt - a.createdAt)
		.map((route) => ({
			id: route.id,
			ref: route.ref,
			type: route.cableType,
			fn: route.wireFunction,
			color: route.color.code,
			from: `${Math.round(route.start.x)},${Math.round(route.start.y)}`,
			to: `${Math.round(route.end.x)},${Math.round(route.end.y)}`,
			length: Math.round(route.length),
		}));
	const bridgeBadgeLabel = isTerminalWorkspace
		? "Terminal Scan Workflow"
		: routeBackchecking
			? "Backcheck Running"
			: obstacleSyncing
			? "AutoCAD Bridge Syncing"
			: obstacleSource === "autocad"
				? "AutoCAD Bridge Active"
				: "AutoCAD Bridge Ready";

	const exportScheduleCsv = () => {
		if (scheduleRows.length === 0) {
			setStatusMessage("No schedule rows available to export.");
			return;
		}

		const header = ["Ref", "Type", "Fn", "Color", "From", "To", "LengthPx"];
		const lines = [header.join(",")];
		for (const row of scheduleRows) {
			lines.push(
				[
					toCsvValue(row.ref),
					toCsvValue(row.type),
					toCsvValue(row.fn),
					toCsvValue(row.color),
					toCsvValue(row.from),
					toCsvValue(row.to),
					toCsvValue(row.length),
				].join(","),
			);
		}

		const csvText = lines.join("\r\n");
		const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		anchor.href = url;
		anchor.download = `conduit-route-schedule-${stamp}.csv`;
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
		setStatusMessage(`Exported ${scheduleRows.length} schedule row(s) to CSV.`);
	};

	const runRouteBackcheck = async () => {
		if (routeBackchecking || routeComputing || obstacleSyncing) {
			return;
		}
		if (routes.length === 0) {
			setStatusMessage("Create at least one route before running backcheck.");
			return;
		}

		setRouteBackchecking(true);
		setCrewReviewEntries([]);
		setCrewReviewError(null);
		setStatusMessage(`Running backcheck for ${routes.length} route(s)...`);

		const response = await conduitRouteService.backcheckRoutes({
			routes: routes.map((route) => ({
				id: route.id,
				ref: route.ref,
				mode: route.mode,
				path: route.path,
			})),
			obstacles: activeObstacles,
			obstacleSource,
			clearance,
		});

		setRouteBackchecking(false);
		if (!response.success) {
			setStatusMessage(response.message || "Route backcheck failed.");
			return;
		}

		setRouteBackcheckReport(response);
		const summary = response.summary;
		if (summary) {
			setStatusMessage(
				`Backcheck complete: ${summary.pass_count} pass, ${summary.warn_count} warn, ${summary.fail_count} fail.`,
			);
			return;
		}
		setStatusMessage("Backcheck complete.");
	};

	const runCadCrewReview = async () => {
		if (!routeBackcheckReport) {
			setCrewReviewError("Run backcheck first before requesting CAD crew review.");
			return;
		}
		if (
			crewReviewLoading ||
			routeBackchecking ||
			routeComputing ||
			obstacleSyncing
		) {
			return;
		}

		setCrewReviewLoading(true);
		setCrewReviewError(null);
		setCrewReviewEntries([]);

		const entries: CrewReviewEntry[] = [];
		try {
			entries.push({ profileId: "draftsmith", status: "running" });
			setCrewReviewEntries([...entries]);
			const draftsmithResult = await agentService.sendMessage(
				buildCadCrewReviewPrompt({
					profileId: "draftsmith",
					report: routeBackcheckReport,
				}),
				{
					profileId: "draftsmith",
					promptMode: "template",
					templateLabel: "AutoWire backcheck review",
				},
			);
			if (!draftsmithResult.success) {
				entries[0] = {
					profileId: "draftsmith",
					status: "failed",
					error: draftsmithResult.error || "Draftsmith review failed.",
				};
				setCrewReviewEntries([...entries]);
				setCrewReviewError(entries[0].error || "Draftsmith review failed.");
				setStatusMessage(entries[0].error || "Draftsmith review failed.");
				return;
			}

			const draftsmithText = extractAgentResponseText(draftsmithResult.data);
			entries[0] = {
				profileId: "draftsmith",
				status: "completed",
				response: draftsmithText,
			};
			entries.push({ profileId: "gridsage", status: "running" });
			setCrewReviewEntries([...entries]);

			const gridsageResult = await agentService.sendMessage(
				buildCadCrewReviewPrompt({
					profileId: "gridsage",
					report: routeBackcheckReport,
					draftsmithReview: draftsmithText,
				}),
				{
					profileId: "gridsage",
					promptMode: "template",
					templateLabel: "AutoWire electrical QA review",
				},
			);
			if (!gridsageResult.success) {
				entries[1] = {
					profileId: "gridsage",
					status: "failed",
					error: gridsageResult.error || "GridSage review failed.",
				};
				setCrewReviewEntries([...entries]);
				setCrewReviewError(entries[1].error || "GridSage review failed.");
				setStatusMessage(entries[1].error || "GridSage review failed.");
				return;
			}

			entries[1] = {
				profileId: "gridsage",
				status: "completed",
				response: extractAgentResponseText(gridsageResult.data),
			};
			setCrewReviewEntries([...entries]);
			setStatusMessage("CAD crew review complete (Draftsmith -> GridSage).");
		} finally {
			setCrewReviewLoading(false);
		}
	};

	const exportBackcheckJson = () => {
		if (!routeBackcheckReport) {
			setStatusMessage("Run backcheck first to export a report.");
			return;
		}
		const payload = JSON.stringify(
			{
				...routeBackcheckReport,
				crew_review: {
					entries: crewReviewEntries,
					error: crewReviewError,
				},
			},
			null,
			2,
		);
		const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		anchor.href = url;
		anchor.download = `autowire-backcheck-${stamp}.json`;
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
		setStatusMessage("Exported backcheck report JSON.");
	};

	const handleLayerPresetChange = (presetId: string) => {
		setObstacleLayerPreset(presetId);
		const selected = AUTOWIRE_OBSTACLE_LAYER_PRESET_OPTIONS.find(
			(entry) => entry.id === presetId,
		);
		setStatusMessage(
			presetId
				? `Obstacle layer preset set to '${selected?.label ?? presetId}'.`
				: "Obstacle layer preset set to manual rules.",
		);
	};

	return (
		<div className={styles.root}>
			<section className={styles.hero}>
				<div className={styles.heroGlow} />
				<div className={styles.heroHeader}>
					<div>
						<p className={styles.kicker}>AutoWire Lab</p>
						<h2 className={styles.title}>{heroTitle}</h2>
						<p className={styles.subtitle}>{heroSubtitle}</p>
					</div>
					<div className={styles.heroBadges}>
						<Badge color="success" variant="outline" size="sm">
							<ScanLine size={12} />
							{bridgeBadgeLabel}
						</Badge>
						<Badge color="primary" variant="outline" size="sm">
							<Sparkles size={12} />
							{isTerminalWorkspace
								? "Terminal Router Live"
								: "Route Engine Live"}
						</Badge>
					</div>
				</div>
				<div className={styles.workspaceToggle}>
					<button
						type="button"
						onClick={() => setWorkspace("yard")}
						className={cn(
							styles.workspaceButton,
							workspace === "yard" && styles.workspaceButtonActive,
						)}
					>
						<MapIcon size={13} />
						Yard Routing
					</button>
					<button
						type="button"
						onClick={() => setWorkspace("terminal")}
						className={cn(
							styles.workspaceButton,
							workspace === "terminal" && styles.workspaceButtonActive,
						)}
					>
						<Rows3 size={13} />
						Terminal Strips
					</button>
				</div>
				{workspace === "yard" ? (
					<div className={styles.metricsRow}>
						<div className={styles.metricCard}>
							<span>Total Routes</span>
							<strong>{routeStats.total}</strong>
						</div>
						<div className={styles.metricCard}>
							<span>Total Length</span>
							<strong>{Math.round(routeStats.totalLength)} px</strong>
						</div>
						<div className={styles.metricCard}>
							<span>Total Bends</span>
							<strong>{routeStats.totalBends}</strong>
						</div>
						<div className={styles.metricCard}>
							<span>Warnings</span>
							<strong>{routeStats.warningCount}</strong>
						</div>
					</div>
				) : (
					<div className={styles.metricsRow}>
						<div className={styles.metricCard}>
							<span>Workflow</span>
							<strong>Scan → Pick → Route</strong>
						</div>
						<div className={styles.metricCard}>
							<span>Input</span>
							<strong>Terminal Strips</strong>
						</div>
						<div className={styles.metricCard}>
							<span>Output</span>
							<strong>Route + Schedule</strong>
						</div>
						<div className={styles.metricCard}>
							<span>Phase</span>
							<strong>UI First</strong>
						</div>
					</div>
				)}
			</section>

			{workspace === "terminal" ? <ConduitTerminalWorkflow /> : null}

			{workspace === "yard" ? (
				<>
					<div className={styles.layout}>
						<Panel variant="glass" padding="md" className={styles.controlsCard}>
							<Stack gap={4}>
								<div>
									<Text size="sm" weight="semibold">
										Routing Controls
									</Text>
									<Text size="xs" color="muted">
										Select mode, system, and routing constraints.
									</Text>
								</div>

								<div className={styles.controlGroup}>
									<Text size="xs" color="muted">
										Mode
									</Text>
									<div className={styles.modeGrid}>
										{ROUTING_MODES.map((entry) => (
											<button
												key={entry.id}
												type="button"
												onClick={() => setMode(entry.id)}
												className={cn(
													styles.modeButton,
													mode === entry.id && styles.modeButtonActive,
												)}
											>
												<div className={styles.modeLabel}>{entry.label}</div>
												<div className={styles.modeDescription}>
													{entry.description}
												</div>
											</button>
										))}
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
											>
												{entry}
											</Button>
										))}
									</div>
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
													style={{
														background: WIRE_COLORS[cableType][entry].hex,
													}}
												/>
												<span>{entry}</span>
												<small>{WIRE_COLORS[cableType][entry].code}</small>
											</button>
										))}
									</div>
								</div>

								<div className={styles.controlGroup}>
									<Text size="xs" color="muted">
										Clearance: {clearance} px
									</Text>
									<input
										type="range"
										min={4}
										max={48}
										value={clearance}
										onChange={(event) =>
											setClearance(Number(event.target.value) || 18)
										}
										className={styles.slider}
									name="conduitrouteapp_input_1061"
									/>
								</div>

								<div className={styles.controlGroup}>
									<Text size="xs" color="muted">
										Obstacle Source
									</Text>
									<div className={styles.canvasBadges}>
										<Badge
											color={
												obstacleSource === "autocad" ? "success" : "default"
											}
											variant="outline"
											size="sm"
										>
											<Layers size={12} />
											{obstacleSource === "autocad" ? "AutoCAD" : "Demo Layout"}
										</Badge>
										<Badge color="default" variant="outline" size="sm">
											{activeObstacles.length} obstacles
										</Badge>
										<Badge color="default" variant="outline" size="sm">
											{obstacleLayerRules.length} layer rules
										</Badge>
										{obstacleScanMeta?.scanMs ? (
											<Badge color="default" variant="outline" size="sm">
												{obstacleScanMeta.scanMs} ms
											</Badge>
										) : null}
									</div>
									<div className={styles.layerEditorPanel}>
									<div className={styles.layerEditorHeader}>
										<Text size="xs" color="muted">
											Layer Identification
										</Text>
											<Button
												size="sm"
												variant="ghost"
												iconLeft={
													layerRulesRefreshing ? (
														<LoaderCircle size={12} />
													) : (
														<ScanLine size={12} />
													)
												}
												onClick={() =>
													void refreshObstacleLayerList({ silent: false })
												}
												disabled={routeComputing || obstacleSyncing || routeBackchecking}
												loading={layerRulesRefreshing}
											>
												Refresh
											</Button>
										</div>
										<div className={styles.layerEditorInputRow}>
											<select
												value={obstacleLayerPreset}
												onChange={(event) =>
													handleLayerPresetChange(event.target.value)
												}
												className={styles.layerEditorSelect}
												disabled={routeComputing || obstacleSyncing || routeBackchecking}
											 name="conduitrouteapp_select_1125">
												{AUTOWIRE_OBSTACLE_LAYER_PRESET_OPTIONS.map((preset) => (
													<option key={preset.id || "manual"} value={preset.id}>
														{preset.label}
													</option>
												))}
											</select>
										</div>
										<div className={styles.layerEditorInputRow}>
											{availableCadLayers.length > 0 ? (
												<select
													value={layerPickerValue}
													onChange={(event) =>
														setLayerPickerValue(event.target.value)
													}
													className={styles.layerEditorSelect}
												 name="conduitrouteapp_select_1142">
													<option value="">-- Select layer --</option>
													{availableCadLayers.map((layer) => (
														<option key={layer} value={layer}>
															{layer}
														</option>
													))}
												</select>
											) : (
												<input
													type="text"
													value={layerPickerValue}
													onChange={(event) =>
														setLayerPickerValue(event.target.value)
													}
													className={styles.layerEditorInput}
													placeholder="Type layer name..."
												name="conduitrouteapp_input_1157"
												/>
											)}
											<Button
												size="sm"
												variant="outline"
												onClick={addObstacleLayerRule}
												disabled={routeComputing || obstacleSyncing || routeBackchecking}
											>
												Add
											</Button>
										</div>
										<div className={styles.layerEditorActions}>
											<Button
												size="sm"
												variant="ghost"
												onClick={autoIdentifyObstacleLayers}
												disabled={
													routeComputing ||
													obstacleSyncing ||
													routeBackchecking ||
													availableCadLayers.length === 0
												}
											>
												Auto Identify
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={clearObstacleLayerRules}
												disabled={
													routeComputing ||
													obstacleSyncing ||
													routeBackchecking ||
													obstacleLayerRules.length === 0
												}
											>
												Clear Rules
											</Button>
										</div>
										<div className={styles.layerRuleList}>
											{obstacleLayerRules.length === 0 ? (
												<div className={styles.layerRuleEmpty}>
													No layer rules yet. Add one or run Auto Identify.
												</div>
											) : (
												obstacleLayerRules.map((rule) => (
													<div
														key={rule.layerName}
														className={styles.layerRuleRow}
													>
														<span className={styles.layerRuleName}>
															{rule.layerName}
														</span>
														<select
															value={rule.obstacleType}
															onChange={(event) =>
																setObstacleLayerRules((prev) =>
																	prev.map((entry) =>
																		entry.layerName === rule.layerName
																			? {
																					...entry,
																					obstacleType: event.target
																						.value as ObstacleType,
																				}
																			: entry,
																	),
																)
															}
															className={styles.layerTypeSelect}
														 name="conduitrouteapp_select_1216">
															<option value="foundation">Foundation</option>
															<option value="building">Building</option>
															<option value="equipment_pad">Pad</option>
															<option value="trench">Trench</option>
															<option value="road">Road</option>
															<option value="fence">Fence</option>
														</select>
														<button
															type="button"
															className={styles.layerRuleRemove}
															onClick={() =>
																removeObstacleLayerRule(rule.layerName)
															}
															disabled={routeComputing || obstacleSyncing || routeBackchecking}
														>
															<X size={12} />
														</button>
													</div>
												))
											)}
										</div>
									</div>
									<div className={styles.actionRow}>
										<Button
											size="sm"
											variant="outline"
											iconLeft={
												obstacleSyncing ? (
													<LoaderCircle size={14} />
												) : (
													<ScanLine size={14} />
												)
											}
											onClick={() => void syncAutocadObstacles()}
											loading={obstacleSyncing}
											disabled={routeComputing || obstacleSyncing || routeBackchecking}
										>
											Sync AutoCAD
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={useDemoObstacleLayout}
											disabled={routeComputing || obstacleSyncing || routeBackchecking}
										>
											Use Demo
										</Button>
									</div>
								</div>

								<div className={styles.actionRow}>
									<Button
										size="sm"
										variant="outline"
										iconLeft={<Eraser size={14} />}
										onClick={clearAllRoutes}
										disabled={routeComputing || obstacleSyncing || routeBackchecking}
									>
										Clear All
									</Button>
									<Button
										size="sm"
										variant="outline"
										iconLeft={<X size={14} />}
										onClick={undoLastRoute}
										disabled={routeComputing || obstacleSyncing || routeBackchecking}
									>
										Undo
									</Button>
								</div>
								<div className={styles.backcheckPanel}>
									<div className={styles.backcheckHeader}>
										<Text size="xs" color="muted">
											Route Backcheck
										</Text>
										<div className={styles.backcheckHeaderBadges}>
											{routeBackcheckSummary ? (
												<>
													<Badge color="success" variant="outline" size="sm">
														{routeBackcheckSummary.pass_count} pass
													</Badge>
													<Badge color="warning" variant="outline" size="sm">
														{routeBackcheckSummary.warn_count} warn
													</Badge>
													<Badge color="danger" variant="outline" size="sm">
														{routeBackcheckSummary.fail_count} fail
													</Badge>
												</>
											) : (
												<Badge color="default" variant="outline" size="sm">
													not run
												</Badge>
											)}
										</div>
									</div>
									<div className={styles.gatePanel}>
										<Badge color={cadSyncGate.color} variant="outline" size="sm">
											{cadSyncGate.label}
										</Badge>
										<Text size="xs" color="muted">
											{cadSyncGate.detail}
										</Text>
									</div>
									<div className={styles.actionRow}>
										<Button
											size="sm"
											variant="outline"
											iconLeft={
												routeBackchecking ? (
													<LoaderCircle size={14} />
												) : (
													<CheckCircle2 size={14} />
												)
											}
											onClick={() => void runRouteBackcheck()}
											loading={routeBackchecking}
											disabled={
												routeBackchecking ||
												crewReviewLoading ||
												routeComputing ||
												obstacleSyncing ||
												routes.length === 0
											}
										>
											Run Backcheck
										</Button>
										<Button
											size="sm"
											variant="ghost"
											iconLeft={<HardDriveDownload size={14} />}
											onClick={exportBackcheckJson}
											disabled={!routeBackcheckReport || routeBackchecking}
										>
											Export JSON
										</Button>
									</div>
									<div className={styles.actionRow}>
										<Button
											size="sm"
											variant="outline"
											iconLeft={
												crewReviewLoading ? (
													<LoaderCircle size={14} />
												) : (
													<CheckCircle2 size={14} />
												)
											}
											onClick={() => void runCadCrewReview()}
											loading={crewReviewLoading}
											disabled={!routeBackcheckReport || routeBackchecking || crewReviewLoading}
										>
											CAD Crew Review
										</Button>
									</div>
									{routeBackcheckReport?.findings?.length ? (
										<div className={styles.backcheckFindings}>
											{routeBackcheckReport.findings.slice(0, 6).map((finding) => (
												<div key={finding.routeId} className={styles.backcheckFindingRow}>
													<div className={styles.backcheckFindingHead}>
														<strong>{finding.ref || finding.routeId}</strong>
														<Badge
															color={
																finding.status === "fail"
																	? "danger"
																	: finding.status === "warn"
																		? "warning"
																		: "success"
															}
															variant="outline"
															size="sm"
														>
															{finding.status}
														</Badge>
													</div>
													<div className={styles.backcheckFindingMeta}>
														<span>{Math.round(finding.stats.length)} px</span>
														<span>{finding.stats.bend_degrees}° bends</span>
														<span>{finding.stats.collision_count} collisions</span>
													</div>
													{finding.issues.length > 0 ? (
														<Text size="xs" color="muted">
															{finding.issues[0]?.message}
														</Text>
													) : null}
												</div>
											))}
										</div>
									) : null}
									{crewReviewEntries.length > 0 ? (
										<div className={styles.crewReviewPanel}>
											<Text size="xs" color="muted">
												Draftsmith {"->"} GridSage
											</Text>
											{crewReviewEntries.map((entry) => (
												<div key={entry.profileId} className={styles.crewReviewCard}>
													<div className={styles.backcheckFindingHead}>
														<strong>{entry.profileId}</strong>
														<Badge
															color={
																entry.status === "completed"
																	? "success"
																	: entry.status === "running"
																		? "warning"
																		: "danger"
															}
															variant="outline"
															size="sm"
														>
															{entry.status}
														</Badge>
													</div>
													{entry.response ? (
														<pre className={styles.crewReviewResponse}>
															{entry.response}
														</pre>
													) : null}
													{entry.error ? (
														<Text size="xs" color="warning">
															{entry.error}
														</Text>
													) : null}
												</div>
											))}
										</div>
									) : null}
									{crewReviewError ? (
										<Text size="xs" color="warning">
											{crewReviewError}
										</Text>
									) : null}
								</div>
							</Stack>
						</Panel>

						<Panel
							variant="elevated"
							padding="md"
							className={styles.canvasCard}
						>
							<div className={styles.canvasHeader}>
								<div>
									<Text size="sm" weight="semibold">
										Route Canvas
									</Text>
									<Text size="xs" color="muted">
										Click start, then destination. Engine computes around
										inflated obstacles.
									</Text>
								</div>
								<div className={styles.canvasBadges}>
									<Badge
										color={getModeBadgeTone(mode)}
										variant="outline"
										size="sm"
									>
										<MapIcon size={12} />
										{mode.replace("_", " ")}
									</Badge>
									<Badge color="default" variant="outline" size="sm">
										<Layers size={12} />
										{cableType} / {wireFunction}
									</Badge>
									<Badge
										color={obstacleSource === "autocad" ? "success" : "default"}
										variant="outline"
										size="sm"
									>
										{obstacleSource === "autocad"
											? "AutoCAD Obstacles"
											: "Demo Obstacles"}
									</Badge>
									{obstacleSyncing ? (
										<Badge color="warning" variant="outline" size="sm">
											<LoaderCircle size={12} />
											Syncing Obstacles...
										</Badge>
									) : null}
									{routeBackchecking ? (
										<Badge color="warning" variant="outline" size="sm">
											<LoaderCircle size={12} />
											Backchecking...
										</Badge>
									) : null}
									{routeComputing ? (
										<Badge color="warning" variant="outline" size="sm">
											<LoaderCircle size={12} />
											Computing...
										</Badge>
									) : null}
									{lastComputeMeta &&
									(lastComputeMeta.computeMs ||
										lastComputeMeta.requestMs ||
										lastComputeMeta.routeValid === false) ? (
										<Badge
											color={
												lastComputeMeta.routeValid === false
													? "danger"
													: "success"
											}
											variant="outline"
											size="sm"
										>
											{lastComputeMeta.routeValid === false
												? "Blocked"
												: `${lastComputeMeta.computeMs ?? lastComputeMeta.requestMs} ms`}
										</Badge>
									) : null}
								</div>
							</div>

							<div className={styles.canvasWrap}>
								<svg
									viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
									className={styles.canvas}
									onMouseMove={(event) => {
										if (routeComputing || obstacleSyncing || routeBackchecking) {
											return;
										}
										setHoverPoint(handleCanvasPoint(event));
									}}
									onMouseLeave={() => setHoverPoint(null)}
									onClick={handleCanvasClick}
								>
									<defs>
										<pattern
											id="grid-sm"
											width="16"
											height="16"
											patternUnits="userSpaceOnUse"
										>
											<path
												d="M 16 0 L 0 0 0 16"
												className={styles.gridMinor}
											/>
										</pattern>
										<pattern
											id="grid-lg"
											width="64"
											height="64"
											patternUnits="userSpaceOnUse"
										>
											<rect width="64" height="64" fill="url(#grid-sm)" />
											<path
												d="M 64 0 L 0 0 0 64"
												className={styles.gridMajor}
											/>
										</pattern>
									</defs>
									<rect
										width={CANVAS_WIDTH}
										height={CANVAS_HEIGHT}
										className={styles.canvasBg}
									/>
									<rect
										width={CANVAS_WIDTH}
										height={CANVAS_HEIGHT}
										fill="url(#grid-lg)"
									/>

									{activeObstacles.map((obstacle) => {
										const style = OBSTACLE_STYLE[obstacle.type];
										return (
											<g key={obstacle.id}>
												<rect
													x={obstacle.x}
													y={obstacle.y}
													width={obstacle.w}
													height={obstacle.h}
													rx={obstacle.type === "fence" ? 8 : 4}
													fill={style.fill}
													stroke={style.stroke}
													strokeWidth={obstacle.type === "fence" ? 1.5 : 1.1}
													strokeDasharray={
														obstacle.type === "fence" ? "6,4" : undefined
													}
												/>
												{obstacle.label ? (
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
									})}

									{routes.map((route) => {
										const selected = selectedRouteId === route.id;
										return (
											<g key={route.id}>
												<path
													d={toRoundedPathSvg(route.path)}
													className={styles.routeShadow}
												/>
												<path
													d={toRoundedPathSvg(route.path)}
													stroke={route.color.stroke}
													strokeWidth={selected ? 4 : 3}
													fill="none"
													className={styles.routeStroke}
													onClick={(event) => {
														event.stopPropagation();
														setSelectedRouteId(route.id);
													}}
												/>
												{route.tag ? (
													<text
														x={route.tag.position.x}
														y={route.tag.position.y}
														transform={`rotate(${route.tag.angleDeg} ${route.tag.position.x} ${route.tag.position.y})`}
														className={styles.tagText}
													>
														{route.tag.text}
													</text>
												) : null}
											</g>
										);
									})}

									{startPoint ? (
										<g>
											<circle
												cx={startPoint.x}
												cy={startPoint.y}
												r={8}
												className={styles.startDot}
											/>
											<circle
												cx={startPoint.x}
												cy={startPoint.y}
												r={16}
												className={styles.startRing}
											/>
										</g>
									) : null}

									{previewPath.path.length > 1 ? (
										<path
											d={toRoundedPathSvg(previewPath.path)}
											className={cn(
												styles.previewStroke,
												!previewPath.valid && styles.previewSketch,
											)}
										/>
									) : null}

									{EQUIPMENT_NODES.map((node) => (
										<g key={node.id}>
											<circle
												cx={node.x}
												cy={node.y}
												r={8}
												fill={node.color}
												className={styles.nodeDot}
											/>
											<text
												x={node.x + 12}
												y={node.y + 4}
												className={styles.nodeLabel}
											>
												{node.label}
											</text>
										</g>
									))}
								</svg>
							</div>

							<div className={styles.statusBar}>
								<span>{statusMessage}</span>
								{startPoint ? (
									<span>
										<Crosshair size={12} /> Start locked (
										{Math.round(startPoint.x)}, {Math.round(startPoint.y)})
									</span>
								) : null}
							</div>
						</Panel>

						<Panel variant="glass" padding="md" className={styles.inspectCard}>
							<div className={styles.inspectTabs}>
								{ROUTE_TABS.map((entry) => (
									<button
										key={entry.id}
										type="button"
										onClick={() => setTab(entry.id)}
										className={cn(
											styles.inspectTab,
											tab === entry.id && styles.inspectTabActive,
										)}
									>
										{entry.label}
									</button>
								))}
							</div>

							{tab === "routes" ? (
								<Stack gap={3} className={styles.feed}>
									{routes.length === 0 ? (
										<div className={styles.emptyState}>
											<Circle size={14} />
											No routes yet. Start by clicking two points on the canvas.
										</div>
									) : (
										routes.map((route) => (
											<div
												key={route.id}
												className={cn(
													styles.feedCard,
													selectedRouteId === route.id &&
														styles.feedCardSelected,
												)}
											>
												<button
													type="button"
													onClick={() => setSelectedRouteId(route.id)}
													className={styles.feedSelect}
												>
													<div className={styles.feedTop}>
														<strong>{route.ref}</strong>
														<Badge
															color={
																route.bendDegrees > 360 ? "danger" : "success"
															}
															variant="outline"
															size="sm"
														>
															{route.mode.replace("_", " ")}
														</Badge>
													</div>
													<div className={styles.feedMeta}>
														<span>
															<Ruler size={12} /> {formatLength(route.length)}
														</span>
														<span>
															<Cable size={12} /> {route.bendDegrees}° bends
														</span>
													</div>
												</button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => removeRoute(route.id)}
													iconLeft={<X size={12} />}
													disabled={routeComputing || obstacleSyncing || routeBackchecking}
												>
													Remove
												</Button>
											</div>
										))
									)}

									{selectedRoute ? (
										<div className={styles.selectedRouteCard}>
											<div className={styles.selectedHeader}>
												<span>Selected</span>
												<strong>{selectedRoute.ref}</strong>
											</div>
											<div className={styles.selectedRows}>
												<div>
													<span>System</span>
													<strong>{selectedRoute.cableType}</strong>
												</div>
												<div>
													<span>Function</span>
													<strong>{selectedRoute.wireFunction}</strong>
												</div>
												<div>
													<span>Bends</span>
													<strong>{selectedRoute.bendCount}</strong>
												</div>
												<div>
													<span>Total Degrees</span>
													<strong>{selectedRoute.bendDegrees}°</strong>
												</div>
											</div>
											{selectedRoute.bendDegrees > 360 ? (
												<div className={styles.warningBanner}>
													<AlertTriangle size={14} />
													Exceeded NEC 360° pull limit. Add pull point.
												</div>
											) : (
												<div className={styles.okBanner}>
													<CheckCircle2 size={14} />
													Within bend-limit envelope.
												</div>
											)}
										</div>
									) : null}
								</Stack>
							) : null}

							{tab === "schedule" ? (
								<div className={styles.scheduleWrap}>
									{scheduleRows.length === 0 ? (
										<div className={styles.emptyState}>
											No schedule rows yet.
										</div>
									) : (
										<table className={styles.scheduleTable}>
											<thead>
												<tr>
													<th>Ref</th>
													<th>Type</th>
													<th>Fn</th>
													<th>Color</th>
													<th>From</th>
													<th>To</th>
													<th>Len</th>
												</tr>
											</thead>
											<tbody>
												{scheduleRows.map((row) => (
													<tr key={row.id}>
														<td>{row.ref}</td>
														<td>{row.type}</td>
														<td>{row.fn}</td>
														<td>{row.color}</td>
														<td>{row.from}</td>
														<td>{row.to}</td>
														<td>{row.length}px</td>
													</tr>
												))}
											</tbody>
										</table>
									)}
									<div className={styles.scheduleActions}>
										<Button
											variant="outline"
											size="sm"
											iconLeft={<HardDriveDownload size={14} />}
											onClick={exportScheduleCsv}
											disabled={scheduleRows.length === 0}
										>
											Export CSV
										</Button>
									</div>
								</div>
							) : null}

							{tab === "nec" ? (
								<Stack gap={3}>
									<div className={styles.necControls}>
										<label className={styles.necLabel}>
											Conduit Type
											<select
												className={styles.selectField}
												value={necConduit}
												onChange={(event) => setNecConduit(event.target.value)}
											 name="conduitrouteapp_select_1707">
												{Object.keys(CONDUIT_AREAS).map((option) => (
													<option key={option} value={option}>
														{option}
													</option>
												))}
											</select>
										</label>
										<Input
											label="Ambient Temp (C)"
											type="number"
											value={ambientTempC}
											onChange={(event) =>
												setAmbientTempC(Number(event.target.value) || 30)
											}
											inputSize="sm"
										/>
									</div>

									<div className={styles.necConductors}>
										{necConductors.map((conductor, index) => (
											<div
												key={`${conductor.gauge}_${index}`}
												className={styles.necConductorRow}
											>
												<select
													className={styles.selectField}
													value={conductor.gauge}
													onChange={(event) => {
														setNecConductors((current) => {
															const next = [...current];
															next[index] = {
																...next[index],
																gauge: event.target.value,
															};
															return next;
														});
													}}
												 name="conduitrouteapp_select_1736">
													{Object.keys(CONDUCTOR_AREAS).map((option) => (
														<option key={option} value={option}>
															{option}
														</option>
													))}
												</select>
												<input
													type="number"
													min={1}
													className={styles.countField}
													value={conductor.count}
													onChange={(event) => {
														setNecConductors((current) => {
															const next = [...current];
															next[index] = {
																...next[index],
																count: Math.max(
																	1,
																	Number(event.target.value) || 1,
																),
															};
															return next;
														});
													}}
												name="conduitrouteapp_input_1756"
												/>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => {
														setNecConductors((current) =>
															current.length > 1
																? current.filter((_, row) => row !== index)
																: current,
														);
													}}
													iconLeft={<X size={12} />}
												>
													Drop
												</Button>
											</div>
										))}
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												setNecConductors((current) => [
													...current,
													{ gauge: "12 AWG", count: 1 },
												])
											}
										>
											+ Add Conductor
										</Button>
									</div>

									<div className={styles.necResults}>
										<div className={styles.necCard}>
											<span>Fill</span>
											<strong>{necResult.fillPercent.toFixed(1)}%</strong>
											<Badge
												color={necResult.fillPass ? "success" : "danger"}
												variant="outline"
												size="sm"
											>
												Limit {necResult.fillLimitPercent}%
											</Badge>
										</div>
										<div className={styles.necCard}>
											<span>Derating</span>
											<strong>
												{(necResult.deratingFactor * 100).toFixed(0)}%
											</strong>
										</div>
										<div className={styles.necCard}>
											<span>Temp Corr</span>
											<strong>
												{(necResult.tempCorrectionFactor * 100).toFixed(0)}%
											</strong>
										</div>
									</div>

									<div>
										<Text
											size="xs"
											color="muted"
											className={styles.progressLabel}
										>
											Combined Thermal Utilization
										</Text>
										<Progress
											value={Math.min(
												100,
												Math.round((1 - necResult.combinedFactor) * 100),
											)}
											color={colorVariantByPercent(
												(1 - necResult.combinedFactor) * 100,
											)}
											showValue
										/>
									</div>
								</Stack>
							) : null}

							{tab === "sections" ? (
								<Stack gap={3}>
									<div className={styles.sectionButtons}>
										{SECTION_PRESETS.map((preset) => (
											<button
												key={preset.id}
												type="button"
												onClick={() => setSectionPreset(preset.id)}
												className={cn(
													styles.sectionButton,
													sectionPreset === preset.id &&
														styles.sectionButtonActive,
												)}
											>
												{preset.label}
											</button>
										))}
									</div>
									<div className={styles.sectionPanel}>
										<div className={styles.sectionHeader}>
											<Text size="sm" weight="semibold">
												{sectionInfo?.title ?? "Section"}
											</Text>
											<Text size="xs" color="muted">
												{sectionInfo?.description}
											</Text>
										</div>
										<SectionSketch preset={sectionPreset} />
										<div className={styles.sectionMetrics}>
											{sectionMetricCards.map((metric) => (
												<div
													key={metric.label}
													className={styles.sectionMetric}
												>
													<span>{metric.label}</span>
													<strong>{metric.value}</strong>
												</div>
											))}
										</div>
									</div>
								</Stack>
							) : null}
						</Panel>
					</div>
					<footer className={styles.footer}>
						<div>
							<Grid3X3 size={12} />
							Grid {CANVAS_WIDTH}x{CANVAS_HEIGHT}
						</div>
						<div>
							<MoveRight size={12} />
							{routes.length > 0
								? `${routes[0].ref} latest route`
								: "No routes committed yet"}
						</div>
						<div>
							<FlaskConical size={12} />
							NEC snapshot in sync
						</div>
					</footer>
				</>
			) : null}
		</div>
	);
}
