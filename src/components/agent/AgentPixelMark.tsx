// src/components/agent/AgentPixelMark.tsx
import {
	memo,
	type CSSProperties,
	type ReactElement,
	useEffect,
	useId,
	useMemo,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import styles from "./AgentPixelMark.module.css";
import {
	CREST_CORE_PATH,
	CREST_SHELL_PATH,
	CREST_STATE_PHASES,
	CREST_VARIANTS,
	type CrestVectorElement,
} from "./agentCrestDefinitions";
import type { MarkExpression } from "./agentMarkPatterns";
import type { AgentProfileId } from "./agentProfiles";
import { type AgentMarkState, mapLegacyMarkState } from "./agentMarkState";

interface AgentPixelMarkProps {
	profileId: AgentProfileId;
	size?: number;
	state?: AgentMarkState;
	motionPreset?: "balanced" | "reduced";
	detailLevel?: "auto" | "micro" | "standard" | "hero";
	expression?: MarkExpression;
	className?: string;
	/** Add a pulsing ring effect */
	pulse?: boolean;
	/** Add a subtle breathing animation */
	breathe?: boolean;
}

function resolveDetailLevel(
	size: number,
	detailLevel: "auto" | "micro" | "standard" | "hero",
): "micro" | "standard" | "hero" {
	if (detailLevel !== "auto") return detailLevel;
	if (size >= 110) return "hero";
	if (size >= 36) return "standard";
	return "micro";
}

function renderVectorElement(
	element: CrestVectorElement,
	key: string,
): ReactElement {
	switch (element.type) {
		case "path":
			return (
				<path
					key={key}
					d={element.d}
					fill={element.fill}
					stroke={element.stroke}
					strokeWidth={element.strokeWidth}
					opacity={element.opacity}
					strokeLinecap={element.strokeLinecap}
					strokeLinejoin={element.strokeLinejoin}
				/>
			);
		case "circle":
			return (
				<circle
					key={key}
					cx={element.cx}
					cy={element.cy}
					r={element.r}
					fill={element.fill}
					stroke={element.stroke}
					strokeWidth={element.strokeWidth}
					opacity={element.opacity}
					strokeLinecap={element.strokeLinecap}
					strokeLinejoin={element.strokeLinejoin}
				/>
			);
		case "rect":
			return (
				<rect
					key={key}
					x={element.x}
					y={element.y}
					width={element.width}
					height={element.height}
					rx={element.rx}
					fill={element.fill}
					stroke={element.stroke}
					strokeWidth={element.strokeWidth}
					opacity={element.opacity}
					strokeLinecap={element.strokeLinecap}
					strokeLinejoin={element.strokeLinejoin}
				/>
			);
		case "line":
			return (
				<line
					key={key}
					x1={element.x1}
					y1={element.y1}
					x2={element.x2}
					y2={element.y2}
					fill={element.fill}
					stroke={element.stroke}
					strokeWidth={element.strokeWidth}
					opacity={element.opacity}
					strokeLinecap={element.strokeLinecap}
					strokeLinejoin={element.strokeLinejoin}
				/>
			);
		default:
			return <g key={key} />;
	}
}

function AgentPixelMarkInner({
	profileId,
	size = 48,
	state,
	motionPreset = "balanced",
	detailLevel = "auto",
	expression = "neutral",
	className = "",
	pulse = false,
	breathe = false,
}: AgentPixelMarkProps) {
	const crest = CREST_VARIANTS[profileId];
	const gradientId = useId();
	const safeGradientId = useMemo(() => gradientId.replace(/[:]/g, ""), [gradientId]);
	const [frameIndex, setFrameIndex] = useState(0);
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const applyReducedPreference = () => {
			setPrefersReducedMotion(mediaQuery.matches);
		};
		applyReducedPreference();
		mediaQuery.addEventListener("change", applyReducedPreference);
		return () => {
			mediaQuery.removeEventListener("change", applyReducedPreference);
		};
	}, []);

	const reducedMotion =
		motionPreset === "reduced" || prefersReducedMotion;
	const effectiveState = state ?? mapLegacyMarkState({ expression, pulse, breathe });

	const framesForState = CREST_STATE_PHASES[effectiveState] ?? [0];

	const normalizedFrameIndex =
		framesForState.length > 0 ? frameIndex % framesForState.length : 0;
	const phaseStep = framesForState[normalizedFrameIndex] ?? 0;
	const phaseRatio =
		framesForState.length > 1
			? phaseStep / (framesForState.length - 1)
			: 0;
	const effectiveDetail = resolveDetailLevel(size, detailLevel);

	const cadenceMs = useMemo(() => {
		const cadenceByState: Record<AgentMarkState, number> = {
			idle: 3200,
			thinking: 220,
			speaking: 220,
			running: 180,
			waiting: 320,
			success: 220,
			warning: 260,
			error: 260,
			focus: 280,
		};
		const baseCadence = cadenceByState[effectiveState];
		const lowCostMultiplier = size <= 26 ? 1.85 : 1;
		return Math.round(baseCadence * lowCostMultiplier);
	}, [effectiveState, size]);
	const shouldAnimateFrames =
		!reducedMotion && framesForState.length > 1 && size >= 40;

	useEffect(() => {
		setFrameIndex(0);
		if (!shouldAnimateFrames) {
			return;
		}
		const timer = window.setInterval(() => {
			setFrameIndex((current) => (current + 1) % framesForState.length);
		}, cadenceMs);
		return () => {
			window.clearInterval(timer);
		};
	}, [shouldAnimateFrames, framesForState.length, cadenceMs]);

	const stateColor = useMemo(() => {
		switch (effectiveState) {
			case "error":
				return "var(--danger)";
			case "warning":
			case "waiting":
				return "var(--warning)";
			case "success":
				return "var(--success)";
			case "focus":
				return "var(--info)";
			default:
				return crest.palette.glow;
		}
	}, [effectiveState, crest.palette.glow]);

	const crestVars = useMemo(
		() =>
			({
				"--crest-shell": crest.palette.shell,
				"--crest-shell-deep": crest.palette.shellDeep,
				"--crest-core": crest.palette.core,
				"--crest-line": crest.palette.line,
				"--crest-ink": crest.palette.ink,
				"--crest-accent": crest.palette.accent,
				"--crest-glow": stateColor,
			}) as CSSProperties,
		[crest, stateColor],
	);

	const activityStrokeWidth =
		effectiveState === "running" || effectiveState === "speaking" ? 2.2 : 1.8;
	const sweepRotation = -92 + phaseRatio * 214;
	const sweepDashOffset = Math.round((1 - phaseRatio) * 82);
	const showGlow =
		size >= 28 && effectiveState !== "idle" && effectiveState !== "waiting";
	const showPulseRing =
		!reducedMotion &&
		size >= 34 &&
		(pulse ||
			effectiveState === "speaking" ||
			effectiveState === "running" ||
			effectiveState === "error" ||
			effectiveState === "warning");
	const showBreathe =
		!reducedMotion && size >= 40 && (breathe || effectiveState === "focus");
	const showStateSweep = size >= 26 && effectiveState !== "idle";
	const motionMode = reducedMotion ? "reduced" : "balanced";
	const symbolElements =
		effectiveDetail === "micro" ? crest.microSymbol : crest.symbol;
	const showEngraving = effectiveDetail !== "micro";

	return (
		<div
			className={cn(styles.root, className)}
			style={{ width: size, height: size }}
			data-agent-state={effectiveState}
			data-agent-frame={normalizedFrameIndex}
			data-agent-motion={motionMode}
			data-agent-detail={effectiveDetail}
		>
			{showPulseRing && (
				<div
					data-agent-layer="pulse"
					className={styles.pulseRing}
					style={{ "--agent-glow": stateColor } as CSSProperties}
				/>
			)}

			{showGlow && !reducedMotion && (
				<div
					data-agent-layer="halo"
					className={styles.halo}
					style={{ "--agent-glow": stateColor } as CSSProperties}
				/>
			)}

			<div
				className={cn(styles.crestWrap, showBreathe && styles.breathe)}
				style={crestVars}
			>
				<svg
					width={size}
					height={size}
					viewBox="0 0 72 72"
					className={styles.crestSvg}
					aria-hidden="true"
					data-agent-layer="crest"
					data-agent-vector="true"
				>
					<defs>
						<linearGradient id={`agent-shell-${safeGradientId}`} x1="20%" y1="8%" x2="82%" y2="88%">
							<stop offset="0%" stopColor="var(--crest-shell)" />
							<stop offset="100%" stopColor="var(--crest-shell-deep)" />
						</linearGradient>
						<radialGradient id={`agent-core-${safeGradientId}`} cx="42%" cy="24%" r="80%">
							<stop
								offset="0%"
								stopColor="color-mix(in srgb, var(--crest-core) 88%, white 12%)"
							/>
							<stop offset="100%" stopColor="var(--crest-core)" />
						</radialGradient>
					</defs>

					<g className={styles.crestShell}>
						<path
							d={CREST_SHELL_PATH}
							fill={`url(#agent-shell-${safeGradientId})`}
							stroke="var(--crest-line)"
							strokeWidth={1.15}
							opacity={0.96}
						/>
						<path
							d={CREST_CORE_PATH}
							fill={`url(#agent-core-${safeGradientId})`}
							stroke="color-mix(in srgb, var(--crest-line) 62%, transparent)"
							strokeWidth={0.95}
							opacity={0.92}
						/>
					</g>

					<g className={styles.symbolLayer}>
						{symbolElements.map((element, index) =>
							renderVectorElement(element, `symbol-${profileId}-${index}`),
						)}
					</g>

					{showEngraving && (
						<g
							className={cn(
								styles.engravingLayer,
								effectiveDetail === "hero" && styles.engravingLayerHero,
							)}
						>
							{crest.engraving.map((element, index) =>
								renderVectorElement(element, `engraving-${profileId}-${index}`),
							)}
						</g>
					)}

					<g className={styles.stateLayer}>
						<circle
							cx={36}
							cy={36}
							r={28}
							fill="none"
							stroke="color-mix(in srgb, var(--crest-glow) 28%, transparent)"
							strokeWidth={1.1}
							opacity={showStateSweep ? 0.72 : 0}
						/>
						<circle
							cx={36}
							cy={36}
							r={28}
							fill="none"
							stroke="var(--crest-glow)"
							strokeWidth={activityStrokeWidth}
							strokeLinecap="round"
							strokeDasharray="26 150"
							strokeDashoffset={sweepDashOffset}
							opacity={showStateSweep ? 0.88 : 0}
							transform={`rotate(${sweepRotation} 36 36)`}
						/>
					</g>
				</svg>
			</div>
		</div>
	);
}

function areEqual(
	prev: Readonly<AgentPixelMarkProps>,
	next: Readonly<AgentPixelMarkProps>,
): boolean {
	return (
		prev.profileId === next.profileId &&
		(prev.size ?? 48) === (next.size ?? 48) &&
		(prev.state ?? "idle") === (next.state ?? "idle") &&
		(prev.motionPreset ?? "balanced") === (next.motionPreset ?? "balanced") &&
		(prev.detailLevel ?? "auto") === (next.detailLevel ?? "auto") &&
		(prev.expression ?? "neutral") === (next.expression ?? "neutral") &&
		(prev.className ?? "") === (next.className ?? "") &&
		Boolean(prev.pulse) === Boolean(next.pulse) &&
		Boolean(prev.breathe) === Boolean(next.breathe)
	);
}

export const AgentPixelMark = memo(AgentPixelMarkInner, areEqual);
