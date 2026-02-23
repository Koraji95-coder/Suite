import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingCard } from "@/data/LoadingCard";
import { ProgressBar } from "@/data/ProgressBar";
import { hexToRgba, useTheme } from "@/lib/palette";

function usePrefersReducedMotion() {
	const [reducedMotion, setReducedMotion] = useState(false);
	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => setReducedMotion(media.matches);
		update();
		if (media.addEventListener) {
			media.addEventListener("change", update);
			return () => media.removeEventListener("change", update);
		}
		media.addListener(update);
		return () => media.removeListener(update);
	}, []);
	return reducedMotion;
}

function clamp(v: number, min: number, max: number) {
	return Math.max(min, Math.min(max, v));
}

const AMBER = "#f59e0b";
const COPPER = "#ea580c";

function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t;
}

function heatColor(v: number): string {
	const t = clamp(v, 0, 1);
	if (t < 0.2) {
		const s = t / 0.2;
		return `rgb(${Math.round(lerp(10, 20, s))}, ${Math.round(lerp(20, 60, s))}, ${Math.round(lerp(80, 140, s))})`;
	} else if (t < 0.4) {
		const s = (t - 0.2) / 0.2;
		return `rgb(${Math.round(lerp(20, 30, s))}, ${Math.round(lerp(60, 140, s))}, ${Math.round(lerp(140, 100, s))})`;
	} else if (t < 0.6) {
		const s = (t - 0.4) / 0.2;
		return `rgb(${Math.round(lerp(30, 200, s))}, ${Math.round(lerp(140, 180, s))}, ${Math.round(lerp(100, 30, s))})`;
	} else if (t < 0.8) {
		const s = (t - 0.6) / 0.2;
		return `rgb(${Math.round(lerp(200, 240, s))}, ${Math.round(lerp(180, 120, s))}, ${Math.round(lerp(30, 20, s))})`;
	} else {
		const s = (t - 0.8) / 0.2;
		return `rgb(${Math.round(lerp(240, 255, s))}, ${Math.round(lerp(120, 60, s))}, ${Math.round(lerp(20, 20, s))})`;
	}
}

export interface GroundGridSplashProps {
	onComplete: () => void;
}

