import type { WatchdogCollectorEvent } from "@/services/watchdogService";
import type {
	ProjectDrawingProgramChange,
	ProjectDrawingProgramFileAction,
	ProjectDrawingProgramPlan,
	ProjectDrawingProgramPlanMode,
	ProjectDrawingProgramRecord,
	ProjectDrawingProgramRow,
	ProjectDrawingRenumberChange,
	ProjectDrawingRenumberPlan,
} from "./types";
import {
	buildDrawingNumberPrefix,
	buildStructuredDrawingNumber,
	createId,
	formatSequenceBand,
	normalizeCatalogKey,
	normalizeText,
	nowIso,
	replaceDrawingNumberInRelativePath,
	sortRows,
} from "./validation";
import { buildWorkbookMirrorRows } from "./workbookParser";

export function buildRenumberPlan(
	projectId: string,
	beforeRows: ProjectDrawingProgramRow[],
	afterRows: ProjectDrawingProgramRow[],
): ProjectDrawingRenumberPlan | null {
	const changes: ProjectDrawingRenumberChange[] = [];
	const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
	for (const row of afterRows) {
		const current = beforeById.get(row.id);
		if (!current) {
			continue;
		}
		if (
			current.drawingNumber !== row.drawingNumber ||
			(current.dwgRelativePath || "") !== (row.dwgRelativePath || "")
		) {
			changes.push({
				rowId: row.id,
				oldDrawingNumber: current.drawingNumber,
				newDrawingNumber: row.drawingNumber,
				oldRelativePath: current.dwgRelativePath,
				newRelativePath: row.dwgRelativePath,
			});
		}
	}
	if (changes.length === 0) {
		return null;
	}
	return {
		id: createId("drawing-renumber"),
		projectId,
		createdAt: nowIso(),
		changes,
		warnings: [],
	} satisfies ProjectDrawingRenumberPlan;
}

export function parseSequenceBand(value: string | null | undefined) {
	const normalized = normalizeText(value);
	const match = normalized.match(/^(\d+)\s*-\s*(\d+)$/);
	if (!match) {
		return null;
	}
	return {
		start: Math.max(0, Number.parseInt(match[1], 10) || 0),
		end: Math.max(0, Number.parseInt(match[2], 10) || 0),
	};
}

function buildFamilyAllocationKey(row: ProjectDrawingProgramRow) {
	return [
		row.typeCode.toUpperCase(),
		normalizeCatalogKey(row.familyKey),
		row.sequenceBandStart,
		row.sequenceBandEnd,
		row.sequenceDigits,
	].join("::");
}

export function applyFamilyBandAllocation(args: {
	rows: ProjectDrawingProgramRow[];
	projectNumber: string;
}) {
	const inactiveRows: ProjectDrawingProgramRow[] = [];
	const grouped = new Map<string, ProjectDrawingProgramRow[]>();
	for (const row of sortRows(args.rows)) {
		if (row.status === "inactive") {
			inactiveRows.push({ ...row });
			continue;
		}
		const key = buildFamilyAllocationKey(row);
		const current = grouped.get(key) ?? [];
		current.push({ ...row });
		grouped.set(key, current);
	}
	const nextRows: ProjectDrawingProgramRow[] = [];
	for (const entries of grouped.values()) {
		const ordered = sortRows(entries);
		const exemplar = ordered[0];
		const availableSlots =
			exemplar.sequenceBandEnd - exemplar.sequenceBandStart + 1;
		if (ordered.length > availableSlots) {
			throw new Error(
				`${exemplar.sheetFamily} exceeds the ${formatSequenceBand(
					exemplar.sequenceBandStart,
					exemplar.sequenceBandEnd,
					exemplar.sequenceDigits,
				)} band. Remove or move drawings before adding more.`,
			);
		}
		ordered.forEach((entry, index) => {
			const sequenceNumber = exemplar.sequenceBandStart + index;
			const drawingNumber = buildStructuredDrawingNumber({
				projectNumber: args.projectNumber,
				typeCode: entry.typeCode,
				sequenceDigits: entry.sequenceDigits,
				sequenceNumber,
			});
			nextRows.push({
				...entry,
				numberPrefix: buildDrawingNumberPrefix(
					args.projectNumber,
					entry.typeCode,
				),
				sequenceNumber,
				drawingNumber,
				dwgRelativePath: replaceDrawingNumberInRelativePath(
					entry.dwgRelativePath,
					entry.drawingNumber,
					drawingNumber,
					entry.title,
				),
				updatedAt: nowIso(),
			});
		});
	}
	return sortRows([...nextRows, ...inactiveRows]).map((row, index) => ({
		...row,
		sortOrder: (index + 1) * 10,
	}));
}

