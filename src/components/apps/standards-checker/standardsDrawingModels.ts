import type { Database, Json } from "@/supabase/database";

export interface Issue {
	type: string;
	severity: "error" | "warning" | "info";
	message: string;
	location?: string;
}

export interface DrawingAnnotation {
	id: string;
	drawing_name: string;
	file_path: string;
	annotations: Issue[];
	qa_status: "pass" | "fail" | "warning" | "pending";
	checked_at: string | null;
	checked_by: string | null;
	rules_applied: string[];
	issues_found: number;
	created_at: string;
}

export type DrawingAnnotationRow =
	Database["public"]["Tables"]["drawing_annotations"]["Row"];

export interface QARule {
	id: string;
	name: string;
	description: string;
	category:
		| "title_block"
		| "layer"
		| "dimension"
		| "text"
		| "compliance"
		| "standard";
	severity: "error" | "warning" | "info";
	enabled: boolean;
}

export const mapDrawingRow = (row: DrawingAnnotationRow): DrawingAnnotation => {
	const annotations = Array.isArray(row.annotation_data)
		? (row.annotation_data as unknown as Issue[])
		: [];
	const rulesApplied = Array.isArray(row.qa_checks)
		? (row.qa_checks as string[])
		: [];
	const issuesFound =
		typeof row.issues_found === "number"
			? row.issues_found
			: annotations.length;
	const qa_status: DrawingAnnotation["qa_status"] =
		row.status === "approved"
			? "pass"
			: row.status === "rejected"
				? "fail"
				: row.status === "reviewed"
					? "warning"
					: "pending";

	return {
		id: row.id,
		drawing_name: row.drawing_name,
		file_path: row.file_path,
		annotations,
		qa_status,
		checked_at: row.reviewed_at,
		checked_by: null,
		rules_applied: rulesApplied,
		issues_found: issuesFound,
		created_at: row.created_at,
	};
};

export const DEFAULT_QA_RULES: QARule[] = [
	{
		id: "1",
		name: "Title Block - Project Name",
		description: "Verify project name is present and matches project standards",
		category: "title_block",
		severity: "error",
		enabled: true,
	},
	{
		id: "2",
		name: "Title Block - Drawing Number",
		description: "Check drawing number format matches standard (e.g., E-001)",
		category: "title_block",
		severity: "error",
		enabled: true,
	},
	{
		id: "3",
		name: "Title Block - Revision",
		description: "Verify revision number/letter is present",
		category: "title_block",
		severity: "error",
		enabled: true,
	},
	{
		id: "4",
		name: "Title Block - Date",
		description: "Check date format and ensure it is current",
		category: "title_block",
		severity: "warning",
		enabled: true,
	},
	{
		id: "5",
		name: "Title Block - Drawn By",
		description: "Verify designer/drafter name is filled",
		category: "title_block",
		severity: "error",
		enabled: true,
	},
	{
		id: "6",
		name: "Title Block - Checked By",
		description: "Verify checker name is filled",
		category: "title_block",
		severity: "error",
		enabled: true,
	},
	{
		id: "7",
		name: "Title Block - Scale",
		description: "Check that scale is properly indicated",
		category: "title_block",
		severity: "warning",
		enabled: true,
	},
	{
		id: "8",
		name: "Layer Standards",
		description:
			"Verify layers follow naming conventions (e.g., E-POWR, E-LTNG)",
		category: "layer",
		severity: "warning",
		enabled: true,
	},
	{
		id: "9",
		name: "Text Height",
		description: "Check text heights meet minimum readability standards",
		category: "text",
		severity: "warning",
		enabled: true,
	},
	{
		id: "10",
		name: "NEC Compliance",
		description: "Verify calculations and designs meet NEC requirements",
		category: "compliance",
		severity: "error",
		enabled: true,
	},
	{
		id: "11",
		name: "Border and Margins",
		description: "Check drawing border and print margins",
		category: "standard",
		severity: "info",
		enabled: true,
	},
	{
		id: "12",
		name: "Line Weights",
		description: "Verify line weights are appropriate for drawing type",
		category: "standard",
		severity: "info",
		enabled: true,
	},
];

export const buildDrawingAnnotationInsert = (
	drawingName: string,
	issues: Issue[],
	enabledRuleNames: string[],
	qaStatus: DrawingAnnotation["qa_status"],
	userId: string,
): Database["public"]["Tables"]["drawing_annotations"]["Insert"] => {
	const status =
		qaStatus === "pass"
			? "approved"
			: qaStatus === "fail"
				? "rejected"
				: "reviewed";

	return {
		drawing_name: drawingName,
		file_path: `/drawings/${drawingName}.dwg`,
		annotation_data: issues as unknown as Json,
		qa_checks: enabledRuleNames,
		issues_found: issues.length,
		status,
		reviewed_at: new Date().toISOString(),
		user_id: userId,
	};
};
