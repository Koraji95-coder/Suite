import type { ProjectFormData } from "@/features/project-core";
import { projectSetupActionService } from "@/features/project-setup/actionService";
import {
	projectTitleBlockProfileService,
	type ProjectTitleBlockProfileRow,
} from "@/services/projectTitleBlockProfileService";
import type { DrawingRevisionRegisterRow } from "@/services/projectRevisionRegisterService";
import type { TitleBlockSyncPayload, TitleBlockSyncProfile } from "./types";

export interface ProjectSetupActionArgs {
	projectId: string;
	projectRootPath: string | null;
	form: ProjectFormData;
}

export function buildProjectSetupSyncProfile(
	form: ProjectFormData,
	projectRootPath: string | null,
): TitleBlockSyncProfile {
	return {
		projectName: form.name,
		blockName: form.titleBlockBlockName,
		projectRootPath,
		acadeProjectFilePath: form.titleBlockAcadeProjectFilePath,
		acadeLine1: form.titleBlockAcadeLine1,
		acadeLine2: form.titleBlockAcadeLine2,
		acadeLine4: form.titleBlockAcadeLine4,
		signerDrawnBy: form.titleBlockDrawnBy,
		signerCheckedBy: form.titleBlockCheckedBy,
		signerEngineer: form.titleBlockEngineer,
	};
}

export function buildProjectSetupTitleBlockPayload(
	args: ProjectSetupActionArgs,
): TitleBlockSyncPayload {
	return {
		projectId: args.projectId,
		projectRootPath: args.projectRootPath || "",
		profile: buildProjectSetupSyncProfile(args.form, args.projectRootPath),
		revisionEntries: [],
		rows: [],
		selectedRelativePaths: [],
		triggerAcadeUpdate: false,
	};
}

export async function persistProjectSetupProfile(args: {
	projectId: string;
	projectRootPath: string | null;
	form: ProjectFormData;
}) {
	return await projectTitleBlockProfileService.upsertProfile({
		projectId: args.projectId,
		blockName: args.form.titleBlockBlockName,
		projectRootPath: args.projectRootPath,
		acadeProjectFilePath: args.form.titleBlockAcadeProjectFilePath,
		acadeLine1: args.form.titleBlockAcadeLine1,
		acadeLine2: args.form.titleBlockAcadeLine2,
		acadeLine4: args.form.titleBlockAcadeLine4,
		signerDrawnBy: args.form.titleBlockDrawnBy,
		signerCheckedBy: args.form.titleBlockCheckedBy,
		signerEngineer: args.form.titleBlockEngineer,
	});
}

export async function ensureProjectSetupArtifacts(
	args: ProjectSetupActionArgs,
) {
	if (!args.projectRootPath) {
		return null;
	}

	return await projectSetupActionService.ensureArtifacts(
		buildProjectSetupTitleBlockPayload(args),
	);
}

export async function openProjectSetupInAcade(
	args: ProjectSetupActionArgs,
) {
	if (!args.projectRootPath) {
		return null;
	}

	return await projectSetupActionService.openProject(
		buildProjectSetupTitleBlockPayload(args),
	);
}

export async function openProjectSetupFromStoredProfile(args: {
	projectId: string;
	projectName: string;
	projectRootPath: string;
	profile: ProjectTitleBlockProfileRow;
	revisionEntries?: DrawingRevisionRegisterRow[];
}) {
	return await projectSetupActionService.openProject({
		projectId: args.projectId,
		projectRootPath: args.projectRootPath,
		profile: {
			projectName: args.projectName,
			blockName: args.profile.block_name,
			projectRootPath: args.projectRootPath,
			acadeProjectFilePath: args.profile.acade_project_file_path,
			acadeLine1: args.profile.acade_line1,
			acadeLine2: args.profile.acade_line2,
			acadeLine4: args.profile.acade_line4,
			signerDrawnBy: args.profile.signer_drawn_by,
			signerCheckedBy: args.profile.signer_checked_by,
			signerEngineer: args.profile.signer_engineer,
		},
		revisionEntries: args.revisionEntries ?? [],
		rows: [],
		selectedRelativePaths: [],
		triggerAcadeUpdate: false,
	});
}

export async function createProjectSetupInAcade(
	args: ProjectSetupActionArgs,
) {
	return await projectSetupActionService.createProject(
		buildProjectSetupTitleBlockPayload(args),
	);
}
