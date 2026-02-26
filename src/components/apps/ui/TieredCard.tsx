import {
	forwardRef,
	type CSSProperties,
	type HTMLAttributes,
	type ReactNode,
} from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { cn } from "@/lib/utils";

export type CardTier = "solid" | "frosted" | "glass";

export interface TieredCardProps extends HTMLAttributes<HTMLDivElement> {
	tier?: CardTier;
	tint?: string;
	hover?: boolean;
	padded?: boolean;
	overflow?: "hidden" | "visible";
	accentEdge?: "left" | "top" | false;
	accentColor?: string;
}

const TIER_CONFIG = {
	solid: { blur: 0, bgOpacity: 1, borderOpacity: 0.07, shadowSpread: 0 },
	frosted: {
		blur: 10,
		bgOpacity: 0.7,
		borderOpacity: 0.12,
		shadowSpread: 12,
	},
	glass: { blur: 16, bgOpacity: 0.55, borderOpacity: 0.1, shadowSpread: 32 },
} as const;

export const TieredCard = forwardRef<HTMLDivElement, TieredCardProps>(
	(
		{
			tier = "solid",
			tint: tintProp,
			hover = false,
			padded = false,
			overflow = "hidden",
			accentEdge = false,
			accentColor: accentColorProp,
			className,
			style,
			children,
			...props
		},
		ref,
	) => {
		const { palette } = useTheme();
		const tint = tintProp ?? palette.primary;
		const config = TIER_CONFIG[tier];
		const accentColor = accentColorProp ?? tint;

		const buildStyle = (): CSSProperties => {
			const base: CSSProperties = {
				borderRadius: "1rem",
				transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
			};

			if (tier === "solid") {
				const surfaceShade = palette.surfaceLight;
				base.background = surfaceShade;
				base.border = `1px solid ${hexToRgba("#ffffff", config.borderOpacity)}`;
				base.boxShadow = `inset 0 1px 0 ${hexToRgba("#ffffff", 0.04)}`;
			}

			if (tier === "frosted") {
				base.background = hexToRgba(palette.surface, config.bgOpacity);
				base.backdropFilter = `blur(${config.blur}px) saturate(130%)`;
				base.WebkitBackdropFilter = `blur(${config.blur}px) saturate(130%)`;
				base.border = `1px solid ${hexToRgba(tint, config.borderOpacity)}`;
				base.boxShadow = [
					`0 0 ${config.shadowSpread}px ${hexToRgba(tint, 0.08)}`,
					`inset 0 1px 0 ${hexToRgba("#ffffff", 0.04)}`,
				].join(", ");
			}

			if (tier === "glass") {
				base.background = hexToRgba(palette.surface, config.bgOpacity);
				base.backdropFilter = `blur(${config.blur}px) saturate(160%)`;
				base.WebkitBackdropFilter = `blur(${config.blur}px) saturate(160%)`;
				base.border = `1px solid ${hexToRgba("#ffffff", config.borderOpacity)}`;
				base.boxShadow = `0 8px ${config.shadowSpread}px ${hexToRgba("#000000", 0.3)}`;
			}

			return base;
		};

		return (
			<div
				ref={ref}
				className={cn(
					"relative",
					overflow === "hidden" ? "overflow-hidden" : "overflow-visible",
					padded && "p-5",
					hover &&
						"hover:border-[var(--tc-hover-border)] hover:translate-y-[-1px]",
					className,
				)}
				style={
					{
						...buildStyle(),
						"--tc-hover-border": hexToRgba(tint, 0.2),
						...style,
					} as CSSProperties
				}
				{...props}
			>
				{accentEdge && (
					<div
						aria-hidden
						className="absolute pointer-events-none"
						style={
							accentEdge === "left"
								? {
										top: 12,
										bottom: 12,
										left: 0,
										width: 3,
										borderRadius: "0 3px 3px 0",
										background: accentColor,
									}
								: {
										left: 12,
										right: 12,
										top: 0,
										height: 3,
										borderRadius: "0 0 3px 3px",
										background: accentColor,
									}
						}
					/>
				)}
				{children}
			</div>
		);
	},
);

TieredCard.displayName = "TieredCard";

export interface InsetPanelProps extends HTMLAttributes<HTMLDivElement> {
	tint?: string;
}

export const InsetPanel = forwardRef<HTMLDivElement, InsetPanelProps>(
	({ className, tint, style, children, ...props }, ref) => {
		const { palette } = useTheme();
		const color = tint ?? palette.primary;

		return (
			<div
				ref={ref}
				className={cn("relative rounded-2xl p-5", className)}
				style={{
					background: hexToRgba(palette.background, 0.6),
					border: `1px solid ${hexToRgba("#ffffff", 0.05)}`,
					boxShadow: `inset 0 2px 4px ${hexToRgba("#000000", 0.15)}`,
					...style,
				}}
				{...props}
			>
				{children}
			</div>
		);
	},
);
InsetPanel.displayName = "InsetPanel";

export interface AccentBandCardProps extends HTMLAttributes<HTMLDivElement> {
	bandColor?: string;
	bandSide?: "left" | "top";
}

export const AccentBandCard = forwardRef<HTMLDivElement, AccentBandCardProps>(
	(
		{ bandColor, bandSide = "left", className, style, children, ...props },
		ref,
	) => {
		return (
			<TieredCard
				ref={ref}
				tier="solid"
				hover
				accentEdge={bandSide}
				accentColor={bandColor}
				className={className}
				style={style}
				{...props}
			>
				{children}
			</TieredCard>
		);
	},
);
AccentBandCard.displayName = "AccentBandCard";

export interface RevealCardProps extends HTMLAttributes<HTMLDivElement> {
	summary: ReactNode;
	expanded?: ReactNode;
	tint?: string;
}

export const RevealCard = forwardRef<HTMLDivElement, RevealCardProps>(
	({ summary, expanded, tint, className, style, children, ...props }, ref) => {
		return (
			<TieredCard
				ref={ref}
				tier="solid"
				tint={tint}
				hover
				className={cn(
					"group/reveal transition-all duration-250",
					expanded && "cursor-pointer",
					className,
				)}
				style={style}
				{...props}
			>
				<div className="px-5 py-4">{summary}</div>
				{expanded && (
					<div className="max-h-0 overflow-hidden opacity-0 group-hover/reveal:max-h-40 group-hover/reveal:opacity-100 transition-all duration-250 ease-out">
						<div className="px-5 pb-4">{expanded}</div>
					</div>
				)}
				{children}
			</TieredCard>
		);
	},
);
RevealCard.displayName = "RevealCard";
