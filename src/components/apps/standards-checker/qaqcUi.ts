import type { DrawingAnnotation, Issue } from "./qaqcModels";

export const getStatusColor = (status: DrawingAnnotation["qa_status"]) => {
	switch (status) {
		case "pass":
			return "[background:linear-gradient(to_bottom_right,color-mix(in_srgb,var(--success)_20%,var(--surface)),color-mix(in_srgb,var(--success)_20%,var(--surface)))] [border-color:color-mix(in_srgb,var(--success)_40%,transparent)]";
		case "fail":
			return "[background:linear-gradient(to_bottom_right,color-mix(in_srgb,var(--danger)_20%,var(--surface)),color-mix(in_srgb,var(--danger)_20%,var(--surface)))] [border-color:color-mix(in_srgb,var(--danger)_40%,transparent)]";
		case "warning":
			return "[background:linear-gradient(to_bottom_right,color-mix(in_srgb,var(--warning)_20%,var(--surface)),color-mix(in_srgb,var(--warning)_20%,var(--surface)))] [border-color:color-mix(in_srgb,var(--warning)_40%,transparent)]";
		default:
			return "[background:linear-gradient(to_bottom_right,color-mix(in_srgb,var(--text-muted)_20%,var(--surface)),color-mix(in_srgb,var(--text-muted)_20%,var(--surface)))] [border-color:color-mix(in_srgb,var(--text-muted)_40%,transparent)]";
	}
};

export const getStatusTextColor = (status: DrawingAnnotation["qa_status"]) => {
	switch (status) {
		case "pass":
			return "[color:var(--success)]";
		case "fail":
			return "[color:var(--danger)]";
		case "warning":
			return "[color:var(--warning)]";
		default:
			return "[color:var(--text-muted)]";
	}
};

export const getSeverityColor = (severity: Issue["severity"]) => {
	switch (severity) {
		case "error":
			return "[color:var(--danger)] [background:color-mix(in_srgb,var(--danger)_10%,var(--surface))] [border-color:color-mix(in_srgb,var(--danger)_30%,transparent)]";
		case "warning":
			return "[color:var(--warning)] [background:color-mix(in_srgb,var(--warning)_10%,var(--surface))] [border-color:color-mix(in_srgb,var(--warning)_30%,transparent)]";
		default:
			return "[color:var(--accent)] [background:color-mix(in_srgb,var(--accent)_10%,var(--surface))] [border-color:color-mix(in_srgb,var(--accent)_30%,transparent)]";
	}
};
