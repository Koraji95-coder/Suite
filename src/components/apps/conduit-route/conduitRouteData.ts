import type {
	CableSystemType,
	ConduitRouteTab,
	EquipmentNode,
	Obstacle,
	RoutingMode,
	SectionPreset,
	WirePalette,
} from "./conduitRouteTypes";

export const CANVAS_WIDTH = 980;
export const CANVAS_HEIGHT = 560;
export const GRID_STEP = 8;

export const ROUTING_MODES: Array<{
	id: RoutingMode;
	label: string;
	description: string;
}> = [
	{
		id: "plan_view",
		label: "Plan View",
		description: "Routes around foundations with corridor preference.",
	},
	{
		id: "cable_tag",
		label: "Cable Tag",
		description: "Places annotation-friendly phantom routes.",
	},
	{
		id: "schematic",
		label: "Schematic",
		description: "Lean routing for panel-diagram style layouts.",
	},
];

export const ROUTE_TABS: Array<{
	id: ConduitRouteTab;
	label: string;
}> = [
	{ id: "routes", label: "Route Feed" },
	{ id: "schedule", label: "Schedule" },
	{ id: "nec", label: "NEC" },
	{ id: "sections", label: "Sections" },
];

export const WIRE_COLORS: WirePalette = {
	AC: {
		"Phase A": { code: "BK", hex: "#444444", stroke: "#6b7280", aci: 7 },
		"Phase B": { code: "RD", hex: "#dc2626", stroke: "#ef4444", aci: 1 },
		"Phase C": { code: "BL", hex: "#2563eb", stroke: "#3b82f6", aci: 5 },
		Neutral: { code: "WH", hex: "#d4d4d4", stroke: "#e5e7eb", aci: 9 },
		Ground: { code: "GN", hex: "#16a34a", stroke: "#22c55e", aci: 3 },
		"Ground Alt": {
			code: "GN/YL",
			hex: "#84cc16",
			stroke: "#a3e635",
			aci: 82,
		},
	},
	DC: {
		Positive: { code: "RD", hex: "#dc2626", stroke: "#ef4444", aci: 1 },
		Negative: { code: "BK", hex: "#444444", stroke: "#6b7280", aci: 7 },
		"Pos Alt": { code: "BL", hex: "#2563eb", stroke: "#3b82f6", aci: 5 },
		"Neg Alt": { code: "WH", hex: "#d4d4d4", stroke: "#e5e7eb", aci: 9 },
		Ground: { code: "GN", hex: "#16a34a", stroke: "#22c55e", aci: 3 },
		Return: { code: "WH/BK", hex: "#9ca3af", stroke: "#9ca3af", aci: 8 },
	},
};

export const DEFAULT_WIRE_FUNCTIONS: Record<CableSystemType, string> = {
	AC: "Phase A",
	DC: "Positive",
};

export const OBSTACLES: Obstacle[] = [
	{
		id: "FNDN-1",
		type: "foundation",
		x: 120,
		y: 70,
		w: 120,
		h: 82,
		label: "XFMR-1 Foundation",
	},
	{
		id: "FNDN-2",
		type: "foundation",
		x: 360,
		y: 94,
		w: 104,
		h: 74,
		label: "BKR-1 Foundation",
	},
	{
		id: "FNDN-3",
		type: "foundation",
		x: 586,
		y: 58,
		w: 84,
		h: 66,
		label: "CT/PT Foundation",
	},
	{
		id: "FNDN-4",
		type: "foundation",
		x: 322,
		y: 296,
		w: 116,
		h: 88,
		label: "XFMR-2 Foundation",
	},
	{
		id: "FNDN-5",
		type: "foundation",
		x: 610,
		y: 258,
		w: 88,
		h: 72,
		label: "SW-1 Foundation",
	},
	{
		id: "BLDG-1",
		type: "building",
		x: 770,
		y: 386,
		w: 180,
		h: 142,
		label: "Control House",
	},
	{
		id: "PAD-1",
		type: "equipment_pad",
		x: 80,
		y: 328,
		w: 76,
		h: 54,
		label: "JB-1",
	},
	{
		id: "PAD-2",
		type: "equipment_pad",
		x: 532,
		y: 414,
		w: 72,
		h: 52,
		label: "JB-2",
	},
	{
		id: "ROAD-1",
		type: "road",
		x: 0,
		y: 510,
		w: 760,
		h: 38,
		label: "Access Road",
	},
	{
		id: "TR-1",
		type: "trench",
		x: 66,
		y: 220,
		w: 720,
		h: 18,
		label: "Trench A",
	},
	{
		id: "TR-2",
		type: "trench",
		x: 750,
		y: 220,
		w: 22,
		h: 220,
		label: "Trench Riser",
	},
	{
		id: "FENCE",
		type: "fence",
		x: 8,
		y: 8,
		w: 964,
		h: 544,
		label: "Yard Fence",
	},
];

