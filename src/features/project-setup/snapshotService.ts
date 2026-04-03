import {
	DEFAULT_PROJECT_TITLE_BLOCK_NAME,
	projectTitleBlockProfileService,
	type ProjectTitleBlockProfileRow,
} from "@/services/projectTitleBlockProfileService";
import {
	projectRevisionRegisterService,
} from "@/services/projectRevisionRegisterService";
import { projectSetupBackendService } from "./backendService";
import { projectSetupCompanionService } from "./companionService";
import {
	buildTitleBlockSyncFailureMessage,
	normalizeTitleBlockWorkflowWarnings,
} from "./workflowMessages";
import type {
	TitleBlockSyncArtifacts,
	TitleBlockSyncProfile,
	TitleBlockSyncRow,
	TitleBlockSyncSummary,
} from "./types";

export interface ProjectSetupDocumentSnapshotResult {
	projectRootPath: string;
	profile: TitleBlockSyncProfile;
	drawings: TitleBlockSyncRow[];
	summary: TitleBlockSyncSummary;
	artifacts: TitleBlockSyncArtifacts;
	warnings: string[];
}

function buildSnapshotRequestId(projectId: string) {
	const normalizedProjectId = String(projectId || "").trim();
	return normalizedProjectId
		? `project-setup-snapshot-${normalizedProjectId}-${Date.now()}`
		: `project-setup-snapshot-${Date.now()}`;
}

function buildSnapshotProfile(
	profile: ProjectTitleBlockProfileRow,
	projectRootPath: string,
): TitleBlockSyncProfile {
	return {
		blockName: profile.block_name || DEFAULT_PROJECT_TITLE_BLOCK_NAME,
		projectRootPath: profile.project_root_path || projectRootPath,
		acadeProjectFilePath: profile.acade_project_file_path,
		acadeLine1: profile.acade_line1,
		acadeLine2: profile.acade_line2,
		acadeLine4: profile.acade_line4,
		signerDrawnBy: profile.signer_drawn_by,
		signerCheckedBy: profile.signer_checked_by,
		signerEngineer: profile.signer_engineer,
	};
}

export async function loadProjectSetupDocumentSnapshot(args: {
	projectId: string;
	projectRootPath: string;
}): Promise<ProjectSetupDocumentSnapshotResult> {
	const requestId = buildSnapshotRequestId(args.projectId);
	const [profileResult, revisionsResult] = await Promise.all([
		projectTitleBlockProfileService.fetchProfile(args.projectId, {
			projectRootPath: args.projectRootPath,
		}),
		projectRevisionRegisterService.fetchEntries(args.projectId),
	]);

	const profile = buildSnapshotProfile(profileResult.data, args.projectRootPath);
	const ticket = await projectSetupBackendService.issueTicket({
		action: "scan-root",
		projectId: args.projectId,
		requestId,
	});
	const scanResponse = await projectSetupCompanionService.scanRoot(ticket, {
		projectRootPath: args.projectRootPath,
		profile,
	});
	if (!scanResponse.success || !scanResponse.data) {
		throw new Error(
			buildTitleBlockSyncFailureMessage(
				scanResponse,
				"Project metadata scan failed.",
			),
		);
	}

	const previewResponse = await projectSetupBackendService.buildPreview({
		projectId: args.projectId,
		projectRootPath: args.projectRootPath,
		profile,
		revisionEntries: revisionsResult.data,
		rows: [],
		selectedRelativePaths: [],
		triggerAcadeUpdate: false,
		scanSnapshot: scanResponse.data,
	});
	if (!previewResponse.success || !previewResponse.data) {
		throw new Error(
			buildTitleBlockSyncFailureMessage(
				previewResponse,
				"Project metadata scan failed.",
			),
		);
	}

	return {
		projectRootPath: previewResponse.data.projectRootPath,
		profile: previewResponse.data.profile,
		drawings: previewResponse.data.drawings,
		summary: previewResponse.data.summary,
		artifacts: previewResponse.data.artifacts,
		warnings: normalizeTitleBlockWorkflowWarnings([
			...(scanResponse.warnings || []),
			...(previewResponse.warnings || []),
			...(profileResult.error ? [profileResult.error.message] : []),
			...(revisionsResult.error ? [revisionsResult.error.message] : []),
		]),
	};
}
