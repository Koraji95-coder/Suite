import type { ProjectFormData } from "@/features/project-core";
import {
	categoryColor,
	deriveAcadeProjectFilePath,
	toDateOnly,
} from "@/features/project-core";
import type { Database } from "@/supabase/database";

const OPTIONAL_PROJECT_SETUP_COLUMNS = [
	"pe_name",
	"firm_number",
	"pdf_package_root_path",
] as const;

export function getMissingProjectSetupColumns(error: unknown) {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "object" && error && "message" in error
				? String((error as { message?: unknown }).message || "")
				: String(error || "");
	const normalized = message.toLowerCase();

	if (
		!(
			normalized.includes("column") ||
			normalized.includes("schema cache") ||
			normalized.includes("not found") ||
			normalized.includes("does not exist")
		)
	) {
		return [];
	}

	return OPTIONAL_PROJECT_SETUP_COLUMNS.filter((column) =>
		normalized.includes(column),
	);
}

export function stripProjectSetupColumns<
	T extends
		| Database["public"]["Tables"]["projects"]["Insert"]
		| Database["public"]["Tables"]["projects"]["Update"],
>(payload: T, columns: readonly string[]) {
	if (columns.length === 0) {
		return payload;
	}
	const nextPayload = { ...payload };
	for (const column of columns) {
		delete nextPayload[column as keyof typeof nextPayload];
	}
	return nextPayload;
}

export function normalizeProjectRootPath(value: string): string | null {
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

export function withDerivedAcadeProjectFilePath(
	form: ProjectFormData,
	projectRootPath: string | null,
): ProjectFormData {
	if (form.titleBlockAcadeProjectFilePath.trim()) {
		return form;
	}

	const derivedPath = deriveAcadeProjectFilePath(form.name, projectRootPath);
	if (!derivedPath) {
		return form;
	}

	return {
		...form,
		titleBlockAcadeProjectFilePath: derivedPath,
	};
}

export function buildProjectInsertPayload(args: {
	form: ProjectFormData;
	watchdogRootPath: string | null;
	userId: string;
}): Database["public"]["Tables"]["projects"]["Insert"] {
	const { form, watchdogRootPath, userId } = args;
	return {
		name: form.name,
		description: form.description,
		deadline: toDateOnly(form.deadline) || null,
		priority: form.priority,
		status: form.status,
		category: form.category || "Other",
		pe_name: form.projectPeName.trim(),
		firm_number: form.projectFirmNumber.trim(),
		color: form.category ? categoryColor(form.category) : categoryColor(null),
		watchdog_root_path: watchdogRootPath,
		pdf_package_root_path:
			normalizeProjectRootPath(form.pdfPackageRootPath) ?? null,
		user_id: userId,
	};
}

export function buildProjectUpdatePayload(args: {
	form: ProjectFormData;
	watchdogRootPath: string | null;
}): Database["public"]["Tables"]["projects"]["Update"] {
	const { form, watchdogRootPath } = args;
	return {
		name: form.name,
		description: form.description,
		deadline: toDateOnly(form.deadline) || null,
		category: form.category || "Other",
		pe_name: form.projectPeName.trim(),
		firm_number: form.projectFirmNumber.trim(),
		color: form.category ? categoryColor(form.category) : categoryColor(null),
		priority: form.priority,
		status: form.status,
		watchdog_root_path: watchdogRootPath,
		pdf_package_root_path:
			normalizeProjectRootPath(form.pdfPackageRootPath) ?? null,
	};
}