export const EQUIPMENT_NODES: EquipmentNode[] = [
	{ id: "RP1", x: 838, y: 430, label: "RP1", color: "#f59e0b" },
	{ id: "RP2", x: 838, y: 472, label: "RP2", color: "#3b82f6" },
	{ id: "JB1", x: 118, y: 354, label: "JB-1", color: "#22c55e" },
	{ id: "JB2", x: 564, y: 438, label: "JB-2", color: "#22c55e" },
	{ id: "XFMR1", x: 176, y: 108, label: "XFMR-1", color: "#ef4444" },
	{ id: "BKR1", x: 408, y: 124, label: "BKR-1", color: "#ef4444" },
	{ id: "CTPT", x: 632, y: 88, label: "CT/PT", color: "#ef4444" },
	{ id: "SW1", x: 654, y: 286, label: "SW-1", color: "#ef4444" },
	{ id: "XFMR2", x: 380, y: 334, label: "XFMR-2", color: "#ef4444" },
];

export const SECTION_PRESETS: SectionPreset[] = [
	{
		id: "stub_up",
		label: "Stub-Up",
		title: "Conduit Stub-Up",
		description:
			"Vertical rise detail with pad penetration and seal-off annotation.",
	},
	{
		id: "duct_bank",
		label: "Duct Bank",
		title: "Duct Bank Cross-Section",
		description: "Concrete-encased conduit matrix for feeder group routing.",
	},
	{
		id: "trench",
		label: "Trench",
		title: "Cable Trench Cross-Section",
		description: "Tray stack and fill-readout across trench envelope.",
	},
	{
		id: "entry",
		label: "Entry",
		title: "Building Entry Section",
		description: "Wall penetration with seal detail and conductor callouts.",
	},
];

export const OBSTACLE_STYLE: Record<
	Obstacle["type"],
	{ fill: string; stroke: string; label: string }
> = {
	foundation: { fill: "#1a120b", stroke: "#a16207", label: "#f59e0b" },
	building: { fill: "#0d1324", stroke: "#2563eb", label: "#60a5fa" },
	equipment_pad: { fill: "#0c1710", stroke: "#16a34a", label: "#4ade80" },
	trench: { fill: "#071326", stroke: "#0ea5e9", label: "#38bdf8" },
	fence: { fill: "none", stroke: "#334155", label: "#64748b" },
	road: { fill: "#16120e", stroke: "#8b5e34", label: "#c08457" },
};

export const SECTION_METRICS = {
	stub_up: [
		{ label: "Conduits", value: "4" },
		{ label: "Entry Depth", value: "4'-0\"" },
		{ label: "Seal", value: "Type M" },
	],
	duct_bank: [
		{ label: "Matrix", value: "3x4" },
		{ label: "Encasement", value: "10'-0\"" },
		{ label: "Conduits", value: "12" },
	],
	trench: [
		{ label: "Width", value: "2'-0\"" },
		{ label: "Tray Fill", value: "60%" },
		{ label: "Status", value: "Pass" },
	],
	entry: [
		{ label: "Penetrations", value: "3" },
		{ label: "Seal", value: "Link-Seal" },
		{ label: "Wall", value: '12"' },
	],
};
