import type { CSSProperties } from "react";

export function ProgressBar({
	value,
	progress,
	style,
}: {
	value?: number;
	progress?: number;
	style?: CSSProperties;
}) {
	const normalizedValue = value ?? progress ?? 0;
	const clamped = Math.max(0, Math.min(100, normalizedValue));
	return (
		<div className="h-2 w-full rounded [background:color-mix(in_srgb,var(--text)_10%,transparent)]" style={style}>
			<div
				className="h-2 rounded [background:var(--primary)] transition-all"
				style={{ width: `${clamped}%` }}
			/>
		</div>
	);
}
