import type { DrawingListManagerArchitectureMap as ArchMap } from "./useDrawingListManagerState";

interface DrawingListManagerArchitectureMapProps {
	architectureMap: ArchMap;
}

export function DrawingListManagerArchitectureMap({
	architectureMap,
}: DrawingListManagerArchitectureMapProps) {
	return (
		<div className="rounded-xl border p-4 [border-color:var(--border)] [background:var(--surface)]">
			<h3 className="text-sm font-semibold [color:var(--text)]">
				Architecture Map
			</h3>
			<p className="mt-1 text-xs [color:var(--text-muted)]">
				Summarized by sheet type for quick reporting.
			</p>
			<div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
				{architectureMap.map(([type, count]) => (
					<div
						key={type}
						className="flex items-center justify-between rounded-xl border p-3 [border-color:var(--border)] [background:var(--surface-2)]"
					>
						<div className="text-xs [color:var(--text-muted)]">{type}</div>
						<div className="text-base font-bold [color:var(--text)]">
							{count}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
