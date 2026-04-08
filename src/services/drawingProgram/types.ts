export type ProjectDrawingProgramRowStatus =
	| "planned"
	| "active"
	| "on-hold"
	| "inactive";

export type ProjectDrawingProvisionState =
	| "planned"
	| "provisioned"
	| "blocked"
	| "inactive";

export type ProjectDrawingProgramPlanMode =
	| "bootstrap"
	| "insert"
	| "deactivate"
	| "workbook-reconcile"
	| "acade-sync";

export type ProjectDrawingProgramChangeType =
	| "create"
	| "renumber"
	| "rename-file"
	| "title-update"
	| "status-update"
	| "reorder"
	| "deactivate"
	| "warning";

export type ProjectDrawingProgramFileActionKind =
	| "copy-template"
	| "rename-dwg"
	| "skip-missing-template";

export type ProjectDrawingStandardSource = "builtin" | "project-import";

export interface ProjectDrawingTemplateMapping {
	id: string;
	templateKey: string;
	templatePath: string | null;
	discipline: string;
	acadeSection: string | null;
	acadeGroup: string | null;
	warnings: string[];
}

export interface ProjectDrawingStandardCatalogEntry {
	id: string;
	snapshotId: string;
	rowNumber: number;
	familyKey: string;
	typeCode: string;
	sheetFamily: string;
	defaultTitle: string;
	defaultCount: number;
	sequenceBandStart: number;
	sequenceBandEnd: number;
	sequenceDigits: number;
	bootstrapDefaultCount: number;
	templateKey: string;
	templatePath: string | null;
	discipline: string;
	acadeSection: string | null;
	acadeGroup: string | null;
	warnings: string[];
}

export type ProjectDrawingStandardStarterRow =
	ProjectDrawingStandardCatalogEntry;

export interface ProjectDrawingStandardSnapshot {
	id: string;
	projectId: string;
	source: ProjectDrawingStandardSource;
	standardKey: string;
	catalogVersion: string;
	disciplineScope: string;
	workbookFileName: string;
	importedAt: string;
	catalogEntries: ProjectDrawingStandardCatalogEntry[];
	starterRows: ProjectDrawingStandardStarterRow[];
	templateMappings: ProjectDrawingTemplateMapping[];
	warnings: string[];
}

export interface ProjectDrawingProgramRow {
	id: string;
	projectId: string;
	standardRowId: string | null;
	sortOrder: number;
	drawingNumber: string;
	title: string;
	discipline: string;
	sheetFamily: string;
	familyKey: string;
	typeCode: string;
	sequenceBandStart: number;
	sequenceBandEnd: number;
	catalogSource: ProjectDrawingStandardSource;
	templateKey: string;
	templatePath: string | null;
	status: ProjectDrawingProgramRowStatus;
	provisionState: ProjectDrawingProvisionState;
	dwgRelativePath: string | null;
	acadeSection: string | null;
	acadeGroup: string | null;
	workbookSyncedAt: string | null;
	workbookDriftDetectedAt: string | null;
	numberPrefix: string;
	sequenceDigits: number;
	sequenceNumber: number;
	createdAt: string;
	updatedAt: string;
}

export interface ProjectDrawingWorkbookMirror {
	workbookRelativePath: string;
	lastExportedAt: string | null;
	lastImportedAt: string | null;
	lastDriftEventAt: string | null;
}

export interface ProjectDrawingProgramRecord {
	id: string;
	projectId: string;
	activeStandardKey: string;
	standardSnapshotId: string | null;
	workbookMirror: ProjectDrawingWorkbookMirror;
	rows: ProjectDrawingProgramRow[];
	pendingTitleBlockSyncPaths: string[];
	pendingTitleBlockSyncAt: string | null;
	lastAcadeSyncAt: string | null;
	acadeSyncPending: boolean;
	lastProvisionReceiptId: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface ProjectDrawingWorkbookMirrorRow {
	suiteRowId: string;
	sortOrder: number;
	drawingNumber: string;
	title: string;
	status: ProjectDrawingProgramRowStatus;
	discipline: string;
	sheetFamily: string;
	familyKey: string;
	typeCode: string;
	sequenceBand: string;
	templateKey: string;
	provisionState: ProjectDrawingProvisionState;
	dwgRelativePath: string;
	acadeSection: string;
	acadeGroup: string;
}

export interface ProjectDrawingProvisionReceipt {
	id: string;
	projectId: string;
	programId: string;
	planId: string;
	mode: ProjectDrawingProgramPlanMode;
	appliedAt: string;
	createdFiles: string[];
	renamedFiles: Array<{
		fromRelativePath: string;
		toRelativePath: string;
	}>;
	workbookPath: string | null;
	wdpPath: string | null;
	warnings: string[];
}

export interface ProjectDrawingRenumberChange {
	rowId: string;
	oldDrawingNumber: string;
	newDrawingNumber: string;
	oldRelativePath: string | null;
	newRelativePath: string | null;
}

export interface ProjectDrawingRenumberPlan {
	id: string;
	projectId: string;
	createdAt: string;
	changes: ProjectDrawingRenumberChange[];
	warnings: string[];
}

export interface ProjectDrawingProgramChange {
	id: string;
	rowId: string | null;
	type: ProjectDrawingProgramChangeType;
	description: string;
	before: string;
	after: string;
	blocked: boolean;
}

export interface ProjectDrawingProgramFileAction {
	id: string;
	rowId: string;
	kind: ProjectDrawingProgramFileActionKind;
	fromRelativePath: string | null;
	toRelativePath: string | null;
	templatePath: string | null;
	blocked: boolean;
	reason: string | null;
}

export interface ProjectDrawingProgramPlan {
	id: string;
	projectId: string;
	mode: ProjectDrawingProgramPlanMode;
	updatedProgram: ProjectDrawingProgramRecord;
	renumberPlan: ProjectDrawingRenumberPlan | null;
	changes: ProjectDrawingProgramChange[];
	fileActions: ProjectDrawingProgramFileAction[];
	workbookRows: ProjectDrawingWorkbookMirrorRow[];
	warnings: string[];
	createdAt: string;
}

export interface ProjectDrawingWorkbookImportedRow {
	suiteRowId: string | null;
	sortOrder: number;
	drawingNumber: string;
	title: string;
	status: ProjectDrawingProgramRowStatus;
	discipline: string;
	sheetFamily: string;
	familyKey: string;
	typeCode: string;
	sequenceBand: string;
	templateKey: string;
	provisionState: ProjectDrawingProvisionState;
	dwgRelativePath: string;
	acadeSection: string;
	acadeGroup: string;
}

export interface ProjectDrawingWorkbookReconcilePreview {
	plan: ProjectDrawingProgramPlan;
	importedRows: ProjectDrawingWorkbookImportedRow[];
}

export interface ProjectDrawingStandardImportInput {
	projectId: string;
	fileName: string;
	arrayBuffer: ArrayBuffer;
}

export interface ProjectDrawingProgramInsertInput {
	projectId: string;
	program: ProjectDrawingProgramRecord;
	standardSnapshot: ProjectDrawingStandardSnapshot;
	standardRowId: string;
	projectNumber?: string | null;
	insertBeforeRowId?: string | null;
	count?: number;
}

export interface ProjectDrawingProgramDeactivateInput {
	projectId: string;
	program: ProjectDrawingProgramRecord;
	rowId: string;
}
