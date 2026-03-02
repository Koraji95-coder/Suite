import { CheckCircle, Eye, XCircle } from "lucide-react";
import { QAQCStatusIcon } from "./QAQCStatusIcon";
import type { DrawingAnnotation } from "./qaqcModels";
import { getStatusColor, getStatusTextColor } from "./qaqcUi";

interface QAQCDrawingCardsProps {
	loading: boolean;
	filteredDrawings: DrawingAnnotation[];
	searchTerm: string;
	filterStatus: string;
	onSelectDrawing: (drawing: DrawingAnnotation) => void;
	onDeleteDrawing: (drawing: DrawingAnnotation) => void;
}

export function QAQCDrawingCards({
	loading,
	filteredDrawings,
	searchTerm,
	filterStatus,
	onSelectDrawing,
	onDeleteDrawing,
}: QAQCDrawingCardsProps) {
	if (loading) {
		return (
			<div className="text-center [color:var(--text-muted)] py-12">
				Loading drawings...
			</div>
		);
	}

	if (filteredDrawings.length === 0) {
		return (
			<div className="text-center [color:var(--text-muted)] py-12">
				<CheckCircle className="w-16 h-16 mx-auto mb-4 [color:var(--success)] opacity-30" />
				{searchTerm || filterStatus !== "all"
					? "No drawings match your filters"
					: "No drawings checked yet. Upload a drawing to perform QA/QC check!"}
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{filteredDrawings.map((drawing) => (
				<div
					key={drawing.id}
					className={`${getStatusColor(drawing.qa_status)} backdrop-blur-md border rounded-lg overflow-hidden hover:shadow-lg transition-all cursor-pointer`}
					onClick={() => onSelectDrawing(drawing)}
				>
					<div className="p-4">
						<div className="flex items-start justify-between mb-3">
							<div className="flex items-center space-x-2">
								<QAQCStatusIcon status={drawing.qa_status} />
								<h3 className="text-lg font-bold [color:var(--text)]">
									{drawing.drawing_name}
								</h3>
							</div>
						</div>

						<div className="space-y-2 text-sm">
							<div className="flex items-center justify-between [color:var(--text-muted)]">
								<span>Issues Found:</span>
								<span className="font-semibold [color:var(--text)]">
									{drawing.issues_found}
								</span>
							</div>

							<div className="flex items-center justify-between [color:var(--text-muted)]">
								<span>Status:</span>
								<span
									className={`capitalize font-semibold ${getStatusTextColor(drawing.qa_status)}`}
								>
									{drawing.qa_status}
								</span>
							</div>

							{drawing.checked_at && (
								<div className="flex items-center justify-between [color:var(--text-muted)]">
									<span>Checked:</span>
									<span>
										{new Date(drawing.checked_at).toLocaleDateString()}
									</span>
								</div>
							)}
						</div>

						<div className="flex gap-2 mt-4">
							<button
								onClick={(event) => {
									event.stopPropagation();
									onSelectDrawing(drawing);
								}}
								className="flex-1 flex items-center justify-center space-x-1 [background:color-mix(in_srgb,var(--success)_20%,var(--surface))] hover:[background:color-mix(in_srgb,var(--success)_30%,var(--surface))] border [border-color:color-mix(in_srgb,var(--success)_40%,transparent)] [color:var(--text)] px-3 py-2 rounded-lg transition-all text-sm"
							>
								<Eye className="w-4 h-4" />
								<span>Details</span>
							</button>
							<button
								onClick={(event) => {
									event.stopPropagation();
									onDeleteDrawing(drawing);
								}}
								className="px-3 py-2 [background:color-mix(in_srgb,var(--danger)_20%,var(--surface))] hover:[background:color-mix(in_srgb,var(--danger)_30%,var(--surface))] border [border-color:color-mix(in_srgb,var(--danger)_40%,transparent)] [color:var(--danger)] rounded-lg transition-all text-sm"
							>
								<XCircle className="w-4 h-4" />
							</button>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
