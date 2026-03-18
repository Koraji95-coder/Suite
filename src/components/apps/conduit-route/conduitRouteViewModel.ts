import {
	DEFAULT_WIRE_FUNCTIONS,
	SECTION_METRICS,
	SECTION_PRESETS,
	WIRE_COLORS,
} from "./conduitRouteData";
import { buildCostGrid, routePath } from "./conduitRouteEngine";
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

export type CrewReviewProfile = "draftsmith" | "gridsage";

export type CrewReviewEntry = {
	profileId: CrewReviewProfile;
	status: "running" | "completed" | "failed";
	response?: string;
	error?: string;
};

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
	return `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

export function extractAgentResponseText(
	data: Record<string, unknown> | undefined,
): string {
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

export function buildCadCrewReviewPrompt(args: {
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

function buildCadSyncGate(args: {
	report: ConduitRouteBackcheckResponse | null;
	crewReviewEntries: CrewReviewEntry[];
}): ConduitRouteCadSyncGate {
	const { report, crewReviewEntries } = args;
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

	const completedCount = crewReviewEntries.filter(
		(entry) => entry.status === "completed",
	).length;
	const hasCrewReviewFailures = crewReviewEntries.some(
		(entry) => entry.status === "failed",
	);
	if (hasCrewReviewFailures) {
		return {
			color: "danger",
			label: "Crew review failed",
			detail: "Resolve agent review errors before proceeding.",
		};
	}
	if (completedCount < 2) {
		return {
			color: "warning",
			label: "Crew review required",
			detail:
				"Backcheck has failing findings. Run Draftsmith and GridSage review.",
		};
	}
	return {
		color: "danger",
		label: "Manual decision required",
		detail:
			"Fail findings remain after crew review. Apply fixes or document override.",
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
	crewReviewEntries: CrewReviewEntry[];
	obstacleLayerRules: ObstacleLayerRule[];
	sectionPreset: SectionPreset["id"];
}): {
	activeColor: (typeof WIRE_COLORS)[CableSystemType][string];
	availableWireFunctions: string[];
	costGrid: ReturnType<typeof buildCostGrid>;
	heroSubtitle: string;
	heroTitle: string;
	isTerminalWorkspace: boolean;
	obstacleLayerNames: string[];
	obstacleLayerTypeOverrides: Record<string, ObstacleType>;
	previewPath: ReturnType<typeof routePath>;
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
		activeObstacles,
		clearance,
		mode,
		startPoint,
		hoverPoint,
		routes,
		selectedRouteId,
		routeBackcheckReport,
		crewReviewEntries,
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
	const costGrid = buildCostGrid(activeObstacles, clearance, mode);
	const previewPath =
		startPoint && hoverPoint
			? routePath(startPoint, hoverPoint, costGrid, mode)
			: { path: [] as Point2D[], valid: true, fallbackUsed: false };
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

	return {
		activeColor,
		availableWireFunctions,
		costGrid,
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
		cadSyncGate: buildCadSyncGate({
			report: routeBackcheckReport,
			crewReviewEntries,
		}),
		sectionInfo,
		sectionMetricCards: SECTION_METRICS[sectionPreset],
	};
}
