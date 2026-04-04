import type { CSSProperties, ReactNode } from "react";
import { hexToRgba } from "@/lib/palette";

interface GridOverlayCardProps {
	children: ReactNode;
	backgroundColor: string;
	className?: string;
	style?: CSSProperties;
	borderColor?: string;
	textColor?: string;
	backgroundAlpha?: number;
	borderAlpha?: number;
	showBorder?: boolean;
	padding?: string;
}

export function GridOverlayCard({
	children,
	backgroundColor,
	className,
	style,
	borderColor,
	textColor,
	backgroundAlpha = 0.86,
	borderAlpha = 0.16,
	showBorder = true,
	padding = "6px 10px",
}: GridOverlayCardProps) {
	const resolvedBorderColor = borderColor ?? backgroundColor;

	const baseStyle: CSSProperties = {
		borderRadius: 6,
		background: hexToRgba(backgroundColor, backgroundAlpha),
		padding,
		pointerEvents: "none",
		backdropFilter: "blur(4px)",
		...(showBorder
			? {
					border: `1px solid ${hexToRgba(resolvedBorderColor, borderAlpha)}`,
				}
			: {}),
		...(textColor ? { color: textColor } : {}),
	};

	return (
		<div className={className} style={{ ...baseStyle, ...style }}>
			{children}
		</div>
	);
}
