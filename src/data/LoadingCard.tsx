import type { ReactNode } from "react";

export interface LoadingCardProps {
	title?: string;
	children?: ReactNode;
	label?: string;
	icon?: ReactNode;
	isActive?: boolean;
	isComplete?: boolean;
	index?: number;
}

export function LoadingCard({
	title = "Loading",
	children,
	label,
	icon,
	isActive,
	isComplete,
	index,
}: LoadingCardProps) {
	const displayTitle = label ?? title;
	const statusClass = isActive
		? "border-orange-400/50"
		: isComplete
			? "border-emerald-400/40"
			: "border-white/10";

	return (
		<div className={`glass rounded-xl p-4 border ${statusClass}`}>
			<div className="flex items-center justify-between gap-2">
				<div className="text-sm font-medium">{displayTitle}</div>
				{icon ? <div>{icon}</div> : null}
			</div>
			<div className="mt-2 text-xs" style={{ color: "var(--white-dim)" }}>
				{children ||
					`Step ${typeof index === "number" ? index + 1 : ""}`.trim() ||
					"Please wait…"}
			</div>
		</div>
	);
}

export default LoadingCard;
