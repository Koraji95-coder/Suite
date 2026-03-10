import type { FormEvent } from "react";
import { Dialog, DialogContent } from "@/components/apps/ui/dialog";
import styles from "./StandardsDrawingDialogs.module.css";

interface StandardsDrawingUploadDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	checkingDrawing: boolean;
	enabledRuleCount: number;
	uploadForm: { name: string };
	setUploadForm: (value: { name: string }) => void;
	onSubmit: (event: FormEvent) => void;
	onCancel: () => void;
}

export function StandardsDrawingUploadDialog({
	open,
	onOpenChange,
	checkingDrawing,
	enabledRuleCount,
	uploadForm,
	setUploadForm,
	onSubmit,
	onCancel,
}: StandardsDrawingUploadDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className={styles.dialogShell}>
				<h3 className={styles.title}>Check Drawing</h3>
				{checkingDrawing ? (
					<div className={styles.loadingBox}>
						<p>Running standards checks...</p>
						<p className={styles.subtitle}>Applying {enabledRuleCount} rules</p>
					</div>
				) : (
					<form onSubmit={onSubmit} className={styles.form}>
						<div>
							<label className={styles.fieldLabel} htmlFor="standards-drawing-name">
								Drawing Name *
							</label>
							<input
								id="standards-drawing-name"
								name="standards_drawing_name"
								type="text"
								value={uploadForm.name}
								onChange={(event) =>
									setUploadForm({ name: event.target.value })
								}
								required
								className={styles.fieldInput}
								placeholder="e.g., E-001-POWER-PLAN"
							/>
						</div>

						<div className={styles.infoBox}>
							<p>
								{enabledRuleCount} standards rules will be applied to this
								drawing.
							</p>
						</div>

						<div className={styles.actionRow}>
							<button
								type="submit"
								className={`${styles.actionButton} ${styles.primaryButton}`}
							>
								Run Check
							</button>
							<button
								type="button"
								onClick={onCancel}
								className={styles.secondaryButton}
							>
								Cancel
							</button>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
