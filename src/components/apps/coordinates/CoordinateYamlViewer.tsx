import yaml from "js-yaml";
import { useMemo, useState } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { CoordinatePoint } from "./types";

interface CoordinateYamlViewerProps {
	data: CoordinatePoint[];
}

export function CoordinateYamlViewer({ data }: CoordinateYamlViewerProps) {
	const { palette } = useTheme();
	const [copied, setCopied] = useState(false);

	const yamlOutput = useMemo(() => {
		if (data.length === 0) return "";

		const doc = {
			ground_grid_coordinates: {
				generated: new Date().toISOString(),
				total_points: data.length,
				columns: [
					"Point ID",
					"East (X)",
					"North (Y)",
					"Elevation (Z)",
					"Layer",
				],
				points: data.map((p) => ({
					id: p.id,
					east: p.east,
					north: p.north,
					elevation: p.elevation,
					layer: p.layer,
				})),
			},
		};

		return yaml.dump(doc, {
			indent: 2,
			lineWidth: 120,
			noRefs: true,
			sortKeys: false,
		});
	}, [data]);

	const handleCopy = () => {
		if (!yamlOutput) return;
		navigator.clipboard.writeText(yamlOutput);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const colorizeYaml = (text: string): React.ReactNode[] => {
		return text.split("\n").map((line, i) => {
			let content: React.ReactNode = line;

			if (line.match(/^\s*#/)) {
				content = (
					<span style={{ color: hexToRgba(palette.textMuted, 0.9) }}>
						{line}
					</span>
				);
			} else if (line.match(/^\s*-\s/)) {
				const dashIdx = line.indexOf("-");
				content = (
					<>
						<span>{line.slice(0, dashIdx)}</span>
						<span style={{ color: palette.primary }}>-</span>
						<span>{line.slice(dashIdx + 1)}</span>
					</>
				);
			} else if (line.includes(":")) {
				const colonIdx = line.indexOf(":");
				const key = line.slice(0, colonIdx);
				const value = line.slice(colonIdx + 1);

				const numMatch = value.trim().match(/^-?\d+\.?\d*$/);
				const strMatch = value.trim().match(/^'.*'$|^".*"$/);

				let valueNode: React.ReactNode = (
					<span style={{ color: palette.text }}>{value}</span>
				);
				if (numMatch) {
					valueNode = <span style={{ color: palette.primary }}>{value}</span>;
				} else if (strMatch) {
					valueNode = (
						<span style={{ color: hexToRgba(palette.text, 0.85) }}>
							{value}
						</span>
					);
				}

				content = (
					<>
						<span style={{ color: palette.primary }}>{key}</span>
						<span style={{ color: palette.textMuted }}>:</span>
						{valueNode}
					</>
				);
			}

			return (
				<div
					key={i}
					style={{
						padding: "1px 0",
						minHeight: "18px",
						display: "flex",
						alignItems: "center",
					}}
				>
					<span
						style={{
							display: "inline-block",
							width: "32px",
							textAlign: "right",
							marginRight: "12px",
							color: hexToRgba(palette.textMuted, 0.4),
							fontSize: "10px",
							userSelect: "none",
							flexShrink: 0,
						}}
					>
						{i + 1}
					</span>
					<span style={{ whiteSpace: "pre" }}>{content}</span>
				</div>
			);
		});
	};

	if (data.length === 0) {
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					height: "200px",
					borderRadius: "6px",
					border: `1px dashed ${hexToRgba(palette.primary, 0.2)}`,
					color: palette.textMuted,
					fontSize: "12px",
				}}
			>
				No coordinate data. Run a search to generate YAML output.
			</div>
		);
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
					<span
						style={{
							padding: "2px 8px",
							borderRadius: "3px",
							background: hexToRgba(palette.primary, 0.12),
							color: palette.primary,
							fontSize: "10px",
							fontWeight: "600",
							letterSpacing: "0.5px",
							textTransform: "uppercase",
						}}
					>
						YAML
					</span>
					<span style={{ fontSize: "11px", color: palette.textMuted }}>
						{data.length} point{data.length !== 1 ? "s" : ""}
					</span>
				</div>
				<button
					onClick={handleCopy}
					style={{
						padding: "4px 10px",
						borderRadius: "4px",
						border: `1px solid ${hexToRgba(palette.primary, 0.25)}`,
						background: copied
							? hexToRgba(palette.primary, 0.18)
							: hexToRgba(palette.primary, 0.08),
						color: palette.primary,
						fontSize: "11px",
						fontWeight: "500",
						cursor: "pointer",
						transition: "all 0.2s",
					}}
				>
					{copied ? "Copied" : "Copy"}
				</button>
			</div>

			<div
				style={{
					borderRadius: "6px",
					overflow: "auto",
					border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
					background: hexToRgba(palette.background, 0.6),
					padding: "12px 8px",
					fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
					fontSize: "12px",
					lineHeight: "1.5",
					maxHeight: "500px",
					color: palette.text,
				}}
			>
				{colorizeYaml(yamlOutput)}
			</div>
		</div>
	);
}
