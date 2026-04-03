import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import type { Project, ProjectFile } from "@/features/project-core";
import {
	type DrawingRevisionRegisterInput,
	type DrawingRevisionIssueStatus,
	type DrawingRevisionRegisterRow,
	type DrawingRevisionSeverity,
	type DrawingRevisionSourceKind,
	projectRevisionRegisterService,
} from "@/services/projectRevisionRegisterService";

export interface UseProjectRevisionRegisterStateArgs {
	project: Project;
	files: ProjectFile[];
}

export function buildDefaultRevisionRegisterForm(
	projectId: string,
): DrawingRevisionRegisterInput {
	return {
		projectId,
		fileId: null,
		drawingNumber: "",
		title: "",
		revision: "",
		previousRevision: "",
		revisionDescription: "",
		revisionBy: "",
		revisionCheckedBy: "",
		revisionDate: "",
		revisionSortOrder: 0,
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

export function useProjectRevisionRegisterState({
	project,
	files,
}: UseProjectRevisionRegisterStateArgs) {
	const { showToast } = useToast();
	const [entries, setEntries] = useState<DrawingRevisionRegisterRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [importing, setImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
	const [showForm, setShowForm] = useState(false);
	const [form, setForm] = useState<DrawingRevisionRegisterInput>(
		buildDefaultRevisionRegisterForm(project.id),
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
		setForm(buildDefaultRevisionRegisterForm(project.id));
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
		setForm(buildDefaultRevisionRegisterForm(project.id));
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
			revisionDescription: entry.revision_description ?? "",
			revisionBy: entry.revision_by ?? "",
			revisionCheckedBy: entry.revision_checked_by ?? "",
			revisionDate: entry.revision_date ?? "",
			revisionSortOrder: entry.revision_sort_order ?? 0,
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

	const closeForm = () => {
		resetForm();
		setShowForm(false);
	};

	const handleSave = async () => {
		if (saving) {
			return;
		}
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

		setEntries((previous) => [
			result,
			...previous.filter((entry) => entry.id !== result.id),
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
		setEntries((previous) =>
			previous.filter((entry) => entry.id !== entryId),
		);
		if (editingEntryId === entryId) {
			resetForm();
			setShowForm(false);
		}
		showToast("success", "Removed revision register entry.");
	};

	const handleImportProjectFiles = async () => {
		if (importDrafts.length === 0 || importing) {
			return;
		}
		setImporting(true);
		const created: DrawingRevisionRegisterRow[] = [];
		for (const draft of importDrafts) {
			const row = await projectRevisionRegisterService.createEntry(draft);
			if (row) {
				created.push(row);
			}
		}
		setImporting(false);
		if (created.length === 0) {
			showToast("warning", "No new file rows were imported.");
			return;
		}
		setEntries((previous) => [...created, ...previous]);
		showToast(
			"success",
			`Imported ${created.length} file-backed revision row${created.length === 1 ? "" : "s"}.`,
		);
	};

	const toggleResolved = async (entry: DrawingRevisionRegisterRow) => {
		const updated = await projectRevisionRegisterService.updateEntry(entry.id, {
			issueStatus: entry.issue_status === "resolved" ? "open" : "resolved",
		});
		if (!updated) {
			showToast("error", "Unable to update revision register entry.");
			return;
		}
		setEntries((previous) =>
			previous.map((item) => (item.id === updated.id ? updated : item)),
		);
	};

	return {
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
	};
}
