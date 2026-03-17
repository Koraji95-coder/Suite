export type RoutingMode = "plan_view" | "cable_tag" | "schematic";

export type ConduitRouteTab = "routes" | "schedule" | "nec" | "sections";

export type CableSystemType = "AC" | "DC";

export type ObstacleType =
	| "foundation"
	| "building"
	| "equipment_pad"
	| "trench"
	| "fence"
	| "road";

export interface ObstacleLayerRule {
	layerName: string;
	obstacleType: ObstacleType;
}

export interface Point2D {
	x: number;
	y: number;
}

export interface Obstacle {
	id: string;
	type: ObstacleType;
	x: number;
	y: number;
	w: number;
	h: number;
	label: string;
}

export interface EquipmentNode {
	id: string;
	label: string;
	x: number;
	y: number;
	color: string;
}

export interface WireColorProfile {
	code: string;
	hex: string;
	stroke: string;
	aci: number;
}

export type WirePalette = Record<
	CableSystemType,
	Record<string, WireColorProfile>
>;

export interface RouteTag {
	text: string;
	position: Point2D;
	angleDeg: number;
}

export type ConduitObstacleSource = "client" | "autocad";

export interface ConduitObstacleScanOptions {
	selectionOnly?: boolean;
	includeModelspace?: boolean;
	maxEntities?: number;
	layerNames?: string[];
	layerTypeOverrides?: Record<string, ObstacleType>;
	layerPreset?: string;
}

export interface ConduitObstacleViewport {
	canvasWidth: number;
	canvasHeight: number;
	padding: number;
	scale: number;
	worldMinX: number;
	worldMinY: number;
	worldMaxX: number;
	worldMaxY: number;
}

export interface ConduitRouteComputeRequest {
	start: Point2D;
	end: Point2D;
	mode: RoutingMode;
	clearance: number;
	obstacles?: Obstacle[];
	obstacleSource?: ConduitObstacleSource;
	obstacleScan?: ConduitObstacleScanOptions;
	canvasWidth?: number;
	canvasHeight?: number;
	gridStep?: number;
	tagText?: string;
}

export interface ConduitRouteComputeData {
	path: Point2D[];
	length: number;
	bendCount: number;
	bendDegrees: number;
	tag: RouteTag | null;
	resolvedObstacles?: Obstacle[];
	obstacleViewport?: ConduitObstacleViewport;
}

export interface ConduitRouteComputeMeta {
	computeMs?: number;
	requestMs?: number;
	obstacleScanMs?: number;
	obstacleSource?: ConduitObstacleSource;
	resolvedObstacleCount?: number;
	obstacleScan?: Record<string, unknown>;
	iterations?: number;
	visitedNodes?: number;
	fallbackUsed?: boolean;
	routeValid?: boolean;
	gridCols?: number;
	gridRows?: number;
	gridStep?: number;
	obstacleCount?: number;
	mode?: RoutingMode;
	clearance?: number;
	source?: string;
}

export interface ConduitRouteComputeResponse {
	success: boolean;
	code?: string;
	message?: string;
	data?: ConduitRouteComputeData;
	meta?: ConduitRouteComputeMeta;
	warnings?: string[];
}

export interface ConduitObstacleScanRequest {
	selectionOnly?: boolean;
	includeModelspace?: boolean;
	maxEntities?: number;
	canvasWidth?: number;
	canvasHeight?: number;
	layerNames?: string[];
	layerTypeOverrides?: Record<string, ObstacleType>;
	layerPreset?: string;
}

export interface ConduitObstacleScanMeta {
	scanMs?: number;
	source?: string;
	scannedEntities?: number;
	scannedGeometryEntities?: number;
	matchedLayerEntities?: number;
	dedupedEntities?: number;
	totalObstacles?: number;
}

export interface ConduitObstacleScanData {
	drawing?: {
		name?: string;
		units?: string;
	};
	obstacles: Obstacle[];
	viewport?: ConduitObstacleViewport;
}

export interface ConduitObstacleScanResponse {
	success: boolean;
	code?: string;
	message?: string;
	data?: ConduitObstacleScanData;
	meta?: ConduitObstacleScanMeta;
	warnings?: string[];
}

export interface ConduitRouteBackcheckIssue {
	code: string;
	severity: "pass" | "warn" | "fail";
	message: string;
	meta?: Record<string, unknown>;
}

export interface ConduitRouteBackcheckFinding {
	routeId: string;
	ref: string;
	mode: RoutingMode | string;
	status: "pass" | "warn" | "fail";
	issues: ConduitRouteBackcheckIssue[];
	suggestions: string[];
	stats: {
		length: number;
		bend_count: number;
		bend_degrees: number;
		point_count: number;
		segment_count: number;
		diagonal_segment_count: number;
		collision_count: number;
	};
}

export interface ConduitRouteBackcheckRequest {
	routes: Array<{
		id: string;
		ref?: string;
		mode?: RoutingMode;
		path: Point2D[];
	}>;
	obstacles?: Obstacle[];
	obstacleSource?: ConduitObstacleSource;
	clearance?: number;
}

export interface ConduitRouteBackcheckResponse {
	success: boolean;
	code?: string;
	message?: string;
	requestId?: string;
	source?: string;
	summary?: {
		total_routes: number;
		pass_count: number;
		warn_count: number;
		fail_count: number;
	};
	findings?: ConduitRouteBackcheckFinding[];
	warnings?: string[];
	meta?: Record<string, unknown>;
}

export interface ConduitRouteRecord {
	id: string;
	ref: string;
	mode: RoutingMode;
	cableType: CableSystemType;
	wireFunction: string;
	color: WireColorProfile;
	start: Point2D;
	end: Point2D;
	path: Point2D[];
	length: number;
	bendCount: number;
	bendDegrees: number;
	tag: RouteTag | null;
	createdAt: number;
}

export interface NecConductorInput {
	gauge: string;
	count: number;
}

export interface NecResult {
	totalConductors: number;
	totalConductorArea: number;
	conduitArea: number;
	fillPercent: number;
	fillLimitPercent: number;
	fillPass: boolean;
	deratingFactor: number;
	tempCorrectionFactor: number;
	combinedFactor: number;
}

export interface SectionPreset {
	id: "stub_up" | "duct_bank" | "trench" | "entry";
	label: string;
	title: string;
	description: string;
}
