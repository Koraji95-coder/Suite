import {
	AlertTriangle,
	CheckCircle,
	Download,
	FileText,
	XCircle,
	Zap,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/apps/ui/dialog";
import { cn } from "@/lib/utils";
import styles from "./StandardsDrawingDialogs.module.css";
import { StandardsDrawingStatusIcon } from "./StandardsDrawingStatusIcon";
import type {
	DrawingAnnotation,
	Issue,
} from "@/features/standards-checker/standardsDrawingModels";

interface StandardsDrawingDetailDialogProps {
	selectedDrawing: DrawingAnnotation | null;
	onClose: () => void;
	onRecheckDrawing: (drawingName: string) => Promise<void>;
}

export function StandardsDrawingDetailDialog({
	selectedDrawing,
	onClose,
	onRecheckDrawing,
}: StandardsDrawingDetailDialogProps) {
	const severityCardClass: Record<Issue["severity"], string> = {
		error: styles.issueError,
		warning: styles.issueWarning,
		info: styles.issueInfo,
	};

	const severityChipClass: Record<Issue["severity"], string> = {
		error: styles.chipError,
		warning: styles.chipWarning,
		info: styles.chipInfo,
	};

	const severityIconClass: Record<Issue["severity"], string> = {
		error: styles.issueIconError,
		warning: styles.issueIconWarning,
		info: styles.issueIconInfo,
	};

	return (
		<Dialog
			open={Boolean(selectedDrawing)}
			onOpenChange={(open) => !open && onClose()}
		>
			<DialogContent
				className={cn(styles.dialogShell, styles.scroll)}
				showCloseButton={false}
			>
				<div className={styles.header}>
					<div className={styles.headerMeta}>
						<StandardsDrawingStatusIcon
							status={selectedDrawing?.qa_status ?? "pending"}
						/>
						<div>
							<h3 className={styles.title}>{selectedDrawing?.drawing_name}</h3>
							<p className={styles.subtitle}>
								Checked on{" "}
								{selectedDrawing?.checked_at
									? new Date(selectedDrawing.checked_at).toLocaleString()
									: "N/A"}
							</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className={styles.closeButton}
						type="button"
					>
						<span className={styles.closeGlyph}>×</span>
					</button>
				</div>

				<div className={styles.body}>
					<div className={styles.metrics}>
						<div className={styles.metricCard}>
							<div className={styles.metricValue}>
								{selectedDrawing?.issues_found ?? 0}
							</div>
							<div className={styles.metricLabel}>Issues Found</div>
						</div>
						<div className={styles.metricCard}>
							<div className={cn(styles.metricValue, styles.issueType)}>
								{selectedDrawing?.qa_status}
							</div>
							<div className={styles.metricLabel}>Status</div>
						</div>
						<div className={styles.metricCard}>
							<div className={styles.metricValue}>
								{selectedDrawing?.rules_applied.length ?? 0}
							</div>
							<div className={styles.metricLabel}>Rules Applied</div>
						</div>
					</div>

					<div>
						<h4 className={styles.sectionTitle}>Issues Detected</h4>
						{(selectedDrawing?.annotations.length ?? 0) === 0 ? (
							<div className={styles.successEmpty}>
								<CheckCircle className={styles.successIcon} />
								<p>No issues found! Drawing passes all checks.</p>
							</div>
						) : (
							<div className={styles.issueList}>
								{selectedDrawing?.annotations.map(
									(issue: Issue, index: number) => (
										<div
											key={`${issue.type}-${issue.severity}-${index}`}
											className={cn(
												styles.issueCard,
												severityCardClass[issue.severity],
											)}
										>
											<div className={styles.issueRow}>
												{issue.severity === "error" && (
													<XCircle className={severityIconClass.error} />
												)}
												{issue.severity === "warning" && (
													<AlertTriangle
														className={severityIconClass.warning}
													/>
												)}
												{issue.severity === "info" && (
													<FileText className={severityIconClass.info} />
												)}
												<div className={styles.fill}>
													<div className={styles.issueTopLine}>
														<span
															className={cn(
																styles.chip,
																severityChipClass[issue.severity],
															)}
														>
															{issue.severity}
														</span>
														<span className={styles.issueType}>
															{issue.type.replace("_", " ")}
														</span>
													</div>
													<p className={styles.issueMessage}>{issue.message}</p>
													{issue.location && (
														<p className={styles.issueLocation}>
															Location: {issue.location}
														</p>
													)}
												</div>
											</div>
										</div>
									),
								)}
							</div>
						)}
					</div>

					<div className={styles.actionRow}>
						<button className={styles.actionButton} type="button">
							<Download className={styles.iconSm} />
							<span>Export Report</span>
						</button>
						<button
							type="button"
							onClick={async () => {
								if (!selectedDrawing) return;
								await onRecheckDrawing(selectedDrawing.drawing_name);
								onClose();
							}}
							className={cn(styles.actionButton, styles.primaryButton)}
						>
							<Zap className={styles.iconSm} />
							<span>Re-check</span>
						</button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
