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
		<div className="h-2 w-full rounded bg-white/10" style={style}>
			<div
				className="h-2 rounded bg-emerald-400 transition-all"
				style={{ width: `${clamped}%` }}
			/>
		</div>
	);
}

export default ProgressBar;
