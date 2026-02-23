import { useEffect, useMemo, useRef, useState } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import type { GridConductor, GridRod } from "./types";

interface PotentialContourProps {
	rods: GridRod[];
	conductors: GridConductor[];
	soilResistivity: number;
	faultCurrent: number;
}

const RESOLUTION = 80;
const CONTOUR_LEVELS = 12;

function computePotentialField(
	rods: GridRod[],
	conductors: GridConductor[],
	bounds: { minX: number; minY: number; maxX: number; maxY: number },
	soilResistivity: number,
	faultCurrent: number,
): number[][] {
	const field: number[][] = [];
	const spanX = bounds.maxX - bounds.minX;
	const spanY = bounds.maxY - bounds.minY;
	const currentPerRod = rods.length > 0 ? faultCurrent / rods.length : 0;

	for (let j = 0; j < RESOLUTION; j++) {
		const row: number[] = [];
		for (let i = 0; i < RESOLUTION; i++) {
			const px = bounds.minX + (i / (RESOLUTION - 1)) * spanX;
			const py = bounds.minY + (j / (RESOLUTION - 1)) * spanY;

			let potential = 0;

			for (const rod of rods) {
				const dist = Math.sqrt((px - rod.grid_x) ** 2 + (py - rod.grid_y) ** 2);
				const effectiveDist = Math.max(dist, 0.5);
				potential +=
					(soilResistivity * currentPerRod) / (2 * Math.PI * effectiveDist);
			}

			for (const c of conductors) {
				const dx = c.x2 - c.x1;
				const dy = c.y2 - c.y1;
				const len = Math.sqrt(dx * dx + dy * dy);
				if (len < 0.01) continue;

				const t = Math.max(
					0,
					Math.min(1, ((px - c.x1) * dx + (py - c.y1) * dy) / (len * len)),
				);
				const closestX = c.x1 + t * dx;
				const closestY = c.y1 + t * dy;
				const dist = Math.max(
					Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2),
					0.3,
				);
				potential +=
					(soilResistivity * currentPerRod * 0.1) / (2 * Math.PI * dist);
			}

			row.push(potential);
		}
		field.push(row);
	}

	return field;
}

function potentialToColor(value: number, min: number, max: number): string {
	const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));

	if (t < 0.25) {
		const s = t / 0.25;
		return `rgb(${Math.round(34 + s * (59 - 34))}, ${Math.round(139 + s * (130 - 139))}, ${Math.round(34 + s * (246 - 34))})`;
	} else if (t < 0.5) {
		const s = (t - 0.25) / 0.25;
		return `rgb(${Math.round(59 + s * (234 - 59))}, ${Math.round(130 + s * (179 - 130))}, ${Math.round(246 + s * (8 - 246))})`;
	} else if (t < 0.75) {
		const s = (t - 0.5) / 0.25;
		return `rgb(${Math.round(234 + s * (245 - 234))}, ${Math.round(179 + s * (158 - 179))}, ${Math.round(8 + s * (11 - 8))})`;
	} else {
		const s = (t - 0.75) / 0.25;
		return `rgb(${Math.round(245 + s * (239 - 245))}, ${Math.round(158 + s * (68 - 158))}, ${Math.round(11 + s * (68 - 11))})`;
	}
}

