import type { DrawingRevisionRegisterRow } from "@/services/projectRevisionRegisterService";

export interface TitleBlockSyncProfile {
	projectName?: string | null;
	blockName: string;
	projectRootPath: string | null;
	acadeProjectFilePath?: string | null;
	acadeLine1: string;
	acadeLine2: string;
	acadeLine4: string;
	signerDrawnBy: string;
	signerCheckedBy: string;
	signerEngineer: string;
}

export interface TitleBlockEditableFields {
	scale: string;
	drawnBy: string;
	drawnDate: string;
	checkedBy: string;
	checkedDate: string;
	engineer: string;
	engineerDate: string;
}

export interface TitleBlockSyncPendingWrite {
	attributeTag: string;
	previousValue: string;
	nextValue: string;
}

export interface TitleBlockRevisionDisplayRow {
	revision: string;
	description: string;
	by: string;
	checkedBy: string;
	date: string;
}

export interface TitleBlockSyncRow {
	id: string;
	fileName: string;
	relativePath: string;
	absolutePath: string;
	fileType: string;
	filenameDrawingNumber: string;
	filenameTitle: string;
	filenameRevision: string;
	titleBlockFound: boolean;
	effectiveBlockName: string;
	layoutName: string;
	titleBlockHandle: string;
	hasWdTbConflict: boolean;
	currentAttributes: Record<string, string>;
	editableFields: TitleBlockEditableFields;
	issues: string[];
	warnings: string[];
	revisionEntryCount: number;
	drawingNumber: string;
	drawingTitle: string;
	acadeValues: Record<string, string>;
	acadeExpectedTags?: Record<string, string>;
	suiteUpdates: Record<string, string>;
	pendingSuiteWrites: TitleBlockSyncPendingWrite[];
	pendingAcadeWrites: TitleBlockSyncPendingWrite[];
	revisionRows: TitleBlockRevisionDisplayRow[];
}

export interface TitleBlockSyncSummary {
	totalFiles: number;
	drawingFiles: number;
	flaggedFiles: number;
	suiteWriteCount: number;
	acadeWriteCount: number;
	wdTbConflictCount: number;
}

export interface TitleBlockSyncArtifacts {
	wdtPath: string;
	wdlPath: string;
	wdpPath?: string;
	wdtText: string;
	wdlText: string;
	wdpText?: string;
	wdpState?: "existing" | "starter";
}

export interface TitleBlockSyncPayload {
	projectId: string;
	projectRootPath: string;
	profile: TitleBlockSyncProfile;
	revisionEntries: DrawingRevisionRegisterRow[];
	rows?: TitleBlockSyncRow[];
	selectedRelativePaths?: string[];
	triggerAcadeUpdate?: boolean;
}

export interface TitleBlockSyncResponse {
	success: boolean;
	code?: string;
	message: string;
	requestId?: string;
	data?: {
		projectRootPath: string;
		profile: TitleBlockSyncProfile;
		drawings: TitleBlockSyncRow[];
		summary: TitleBlockSyncSummary;
		artifacts: TitleBlockSyncArtifacts;
		openProject?: {
			wdpPath: string;
			acadeLaunched: boolean;
			projectActivated: boolean;
			temporaryDocumentCreated?: boolean;
			temporaryDocumentClosed?: boolean;
			verification: {
				commandCompleted: boolean;
				aepxObserved: boolean;
				lastProjObserved: boolean;
				activeProjectObserved?: boolean;
			};
		};
		createProject?: {
			wdpPath: string;
			templateWdpPath: string;
			acadeLaunched: boolean;
			projectCreated: boolean;
			projectActivated: boolean;
			temporaryDocumentCreated?: boolean;
			temporaryDocumentClosed?: boolean;
			verification: {
				commandCompleted: boolean;
				aepxObserved: boolean;
				lastProjObserved: boolean;
				activeProjectObserved?: boolean;
			};
		};
		apply?: Record<string, unknown>;
		selectedRelativePaths?: string[];
	};
	warnings?: string[];
	meta?: Record<string, unknown>;
}
