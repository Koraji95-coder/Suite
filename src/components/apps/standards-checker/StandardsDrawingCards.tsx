import { CheckCircle, Eye, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./StandardsDrawingCards.module.css";
import { StandardsDrawingStatusIcon } from "./StandardsDrawingStatusIcon";
import type { DrawingAnnotation } from "./standardsDrawingModels";

interface StandardsDrawingCardsProps {
	loading: boolean;
	filteredDrawings: DrawingAnnotation[];
	searchTerm: string;
	filterStatus: string;
	onSelectDrawing: (drawing: DrawingAnnotation) => void;
	onDeleteDrawing: (drawing: DrawingAnnotation) => void;
}

export function StandardsDrawingCards({
	loading,
	filteredDrawings,
	searchTerm,
	filterStatus,
	onSelectDrawing,
	onDeleteDrawing,
}: StandardsDrawingCardsProps) {
	const cardStatusClass: Record<DrawingAnnotation["qa_status"], string> = {
		pass: styles.statusPass,
		fail: styles.statusFail,
		warning: styles.statusWarning,
		pending: styles.statusPending,
	};

	const textStatusClass: Record<DrawingAnnotation["qa_status"], string> = {
		pass: styles.statusPassText,
		fail: styles.statusFailText,
		warning: styles.statusWarningText,
		pending: styles.statusPendingText,
	};

	if (loading) {
		return <div className={styles.loading}>Loading drawings...</div>;
	}

	if (filteredDrawings.length === 0) {
		return (
			<div className={styles.empty}>
				<CheckCircle className={styles.emptyIcon} />
				{searchTerm || filterStatus !== "all"
					? "No drawings match your filters"
					: "No drawings checked yet. Upload a drawing to run a standards check."}
			</div>
		);
	}

	return (
		<div className={styles.grid}>
			{filteredDrawings.map((drawing) => (
				<div
					key={drawing.id}
					className={cn(styles.card, cardStatusClass[drawing.qa_status])}
					onClick={() => onSelectDrawing(drawing)}
				>
					<div className={styles.cardBody}>
						<div className={styles.cardHeader}>
							<div className={styles.cardTitleRow}>
								<StandardsDrawingStatusIcon status={drawing.qa_status} />
								<h3 className={styles.cardTitle}>{drawing.drawing_name}</h3>
							</div>
						</div>

						<div className={styles.meta}>
							<div className={styles.metaRow}>
								<span>Issues Found:</span>
								<span className={styles.metaValue}>{drawing.issues_found}</span>
							</div>

							<div className={styles.metaRow}>
								<span>Status:</span>
								<span
									className={cn(
										styles.statusLabel,
										textStatusClass[drawing.qa_status],
									)}
								>
									{drawing.qa_status}
								</span>
							</div>

							{drawing.checked_at && (
								<div className={styles.metaRow}>
									<span>Checked:</span>
									<span>
										{new Date(drawing.checked_at).toLocaleDateString()}
									</span>
								</div>
							)}
						</div>

						<div className={styles.actions}>
							<button
								onClick={(event) => {
									event.stopPropagation();
									onSelectDrawing(drawing);
								}}
								className={styles.detailsButton}
								type="button"
							>
								<Eye className={styles.iconSm} />
								<span>Details</span>
							</button>
							<button
								onClick={(event) => {
									event.stopPropagation();
									onDeleteDrawing(drawing);
								}}
								className={styles.deleteButton}
								type="button"
							>
								<XCircle className={styles.iconSm} />
							</button>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
