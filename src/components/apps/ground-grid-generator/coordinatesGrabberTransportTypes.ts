export interface CoordinatesConfig {
	mode: "polylines" | "blocks" | "layer_search";
	precision: number;
	prefix: string;
	initial_number: number;
	block_name_filter: string;
	layer_search_name: string;
	layer_search_names?: string[];
	layer_search_use_selection: boolean;
	layer_search_include_modelspace: boolean;
	layer_search_use_corners: boolean;
	ref_dwg_path: string;
	ref_layer_name: string;
	ref_scale: number;
	ref_rotation_deg: number;
	excel_path: string;
	replace_previous: boolean;
	auto_increment: boolean;
	show_segment: boolean;
	show_elevation: boolean;
	show_distance: boolean;
	show_distance_3d: boolean;
	show_bearing: boolean;
	show_azimuth: boolean;
}

export interface ExecutionResultPoint {
	id: string;
	east: number;
	north: number;
	elevation: number;
	layer: string;
}

export interface ExecutionResult {
	success: boolean;
	message: string;
	run_id?: string;
	excel_path?: string;
	points_created?: number;
	blocks_inserted?: number;
	block_errors?: string[] | null;
	duration_seconds?: number;
	error_details?: string;
	points?: ExecutionResultPoint[];
}

export interface GroundGridPlotConductor {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface GroundGridPlotPlacement {
	type: "ROD" | "TEE" | "CROSS" | "GROUND_ROD_WITH_TEST_WELL";
	grid_x: number;
	grid_y: number;
	autocad_x: number;
	autocad_y: number;
	rotation_deg: number;
}

export interface GroundGridPlotConfig {
	origin_x_feet: number;
	origin_x_inches: number;
	origin_y_feet: number;
	origin_y_inches: number;
	block_scale: number;
	layer_name: string;
	grid_max_y: number;
}

export interface GroundGridPlotRequest {
	conductors: GroundGridPlotConductor[];
	placements: GroundGridPlotPlacement[];
	config: GroundGridPlotConfig;
}

export interface GroundGridPlotResult {
	success: boolean;
	message: string;
	lines_drawn: number;
	blocks_inserted: number;
	layer_name: string;
	test_well_block_name?: string;
	error_details?: string;
}

export interface OpenExportFolderResult {
	success: boolean;
	message: string;
}

export interface BackendStatus {
	connected: boolean;
	autocad_running: boolean;
	drawing_open?: boolean;
	drawing_name?: string | null;
	error?: string | null;
	last_config?: CoordinatesConfig;
	last_execution_time?: string;
}

export interface ServiceDisconnectedEvent {
	type: "service-disconnected";
	message: string;
	timestamp: string;
}

export interface WebSocketConnectedEvent {
	type: "connected";
	backend_id: string;
	backend_version: string;
	timestamp: number;
}

export interface WebSocketStatusEvent {
	type: "status";
	backend_id: string;
	backend_version: string;
	connected: boolean;
	autocad_running: boolean;
	drawing_open: boolean;
	drawing_name?: string | null;
	error?: string | null;
	checks?: Record<string, boolean>;
	timestamp: number;
}

export interface WebSocketProgressEvent {
	type: "progress";
	run_id?: string | null;
	stage: string;
	progress: number;
	current_item?: string;
	message?: string;
}

export interface WebSocketCompleteEvent {
	type: "complete";
	run_id?: string | null;
	message?: string;
	result?: ExecutionResult;
	timestamp?: number;
}

export interface WebSocketErrorEvent {
	type: "error";
	run_id?: string | null;
	message: string;
	code?: string;
	error_details?: string;
	timestamp?: number;
}

export type WebSocketMessage =
	| ServiceDisconnectedEvent
	| WebSocketConnectedEvent
	| WebSocketStatusEvent
	| WebSocketProgressEvent
	| WebSocketCompleteEvent
	| WebSocketErrorEvent;

export interface WebSocketTicketResponse {
	ok?: boolean;
	ticket?: string;
	expires_at?: number;
	ttl_seconds?: number;
	error?: string;
	message?: string;
	code?: string;
}

