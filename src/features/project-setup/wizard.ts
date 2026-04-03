import type { ProjectFormData } from "@/features/project-core";
import { deriveAcadeProjectFilePath } from "@/features/project-core";
import { projectDocumentMetadataService } from "@/features/project-documents";
import {
	DEFAULT_PROJECT_TITLE_BLOCK_NAME,
	projectTitleBlockProfileService,
} from "@/services/projectTitleBlockProfileService";

export interface ProjectSetupRootCheckState {
	status: "idle" | "running" | "ready" | "warning" | "error";
	rootPath: string | null;
	drawingFiles: number;
	totalFiles: number;
	pdfFiles: number;
	wdpPath: string | null;
	wdtPath: string | null;
	wdlPath: string | null;
	wdpState: "existing" | "starter" | null;
	warnings: string[];
	message: string | null;
}

export const EMPTY_PROJECT_SETUP_ROOT_CHECK: ProjectSetupRootCheckState = {
	status: "idle",
	rootPath: null,
	drawingFiles: 0,
	totalFiles: 0,
	pdfFiles: 0,
	wdpPath: null,
	wdtPath: null,
	wdlPath: null,
	wdpState: null,
	warnings: [],
	message: null,
};

export const DEFAULT_PROJECT_SETUP_TITLE_BLOCK_NAME =
	DEFAULT_PROJECT_TITLE_BLOCK_NAME;

function isLowSignalRootValidationWarning(warning: string) {
	const normalized = warning.trim().toLowerCase();
	return (
		normalized.includes("live dwg metadata is unavailable") ||
		normalized.includes("filename fallback") ||
		normalized.includes("named pipe") ||
		normalized.includes("autocad scan bridge unavailable")
	);
}

export function summarizeProjectSetupRootValidationWarnings(warnings: string[]) {
	return warnings.filter((warning) => !isLowSignalRootValidationWarning(warning));
}

function normalizeComparablePath(path: string) {
	return path.trim().replace(/[\\/]+/g, "/").replace(/\/+$/g, "").toLowerCase();
}

function isPathInsideRoot(path: string, root: string) {
	const normalizedPath = normalizeComparablePath(path);
	const normalizedRoot = normalizeComparablePath(root);
	if (!normalizedPath || !normalizedRoot) {
		return false;
	}
	return (
		normalizedPath === normalizedRoot ||
		normalizedPath.startsWith(`${normalizedRoot}/`)
	);
}

export function shouldAdoptProjectSetupDiscoveredWdpPath(args: {
	currentPath: string;
	discoveredWdpPath: string;
	projectRootPath: string;
	autoDerivedPath: string;
}) {
	const currentPath = args.currentPath.trim();
	const discoveredWdpPath = args.discoveredWdpPath.trim();
	const projectRootPath = args.projectRootPath.trim();
	const autoDerivedPath = args.autoDerivedPath.trim();
	if (!discoveredWdpPath) {
		return false;
	}
	if (!currentPath) {
		return true;
	}
	if (
		normalizeComparablePath(currentPath) ===
		normalizeComparablePath(discoveredWdpPath)
	) {
		return false;
	}
	if (
		autoDerivedPath &&
		normalizeComparablePath(currentPath) ===
			normalizeComparablePath(autoDerivedPath)
	) {
		return true;
	}
	if (!currentPath.toLowerCase().endsWith(".wdp")) {
		return true;
	}
	return !isPathInsideRoot(currentPath, projectRootPath);
}

export function hasValidatedProjectSetupRoot(
	rootCheck: ProjectSetupRootCheckState,
	projectRootPath: string,
) {
	const normalizedRootPath = projectRootPath.trim();
	if (!normalizedRootPath) {
		return false;
	}
	return (
		rootCheck.rootPath === normalizedRootPath &&
		(rootCheck.status === "ready" || rootCheck.status === "warning")
	);
}

export function parseProjectSetupDeadlineDate(value: string) {
	const source = String(value || "").trim();
	if (!source) return null;
	const normalized = source.includes("T") ? source : `${source}T12:00:00`;
	const parsed = new Date(normalized);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function createProjectSetupDraftId() {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `project-setup-${crypto.randomUUID()}`;
	}
	return `project-setup-${Date.now()}`;
}

export function hasMeaningfulProjectSetupDefaults(formData: ProjectFormData) {
	return Boolean(
		formData.titleBlockBlockName.trim() &&
			formData.titleBlockAcadeProjectFilePath.trim() &&
			formData.titleBlockAcadeLine1.trim() &&
			formData.titleBlockAcadeLine2.trim() &&
			formData.titleBlockAcadeLine4.trim() &&
			formData.titleBlockDrawnBy.trim() &&
			formData.titleBlockCheckedBy.trim() &&
			formData.titleBlockEngineer.trim(),
	);
}

export function hasCompleteProjectSetupBasics(
	formData: ProjectFormData,
	deadlineDate: Date | null,
) {
	return Boolean(
		formData.name.trim() &&
			formData.description.trim() &&
			deadlineDate &&
			formData.projectPeName.trim() &&
			formData.projectFirmNumber.trim() &&
			formData.category.trim() &&
			formData.priority &&
			formData.status,
	);
}

