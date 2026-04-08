import { localId } from "@/lib/localId";
import {
	DEFAULT_WIRE_FUNCTIONS,
	SECTION_METRICS,
	SECTION_PRESETS,
	WIRE_COLORS,
} from "./conduitRouteData";
import type {
	CableSystemType,
	ConduitRouteBackcheckResponse,
	ConduitRouteRecord,
	Obstacle,
	ObstacleLayerRule,
	ObstacleType,
	Point2D,
	RoutingMode,
	SectionPreset,
} from "./conduitRouteTypes";

export type ConduitRouteCadSyncGate = {
	color: "success" | "warning" | "danger";
	label: string;
	detail: string;
};

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function formatLength(length: number): string {
	return `${Math.round(length)} px`;
}

export function makeRouteId(): string {
	return localId("route");
}

export function toCsvValue(value: string | number): string {
	const text = String(value ?? "");
	if (/[",\r\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

export function colorVariantByPercent(
	percent: number,
): "success" | "warning" | "danger" {
	if (percent <= 60) return "success";
	if (percent <= 85) return "warning";
	return "danger";
}

export function getModeBadgeTone(
	mode: RoutingMode,
): "default" | "primary" | "success" | "warning" {
	if (mode === "plan_view") return "success";
	if (mode === "cable_tag") return "primary";
	return "warning";
}

export function inferObstacleTypeFromLayer(
	layerName: string,
): ObstacleType | null {
	const layer = layerName.trim().toUpperCase();
	if (!layer) return null;
	if (layer.includes("TRENCH")) return "trench";
	if (layer.includes("FENCE")) return "fence";
	if (layer.includes("ROAD")) return "road";
	if (
		layer.includes("FOUND") ||
		layer.includes("FNDN") ||
		layer.startsWith("S-FNDN")
	) {
		return "foundation";
	}
	if (layer.includes("KEEPOUT") || layer.includes("KEEP-OUT")) {
		return "foundation";
	}
	if (layer.includes("PAD") || layer.includes("S-CONC")) {
		return "equipment_pad";
	}
	if (
		layer.includes("BUILD") ||
		layer.includes("A-WALL") ||
		layer.startsWith("A-WALL") ||
		layer.includes("S-STRU") ||
		layer.includes("S-STEEL")
	) {
		return "building";
	}
	if (layer.startsWith("E-CONDUIT") || layer === "E-CONDUIT") return "road";
	return null;
}

function buildCadSyncGate(args: {
	report: ConduitRouteBackcheckResponse | null;
}): ConduitRouteCadSyncGate {
	const { report } = args;
	const routeBackcheckSummary = report?.summary ?? null;
	if (!routeBackcheckSummary) {
		return {
			color: "warning",
			label: "Backcheck required",
			detail: "Run backcheck before issuing CAD sync decisions.",
		};
	}

	if (routeBackcheckSummary.fail_count <= 0) {
		if (routeBackcheckSummary.warn_count > 0) {
			return {
				color: "warning",
				label: "Ready with warnings",
				detail:
					"Fail findings are clear. Review warnings before final CAD publish.",
			};
		}

		return {
			color: "success",
			label: "Ready for CAD sync",
			detail: "No failing findings in current backcheck report.",
		};
	}
	return {
		color: "danger",
		label: "Failing findings detected",
		detail:
			"Backcheck found failing findings. Fix the routes before issuing a CAD sync decision.",
	};
}

export function createConduitRouteViewModel(args: {
	workspace: "yard" | "terminal";
	cableType: CableSystemType;
	wireFunction: string;
	activeObstacles: Obstacle[];
	clearance: number;
	mode: RoutingMode;
	startPoint: Point2D | null;
	hoverPoint: Point2D | null;
	routes: ConduitRouteRecord[];
	selectedRouteId: string | null;
	routeBackcheckReport: ConduitRouteBackcheckResponse | null;
	obstacleLayerRules: ObstacleLayerRule[];
	sectionPreset: SectionPreset["id"];
}): {
	activeColor: (typeof WIRE_COLORS)[CableSystemType][string];
	availableWireFunctions: string[];
	heroSubtitle: string;
	heroTitle: string;
	isTerminalWorkspace: boolean;
	obstacleLayerNames: string[];
	obstacleLayerTypeOverrides: Record<string, ObstacleType>;
	previewPath: { path: Point2D[]; valid: boolean; fallbackUsed: boolean };
	routeStats: {
		total: number;
		totalLength: number;
		totalBends: number;
		warningCount: number;
	};
	routeBackcheckSummary: NonNullable<ConduitRouteBackcheckResponse["summary"]> | null;
	selectedRoute: ConduitRouteRecord | null;
	cadSyncGate: ConduitRouteCadSyncGate;
	sectionInfo:
		| (typeof SECTION_PRESETS)[number]
		| undefined;
	sectionMetricCards: (typeof SECTION_METRICS)[SectionPreset["id"]];
} {
	const {
		workspace,
		cableType,
		wireFunction,
		startPoint,
		hoverPoint,
		routes,
		selectedRouteId,
		routeBackcheckReport,
		obstacleLayerRules,
		sectionPreset,
	} = args;

	const availableWireFunctions = Object.keys(WIRE_COLORS[cableType]);
	const activeColor =
		WIRE_COLORS[cableType][wireFunction] ??
		WIRE_COLORS[cableType][DEFAULT_WIRE_FUNCTIONS[cableType]];
	const obstacleLayerNames = obstacleLayerRules.map((rule) => rule.layerName);
	const obstacleLayerTypeOverrides = obstacleLayerRules.reduce<
		Record<string, ObstacleType>
	>((overrides, rule) => {
		overrides[rule.layerName] = rule.obstacleType;
		return overrides;
	}, {});
	// Route computation delegated to backend (single source of truth).
	// Real-time hover preview uses an L-shaped sketch; final routes are computed
	// by the backend via conduitRouteService.computeRoute().
	// If a smoother preview is needed, add a debounced API call here.
	const previewPath: { path: Point2D[]; valid: boolean; fallbackUsed: boolean } =
		startPoint && hoverPoint
			? {
					path: [
						startPoint,
						{ x: hoverPoint.x, y: startPoint.y },
						hoverPoint,
					],
					valid: false,
					fallbackUsed: true,
				}
			: { path: [], valid: true, fallbackUsed: false };
	const selectedRoute =
		routes.find((route) => route.id === selectedRouteId) ?? null;
	const routeStats = routes.reduce(
		(stats, route) => {
			stats.total += 1;
			stats.totalLength += route.length;
			stats.totalBends += route.bendCount;
			if (route.bendDegrees > 360) {
				stats.warningCount += 1;
			}
			return stats;
		},
		{ total: 0, totalLength: 0, totalBends: 0, warningCount: 0 },
	);
	const routeBackcheckSummary = routeBackcheckReport?.summary ?? null;
	const sectionInfo = SECTION_PRESETS.find((preset) => preset.id === sectionPreset);
	const isTerminalWorkspace = workspace === "terminal";
	const cadSyncGate = buildCadSyncGate({
		report: routeBackcheckReport,
	});

	return {
		activeColor,
		availableWireFunctions,
		heroSubtitle: isTerminalWorkspace
			? "Scan terminal strips, click source and destination, and build route + schedule output."
			: "Interactive cable/conduit routing with NEC snapshots, section previews, and bend-limit monitoring.",
		heroTitle: isTerminalWorkspace
			? "Terminal Strip Routing Deck"
			: "Conduit Route Command Deck",
		isTerminalWorkspace,
		obstacleLayerNames,
		obstacleLayerTypeOverrides,
		previewPath,
		routeStats,
		routeBackcheckSummary,
		selectedRoute,
		cadSyncGate,
		sectionInfo,
		sectionMetricCards: SECTION_METRICS[sectionPreset],
	};
}
