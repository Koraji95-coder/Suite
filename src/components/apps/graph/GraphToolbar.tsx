import { Box, Layers, Plus, Search } from "lucide-react";
import React from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import type { SourceFilter, ViewMode } from "./types";

interface GraphToolbarProps {
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
	sourceFilter: SourceFilter;
	onSourceFilterChange: (filter: SourceFilter) => void;
	searchQuery: string;
	onSearchChange: (query: string) => void;
	onAddMemory: () => void;
}

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
	{ value: "architecture", label: "Architecture" },
	{ value: "memory", label: "Memory" },
	{ value: "both", label: "Both" },
];

export function GraphToolbar({
	viewMode,
	onViewModeChange,
	sourceFilter,
	onSourceFilterChange,
	searchQuery,
	onSearchChange,
	onAddMemory,
}: GraphToolbarProps) {
	const { palette } = useTheme();

	const btnBase: React.CSSProperties = {
		padding: "6px 14px",
		borderRadius: 6,
		border: `1px solid ${hexToRgba(palette.primary, 0.25)}`,
		background: hexToRgba(palette.surface, 0.6),
		color: palette.textMuted,
		cursor: "pointer",
		fontSize: 13,
		fontWeight: 500,
		transition: "all 0.2s",
	};

	const btnActive: React.CSSProperties = {
		...btnBase,
		background: hexToRgba(palette.primary, 0.2),
		color: palette.primary,
		border: `1px solid ${palette.primary}`,
	};

	return (
		<div
			className="flex flex-wrap items-center gap-2 px-3 py-2"
			style={{
				background: hexToRgba(palette.surface, 0.85),
				borderBottom: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
			}}
		>
			<div className="flex flex-wrap gap-1">
				{SOURCE_OPTIONS.map((opt) => (
					<button
						key={opt.value}
						onClick={() => onSourceFilterChange(opt.value)}
						style={sourceFilter === opt.value ? btnActive : btnBase}
					>
						{opt.label}
					</button>
				))}
			</div>

			<div
				className="hidden h-6 w-px md:block"
				style={{
					background: hexToRgba(palette.textMuted, 0.2),
				}}
			/>

			<div className="flex flex-wrap gap-1">
				<button
					onClick={() => onViewModeChange("3d")}
					style={viewMode === "3d" ? btnActive : btnBase}
				>
					<Box size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
					3D
				</button>
				<button
					onClick={() => onViewModeChange("2d")}
					style={viewMode === "2d" ? btnActive : btnBase}
				>
					<Layers size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
					2D
				</button>
			</div>

			<div
				className="order-last flex min-w-[220px] flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5 md:order-none"
				style={{
					borderColor: hexToRgba(palette.primary, 0.2),
					background: hexToRgba(palette.background, 0.8),
				}}
			>
				<Search
					size={14}
					style={{
						color: palette.textMuted,
						flexShrink: 0,
					}}
				/>
				<input
					type="text"
					placeholder="Search nodes..."
					value={searchQuery}
					onChange={(e) => onSearchChange(e.target.value)}
					style={{
						flex: 1,
						minWidth: 0,
						padding: "0",
						border: "none",
						background: "transparent",
						color: palette.text,
						fontSize: 13,
						outline: "none",
					}}
				/>
			</div>

			<button
				onClick={onAddMemory}
				className="inline-flex items-center"
				style={btnBase}
				title="Add Memory"
			>
				<Plus size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
				Memory
			</button>
		</div>
	);
}
