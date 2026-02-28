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
		? "[border-color:color-mix(in_srgb,var(--warning)_60%,var(--border))]"
		: isComplete
			? "[border-color:color-mix(in_srgb,var(--accent)_60%,var(--border))]"
			: "[border-color:var(--border)]";

	return (
		<div
			className={`rounded-xl border p-4 [background:var(--bg-mid)] ${statusClass}`}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="text-sm font-medium">{displayTitle}</div>
				{icon ? <div>{icon}</div> : null}
			</div>
			<div className="mt-2 text-xs [color:var(--text-muted)]">
				{children ||
					`Step ${typeof index === "number" ? index + 1 : ""}`.trim() ||
					"Please wait…"}
			</div>
		</div>
	);
}
