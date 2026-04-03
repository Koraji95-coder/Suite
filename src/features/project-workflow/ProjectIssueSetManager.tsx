import {
	ClipboardCheck,
	Download,
	FileCheck2,
	FilePenLine,
	ShieldCheck,
	Trash2,
	Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";
import { TrustStateBadge } from "@/components/apps/ui/TrustStateBadge";
import { useToast } from "@/components/notification-system/ToastProvider";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Input, TextArea } from "@/components/primitives/Input";
import { Panel } from "@/components/primitives/Panel";
import {
	type ProjectIssueSetStatus,
	formatProjectIssueSetRelativeDate as formatRelativeDate,
	formatProjectIssueSetTimestamp as formatTimestamp,
} from "@/features/project-workflow";
import { useProjectIssueSetManagerState } from "./useProjectIssueSetManagerState";
import { cn } from "@/lib/utils";
import { buildWatchdogHref } from "@/lib/watchdogNavigation";
import styles from "./ProjectIssueSetManager.module.css";
import type { Project, ViewMode } from "@/features/project-core";
import type { ProjectWatchdogTelemetry } from "@/features/project-watchdog";

const ISSUE_SET_STATUS_OPTIONS: ProjectIssueSetStatus[] = [
	"draft",
	"review",
	"ready",
	"issued",
];

interface ProjectIssueSetManagerProps {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	preferredIssueSetId?: string | null;
	onIssueSetContextChange?: (issueSetId: string | null) => void;
	onOpenViewMode: (mode: ViewMode) => void;
}
function statusTone(
	status: ProjectIssueSetStatus,
): "default" | "warning" | "success" | "accent" {
	switch (status) {
		case "issued":
			return "success";
		case "ready":
			return "accent";
		case "review":
			return "warning";
		default:
			return "default";
	}
}