export function GroundGridSplash({ onComplete }: GroundGridSplashProps) {
	const { palette } = useTheme();
	const reducedMotion = usePrefersReducedMotion();
	const [step, setStep] = useState(0);
	const [progress, setProgress] = useState(0);
	const [isExiting, setIsExiting] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const onCompleteRef = useRef(onComplete);
	onCompleteRef.current = onComplete;

	const steps = useMemo(
		() => [
			{
				id: "coords",
				label: "Parsing coordinates",
				duration: reducedMotion ? 400 : 1600,
			},
			{
				id: "topology",
				label: "Building topology",
				duration: reducedMotion ? 500 : 2000,
			},
			{
				id: "rods",
				label: "Placing ground rods",
				duration: reducedMotion ? 450 : 1800,
			},
			{
				id: "contour",
				label: "Computing potential contour",
				duration: reducedMotion ? 350 : 1400,
			},
		],
		[reducedMotion],
	);

	const total = useMemo(
		() => steps.reduce((s, x) => s + x.duration, 0),
		[steps],
	);
	const exitDurationMs = reducedMotion ? 450 : 1800;
	const isComplete = step >= steps.length;

	useEffect(() => {
		if (isExiting || step >= steps.length) return;
		const t = setTimeout(() => setStep((v) => v + 1), steps[step].duration);
		return () => clearTimeout(t);
	}, [isExiting, step, steps]);

	const isExitingRef = useRef(false);
	useEffect(() => {
		if (!isComplete || isExitingRef.current) return;
		isExitingRef.current = true;
		setProgress(100);
		setIsExiting(true);
		const t = setTimeout(() => onCompleteRef.current(), exitDurationMs);
		return () => clearTimeout(t);
	}, [exitDurationMs, isComplete]);

	useEffect(() => {
		if (step >= steps.length) return;
		if (!Number.isFinite(total) || total <= 0) return;
		const elapsed = steps.slice(0, step).reduce((s, x) => s + x.duration, 0);
		const curRaw = steps[Math.min(step, steps.length - 1)]?.duration ?? 1;
		const cur = Number.isFinite(curRaw) && curRaw > 0 ? curRaw : 1;
		const startP = clamp((elapsed / total) * 100, 0, 100);
		const endP = clamp(((elapsed + cur) / total) * 100, 0, 100);
		setProgress(startP);
		const t0 = performance.now();
		let rafId = 0;
		const animate = () => {
			const now = performance.now();
			const a = clamp((now - t0) / cur, 0, 1);
			const next = startP + (endP - startP) * a;
			setProgress(Number.isFinite(next) ? next : startP);
			if (a < 1) rafId = requestAnimationFrame(animate);
		};
		rafId = requestAnimationFrame(animate);
		return () => cancelAnimationFrame(rafId);
	}, [step, steps, total]);

	const progressRef = useRef(progress);
	const isExitingAnimRef = useRef(isExiting);
	const stepRef = useRef(step);
	useEffect(() => {
		progressRef.current = progress;
	}, [progress]);
	useEffect(() => {
		isExitingAnimRef.current = isExiting;
	}, [isExiting]);
	useEffect(() => {
		stepRef.current = step;
	}, [step]);

	const gridSize = 4;
	const gridSpacing = 1;
	const rodPositions = useMemo(() => {
		const pts: { x: number; z: number }[] = [];
		for (let i = 0; i <= gridSize; i++) {
			for (let j = 0; j <= gridSize; j++) {
				if (
					(i + j) % 2 === 0 ||
					((i === 0 || i === gridSize) && (j === 0 || j === gridSize))
				) {
					pts.push({
						x: i * gridSpacing - (gridSize * gridSpacing) / 2,
						z: j * gridSpacing - (gridSize * gridSpacing) / 2,
					});
				}
			}
		}
		return pts;
	}, []);

	const computePotential = useCallback(
		(px: number, pz: number, time: number) => {
			let v = 0;
			for (const rod of rodPositions) {
				const dx = px - rod.x;
				const dz = pz - rod.z;
				const dist = Math.sqrt(dx * dx + dz * dz) + 0.3;
				v += 1 / dist;
			}
			v +=
				Math.sin(px * 0.5 + time * 0.8) * 0.15 +
				Math.cos(pz * 0.4 - time * 0.6) * 0.12;
			return v;
		},
		[rodPositions],
	);

	useEffect(() => {
		if (!canvasRef.current) return;
		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const w = window.innerWidth;
		const h = window.innerHeight;
		canvas.width = w;
		canvas.height = h;

		let disposed = false;
		let rafId = 0;
		const startTime = performance.now();
		const res = 6;
		const halfGrid = (gridSize * gridSpacing) / 2;
		const worldExtent = halfGrid * 1.8;

		const tick = () => {
			if (disposed) return;
			rafId = requestAnimationFrame(tick);

			const time = (performance.now() - startTime) / 1000;
			const prog = clamp(progressRef.current / 100, 0, 1);
			const currentStep = stepRef.current;
			const exiting = isExitingAnimRef.current;

			ctx.fillStyle = palette.background;
			ctx.fillRect(0, 0, w, h);

			const contourOpacity =
				currentStep >= 3
					? clamp(prog, 0, 0.7)
					: currentStep >= 2
						? 0.3
						: currentStep >= 1
							? 0.15
							: 0;

			if (contourOpacity > 0.01) {
				const centerX = w * 0.5;
				const centerY = h * 0.48;
				const scale = Math.min(w, h) * 0.3;
				const exitScale = exiting
					? Math.max(0.3, 1 - (time - Math.floor(time)) * 0.1)
					: 1;

				let minV = Infinity,
					maxV = -Infinity;
				const cols = Math.ceil(w / res);
				const rows = Math.ceil(h / res);
				const values: number[] = new Array(cols * rows);

				for (let gy = 0; gy < rows; gy++) {
					for (let gx = 0; gx < cols; gx++) {
						const sx = gx * res;
						const sy = gy * res;
						const wx = ((sx - centerX) / (scale * exitScale)) * worldExtent;
						const wz = ((sy - centerY) / (scale * exitScale)) * worldExtent;
						const v = computePotential(wx, wz, time);
						values[gy * cols + gx] = v;
						if (v < minV) minV = v;
						if (v > maxV) maxV = v;
					}
				}

				const range = maxV - minV || 1;
				ctx.globalAlpha = contourOpacity;
				for (let gy = 0; gy < rows; gy++) {
					for (let gx = 0; gx < cols; gx++) {
						const norm = (values[gy * cols + gx] - minV) / range;
						ctx.fillStyle = heatColor(norm);
						ctx.fillRect(gx * res, gy * res, res, res);
					}
				}
				ctx.globalAlpha = 1;

				if (currentStep >= 1) {
					ctx.strokeStyle = `rgba(245, 158, 11, ${0.35 * contourOpacity})`;
					ctx.lineWidth = 1.5;
					for (let i = 0; i <= gridSize; i++) {
						const worldCoord = i * gridSpacing - halfGrid;
						const screenMinX =
							centerX + (-halfGrid / worldExtent) * scale * exitScale;
						const screenMaxX =
							centerX + (halfGrid / worldExtent) * scale * exitScale;
						const screenY =
							centerY + (worldCoord / worldExtent) * scale * exitScale;
						const screenX =
							centerX + (worldCoord / worldExtent) * scale * exitScale;
						const screenMinY =
							centerY + (-halfGrid / worldExtent) * scale * exitScale;
						const screenMaxY =
							centerY + (halfGrid / worldExtent) * scale * exitScale;

						ctx.beginPath();
						ctx.moveTo(screenMinX, screenY);
						ctx.lineTo(screenMaxX, screenY);
						ctx.stroke();

						ctx.beginPath();
						ctx.moveTo(screenX, screenMinY);
						ctx.lineTo(screenX, screenMaxY);
						ctx.stroke();
					}
				}

				if (currentStep >= 2) {
					for (const rod of rodPositions) {
						const sx = centerX + (rod.x / worldExtent) * scale * exitScale;
						const sz = centerY + (rod.z / worldExtent) * scale * exitScale;
						const rodR = 4 * exitScale;

						ctx.beginPath();
						ctx.arc(sx, sz, rodR + 3, 0, Math.PI * 2);
						ctx.fillStyle = `rgba(34, 197, 94, ${0.2 * contourOpacity})`;
						ctx.fill();

						ctx.beginPath();
						ctx.arc(sx, sz, rodR, 0, Math.PI * 2);
						ctx.fillStyle = `rgba(34, 197, 94, ${0.8 * contourOpacity})`;
						ctx.fill();
					}
				}
			}
		};

		tick();

		const handleResize = () => {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
		};
		window.addEventListener("resize", handleResize);

		return () => {
			disposed = true;
			cancelAnimationFrame(rafId);
			window.removeEventListener("resize", handleResize);
		};
	}, [palette.background, computePotential, rodPositions]);

	return (
		<div
			className={`fixed inset-0 z-[100] transition-all duration-1000 ${
				isExiting
					? "opacity-0 scale-95 blur-sm"
					: "opacity-100 scale-100 blur-0"
			}`}
			style={{
				backgroundColor: palette.background,
				transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
			}}
		>
			<canvas ref={canvasRef} className="absolute inset-0 opacity-80" />
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					background: `radial-gradient(circle at 50% 45%, ${hexToRgba(AMBER, 0.08)}, ${hexToRgba(COPPER, 0.03)} 38%, ${palette.background} 68%)`,
				}}
			/>
			<div
				className={`relative z-10 flex flex-col items-center justify-start min-h-screen px-6 text-center transition-opacity duration-1000 pt-28 ${
					isExiting ? "opacity-0" : "opacity-100"
				}`}
				style={{ transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)" }}
			>
				<div className="mb-2">
					<svg width="64" height="64" viewBox="0 0 64 64" fill="none">
						<rect
							x="8"
							y="8"
							width="48"
							height="48"
							rx="6"
							stroke={AMBER}
							strokeWidth="2"
							opacity="0.3"
						/>
						<line
							x1="8"
							y1="24"
							x2="56"
							y2="24"
							stroke={AMBER}
							strokeWidth="1.5"
							opacity="0.4"
						/>
						<line
							x1="8"
							y1="40"
							x2="56"
							y2="40"
							stroke={AMBER}
							strokeWidth="1.5"
							opacity="0.4"
						/>
						<line
							x1="24"
							y1="8"
							x2="24"
							y2="56"
							stroke={AMBER}
							strokeWidth="1.5"
							opacity="0.4"
						/>
						<line
							x1="40"
							y1="8"
							x2="40"
							y2="56"
							stroke={AMBER}
							strokeWidth="1.5"
							opacity="0.4"
						/>
						<circle cx="24" cy="24" r="3" fill="#22c55e" opacity="0.8" />
						<circle cx="40" cy="24" r="3" fill="#22c55e" opacity="0.8" />
						<circle cx="24" cy="40" r="3" fill="#22c55e" opacity="0.8" />
						<circle cx="40" cy="40" r="3" fill="#22c55e" opacity="0.8" />
						<circle cx="32" cy="32" r="2.5" fill="#3b82f6" opacity="0.8" />
					</svg>
				</div>

				<h1
					className="text-5xl sm:text-6xl font-black tracking-tight"
					style={{
						background: `linear-gradient(90deg, ${AMBER}, ${COPPER}, ${AMBER})`,
						WebkitBackgroundClip: "text",
						WebkitTextFillColor: "transparent",
					}}
				>
					Ground Grid
				</h1>
				<p
					className="mt-1 text-base font-semibold"
					style={{ color: hexToRgba(palette.text, 0.7) }}
				>
					Coordinate Extraction + Grid Design
				</p>

				<div className="w-full max-w-[360px] mt-8 space-y-2">
					{steps.map((s, i) => (
						<LoadingCard
							key={s.id}
							label={s.label}
							icon={
								<span
									className="text-[10px] font-bold"
									style={{ color: palette.text }}
								>
									*
								</span>
							}
							isActive={i === step}
							isComplete={i < step}
							index={i}
						/>
					))}
					{step < steps.length && (
						<ProgressBar
							progress={Number.isFinite(progress) ? clamp(progress, 0, 100) : 0}
						/>
					)}
				</div>
			</div>

			<div className="absolute bottom-6 right-6 text-right text-[10px] leading-tight z-20 select-none">
				<div className="font-medium" style={{ color: palette.textMuted }}>
					Ground Grid Generator
				</div>
				<div style={{ color: palette.textMuted, opacity: 0.6 }}>
					Root3Power Suite
				</div>
			</div>
		</div>
	);
}
