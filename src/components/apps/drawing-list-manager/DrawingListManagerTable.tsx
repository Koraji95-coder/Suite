import type { DrawingListManagerFilteredDrawing } from "./useDrawingListManagerState";

interface DrawingListManagerTableProps {
	drawings: DrawingListManagerFilteredDrawing[];
	onTitleChange: (id: string, title: string) => void;
}

export function DrawingListManagerTable({
	drawings,
	onTitleChange,
}: DrawingListManagerTableProps) {
	return (
		<div className="rounded-xl border p-4 [border-color:var(--border)] [background:var(--surface)]">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold [color:var(--text)]">
					Drawing List
				</h3>
				<div className="text-xs [color:var(--text-muted)]">
					{drawings.length} entries
				</div>
			</div>

			<div className="mt-3 overflow-x-auto">
				<table className="w-full border-collapse text-xs">
					<thead>
						<tr className="text-left [color:var(--text-muted)]">
							<th className="px-1.5 py-2">Drawing Number</th>
							<th className="px-1.5 py-2">Title</th>
							<th className="px-1.5 py-2">File</th>
							<th className="px-1.5 py-2">Status</th>
						</tr>
					</thead>
					<tbody>
						{drawings.map((drawing) => (
							<tr
								key={drawing.id}
								className="border-t [border-color:var(--border)]"
							>
								<td className="px-1.5 py-2 font-semibold [color:var(--text)]">
									{drawing.drawingNumber}
								</td>
								<td className="px-1.5 py-2">
									<input
										value={drawing.title}
										onChange={(e) => onTitleChange(drawing.id, e.target.value)}
										className="w-full rounded-md border bg-transparent px-1.5 py-1 text-xs outline-none transition focus:[border-color:var(--primary)] border-[color-mix(in_srgb,var(--primary)_15%,transparent)] [color:var(--text)]"
									/>
								</td>
								<td className="px-1.5 py-2 [color:var(--text-muted)]">
									{drawing.fileName || "–"}
								</td>
								<td className="px-1.5 py-2">
									{drawing.issues.length === 0 ? (
										<span className="font-semibold [color:var(--success)]">
											Ready
										</span>
									) : (
										<span className="font-semibold [color:var(--warning)]">
											{drawing.issues.join(", ")}
										</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
