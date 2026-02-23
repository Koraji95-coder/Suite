import { Link, Trash2, X } from "lucide-react";
import React from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import type { GraphNode } from "./types";
import { GROUP_COLORS } from "./types";

interface GraphInspectorProps {
	selectedNode: GraphNode | null;
	onClose: () => void;
	onDeleteMemory: (id: string) => void;
}

export function GraphInspector({
	selectedNode,
	onClose,
	onDeleteMemory,
}: GraphInspectorProps) {
	const { palette } = useTheme();

	if (!selectedNode) return null;

	const isMemory = selectedNode.source === "memory";
	const groupColor = GROUP_COLORS[selectedNode.group] ?? palette.primary;

	const panelStyle: React.CSSProperties = {
		width: 300,
		background: hexToRgba(palette.surface, 0.95),
		borderLeft: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
		padding: 16,
		display: "flex",
		flexDirection: "column",
		gap: 12,
		overflowY: "auto",
		color: palette.text,
		fontSize: 13,
	};

	const badgeStyle: React.CSSProperties = {
		display: "inline-block",
		padding: "2px 10px",
		borderRadius: 12,
		background: hexToRgba(groupColor, 0.2),
		color: groupColor,
		fontSize: 11,
		fontWeight: 600,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	};

	return (
		<div style={panelStyle}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<span style={badgeStyle}>{selectedNode.group}</span>
				<button
					onClick={onClose}
					style={{
						background: "none",
						border: "none",
						cursor: "pointer",
						color: palette.textMuted,
						padding: 4,
					}}
				>
					<X size={16} />
				</button>
			</div>

			<h3
				style={{
					margin: 0,
					fontSize: 16,
					fontWeight: 600,
					color: palette.text,
				}}
			>
				{selectedNode.label}
			</h3>

			<div
				style={{
					fontSize: 11,
					color: palette.textMuted,
					textTransform: "uppercase",
					letterSpacing: 0.5,
				}}
			>
				{selectedNode.source} node
			</div>

			{!isMemory && !!selectedNode.data?.description && (
				<p style={{ margin: 0, color: palette.textMuted, lineHeight: 1.5 }}>
					{String(selectedNode.data.description)}
				</p>
			)}

			{!isMemory && !!selectedNode.data?.sub && (
				<div style={{ color: palette.textMuted, fontStyle: "italic" }}>
					{String(selectedNode.data.sub)}
				</div>
			)}

			{isMemory && !!selectedNode.data?.content && (
				<div
					style={{
						padding: 10,
						borderRadius: 8,
						background: hexToRgba(palette.background, 0.6),
						border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
						lineHeight: 1.5,
					}}
				>
					{String(selectedNode.data.content)}
				</div>
			)}

			{isMemory && typeof selectedNode.data?.strength === "number" && (
				<div>
					<div
						style={{ fontSize: 11, color: palette.textMuted, marginBottom: 4 }}
					>
						Strength: {String(selectedNode.data.strength)}%
					</div>
					<div
						style={{
							height: 6,
							borderRadius: 3,
							background: hexToRgba(palette.textMuted, 0.15),
							overflow: "hidden",
						}}
					>
						<div
							style={{
								width: `${String(selectedNode.data.strength)}%`,
								height: "100%",
								borderRadius: 3,
								background: `linear-gradient(90deg, ${groupColor}, ${hexToRgba(groupColor, 0.5)})`,
							}}
						/>
					</div>
				</div>
			)}

			{Array.isArray(selectedNode.data?.connections) &&
				(selectedNode.data!.connections as string[]).length > 0 && (
					<div>
						<div
							style={{
								fontSize: 11,
								color: palette.textMuted,
								marginBottom: 4,
								display: "flex",
								alignItems: "center",
								gap: 4,
							}}
						>
							<Link size={12} />
							Connections
						</div>
						<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
							{(selectedNode.data!.connections as string[]).map((c) => (
								<span
									key={c}
									style={{
										padding: "2px 8px",
										borderRadius: 4,
										background: hexToRgba(palette.surfaceLight, 0.8),
										fontSize: 11,
										color: palette.textMuted,
									}}
								>
									{c.slice(0, 12)}
								</span>
							))}
						</div>
					</div>
				)}

			{isMemory && (
				<button
					onClick={() => onDeleteMemory(selectedNode.id)}
					style={{
						marginTop: "auto",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 6,
						padding: "8px 0",
						borderRadius: 6,
						border: `1px solid ${hexToRgba("#ef4444", 0.3)}`,
						background: hexToRgba("#ef4444", 0.1),
						color: "#ef4444",
						cursor: "pointer",
						fontSize: 13,
						fontWeight: 500,
					}}
				>
					<Trash2 size={14} />
					Delete Memory
				</button>
			)}
		</div>
	);
}
