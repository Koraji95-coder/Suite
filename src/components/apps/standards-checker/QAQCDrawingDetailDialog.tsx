import {
	AlertTriangle,
	CheckCircle,
	Download,
	FileText,
	XCircle,
	Zap,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/apps/ui/dialog";
import { QAQCStatusIcon } from "./QAQCStatusIcon";
import type { DrawingAnnotation, Issue } from "./qaqcModels";
import { getSeverityColor } from "./qaqcUi";

interface QAQCDrawingDetailDialogProps {
	selectedDrawing: DrawingAnnotation | null;
	onClose: () => void;
	onRecheckDrawing: (drawingName: string) => Promise<void>;
}

export function QAQCDrawingDetailDialog({
	selectedDrawing,
	onClose,
	onRecheckDrawing,
}: QAQCDrawingDetailDialogProps) {
	return (
		<Dialog
			open={Boolean(selectedDrawing)}
			onOpenChange={(open) => !open && onClose()}
		>
			<DialogContent className="max-h-[90vh] max-w-4xl overflow-auto border-[color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--surface)] p-0">
				<div className="sticky top-0 z-10 flex items-center justify-between border-b [border-color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--surface)] p-6 backdrop-blur-sm">
					<div className="flex items-center space-x-3">
						<QAQCStatusIcon status={selectedDrawing?.qa_status ?? "pending"} />
						<div>
							<h3 className="text-2xl font-bold [color:var(--text)]">
								{selectedDrawing?.drawing_name}
							</h3>
							<p className="[color:var(--text-muted)] text-sm">
								Checked on{" "}
								{selectedDrawing?.checked_at
									? new Date(selectedDrawing.checked_at).toLocaleString()
									: "N/A"}
							</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className="p-2 hover:[background:color-mix(in_srgb,var(--danger)_20%,var(--surface))] rounded-lg transition-all"
					>
						<span className="[color:var(--danger)] text-2xl">×</span>
					</button>
				</div>

				<div className="p-6 space-y-6">
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<div className="rounded-lg border [border-color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--surface-2)] p-4 text-center">
							<div className="text-3xl font-bold [color:var(--text)]">
								{selectedDrawing?.issues_found ?? 0}
							</div>
							<div className="[color:var(--text-muted)] text-sm mt-1">
								Issues Found
							</div>
						</div>
						<div className="rounded-lg border [border-color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--surface-2)] p-4 text-center">
							<div className="text-3xl font-bold [color:var(--text)] capitalize">
								{selectedDrawing?.qa_status}
							</div>
							<div className="[color:var(--text-muted)] text-sm mt-1">
								Status
							</div>
						</div>
						<div className="rounded-lg border [border-color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--surface-2)] p-4 text-center">
							<div className="text-3xl font-bold [color:var(--text)]">
								{selectedDrawing?.rules_applied.length ?? 0}
							</div>
							<div className="[color:var(--text-muted)] text-sm mt-1">
								Rules Applied
							</div>
						</div>
					</div>

					<div>
						<h4 className="text-lg font-bold [color:var(--text)] mb-3">
							Issues Detected
						</h4>
						{(selectedDrawing?.annotations.length ?? 0) === 0 ? (
							<div className="[background:color-mix(in_srgb,var(--success)_10%,var(--surface))] border [border-color:color-mix(in_srgb,var(--success)_30%,transparent)] rounded-lg p-4 text-center">
								<CheckCircle className="w-12 h-12 [color:var(--success)] mx-auto mb-2" />
								<p className="[color:var(--text-muted)]">
									No issues found! Drawing passes all checks.
								</p>
							</div>
						) : (
							<div className="space-y-3">
								{selectedDrawing?.annotations.map(
									(issue: Issue, index: number) => (
										<div
											key={`${issue.type}-${issue.severity}-${index}`}
											className={`rounded-lg border bg-[var(--surface-2)] p-4 ${
												issue.severity === "error"
													? "[border-color:color-mix(in_srgb,var(--danger)_40%,transparent)]"
													: issue.severity === "warning"
														? "[border-color:color-mix(in_srgb,var(--warning)_40%,transparent)]"
														: "[border-color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
											}`}
										>
											<div className="flex items-start space-x-3">
												{issue.severity === "error" && (
													<XCircle className="w-5 h-5 [color:var(--danger)] flex-shrink-0 mt-0.5" />
												)}
												{issue.severity === "warning" && (
													<AlertTriangle className="w-5 h-5 [color:var(--warning)] flex-shrink-0 mt-0.5" />
												)}
												{issue.severity === "info" && (
													<FileText className="w-5 h-5 [color:var(--accent)] flex-shrink-0 mt-0.5" />
												)}
												<div className="flex-1">
													<div className="flex items-center space-x-2 mb-1">
														<span
															className={`text-xs px-2 py-1 rounded-full border capitalize ${getSeverityColor(issue.severity)}`}
														>
															{issue.severity}
														</span>
														<span className="text-xs [color:var(--text-muted)] capitalize">
															{issue.type.replace("_", " ")}
														</span>
													</div>
													<p className="[color:var(--text)]">{issue.message}</p>
													{issue.location && (
														<p className="[color:var(--text-muted)] text-sm mt-1">
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

					<div className="flex gap-3">
						<button className="flex-1 [background:color-mix(in_srgb,var(--success)_20%,var(--surface))] hover:[background:color-mix(in_srgb,var(--success)_30%,var(--surface))] border [border-color:color-mix(in_srgb,var(--success)_40%,transparent)] [color:var(--text)] px-6 py-3 rounded-lg transition-all flex items-center justify-center space-x-2">
							<Download className="w-5 h-5" />
							<span>Export Report</span>
						</button>
						<button
							onClick={async () => {
								if (!selectedDrawing) return;
								await onRecheckDrawing(selectedDrawing.drawing_name);
								onClose();
							}}
							className="[background:var(--success)] hover:opacity-90 [color:var(--text)] px-6 py-3 rounded-lg transition-all flex items-center space-x-2"
						>
							<Zap className="w-5 h-5" />
							<span>Re-check</span>
						</button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