export function hasCompleteProjectSetupTracking(args: {
	projectRootPath: string;
	pdfPackageRootPath: string;
	rootValidationReady: boolean;
}) {
	return Boolean(
		args.projectRootPath.trim() &&
			args.pdfPackageRootPath.trim() &&
			args.rootValidationReady,
	);
}

export function getMaxAccessibleProjectSetupStepIndex(args: {
	basicsReady: boolean;
	trackingReady: boolean;
	defaultsReady: boolean;
}) {
	if (!args.basicsReady) {
		return 0;
	}
	if (!args.trackingReady) {
		return 1;
	}
	if (!args.defaultsReady) {
		return 2;
	}
	return 3;
}

export async function loadProjectSetupProfile(args: {
	projectId: string;
	projectRootPath: string | null;
}) {
	const result = await projectTitleBlockProfileService.fetchProfile(args.projectId, {
		projectRootPath: args.projectRootPath,
	});
	return {
		data: result.data,
		message: result.error ? result.error.message : null,
	};
}

export async function validateProjectSetupRoot(args: {
	projectId: string;
	projectRootPath: string;
	formData: ProjectFormData;
	autoDerivedAcadePath: string;
}): Promise<{
	rootCheck: ProjectSetupRootCheckState;
	formPatch: Partial<ProjectFormData>;
}> {
	const normalizedRootPath = args.projectRootPath.trim();
	if (!normalizedRootPath) {
		return {
			rootCheck: {
				...EMPTY_PROJECT_SETUP_ROOT_CHECK,
				status: "error",
				message: "Choose a project root before running validation.",
			},
			formPatch: {},
		};
	}

	const snapshot = await projectDocumentMetadataService.loadSnapshot({
		projectId: args.projectId,
		projectRootPath: normalizedRootPath,
	});
	const followUpWarnings = summarizeProjectSetupRootValidationWarnings(
		snapshot.warnings,
	);
	const pdfFiles = snapshot.rows.filter(
		(row) => row.fileType.toLowerCase() === "pdf",
	).length;
	const discoveredWdpPath =
		snapshot.artifacts.wdpState === "existing"
			? snapshot.artifacts.wdpPath || ""
			: "";
	const nextAcadeProjectFilePath = shouldAdoptProjectSetupDiscoveredWdpPath({
		currentPath: args.formData.titleBlockAcadeProjectFilePath,
		discoveredWdpPath,
		projectRootPath: normalizedRootPath,
		autoDerivedPath: args.autoDerivedAcadePath,
	})
		? discoveredWdpPath
		: args.formData.titleBlockAcadeProjectFilePath;

	return {
		rootCheck: {
			status:
				snapshot.summary.drawingFiles === 0 || followUpWarnings.length > 0
					? "warning"
					: "ready",
			rootPath: normalizedRootPath,
			drawingFiles: snapshot.summary.drawingFiles,
			totalFiles: snapshot.summary.totalFiles,
			pdfFiles,
			wdpPath: snapshot.artifacts.wdpPath || null,
			wdtPath: snapshot.artifacts.wdtPath || null,
			wdlPath: snapshot.artifacts.wdlPath || null,
			wdpState: snapshot.artifacts.wdpState || null,
			warnings: followUpWarnings.slice(0, 3),
			message:
				snapshot.summary.drawingFiles > 0
					? `Root validated. Found ${snapshot.summary.drawingFiles} drawing${
							snapshot.summary.drawingFiles === 1 ? "" : "s"
					  }${pdfFiles > 0 ? ` and ${pdfFiles} PDF${pdfFiles === 1 ? "" : "s"}` : ""} for project setup.`
					: "Root validated, but no drawing files were found yet.",
		},
		formPatch: {
			watchdogRootPath: snapshot.projectRootPath || args.formData.watchdogRootPath,
			titleBlockBlockName:
				args.formData.titleBlockBlockName || snapshot.profile.blockName,
			titleBlockAcadeProjectFilePath: nextAcadeProjectFilePath,
			titleBlockAcadeLine1:
				args.formData.titleBlockAcadeLine1 || snapshot.profile.acadeLine1,
			titleBlockAcadeLine2:
				args.formData.titleBlockAcadeLine2 || snapshot.profile.acadeLine2,
			titleBlockAcadeLine4:
				args.formData.titleBlockAcadeLine4 || snapshot.profile.acadeLine4,
			titleBlockDrawnBy:
				args.formData.titleBlockDrawnBy || snapshot.profile.signerDrawnBy,
			titleBlockCheckedBy:
				args.formData.titleBlockCheckedBy || snapshot.profile.signerCheckedBy,
			titleBlockEngineer:
				args.formData.titleBlockEngineer || snapshot.profile.signerEngineer,
		},
	};
}

export function deriveProjectSetupAcadeProjectFilePath(
	projectName: string | null | undefined,
	projectRootPath: string | null | undefined,
) {
	return deriveAcadeProjectFilePath(projectName, projectRootPath);
}
