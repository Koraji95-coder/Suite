import type {
	CableSystemType,
	Point2D,
	WireColorProfile,
} from "./conduitRouteTypes";

export interface TerminalGeometryPoint {
	x: number;
	y: number;
}

export interface TerminalGeometryPrimitive {
	kind: "line" | "polyline";
	points: TerminalGeometryPoint[];
	closed?: boolean;
}

export interface TerminalDrawingMeta {
	name: string;
	units: string;
}

export interface TerminalStripDefinition {
	stripId: string;
	stripNumber: number;
	terminalCount: number;
	terminalLabels?: string[];
	geometry?: TerminalGeometryPrimitive[];
	x: number;
	y: number;
}

export interface TerminalPanelSide {
	strips: TerminalStripDefinition[];
}

export interface TerminalPanelDefinition {
	fullName: string;
	color: string;
	sides: Record<string, TerminalPanelSide>;
}

export interface TerminalJumperDefinition {
	jumperId: string;
	panelId: string;
	fromStripId: string;
	fromTerminal: number;
	toStripId: string;
	toTerminal: number;
	sourceBlockName?: string;
	resolution?: "attribute" | "position";
	x?: number;
	y?: number;
}

export interface TerminalScanData {
	drawing: TerminalDrawingMeta;
	panels: Record<string, TerminalPanelDefinition>;
	jumpers?: TerminalJumperDefinition[];
}

export interface TerminalLayoutConfig {
	scale: number;
	padding: number;
	stripWidth: number;
	terminalSpacing: number;
	terminalRadius: number;
	gridWidth: number;
	gridHeight: number;
}

export interface TerminalCanvasTransform {
	worldMinX: number;
	worldMaxX: number;
	worldMinY: number;
	worldMaxY: number;
	padding: number;
	usableWidth: number;
	usableHeight: number;
	orientation: "native" | "rotated_cw_90";
	sourceWorldMinX: number;
	sourceWorldMaxX: number;
	sourceWorldMinY: number;
	sourceWorldMaxY: number;
	rotationCenterX: number;
	rotationCenterY: number;
}

export interface TerminalStripLayout extends TerminalStripDefinition {
	panelId: string;
	panelFullName: string;
	panelColor: string;
	side: string;
	geometryPx?: TerminalGeometryPrimitive[];
	terminalRowCentersY?: number[];
	terminalSideColumnsX?: {
		L?: number;
		R?: number;
		C?: number;
	};
	xLabel: number;
	yLabel: number;
	px: number;
	py: number;
	width: number;
	height: number;
}

export interface TerminalNode {
	id: string;
	stripId: string;
	panelId: string;
	panelColor: string;
	side: string;
	termId: string;
	index: number;
	label: string;
	x: number;
	y: number;
}

export interface TerminalLayoutResult {
	canvasWidth: number;
	canvasHeight: number;
	transform: TerminalCanvasTransform;
	orientation: "native" | "rotated_cw_90";
	strips: TerminalStripLayout[];
	terminals: TerminalNode[];
}

export interface TerminalRouteRecord {
	id: string;
	ref: string;
	routeType: "conductor" | "jumper";
	cableType: CableSystemType;
	wireFunction: string;
	color: WireColorProfile;
	fromTerminalId: string;
	toTerminalId: string;
	fromLabel: string;
	toLabel: string;
	path: Point2D[];
	cadPath?: Point2D[];
	length: number;
	bendCount: number;
	bendDegrees: number;
	createdAt: number;
	cadSyncStatus?: "local" | "pending" | "synced" | "failed";
	cadSyncAttempts?: number;
	cadLastError?: string;
	cadEntityHandles?: string[];
	cadSyncedAt?: number;
	cadLastCode?: string;
	cadLastMessage?: string;
	cadWarnings?: string[];
	cadRequestId?: string;
	cadBridgeRequestId?: string;
	cadProviderPath?: string;
	cadLastOperation?: "upsert" | "delete" | "reset";
}

export interface TerminalScanProfile {
	panelIdKeys?: string[];
	panelNameKeys?: string[];
	sideKeys?: string[];
	stripIdKeys?: string[];
	stripNumberKeys?: string[];
	terminalCountKeys?: string[];
	terminalTagKeys?: string[];
	terminalNameTokens?: string[];
	blockNameAllowList?: string[];
	requireStripId?: boolean;
	requireTerminalCount?: boolean;
	requireSide?: boolean;
	defaultPanelPrefix?: string;
	defaultTerminalCount?: number;
}

export interface TerminalScanRequest {
	selectionOnly?: boolean;
	includeModelspace?: boolean;
	maxEntities?: number;
	terminalProfile?: TerminalScanProfile;
}

export interface TerminalScanMeta {
	source?: string;
	scanMs?: number;
	scannedEntities?: number;
	scannedBlockReferences?: number;
	skippedNonTerminalBlocks?: number;
	selectionOnly?: boolean;
	includeModelspace?: boolean;
	totalPanels?: number;
	totalStrips?: number;
	totalTerminals?: number;
	totalJumpers?: number;
	totalLabeledTerminals?: number;
	totalGeometryPrimitives?: number;
	jumperCandidateBlocks?: number;
	skippedInvalidJumperBlocks?: number;
	positionalJumperCandidates?: number;
	resolvedPositionalJumpers?: number;
}