export function PotentialContour({
	rods,
	conductors,
	soilResistivity,
	faultCurrent,
}: PotentialContourProps) {
	const { palette } = useTheme();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [hoveredValue, setHoveredValue] = useState<{
		x: number;
		y: number;
		v: number;
	} | null>(null);

	const bounds = useMemo(() => {
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const r of rods) {
			minX = Math.min(minX, r.grid_x);
			minY = Math.min(minY, r.grid_y);
			maxX = Math.max(maxX, r.grid_x);
			maxY = Math.max(maxY, r.grid_y);
		}
		for (const c of conductors) {
			minX = Math.min(minX, c.x1, c.x2);
			minY = Math.min(minY, c.y1, c.y2);
			maxX = Math.max(maxX, c.x1, c.x2);
			maxY = Math.max(maxY, c.y1, c.y2);
		}
		if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
		const pad = Math.max(maxX - minX, maxY - minY) * 0.3;
		return {
			minX: minX - pad,
			minY: minY - pad,
			maxX: maxX + pad,
			maxY: maxY + pad,
		};
	}, [rods, conductors]);

	const field = useMemo(
		() =>
			computePotentialField(
				rods,
				conductors,
				bounds,
				soilResistivity,
				faultCurrent,
			),
		[rods, conductors, bounds, soilResistivity, faultCurrent],
	);

	const { minVal, maxVal } = useMemo(() => {
		let minVal = Infinity,
			maxVal = -Infinity;
		for (const row of field) {
			for (const v of row) {
				if (v < minVal) minVal = v;
				if (v > maxVal) maxVal = v;
			}
		}
		return { minVal, maxVal };
	}, [field]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container || field.length === 0) return;

		const w = container.clientWidth;
		const h = container.clientHeight;
		canvas.width = w;
		canvas.height = h;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const cellW = w / RESOLUTION;
		const cellH = h / RESOLUTION;

		for (let j = 0; j < RESOLUTION; j++) {
			for (let i = 0; i < RESOLUTION; i++) {
				const color = potentialToColor(field[j][i], minVal, maxVal);
				ctx.fillStyle = color;
				ctx.globalAlpha = 0.65;
				ctx.fillRect(i * cellW, j * cellH, cellW + 1, cellH + 1);
			}
		}

		ctx.globalAlpha = 1;

		const spanX = bounds.maxX - bounds.minX;
		const spanY = bounds.maxY - bounds.minY;

		ctx.strokeStyle = "#f59e0b";
		ctx.lineWidth = 1.5;
		for (const c of conductors) {
			const x1 = ((c.x1 - bounds.minX) / spanX) * w;
			const y1 = ((c.y1 - bounds.minY) / spanY) * h;
			const x2 = ((c.x2 - bounds.minX) / spanX) * w;
			const y2 = ((c.y2 - bounds.minY) / spanY) * h;
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.stroke();
		}

		for (const r of rods) {
			const rx = ((r.grid_x - bounds.minX) / spanX) * w;
			const ry = ((r.grid_y - bounds.minY) / spanY) * h;
			ctx.fillStyle = "#22c55e";
			ctx.beginPath();
			ctx.arc(rx, ry, 4, 0, Math.PI * 2);
			ctx.fill();
			ctx.strokeStyle = "#fff";
			ctx.lineWidth = 1;
			ctx.stroke();
		}

		const step = (maxVal - minVal) / CONTOUR_LEVELS;
		ctx.strokeStyle = "rgba(255,255,255,0.2)";
		ctx.lineWidth = 0.5;
		for (let level = 1; level < CONTOUR_LEVELS; level++) {
			const threshold = minVal + level * step;
			for (let j = 0; j < RESOLUTION - 1; j++) {
				for (let i = 0; i < RESOLUTION - 1; i++) {
					const v00 = field[j][i];
					const v10 = field[j][i + 1];
					const v01 = field[j + 1][i];
					const crossH = v00 < threshold !== v10 < threshold;
					const crossV = v00 < threshold !== v01 < threshold;
					if (crossH) {
						const t = (threshold - v00) / (v10 - v00);
						const px = (i + t) * cellW;
						const py = j * cellH;
						ctx.beginPath();
						ctx.arc(px, py, 0.8, 0, Math.PI * 2);
						ctx.stroke();
					}
					if (crossV) {
						const t = (threshold - v00) / (v01 - v00);
						const px = i * cellW;
						const py = (j + t) * cellH;
						ctx.beginPath();
						ctx.arc(px, py, 0.8, 0, Math.PI * 2);
						ctx.stroke();
					}
				}
			}
		}
	}, [field, bounds, minVal, maxVal, conductors, rods]);

	const handleMouseMove = (e: React.MouseEvent) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const rx = (e.clientX - rect.left) / rect.width;
		const ry = (e.clientY - rect.top) / rect.height;
		const i = Math.floor(rx * RESOLUTION);
		const j = Math.floor(ry * RESOLUTION);
		if (i >= 0 && i < RESOLUTION && j >= 0 && j < RESOLUTION) {
			const spanX = bounds.maxX - bounds.minX;
			const spanY = bounds.maxY - bounds.minY;
			setHoveredValue({
				x: bounds.minX + rx * spanX,
				y: bounds.minY + ry * spanY,
				v: field[j][i],
			});
		}
	};

	const hasData = rods.length > 0 || conductors.length > 0;

	if (!hasData) {
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					height: "100%",
					minHeight: 300,
					color: palette.textMuted,
					fontSize: 13,
				}}
			>
				Import data to see the potential contour
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			style={{
				position: "relative",
				width: "100%",
				height: "100%",
				minHeight: 400,
			}}
		>
			<canvas
				ref={canvasRef}
				style={{ width: "100%", height: "100%", borderRadius: 8 }}
				onMouseMove={handleMouseMove}
				onMouseLeave={() => setHoveredValue(null)}
			/>

			{hoveredValue && (
				<div
					style={{
						position: "absolute",
						top: 8,
						left: 8,
						padding: "6px 10px",
						borderRadius: 6,
						background: hexToRgba(palette.background, 0.9),
						border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
						fontSize: 10,
						color: palette.text,
						pointerEvents: "none",
						fontFamily: "monospace",
					}}
				>
					<div>
						Position: ({hoveredValue.x.toFixed(1)}, {hoveredValue.y.toFixed(1)})
					</div>
					<div>Potential: {hoveredValue.v.toFixed(2)} V</div>
				</div>
			)}

			<div
				style={{
					position: "absolute",
					bottom: 8,
					right: 8,
					display: "flex",
					flexDirection: "column",
					gap: 2,
					padding: "6px 10px",
					borderRadius: 6,
					background: hexToRgba(palette.background, 0.85),
					border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
					fontSize: 9,
					color: palette.textMuted,
					pointerEvents: "none",
				}}
			>
				<div style={{ fontWeight: 600, marginBottom: 2 }}>
					Touch/Step Potential
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
					<div
						style={{
							width: 60,
							height: 8,
							borderRadius: 2,
							background:
								"linear-gradient(90deg, #228b22, #3b82f6, #eab308, #f59e0b, #ef4444)",
						}}
					/>
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						width: 60,
					}}
				>
					<span>{minVal.toFixed(0)}V</span>
					<span>{maxVal.toFixed(0)}V</span>
				</div>
			</div>

			<div
				style={{
					position: "absolute",
					top: 8,
					right: 8,
					fontSize: 9,
					color: hexToRgba(palette.textMuted, 0.6),
					background: hexToRgba(palette.background, 0.7),
					padding: "3px 8px",
					borderRadius: 4,
					pointerEvents: "none",
				}}
			>
				Hover to inspect voltage
			</div>
		</div>
	);
}
