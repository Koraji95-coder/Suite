import {
	AlertTriangle,
	CheckCircle2,
	FilePlus2,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Panel } from "@/components/primitives/Panel";
import { Text } from "@/components/primitives/Text";
import type { Project, ProjectFile } from "./projectmanagertypes";
import styles from "./ProjectRevisionRegisterView.module.css";
import {
	type DrawingRevisionIssueStatus,
	type DrawingRevisionRegisterInput,
	type DrawingRevisionRegisterRow,
	type DrawingRevisionSeverity,
	type DrawingRevisionSourceKind,
	projectRevisionRegisterService,
} from "@/services/projectRevisionRegisterService";

interface ProjectRevisionRegisterViewProps {
	project: Project;
	files: ProjectFile[];
}

const STATUS_OPTIONS: DrawingRevisionIssueStatus[] = [
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

function buildDefaultForm(projectId: string): DrawingRevisionRegisterInput {
	return {
		projectId,
		fileId: null,
		drawingNumber: "",
		title: "",
		revision: "",
		previousRevision: "",
		issueSummary: "",
		issueStatus: "open",
		issueSeverity: "medium",
		sourceKind: "manual",
		sourceRef: "",
		autodraftRequestId: "",
		transmittalNumber: "",
		transmittalDocumentName: "",
		notes: "",
	};
}

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
	const { showToast } = useToast();
	const [entries, setEntries] = useState<DrawingRevisionRegisterRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [importing, setImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
	const [showForm, setShowForm] = useState(false);
	const [form, setForm] = useState<DrawingRevisionRegisterInput>(
		buildDefaultForm(project.id),
	);

	const loadEntries = useCallback(async () => {
		setLoading(true);
		const result = await projectRevisionRegisterService.fetchEntries(project.id);
		setEntries(result.data);
		setError(result.error ? result.error.message : null);
		setLoading(false);
	}, [project.id]);

	useEffect(() => {
		void loadEntries();
		setForm(buildDefaultForm(project.id));
		setEditingEntryId(null);
		setShowForm(false);
	}, [project.id, loadEntries]);

	const fileMap = useMemo(
		() => new Map(files.map((file) => [file.id, file])),
		[files],
	);
	const importDrafts = useMemo(
		() =>
			projectRevisionRegisterService.buildImportDrafts(project.id, files, entries),
		[entries, files, project.id],
	);
	const counts = useMemo(
		() => ({
			total: entries.length,
			open: entries.filter((entry) => entry.issue_status === "open").length,
			inReview: entries.filter((entry) => entry.issue_status === "in-review")
				.length,
			resolved: entries.filter((entry) => entry.issue_status === "resolved")
				.length,
		}),
		[entries],
	);

	const resetForm = () => {
		setForm(buildDefaultForm(project.id));
		setEditingEntryId(null);
	};

	const openCreateForm = () => {
		resetForm();
		setShowForm(true);
	};

	const openEditForm = (entry: DrawingRevisionRegisterRow) => {
		setForm({
			projectId: entry.project_id,
			fileId: entry.file_id,
			drawingNumber: entry.drawing_number,
			title: entry.title,
			revision: entry.revision,
			previousRevision: entry.previous_revision ?? "",
			issueSummary: entry.issue_summary,
			issueStatus: entry.issue_status as DrawingRevisionIssueStatus,
			issueSeverity: entry.issue_severity as DrawingRevisionSeverity,
			sourceKind: entry.source_kind as DrawingRevisionSourceKind,
			sourceRef: entry.source_ref ?? "",
			autodraftRequestId: entry.autodraft_request_id ?? "",
			transmittalNumber: entry.transmittal_number ?? "",
			transmittalDocumentName: entry.transmittal_document_name ?? "",
			notes: entry.notes ?? "",
		});
		setEditingEntryId(entry.id);
		setShowForm(true);
	};

	const handleSave = async () => {
		if (saving) return;
		if (!form.title?.trim() && !form.drawingNumber?.trim()) {
			showToast("error", "Provide a title or drawing number before saving.");
			return;
		}
		setSaving(true);
		const result = editingEntryId
			? await projectRevisionRegisterService.updateEntry(editingEntryId, form)
			: await projectRevisionRegisterService.createEntry(form);
		setSaving(false);
		if (!result) {
			showToast("error", "Unable to save revision register entry.");
			return;
		}
		setEntries((prev) => [
			result,
			...prev.filter((entry) => entry.id !== result.id),
		]);
		resetForm();
		setShowForm(false);
		showToast(
			"success",
			editingEntryId
				? "Updated revision register entry."
				: "Added revision register entry.",
		);
	};

	const handleDelete = async (entryId: string) => {
		const deleted = await projectRevisionRegisterService.deleteEntry(entryId);
		if (!deleted) {
			showToast("error", "Unable to delete revision register entry.");
			return;
		}
		setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
		if (editingEntryId === entryId) {
			resetForm();
			setShowForm(false);
		}
		showToast("success", "Removed revision register entry.");
	};

	const handleImportProjectFiles = async () => {
		if (importDrafts.length === 0 || importing) return;
		setImporting(true);
		const created: DrawingRevisionRegisterRow[] = [];
		for (const draft of importDrafts) {
			const row = await projectRevisionRegisterService.createEntry(draft);
			if (row) created.push(row);
		}
		setImporting(false);
		if (created.length === 0) {
			showToast("warning", "No new file rows were imported.");
			return;
		}
		setEntries((prev) => [...created, ...prev]);
		showToast(
			"success",
			`Imported ${created.length} file-backed revision row${created.length === 1 ? "" : "s"}.`,
		);
	};

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
							? "Importing…"
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
							onClick={() => {
								resetForm();
								setShowForm(false);
							}}
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
						<label className={styles.field}>
							<span className={styles.label}>Status</span>
							<select
								className={styles.select}
								value={form.issueStatus ?? "open"}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										issueStatus:
											event.target.value as DrawingRevisionIssueStatus,
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
							{saving ? "Saving…" : editingEntryId ? "Save changes" : "Add row"}
						</Button>
					</div>
				</Panel>
			) : null}

			{error ? <div className={styles.error}>{error}</div> : null}

			{loading ? (
				<div className={styles.emptyState}>Loading revision register…</div>
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
											onClick={() =>
												void projectRevisionRegisterService
													.updateEntry(entry.id, {
														issueStatus: isResolved ? "open" : "resolved",
													})
													.then((updated) => {
														if (!updated) return;
														setEntries((prev) =>
															prev.map((item) =>
																item.id === updated.id ? updated : item,
															),
														);
													})
											}
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
										<span className={styles.referenceLabel}>AutoDraft</span>
										<span>{entry.autodraft_request_id || "—"}</span>
									</div>
									<div className={styles.referenceCard}>
										<span className={styles.referenceLabel}>Transmittal</span>
										<span>{entry.transmittal_number || "—"}</span>
									</div>
									<div className={styles.referenceCard}>
										<span className={styles.referenceLabel}>Document</span>
										<span>{entry.transmittal_document_name || "—"}</span>
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
