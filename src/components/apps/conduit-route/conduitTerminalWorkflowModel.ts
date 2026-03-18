import { DEFAULT_WIRE_FUNCTIONS, WIRE_COLORS } from "./conduitRouteData";
import { buildTerminalLayout } from "./conduitTerminalEngine";
import type { CableSystemType } from "./conduitRouteTypes";
import type {
	EtapCleanupCommand,
	TerminalCadRuntimeStatus,
	TerminalLayoutResult,
	TerminalRouteRecord,
	TerminalScanData,
	TerminalScanProfile,
} from "./conduitTerminalTypes";

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

function parseEnvNumber(raw: unknown, fallback: number): number {
	if (typeof raw !== "string") return fallback;
	const parsed = Number.parseFloat(raw.trim());
	if (!Number.isFinite(parsed)) return fallback;
	return parsed;
}

export const EMPTY_LAYOUT: TerminalLayoutResult = {
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

export const AUTO_CONNECT_ON_MOUNT = parseEnvBoolean(
	import.meta.env.VITE_TERMINAL_AUTO_CONNECT,
	true,
);

export const TERMINAL_BLOCK_ALLOW_LIST = parseCsvEnv(
	import.meta.env.VITE_TERMINAL_BLOCK_ALLOW_LIST ?? "TB_STRIP_META_SIDE",
);

export const DEFAULT_TERMINAL_SCAN_PROFILE: TerminalScanProfile = {
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

export const JUMPER_COLOR = {
	code: "JMP",
	hex: "#f97316",
	stroke: "#fb923c",
	aci: 30,
} as const;

export const ETAP_CLEANUP_COMMANDS: readonly EtapCleanupCommand[] = [
	"ETAPFIX",
	"ETAPTEXT",
	"ETAPBLOCKS",
	"ETAPLAYERFIX",
	"ETAPOVERLAP",
	"ETAPIMPORT",
];

export const CAD_SYNC_MAX_RETRIES = 2;
export const CAD_SYNC_RETRY_BASE_DELAY_MS = 250;
export const CAD_DIAGNOSTIC_HISTORY_MAX = 30;
export const TERMINAL_CAD_BACKCHECK_REQUIRED = parseEnvBoolean(
	import.meta.env.VITE_TERMINAL_CAD_BACKCHECK_REQUIRED,
	true,
);
export const TERMINAL_CAD_BACKCHECK_CLEARANCE = Math.max(
	0,
	Math.min(
		200,
		Number(
			parseEnvNumber(import.meta.env.VITE_TERMINAL_CAD_BACKCHECK_CLEARANCE, 18),
		) || 18,
	),
);

export function makeCadSessionId(): string {
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

export function makeRouteId(): string {
	return `troute_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatLength(length: number): string {
	return `${Math.round(length)} px`;
}

export function delayMs(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function makeDiagnosticId(): string {
	return `cad-diag-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function resolveCadProviderPath(meta?: {
	providerPath?: string;
	provider_path?: string;
	providerConfigured?: string;
	provider_configured?: string;
	source?: string;
}): string {
	const configured =
		typeof meta?.providerConfigured === "string"
			? meta.providerConfigured
			: typeof meta?.provider_configured === "string"
				? meta.provider_configured
				: "";
	const provider =
		typeof meta?.providerPath === "string"
			? meta.providerPath
			: typeof meta?.provider_path === "string"
				? meta.provider_path
				: "";
	if (provider) return provider;
	if (configured) return configured;
	if (meta?.source === "dotnet") return "dotnet";
	if (meta?.source === "autocad") return "com";
	return "unknown";
}

export function backcheckStatusTone(
	status: TerminalRouteRecord["cadBackcheckStatus"],
): "default" | "success" | "warning" | "danger" {
	if (status === "pass") return "success";
	if (status === "warn" || status === "overridden") return "warning";
	if (status === "fail" || status === "error") return "danger";
	return "default";
}

export function backcheckStatusLabel(
	status: TerminalRouteRecord["cadBackcheckStatus"],
): string {
	if (status === "pass") return "Backcheck pass";
	if (status === "warn") return "Backcheck warn";
	if (status === "fail") return "Backcheck fail";
	if (status === "error") return "Backcheck error";
	if (status === "overridden") return "Backcheck overridden";
	return "Backcheck pending";
}

export function cadLayerForRoute(route: TerminalRouteRecord): string {
	if (route.routeType === "jumper") {
		return "SUITE_WIRE_JUMPER";
	}
	const colorCode =
		String(route.color.code || "")
			.trim()
			.toUpperCase() || "WIRE";
	return `SUITE_WIRE_${route.cableType}_${colorCode}`;
}

export function createConduitTerminalViewModel(args: {
	scanData: TerminalScanData | null;
	routeType: "conductor" | "jumper";
	cableType: CableSystemType;
	wireFunction: string;
	routes: TerminalRouteRecord[];
	selectedRouteId: string | null;
	fromTerminalId: string | null;
	hoverTerminalId: string | null;
	cadStatus: TerminalCadRuntimeStatus | null;
	preflightChecking: boolean;
}): {
	activeColor: typeof JUMPER_COLOR | (typeof WIRE_COLORS)[CableSystemType][string];
	activeFromTerminal: TerminalLayoutResult["terminals"][number] | null;
	activeHoverTerminal: TerminalLayoutResult["terminals"][number] | null;
	availableWireFunctions: string[];
	cadBackcheckGateLabel: string;
	cadPreflightLabel: string;
	cadPreflightReady: boolean;
	cadProviderConfigured: string;
	layout: TerminalLayoutResult;
	panelRows: Array<{
		panelId: string;
		color: string;
		name: string;
		stripCount: number;
	}>;
	routeRows: Array<{
		id: string;
		ref: string;
		from: string;
		to: string;
		function: string;
		colorCode: string;
		sync: string;
		length: number;
	}>;
	routeStats: {
		total: number;
		totalLength: number;
		warnings: number;
		pending: number;
		failed: number;
		synced: number;
		backcheckPass: number;
		backcheckFail: number;
		backcheckWarn: number;
		backcheckOverridden: number;
		backcheckPending: number;
	};
	selectedRoute: TerminalRouteRecord | null;
	stripById: Map<string, TerminalLayoutResult["strips"][number]>;
	terminalById: Map<string, TerminalLayoutResult["terminals"][number]>;
} {
	const {
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
	} = args;

	const availableWireFunctions = Object.keys(WIRE_COLORS[cableType]);
	const activeColor =
		routeType === "jumper"
			? JUMPER_COLOR
			: (WIRE_COLORS[cableType][wireFunction] ??
				WIRE_COLORS[cableType][DEFAULT_WIRE_FUNCTIONS[cableType]]);
	const layout = scanData ? buildTerminalLayout(scanData) : EMPTY_LAYOUT;
	const terminalById = new Map(
		layout.terminals.map((terminal) => [terminal.id, terminal]),
	);
	const stripById = new Map(layout.strips.map((strip) => [strip.stripId, strip]));
	const activeFromTerminal = fromTerminalId
		? (terminalById.get(fromTerminalId) ?? null)
		: null;
	const activeHoverTerminal = hoverTerminalId
		? (terminalById.get(hoverTerminalId) ?? null)
		: null;
	const selectedRoute =
		routes.find((route) => route.id === selectedRouteId) ?? null;
	const routeStats = routes.reduce(
		(stats, route) => {
			stats.total += 1;
			stats.totalLength += route.length;
			if (route.bendDegrees > 360) stats.warnings += 1;
			if (route.cadSyncStatus === "pending") stats.pending += 1;
			if (route.cadSyncStatus === "failed") stats.failed += 1;
			if (route.cadSyncStatus === "synced") stats.synced += 1;
			if (route.cadBackcheckStatus === "pass") stats.backcheckPass += 1;
			if (route.cadBackcheckStatus === "fail") stats.backcheckFail += 1;
			if (route.cadBackcheckStatus === "warn") stats.backcheckWarn += 1;
			if (route.cadBackcheckStatus === "overridden") {
				stats.backcheckOverridden += 1;
			}
			if (
				!route.cadBackcheckStatus ||
				route.cadBackcheckStatus === "not_run"
			) {
				stats.backcheckPending += 1;
			}
			return stats;
		},
		{
			total: 0,
			totalLength: 0,
			warnings: 0,
			pending: 0,
			failed: 0,
			synced: 0,
			backcheckPass: 0,
			backcheckFail: 0,
			backcheckWarn: 0,
			backcheckOverridden: 0,
			backcheckPending: 0,
		},
	);
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
	const cadBackcheckGateLabel = TERMINAL_CAD_BACKCHECK_REQUIRED
		? routeStats.backcheckFail > 0
			? "Backcheck Failures Present"
			: "Backcheck Gate Active"
		: "Backcheck Gate Disabled";
	const panelRows = scanData
		? Object.entries(scanData.panels).map(([panelId, panel]) => {
				const stripCount = Object.values(panel.sides).reduce(
					(sum, side) => sum + side.strips.length,
					0,
				);
				return {
					panelId,
					color: panel.color,
					name: panel.fullName,
					stripCount,
				};
			})
		: [];
	const routeRows = routes
		.slice()
		.sort((left, right) => right.createdAt - left.createdAt)
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

	return {
		activeColor,
		activeFromTerminal,
		activeHoverTerminal,
		availableWireFunctions,
		cadBackcheckGateLabel,
		cadPreflightLabel,
		cadPreflightReady,
		cadProviderConfigured,
		layout,
		panelRows,
		routeRows,
		routeStats,
		selectedRoute,
		stripById,
		terminalById,
	};
}