export function ProjectIssueSetManager({
	project,
	telemetry,
	preferredIssueSetId,
	onIssueSetContextChange,
	onOpenViewMode,
}: ProjectIssueSetManagerProps) {
	const { showToast } = useToast();
	const {
		state,
		editingIssueSetId,
		expandedIssueSetId,
		setExpandedIssueSetId,
		showForm,
		form,
		setForm,
		activeIssueSetContextId,
		currentSnapshot,
		currentSnapshotState,
		availableDrawingRows,
		availableRegisterRows,
		hasRegisterRows,
		packagePathSummary,
		summaryNote,
		drawingListHref,
		standardsHref,
		transmittalHref,
		issueSetEvidencePackets,
		openDraftFromCurrentProject,
		openEditIssueSet,
		closeForm,
		toggleSelectedDrawing,
		toggleSelectedRegisterRow,
		handleSave,
		handleDelete,
		handleMarkIssued,
		exportEvidencePacket,
	} = useProjectIssueSetManagerState({
		project,
		telemetry,
		preferredIssueSetId,
		onIssueSetContextChange,
		showToast,
	});
	return (
		<section className={styles.root}>
			<div className={styles.header}>
				<div className={styles.headerCopy}>
					<p className={styles.eyebrow}>Issue package workflow</p>
					<h4 className={styles.title}>Issue set manager</h4>
					<p className={styles.description}>
						Capture the current package, then track what was ready, selected,
						and issued without leaving the project.
					</p>
				</div>
				<TrustStateBadge state={currentSnapshotState} />
			</div>

			<Panel variant="feature" padding="lg" className={styles.summaryPanel}>
				<div className={styles.summaryTop}>
					<div className={styles.summaryMain}>
						<div className={styles.summaryHeader}>
							<div className={styles.summaryIconShell}>
								<ClipboardCheck className={styles.summaryIcon} />
							</div>
							<div>
								<h5 className={styles.summaryTitle}>Current package snapshot</h5>
								<p className={styles.summaryText}>{packagePathSummary}</p>
							</div>
						</div>
						<div className={styles.summaryFacts}>
							<div className={styles.summaryFact}>
								<span className={styles.summaryFactLabel}>Review blockers</span>
								<span className={styles.summaryFactValue}>
									{currentSnapshot.reviewItemCount} open in this package window
								</span>
							</div>
							<div className={styles.summaryFact}>
								<span className={styles.summaryFactLabel}>Saved issue sets</span>
								<span className={styles.summaryFactValue}>
									{state.issueSets.length} captured so far
								</span>
							</div>
						</div>
						<p className={styles.summaryNote}>{summaryNote}</p>
					</div>
					<div className={styles.summaryActions}>
						<Button
							variant="primary"
							size="md"
							iconRight={<ClipboardCheck size={16} />}
							onClick={openDraftFromCurrentProject}
						>
							Create draft from current project
						</Button>
						<div className={styles.utilityLinks}>
							<Link to={drawingListHref} className={styles.utilityLink}>
								<FileCheck2 className={styles.linkIcon} />
								<span>Title block review</span>
							</Link>
							<Link to={standardsHref} className={styles.utilityLink}>
								<ShieldCheck className={styles.linkIcon} />
								<span>Standards Checker</span>
							</Link>
							<Link to={transmittalHref} className={styles.utilityLink}>
								<Workflow className={styles.linkIcon} />
								<span>Transmittal Builder</span>
							</Link>
							<Link
								to={buildWatchdogHref(project.id, activeIssueSetContextId)}
								className={styles.utilityLink}
							>
								<FileCheck2 className={styles.linkIcon} />
								<span>Watchdog</span>
							</Link>
							<button
								type="button"
								className={styles.utilityButton}
								onClick={() => onOpenViewMode("revisions")}
							>
								<FilePenLine className={styles.linkIcon} />
								<span>Revisions</span>
							</button>
						</div>
					</div>
				</div>

				<div className={styles.workflowDivider} />

				<div className={styles.issueSetHeader}>
					<div>
						<h5 className={styles.issueSetTitle}>Saved issue sets</h5>
						<p className={styles.issueSetCopy}>
							Each saved issue set keeps a snapshot of what was selected and how
							ready the project was at that moment.
						</p>
					</div>
					<Badge color="accent" variant="soft">
						{state.issueSets.length} total
					</Badge>
				</div>

				{state.loading ? (
					<div className={styles.emptyState}>Loading issue sets...</div>
				) : state.issueSets.length === 0 ? (
					<div className={styles.emptyState}>
						No issue sets saved yet. Create the first package draft from the
						current project state.
					</div>
				) : (
				<div className={styles.issueSetList}>
						{state.issueSets.map((issueSet) => {
							const packet = issueSetEvidencePackets.get(issueSet.id) ?? null;
							const isExpanded = expandedIssueSetId === issueSet.id;
							const linkedReceipt = packet?.transmittal.linkedReceipt ?? null;
							const receiptSummary = linkedReceipt
								? linkedReceipt.transmittalNumber || "Linked receipt"
								: issueSet.transmittalNumber || "Not linked";
							const selectedDrawingSummary = packet
								? packet.selectedDrawings
										.slice(0, 3)
										.map(
											(drawing) => drawing.drawingNumber || drawing.fileName,
										)
										.join(", ")
								: "";
							const watchdogSummary = packet?.watchdog.drawings[0]
								? `${packet.watchdog.matchedTrackedCount} tracked drawing${
										packet.watchdog.matchedTrackedCount === 1 ? "" : "s"
								  } â€¢ last worked ${formatTimestamp(
										packet.watchdog.drawings[0].lastWorkedAt,
								  )}`
								: "No tracked drawing history yet";
							const selectedRegisterCount =
								issueSet.selectedRegisterRowIds?.length ?? 0;
							const selectedPdfCount = issueSet.selectedPdfFileIds?.length ?? 0;

							return (
								<div key={issueSet.id} className={styles.issueSetCard}>
									<div className={styles.issueSetCardHeader}>
										<div>
											<div className={styles.issueSetTitleRow}>
												<h6 className={styles.issueSetCardTitle}>
													{issueSet.name}
												</h6>
												<div className={styles.badgeRow}>
													<Badge
														color={statusTone(issueSet.status)}
														variant="soft"
													>
														{issueSet.status}
													</Badge>
													<Badge color="accent" variant="soft">
														{issueSet.issueTag}
													</Badge>
												</div>
											</div>
											<p className={styles.issueSetMeta}>
												Target {formatRelativeDate(issueSet.targetDate)} â€¢
												Updated {formatTimestamp(issueSet.updatedAt)}
												{issueSet.issuedAt
													? ` â€¢ Issued ${formatTimestamp(issueSet.issuedAt)}`
													: ""}
											</p>
										</div>
										<div className={styles.issueSetActions}>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => openEditIssueSet(issueSet)}
											>
												Edit
											</Button>
											{issueSet.status !== "issued" ? (
												<Button
													variant="ghost"
													size="sm"
													onClick={() => {
														void handleMarkIssued(issueSet);
													}}
												>
													Mark issued
												</Button>
											) : null}
											<Button
												variant="ghost"
												size="sm"
												iconRight={<Trash2 size={14} />}
												onClick={() => {
													void handleDelete(issueSet.id);
												}}
											>
												Delete
											</Button>
										</div>
									</div>

									<p className={styles.issueSetSummary}>
										{issueSet.summary || "No summary recorded."}
									</p>

									<div className={styles.issueSetFactRow}>
										<span className={styles.issueSetFact}>
											<strong>
												{selectedRegisterCount ||
													issueSet.snapshot.selectedDrawingCount}
											</strong>{" "}
											{selectedRegisterCount ? "register row" : "drawing"}
											{(selectedRegisterCount ||
												issueSet.snapshot.selectedDrawingCount) === 1
												? ""
												: "s"}
										</span>
										<span className={styles.issueSetFact}>
											<strong>{issueSet.snapshot.reviewItemCount}</strong>{" "}
											blocker{issueSet.snapshot.reviewItemCount === 1 ? "" : "s"}
										</span>
										<span className={styles.issueSetFact}>
											<strong>
												{selectedPdfCount > 0 ? selectedPdfCount : receiptSummary}
											</strong>{" "}
											{selectedPdfCount > 0 ? "PDFs" : "receipt"}
										</span>
									</div>

									{packet ? (
										<p className={styles.issueSetEvidenceSummary}>
											<span>
												<strong>Title block review</strong>{" "}
												{packet.reviewDecisions.acceptedTitleBlockCount > 0
													? `${packet.reviewDecisions.acceptedTitleBlockCount} accepted â€¢ `
													: ""}
												{packet.titleBlock.needsReviewCount > 0
													? `${packet.titleBlock.needsReviewCount} need review`
													: `${packet.titleBlock.readyCount} ready`}
												{packet.titleBlock.fallbackCount > 0
													? ` â€¢ ${packet.titleBlock.fallbackCount} fallback`
													: ""}
											</span>
											<span>
												<strong>Standards</strong>{" "}
												{packet.standards.nativeReview.hasReview ||
												packet.standards.matchedDrawingCount > 0
													? `${
															packet.reviewDecisions.waivedStandardsCount > 0
																? `${packet.reviewDecisions.waivedStandardsCount} waived â€¢ `
																: ""
														}${
															packet.standards.nativeReview.hasReview
																? `native ${packet.standards.nativeReview.overallStatus} â€¢ `
																: ""
														}${packet.standards.passCount} pass â€¢ ${packet.standards.warningCount} warn â€¢ ${packet.standards.failCount} fail`
													: "No linked checks yet"}
											</span>
											<span>
												<strong>Transmittal</strong>{" "}
												{linkedReceipt
													? `${receiptSummary} â€¢ ${linkedReceipt.outputs.length} output${
															linkedReceipt.outputs.length === 1 ? "" : "s"
														}`
													: issueSet.transmittalDocumentName
														? `Manual reference â€¢ ${issueSet.transmittalDocumentName}`
														: "No linked receipt yet"}
											</span>
											<span>
												<strong>Automation</strong>{" "}
												{packet.automation.latestReceipt
													? `${packet.automation.linkedReceiptCount} receipt${
															packet.automation.linkedReceiptCount === 1
																? ""
																: "s"
														} â€¢ ${packet.automation.latestReceipt.mode} mode`
													: "No automation receipt yet"}
											</span>
											<span>
												<strong>Watchdog</strong>{" "}
												{packet.watchdog.matchedTrackedCount > 0
													? `${packet.watchdog.matchedTrackedCount} tracked drawing${
															packet.watchdog.matchedTrackedCount === 1 ? "" : "s"
														}`
													: "No tracked drawing history yet"}
											</span>
										</p>
									) : null}

									{issueSet.notes ? (
										<div className={styles.issueSetNotes}>{issueSet.notes}</div>
									) : null}
									{packet && isExpanded ? (
										<div className={styles.issueSetDetailPanel}>
											<div className={styles.issueSetDetailRow}>
												<span className={styles.issueSetDetailLabel}>
													Package scope
												</span>
												<span className={styles.issueSetDetailValue}>
													{selectedRegisterCount > 0
														? `${selectedRegisterCount} workbook row${
																selectedRegisterCount === 1 ? "" : "s"
														  } â€¢ ${selectedPdfCount} paired PDF${
																selectedPdfCount === 1 ? "" : "s"
														  }${selectedDrawingSummary ? ` â€¢ ${selectedDrawingSummary}` : ""}`
														: selectedDrawingSummary ||
														"No selected drawings captured."}
												</span>
											</div>
											<div className={styles.issueSetDetailRow}>
												<span className={styles.issueSetDetailLabel}>
													Title block review
												</span>
												<span className={styles.issueSetDetailValue}>
													{packet.titleBlock.readyCount} ready â€¢{" "}
													{packet.titleBlock.needsReviewCount} need review â€¢{" "}
													{packet.reviewDecisions.acceptedTitleBlockCount} accepted
												</span>
											</div>
											<div className={styles.issueSetDetailRow}>
												<span className={styles.issueSetDetailLabel}>
													Standards
												</span>
												<span className={styles.issueSetDetailValue}>
													{packet.standards.nativeReview.hasReview
														? `native ${packet.standards.nativeReview.overallStatus} â€¢ ${packet.standards.nativeReview.inspectedDrawingCount} inspected â€¢ `
														: ""}
													{packet.standards.passCount} pass â€¢{" "}
													{packet.standards.warningCount} warn â€¢{" "}
													{packet.standards.failCount} fail â€¢{" "}
													{packet.reviewDecisions.waivedStandardsCount} waived
												</span>
											</div>
											<div className={styles.issueSetDetailRow}>
												<span className={styles.issueSetDetailLabel}>
													Transmittal
												</span>
												<span className={styles.issueSetDetailValue}>
													{linkedReceipt
														? `${receiptSummary} â€¢ ${
																linkedReceipt.outputs.length
														  } output${
																linkedReceipt.outputs.length === 1 ? "" : "s"
														  }`
														: issueSet.transmittalDocumentName ||
															"No linked receipt yet"}
												</span>
											</div>
											<div className={styles.issueSetDetailRow}>
												<span className={styles.issueSetDetailLabel}>
													Automation
												</span>
												<span className={styles.issueSetDetailValue}>
													{packet.automation.latestReceipt
														? `${packet.automation.linkedReceiptCount} receipt${
																packet.automation.linkedReceiptCount === 1
																	? ""
																	: "s"
														  } â€¢ ${
																packet.automation.latestReceipt.mode
														  } mode â€¢ ${
																packet.automation.latestReceipt.affectedDrawingCount
														  } affected drawing${
																packet.automation.latestReceipt
																	.affectedDrawingCount === 1
																	? ""
																	: "s"
														  }`
														: "No linked automation receipt yet"}
												</span>
											</div>
											<div className={styles.issueSetDetailRow}>
												<span className={styles.issueSetDetailLabel}>
													Watchdog
												</span>
												<span className={styles.issueSetDetailValue}>
													{watchdogSummary}
												</span>
											</div>
										</div>
									) : null}
									<div className={styles.issueSetFooterActions}>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												onIssueSetContextChange?.(issueSet.id);
												setExpandedIssueSetId((current) =>
													current === issueSet.id ? null : issueSet.id,
												);
											}}
										>
											{isExpanded ? "Hide details" : "View details"}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											iconRight={<Download size={14} />}
											onClick={() => exportEvidencePacket(issueSet, "md")}
										>
											Export packet
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => exportEvidencePacket(issueSet, "json")}
										>
											Export JSON
										</Button>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</Panel>

			{showForm ? (
				<Panel variant="support" padding="lg" className={styles.formPanel}>
					<div className={styles.formHeader}>
						<div>
							<h5 className={styles.formTitle}>
								{editingIssueSetId ? "Edit issue set" : "New issue set"}
							</h5>
							<p className={styles.formCopy}>
								Save the package snapshot now, then refine standards,
								transmittal, and issuance details as the project closes review
								items.
							</p>
						</div>
						<Button variant="ghost" size="sm" onClick={closeForm}>
							Cancel
						</Button>
					</div>

					<div className={styles.formGrid}>
						<Input
							label="Issue set name"
							value={form.name}
							onChange={(event) =>
								setForm((current) => ({ ...current, name: event.target.value }))
							}
							placeholder="Nanulak IFC package"
						/>
						<Input
							label="Issue tag"
							value={form.issueTag}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									issueTag: event.target.value,
								}))
							}
							placeholder="IFC-01"
						/>
						<Input
							label="Target date"
							type="date"
							value={form.targetDate}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									targetDate: event.target.value,
								}))
							}
						/>
						<label className={styles.field}>
							<span className={styles.label}>Status</span>
							<select
								className={styles.select}
								value={form.status}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										status: event.target.value as ProjectIssueSetStatus,
									}))
								}
							>
								{ISSUE_SET_STATUS_OPTIONS.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
						</label>
						<Input
							label="Transmittal number"
							value={form.transmittalNumber}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									transmittalNumber: event.target.value,
								}))
							}
							placeholder="XMTL-001"
						/>
						<Input
							label="Transmittal document"
							value={form.transmittalDocumentName}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									transmittalDocumentName: event.target.value,
								}))
							}
							placeholder="Issued package cover sheet"
						/>
						<div className={cn(styles.fieldWide, styles.selectedSummary)}>
							<div className={styles.selectedSummaryHeader}>
								<span className={styles.label}>
									{hasRegisterRows ? "Included register rows" : "Included drawings"}
								</span>
								<Badge color="accent" variant="soft">
									{hasRegisterRows
										? form.selectedRegisterRowIds.length
										: form.selectedDrawingPaths.length} selected
								</Badge>
							</div>
							{hasRegisterRows ? (
								<>
									<p className={styles.inlineHint}>
										Build the package from workbook rows first. Suite will carry
										the paired PDFs, DWG paths, and drawing numbers forward into
										the issue set.
									</p>
									<div className={styles.checkboxGrid}>
										{availableRegisterRows.map((row) => (
											<label
												key={row.id}
												className={styles.checkboxRow}
												htmlFor={`issue-set-register-${row.id}`}
											>
												<input
													id={`issue-set-register-${row.id}`}
													type="checkbox"
													checked={form.selectedRegisterRowIds.includes(row.id)}
													onChange={() => toggleSelectedRegisterRow(row)}
												/>
												<span>
													<strong>{row.drawingNumber}</strong>
													{" â€¢ "}
													{row.drawingDescription || "No drawing description"}
													{row.currentRevision
														? ` â€¢ Rev ${row.currentRevision}`
														: ""}
													{" â€¢ "}
													{row.pdfPairingStatus === "paired" ||
													row.pdfPairingStatus === "manual"
														? "PDF paired"
														: row.pdfPairingStatus === "multiple"
															? "Resolve PDF match"
															: "Missing PDF"}
												</span>
											</label>
										))}
									</div>
								</>
							) : availableDrawingRows.length === 0 ? (
								<p className={styles.inlineHint}>
									Run the drawing scan first to select package drawings.
								</p>
							) : (
								<div className={styles.checkboxGrid}>
									{availableDrawingRows.map((row) => (
										<label
											key={row.id}
											className={styles.checkboxRow}
											htmlFor={`issue-set-drawing-${row.id}`}
										>
											<input
												id={`issue-set-drawing-${row.id}`}
												type="checkbox"
												checked={form.selectedDrawingPaths.includes(
													row.relativePath,
												)}
												onChange={() => toggleSelectedDrawing(row.relativePath)}
											/>
											<span>{row.fileName}</span>
										</label>
									))}
								</div>
							)}
						</div>
						<div className={styles.fieldWide}>
							<TextArea
								label="Summary"
								minRows={3}
								value={form.summary}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										summary: event.target.value,
									}))
								}
								placeholder="What this package is for and what still needs review."
							/>
						</div>
						<div className={styles.fieldWide}>
							<TextArea
								label="Notes"
								minRows={4}
								value={form.notes}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										notes: event.target.value,
									}))
								}
								placeholder="Customer issue notes, package caveats, or follow-up tasks."
							/>
						</div>
					</div>

					<div className={styles.formActions}>
						<Button
							variant="primary"
							size="sm"
							loading={state.saving}
							onClick={() => {
								void handleSave();
							}}
						>
							{editingIssueSetId ? "Save issue set" : "Create issue set"}
						</Button>
					</div>
				</Panel>
			) : null}

			{state.messages.length > 0 ? (
				<div className={styles.noticeList}>
					{state.messages.map((message) => (
						<p key={message} className={styles.notice}>
							{message}
						</p>
					))}
				</div>
			) : null}
		</section>
	);
}