export function buildPlanFromPrograms(args: {
	projectId: string;
	mode: ProjectDrawingProgramPlanMode;
	beforeProgram: ProjectDrawingProgramRecord;
	afterProgram: ProjectDrawingProgramRecord;
	extraWarnings?: string[];
}): ProjectDrawingProgramPlan {
	const { projectId, mode, beforeProgram, afterProgram } = args;
	const beforeRows = sortRows(beforeProgram.rows);
	const afterRows = sortRows(afterProgram.rows);
	const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
	const renumberPlan = buildRenumberPlan(projectId, beforeRows, afterRows);
	const changes: ProjectDrawingProgramChange[] = [];
	const fileActions: ProjectDrawingProgramFileAction[] = [];
	const warnings = [...(args.extraWarnings ?? [])];

	for (const row of afterRows) {
		const current = beforeById.get(row.id);
		if (!current) {
			changes.push({
				id: createId("drawing-plan-change"),
				rowId: row.id,
				type: "create",
				description: `Create ${row.drawingNumber} (${row.title}).`,
				before: "Not in program",
				after: `${row.drawingNumber} • ${row.title}`,
				blocked: false,
			});
			const blocked = !row.templatePath;
			if (blocked) {
				const reason = `Template path is missing for ${row.templateKey || row.sheetFamily}.`;
				warnings.push(reason);
				fileActions.push({
					id: createId("drawing-file-action"),
					rowId: row.id,
					kind: "skip-missing-template",
					fromRelativePath: null,
					toRelativePath: row.dwgRelativePath,
					templatePath: null,
					blocked: true,
					reason,
				});
			} else {
				fileActions.push({
					id: createId("drawing-file-action"),
					rowId: row.id,
					kind: "copy-template",
					fromRelativePath: null,
					toRelativePath: row.dwgRelativePath,
					templatePath: row.templatePath,
					blocked: false,
					reason: null,
				});
			}
			continue;
		}

		if (current.status !== row.status) {
			changes.push({
				id: createId("drawing-plan-change"),
				rowId: row.id,
				type: row.status === "inactive" ? "deactivate" : "status-update",
				description:
					row.status === "inactive"
						? `Deactivate ${row.drawingNumber}.`
						: `Update status for ${row.drawingNumber}.`,
				before: current.status,
				after: row.status,
				blocked: false,
			});
		}
		if (current.title !== row.title) {
			changes.push({
				id: createId("drawing-plan-change"),
				rowId: row.id,
				type: "title-update",
				description: `Update title for ${row.drawingNumber}.`,
				before: current.title,
				after: row.title,
				blocked: false,
			});
		}
		if (current.sortOrder !== row.sortOrder) {
			changes.push({
				id: createId("drawing-plan-change"),
				rowId: row.id,
				type: "reorder",
				description: `Move ${row.drawingNumber} within the ACADE stack.`,
				before: String(current.sortOrder),
				after: String(row.sortOrder),
				blocked: false,
			});
		}
		if (current.drawingNumber !== row.drawingNumber) {
			changes.push({
				id: createId("drawing-plan-change"),
				rowId: row.id,
				type: "renumber",
				description: `Renumber ${current.drawingNumber} to ${row.drawingNumber}.`,
				before: current.drawingNumber,
				after: row.drawingNumber,
				blocked: false,
			});
		}
		if (
			current.provisionState === "provisioned" &&
			current.dwgRelativePath &&
			row.dwgRelativePath &&
			current.dwgRelativePath !== row.dwgRelativePath
		) {
			fileActions.push({
				id: createId("drawing-file-action"),
				rowId: row.id,
				kind: "rename-dwg",
				fromRelativePath: current.dwgRelativePath,
				toRelativePath: row.dwgRelativePath,
				templatePath: null,
				blocked: false,
				reason: null,
			});
			changes.push({
				id: createId("drawing-plan-change"),
				rowId: row.id,
				type: "rename-file",
				description: `Rename ${current.dwgRelativePath} to ${row.dwgRelativePath}.`,
				before: current.dwgRelativePath,
				after: row.dwgRelativePath,
				blocked: false,
			});
		}
	}

	return {
		id: createId("drawing-program-plan"),
		projectId,
		mode,
		updatedProgram: {
			...afterProgram,
			acadeSyncPending: true,
			pendingTitleBlockSyncPaths: afterProgram.pendingTitleBlockSyncPaths ?? [],
			pendingTitleBlockSyncAt: afterProgram.pendingTitleBlockSyncAt ?? null,
			updatedAt: nowIso(),
		},
		renumberPlan,
		changes,
		fileActions,
		workbookRows: buildWorkbookMirrorRows(afterProgram),
		warnings: Array.from(new Set(warnings.filter(Boolean))),
		createdAt: nowIso(),
	} satisfies ProjectDrawingProgramPlan;
}

export function detectWorkbookDrift(
	program: ProjectDrawingProgramRecord | null,
	events: WatchdogCollectorEvent[],
) {
	if (!program?.workbookMirror.workbookRelativePath) {
		return null;
	}
	const workbookRelativePath = program.workbookMirror.workbookRelativePath
		.replace(/\\/g, "/")
		.toLowerCase();
	const workbookFileName =
		workbookRelativePath.split("/").pop() || workbookRelativePath;
	const latestEvent = [...events]
		.filter((event) => {
			const path = normalizeText(event.path).replace(/\\/g, "/").toLowerCase();
			const drawingPath = normalizeText(event.drawingPath)
				.replace(/\\/g, "/")
				.toLowerCase();
			return (
				path.endsWith(workbookRelativePath) ||
				path.endsWith(workbookFileName) ||
				drawingPath.endsWith(workbookRelativePath)
			);
		})
		.sort((left, right) => right.timestamp - left.timestamp)[0];
	return latestEvent ?? null;
}
