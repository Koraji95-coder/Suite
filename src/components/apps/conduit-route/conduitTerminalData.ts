import type {
	TerminalLayoutConfig,
	TerminalScanData,
} from "./conduitTerminalTypes";

export const TERMINAL_LAYOUT_CONFIG: TerminalLayoutConfig = {
	scale: 38,
	padding: 42,
	stripWidth: 20,
	terminalSpacing: 7.6,
	terminalRadius: 4,
	gridWidth: 22,
	gridHeight: 14,
};

export const MOCK_TERMINAL_SCAN: TerminalScanData = {
	drawing: { name: "SUB_NORTH_P&C_001.dwg", units: "Inches" },
	panels: {
		RP1: {
			fullName: "Relay Panel 1",
			color: "#f59e0b",
			sides: {
				L: {
					strips: [
						{
							stripId: "RP1L1",
							stripNumber: 1,
							terminalCount: 16,
							x: 2,
							y: 1,
						},
						{
							stripId: "RP1L2",
							stripNumber: 2,
							terminalCount: 12,
							x: 2,
							y: 5,
						},
						{
							stripId: "RP1L3",
							stripNumber: 3,
							terminalCount: 20,
							x: 2,
							y: 8.5,
						},
					],
				},
				R: {
					strips: [
						{
							stripId: "RP1R1",
							stripNumber: 1,
							terminalCount: 16,
							x: 6,
							y: 1,
						},
						{
							stripId: "RP1R2",
							stripNumber: 2,
							terminalCount: 12,
							x: 6,
							y: 5,
						},
					],
				},
			},
		},
		RP2: {
			fullName: "Relay Panel 2",
			color: "#3b82f6",
			sides: {
				L: {
					strips: [
						{
							stripId: "RP2L1",
							stripNumber: 1,
							terminalCount: 20,
							x: 14,
							y: 1,
						},
						{
							stripId: "RP2L2",
							stripNumber: 2,
							terminalCount: 16,
							x: 14,
							y: 5.5,
						},
					],
				},
				R: {
					strips: [
						{
							stripId: "RP2R1",
							stripNumber: 1,
							terminalCount: 14,
							x: 18,
							y: 1,
						},
						{
							stripId: "RP2R2",
							stripNumber: 2,
							terminalCount: 20,
							x: 18,
							y: 4.5,
						},
					],
				},
			},
		},
		JB1: {
			fullName: "Junction Box 1",
			color: "#22c55e",
			sides: {
				C: {
					strips: [
						{
							stripId: "JB1C1",
							stripNumber: 1,
							terminalCount: 10,
							x: 10,
							y: 10,
						},
					],
				},
			},
		},
	},
};
