import type { CSSProperties } from "react";
import { PROJECT_CATEGORIES } from "./projectmanagertypes";

export const categoryColor = (cat: string | null | undefined): string =>
	PROJECT_CATEGORIES.find((c) => c.key === (cat === "QAQC" ? "Standards" : cat))
		?.color ?? "#a855f7";

export const categoryBadgeStyle = (cat: string | null | undefined) => {
	const color = categoryColor(cat);
	return {
		borderColor: color,
		color,
		backgroundColor: `${color}15`,
	};
};

export const formatDateOnly = (isoOrDateLike: string): string => {
	const [y, m, d] = isoOrDateLike.split("T")[0].split("-").map(Number);
	return new Date(y, m - 1, d).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
};

export const formatDateMMDDYYYY = (isoOrDateLike: string): string => {
	const [y, m, d] = isoOrDateLike.split("T")[0].split("-");
	return `${m}-${d}-${y}`;
};

export const toDateOnly = (datetimeLocal: string): string =>
	datetimeLocal ? datetimeLocal.split("T")[0] : "";

/** Returns a CSS variable string for the priority's semantic color. */
export const getPriorityColor = (priority: string): string => {
	switch (priority) {
		case "urgent":
			return "var(--danger)";
		case "high":
			return "var(--warning)";
		case "medium":
			return "var(--primary)";
		default:
			return "var(--text-muted)";
	}
};

export const getPriorityRowStyle = (priority: string): CSSProperties => {
	const color = getPriorityColor(priority);
	return {
		border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
		background: `linear-gradient(135deg, color-mix(in srgb, ${color} 12%, transparent) 0%, color-mix(in srgb, var(--surface) 45%, transparent) 100%)`,
	};
};

export const getPriorityChipStyle = (priority: string): CSSProperties => {
	const color = getPriorityColor(priority);
	return {
		border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
		background: `color-mix(in srgb, ${color} 16%, transparent)`,
		color: "var(--text)",
	};
};

export type UrgencyTone = "none" | "danger" | "warning" | "success";

export const getUrgencyTone = (dueDate: string | null): UrgencyTone => {
	if (!dueDate) return "none";
	const [y, m, d] = dueDate.split("T")[0].split("-").map(Number);
	const due = new Date(y, m - 1, d);
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

	if (diffHours < 24) return "danger";
	if (diffHours < 168) return "warning";
	return "success";
};

export const getDeadlineStatus = (deadline: string | null) => {
	if (!deadline) return { text: "No deadline", color: "var(--text-muted)" };
	const [y, m, d] = deadline.split("T")[0].split("-").map(Number);
	const dueDate = new Date(y, m - 1, d);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const diffDays = Math.ceil(
		(dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (diffDays < 0)
		return {
			text: `Overdue by ${Math.abs(diffDays)} days`,
			color: "var(--danger)",
		};
	if (diffDays === 0) return { text: "Due today", color: "var(--danger)" };
	if (diffDays === 1) return { text: "Due tomorrow", color: "var(--warning)" };
	if (diffDays <= 7)
		return {
			text: `${diffDays} days remaining`,
			color: "var(--warning)",
		};
	return {
		text: `${diffDays} days remaining`,
		color: "var(--success)",
	};
};

export const getFileIcon = (mimeType: string): string => {
	if (mimeType.startsWith("image/")) return "🖼️";
	if (mimeType.startsWith("video/")) return "🎥";
	if (mimeType.includes("pdf")) return "📄";
	if (mimeType.includes("zip") || mimeType.includes("rar")) return "📦";
	if (mimeType.includes("word")) return "📝";
	if (mimeType.includes("excel") || mimeType.includes("spreadsheet"))
		return "📊";
	return "📄";
};