export interface TerminalScanResponse {
	success: boolean;
	code?: string;
	message?: string;
	data?: TerminalScanData;
	meta?: TerminalScanMeta;
	warnings?: string[];
}

export interface TerminalLabelSyncStrip {
	stripId: string;
	terminalCount?: number;
	labels?: string[];
}

export interface TerminalLabelSyncRequest {
	selectionOnly?: boolean;
	includeModelspace?: boolean;
	maxEntities?: number;
	terminalProfile?: TerminalScanProfile;
	strips?: TerminalLabelSyncStrip[];
}

export interface TerminalLabelSyncResponse {
	success: boolean;
	code?: string;
	message?: string;
	data?: {
		drawing?: TerminalDrawingMeta;
		updatedStrips?: number;
		matchedStrips?: number;
		targetStrips?: number;
		matchedBlocks?: number;
		updatedBlocks?: number;
		updatedAttributes?: number;
		unchangedAttributes?: number;
		missingAttributes?: number;
		failedAttributes?: number;
	};
	meta?: Record<string, unknown>;
	warnings?: string[];
}

export interface TerminalCadRoutePathPoint {
	x: number;
	y: number;
}

export interface TerminalCadRouteRecord {
	ref: string;
	routeType: "conductor" | "jumper";
	wireFunction: string;
	cableType: CableSystemType;
	colorCode: string;
	colorAci?: number;
	layerName?: string;
	filletRadius?: number;
	path: TerminalCadRoutePathPoint[];
}

export interface TerminalCadDrawRequest {
	operation: "upsert" | "delete" | "reset";
	sessionId: string;
	clientRouteId?: string;
	route?: TerminalCadRouteRecord;
	defaultLayerName?: string;
	annotateRefs?: boolean;
	textHeight?: number;
}

export interface TerminalCadBinding {
	entityHandles: string[];
}

export interface TerminalCadDrawMeta {
	source?: string;
	requestId?: string;
	drawMs?: number;
	bridgeMs?: number;
	bridgeRequestId?: string;
	routeCandidates?: number;
	routesDrawn?: number;
	segmentsDrawn?: number;
	linesDrawn?: number;
	arcsDrawn?: number;
	labelsDrawn?: number;
	operation?: "upsert" | "delete" | "reset";
	sessionId?: string;
	clientRouteId?: string;
	providerPath?: "dotnet" | "com" | "com_fallback";
	providerConfigured?: string;
}

export interface TerminalCadDrawResponse {
	success: boolean;
	code?: string;
	message?: string;
	data?: {
		drawing?: TerminalDrawingMeta;
		operation?: "upsert" | "delete" | "reset";
		sessionId?: string;
		clientRouteId?: string;
		syncStatus?: "synced" | "deleted" | "reset" | "failed";
		drawnRoutes?: number;
		drawnSegments?: number;
		drawnLines?: number;
		drawnArcs?: number;
		labelsDrawn?: number;
		filletAppliedCorners?: number;
		filletSkippedCorners?: number;
		geometryVersion?: string;
		deletedEntities?: number;
		resetRoutes?: number;
		layersUsed?: string[];
		bindings?: Record<string, TerminalCadBinding>;
	};
	meta?: TerminalCadDrawMeta;
	warnings?: string[];
}

export interface TerminalCadProviderStatus {
	configured?: string;
	dotnet_enabled?: boolean;
	com_fallback?: boolean;
	dotnet_sender_ready?: boolean;
}

export interface TerminalCadRuntimeStatus {
	connected?: boolean;
	autocad_running?: boolean;
	drawing_open?: boolean;
	drawing_name?: string;
	error?: string | null;
	backend_id?: string;
	backend_version?: string;
	conduit_route_provider?: TerminalCadProviderStatus;
}

export interface TerminalCadStatusResponse {
	success: boolean;
	status?: TerminalCadRuntimeStatus;
	httpStatus?: number;
	message?: string;
}

export interface TerminalCadSyncDiagnostic {
	id: string;
	at: number;
	operation: "upsert" | "delete" | "reset" | "preflight" | "etap_cleanup";
	success: boolean;
	routeId?: string;
	routeRef?: string;
	code?: string;
	message?: string;
	warnings?: string[];
	requestId?: string;
	bridgeRequestId?: string;
	providerPath?: string;
	providerConfigured?: string;
	drawnLines?: number;
	drawnArcs?: number;
	filletAppliedCorners?: number;
	filletSkippedCorners?: number;
	geometryVersion?: string;
}

export type EtapCleanupCommand =
	| "ETAPFIX"
	| "ETAPTEXT"
	| "ETAPBLOCKS"
	| "ETAPLAYERFIX"
	| "ETAPOVERLAP"
	| "ETAPIMPORT";

export interface EtapCleanupRunRequest {
	command?: EtapCleanupCommand;
	pluginDllPath?: string;
	waitForCompletion?: boolean;
	timeoutMs?: number;
	saveDrawing?: boolean;
}

export interface EtapCleanupRunResponse {
	success: boolean;
	code?: string;
	message?: string;
	data?: {
		drawing?: TerminalDrawingMeta;
		command?: string;
		commandScript?: string;
		pluginDllPath?: string | null;
		saveDrawing?: boolean;
		waitForCompletion?: boolean;
	};
	meta?: Record<string, unknown>;
	warnings?: string[];
}
