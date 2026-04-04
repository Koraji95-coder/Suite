import {
	AlertTriangle,
	CheckCircle2,
	FilePlus2,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react";
import { Badge } from "@/components/system/base/Badge";
import { Button } from "@/components/system/base/Button";
import { Input } from "@/components/system/base/Input";
import { Panel } from "@/components/system/base/Panel";
import { Text } from "@/components/system/base/Text";
import {
	useProjectRevisionRegisterState,
} from "./useProjectRevisionRegisterState";
import type { Project, ProjectFile } from "@/features/project-core";
import type {
	DrawingRevisionIssueStatus as DrawingRevisionRegisterIssueStatus,
	DrawingRevisionSeverity,
	DrawingRevisionSourceKind,
} from "@/services/projectRevisionRegisterService";
import styles from "./ProjectRevisionRegisterView.module.css";

interface ProjectRevisionRegisterViewProps {
	project: Project;
	files: ProjectFile[];
}

const STATUS_OPTIONS: DrawingRevisionRegisterIssueStatus[] = [
	"open",
	"in-review",
	"resolved",
];
const SEVERITY_OPTIONS: DrawingRevisionSeverity[] = [
	"low",
	"medium",
	"high",
	"critical",
];
const SOURCE_OPTIONS: DrawingRevisionSourceKind[] = [
	"manual",
	"file",
	"autodraft",
	"transmittal",
];

function severityTone(
	severity: string | null | undefined,
): "default" | "warning" | "danger" | "accent" {
	switch (severity) {
		case "critical":
			return "danger";
		case "high":
			return "warning";
		case "low":
			return "default";
		default:
			return "accent";
	}
}

function statusTone(
	status: string | null | undefined,
): "default" | "warning" | "success" {
	switch (status) {
		case "resolved":
			return "success";
		case "in-review":
			return "warning";
		default:
			return "default";
	}
}

function formatTimestamp(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

export function ProjectRevisionRegisterView({
	project,
	files,
}: ProjectRevisionRegisterViewProps) {
	const {
		entries,
		loading,
		saving,
		importing,
		error,
		editingEntryId,
		showForm,
		form,
		setForm,
		fileMap,
		importDrafts,
		counts,
		openCreateForm,
		openEditForm,
		closeForm,
		handleSave,
		handleDelete,
		handleImportProjectFiles,
		toggleResolved,
	} = useProjectRevisionRegisterState({
		project,
		files,
	});

	return (
		<section className={styles.root}>
			<div className={styles.header}>
				<div>
					<Text size="sm" weight="semibold">
						Drawing issue and revision register
					</Text>
					<Text size="xs" color="muted">
						Track drawing changes, linked files, AutoDraft references, and
						transmittal context for this project.
					</Text>
					<Text size="xs" color="muted" className={styles.storageHint}>
						Persistence: Supabase-backed register rows linked to this project and
						its uploaded files.
					</Text>
				</div>
				<div className={styles.headerActions}>
					<Button
						variant="ghost"
						size="sm"
						iconRight={<FilePlus2 size={14} />}
						onClick={() => void handleImportProjectFiles()}
						disabled={importing || importDrafts.length === 0}
					>
						{importing
							? "Importing..."
							: `Import project files${
									importDrafts.length > 0 ? ` (${importDrafts.length})` : ""
								}`}
					</Button>
					<Button
						variant="primary"
						size="sm"
						iconRight={<Plus size={14} />}
						onClick={openCreateForm}
					>
						Add issue
					</Button>
				</div>
			</div>

			<div className={styles.statsGrid}>
				<div className={styles.statCard}>
					<div className={styles.statValue}>{counts.total}</div>
					<div className={styles.statLabel}>Tracked rows</div>
				</div>
				<div className={styles.statCard}>
					<div className={styles.statValue}>{counts.open}</div>
					<div className={styles.statLabel}>Open</div>
				</div>
				<div className={styles.statCard}>
					<div className={styles.statValue}>{counts.inReview}</div>
					<div className={styles.statLabel}>In review</div>
				</div>
				<div className={styles.statCard}>
					<div className={styles.statValue}>{counts.resolved}</div>
					<div className={styles.statLabel}>Resolved</div>
				</div>
			</div>

			{showForm ? (
				<Panel variant="default" padding="lg" className={styles.formPanel}>
					<div className={styles.formHeader}>
						<div>
							<Text size="sm" weight="semibold">
								{editingEntryId ? "Edit register row" : "New register row"}
							</Text>
							<Text size="xs" color="muted">
								Use file, AutoDraft, or transmittal references when they exist.
							</Text>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={closeForm}
						>
							Cancel
						</Button>
					</div>

					<div className={styles.formGrid}>
						<label className={styles.field}>
							<span className={styles.label}>Drawing number</span>
							<Input
								value={form.drawingNumber ?? ""}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										drawingNumber: event.target.value,
									}))
								}
								placeholder="R3P-XXX-E-GEN-001 A"
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Title</span>
							<Input
								value={form.title ?? ""}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, title: event.target.value }))
								}
								placeholder="Main one-line diagram"
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Revision</span>
							<Input
								value={form.revision ?? ""}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, revision: event.target.value }))
								}
								placeholder="B"
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Previous revision</span>
							<Input
								value={form.previousRevision ?? ""}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										previousRevision: event.target.value,
									}))
								}
								placeholder="A"
							/>
						</label>
						<label className={`${styles.field} ${styles.fieldWide}`}>
							<span className={styles.label}>Revision description</span>
							<Input
								value={form.revisionDescription ?? ""}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										revisionDescription: event.target.value,
									}))
								}
								placeholder="Issued for approval"
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Revision by</span>
							<Input
								value={form.revisionBy ?? ""}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										revisionBy: event.target.value,
									}))
								}
								placeholder="KE"
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Revision checked by</span>
							<Input
								value={form.revisionCheckedBy ?? ""}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										revisionCheckedBy: event.target.value,
									}))
								}
								placeholder="DW"
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Revision date</span>
							<Input
								type="date"
								value={form.revisionDate ?? ""}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										revisionDate: event.target.value,
									}))
								}
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Revision sort order</span>
							<Input
								type="number"
								value={String(form.revisionSortOrder ?? 0)}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										revisionSortOrder: Number(event.target.value || 0),
									}))
								}
								placeholder="0"
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Status</span>
							<select
								className={styles.select}
								value={form.issueStatus ?? "open"}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										issueStatus:
											event.target.value as DrawingRevisionRegisterIssueStatus,
									}))
								}
							>
								{STATUS_OPTIONS.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Severity</span>
							<select
								className={styles.select}
								value={form.issueSeverity ?? "medium"}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										issueSeverity:
											event.target.value as DrawingRevisionSeverity,
									}))
								}
							>
								{SEVERITY_OPTIONS.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Source</span>
							<select
								className={styles.select}
								value={form.sourceKind ?? "manual"}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										sourceKind:
											event.target.value as DrawingRevisionSourceKind,
									}))
								}
							>
								{SOURCE_OPTIONS.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Linked file</span>
							<select
								className={styles.select}
								value={form.fileId ?? ""}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										fileId: event.target.value || null,
									}))
								}
							>
								<option value="">No linked file</option>
								{files.map((file) => (
									<option key={file.id} value={file.id}>
										{file.name}
									</option>
								))}
							</select>
						</label>
						<label className={`${styles.field} ${styles.fieldWide}`}>
							<span className={styles.label}>Issue summary</span>
							<Input
								value={form.issueSummary ?? ""}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										issueSummary: event.target.value,
									}))
								}
								placeholder="Revision cloud added on feeder schematic."
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>AutoDraft request id</span>
							<Input
								value={form.autodraftRequestId ?? ""}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										autodraftRequestId: event.target.value,
									}))
								}
								placeholder="req-compare-001"
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Transmittal number</span>
							<Input
								value={form.transmittalNumber ?? ""}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										transmittalNumber: event.target.value,
									}))
								}
								placeholder="XMTL-001"
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Transmittal document</span>
							<Input
								value={form.transmittalDocumentName ?? ""}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										transmittalDocumentName: event.target.value,
									}))
								}
								placeholder="E1-100 feeder one-line"
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Source reference</span>
							<Input
								value={form.sourceRef ?? ""}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										sourceRef: event.target.value,
									}))
								}
								placeholder="path, note, or external reference"
							/>
						</label>
						<label className={`${styles.field} ${styles.fieldWide}`}>
							<span className={styles.label}>Notes</span>
							<textarea
								className={styles.textarea}
								value={form.notes ?? ""}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, notes: event.target.value }))
								}
								rows={4}
								placeholder="Resolution notes, reviewer comments, or follow-up actions."
							/>
						</label>
					</div>

					<div className={styles.formActions}>
						<Button
							variant="primary"
							size="sm"
							onClick={() => void handleSave()}
							disabled={saving}
						>
							{saving ? "Saving..." : editingEntryId ? "Save changes" : "Add row"}
						</Button>
					</div>
				</Panel>
			) : null}

			{error ? <div className={styles.error}>{error}</div> : null}

			{loading ? (
				<div className={styles.emptyState}>Loading revision register...</div>
			) : entries.length === 0 ? (
				<div className={styles.emptyState}>
					<AlertTriangle className={styles.emptyIcon} />
					<p className={styles.emptyTitle}>No revision rows yet</p>
					<p className={styles.emptyCopy}>
						Start manually or import project files to seed the register.
					</p>
				</div>
			) : (
				<div className={styles.entryList}>
					{entries.map((entry) => {
						const linkedFile =
							entry.file_id ? fileMap.get(entry.file_id) ?? null : null;
						const isResolved = entry.issue_status === "resolved";
						return (
							<Panel
								key={entry.id}
								variant="default"
								padding="lg"
								className={styles.entryCard}
							>
								<div className={styles.entryHeader}>
									<div>
										<div className={styles.entryTitleRow}>
											<Text size="sm" weight="semibold">
												{entry.title || entry.drawing_number || "Revision row"}
											</Text>
											<div className={styles.badgeRow}>
												<Badge
													color={statusTone(entry.issue_status)}
													variant="soft"
												>
													{entry.issue_status}
												</Badge>
												<Badge
													color={severityTone(entry.issue_severity)}
													variant="soft"
												>
													{entry.issue_severity}
												</Badge>
												<Badge color="primary" variant="soft">
													{entry.source_kind}
												</Badge>
											</div>
										</div>
										<div className={styles.entryMeta}>
											<span>{entry.drawing_number || "No drawing number"}</span>
											{entry.revision ? <span>Rev {entry.revision}</span> : null}
											{entry.previous_revision ? (
												<span>Prev {entry.previous_revision}</span>
											) : null}
											{entry.revision_date ? (
												<span>{entry.revision_date}</span>
											) : null}
											{linkedFile ? <span>{linkedFile.name}</span> : null}
										</div>
									</div>
									<div className={styles.entryActions}>
										<Button
											variant="ghost"
											size="sm"
											iconRight={<Pencil size={14} />}
											onClick={() => openEditForm(entry)}
										>
											Edit
										</Button>
										<Button
											variant="ghost"
											size="sm"
											iconRight={<CheckCircle2 size={14} />}
											onClick={() => void toggleResolved(entry)}
										>
											{isResolved ? "Reopen" : "Resolve"}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											iconRight={<Trash2 size={14} />}
											onClick={() => void handleDelete(entry.id)}
										>
											Delete
										</Button>
									</div>
								</div>

								<div className={styles.summary}>{entry.issue_summary}</div>

								<div className={styles.referenceGrid}>
									<div className={styles.referenceCard}>
										<span className={styles.referenceLabel}>Revision Note</span>
										<span>{entry.revision_description || "-"}</span>
									</div>
									<div className={styles.referenceCard}>
										<span className={styles.referenceLabel}>By / Checked</span>
										<span>
											{entry.revision_by || "-"} / {entry.revision_checked_by || "-"}
										</span>
									</div>
									<div className={styles.referenceCard}>
										<span className={styles.referenceLabel}>AutoDraft</span>
										<span>{entry.autodraft_request_id || "-"}</span>
									</div>
									<div className={styles.referenceCard}>
										<span className={styles.referenceLabel}>Transmittal</span>
										<span>{entry.transmittal_number || "-"}</span>
									</div>
									<div className={styles.referenceCard}>
										<span className={styles.referenceLabel}>Document</span>
										<span>{entry.transmittal_document_name || "-"}</span>
									</div>
									<div className={styles.referenceCard}>
										<span className={styles.referenceLabel}>Updated</span>
										<span>{formatTimestamp(entry.updated_at)}</span>
									</div>
								</div>

								{entry.notes ? (
									<div className={styles.notes}>{entry.notes}</div>
								) : null}
							</Panel>
						);
					})}
				</div>
			)}
		</section>
	);
}

