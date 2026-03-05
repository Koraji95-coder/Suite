import type {
	CableSystemType,
	Point2D,
	WireColorProfile,
} from "./conduitRouteTypes";

export interface TerminalDrawingMeta {
	name: string;
	units: string;
}

export interface TerminalStripDefinition {
	stripId: string;
	stripNumber: number;
	terminalCount: number;
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

export interface TerminalScanData {
	drawing: TerminalDrawingMeta;
	panels: Record<string, TerminalPanelDefinition>;
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

export interface TerminalStripLayout extends TerminalStripDefinition {
	panelId: string;
	panelFullName: string;
	panelColor: string;
	side: string;
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
	strips: TerminalStripLayout[];
	terminals: TerminalNode[];
}

export interface TerminalRouteRecord {
	id: string;
	ref: string;
	cableType: CableSystemType;
	wireFunction: string;
	color: WireColorProfile;
	fromTerminalId: string;
	toTerminalId: string;
	fromLabel: string;
	toLabel: string;
	path: Point2D[];
	length: number;
	bendCount: number;
	bendDegrees: number;
	createdAt: number;
}

export interface TerminalScanRequest {
	selectionOnly?: boolean;
	includeModelspace?: boolean;
	maxEntities?: number;
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
}

export interface TerminalScanResponse {
	success: boolean;
	code?: string;
	message?: string;
	data?: TerminalScanData;
	meta?: TerminalScanMeta;
	warnings?: string[];
}
