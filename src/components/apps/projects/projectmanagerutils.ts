import type { CSSProperties } from "react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";
import { PROJECT_CATEGORIES } from "./projectmanagertypes";

export const categoryColor = (cat: string | null | undefined): string =>
	PROJECT_CATEGORIES.find((c) => c.key === cat)?.color ?? "#a855f7";

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

export const getPriorityTint = (
	palette: ColorScheme,
	priority: string,
): string => {
	switch (priority) {
		case "urgent":
			return palette.accent;
		case "high":
			return palette.primary;
		case "medium":
			return palette.tertiary;
		default:
			return palette.secondary;
	}
};

export const getPriorityRowStyle = (
	palette: ColorScheme,
	priority: string,
): CSSProperties => {
	const tint = getPriorityTint(palette, priority);
	return {
		border: `1px solid ${hexToRgba(tint, 0.28)}`,
		background: `linear-gradient(135deg, ${hexToRgba(tint, 0.12)} 0%, ${hexToRgba(
			palette.surface,
			0.45,
		)} 100%)`,
	};
};

export const getPriorityChipStyle = (
	palette: ColorScheme,
	priority: string,
): CSSProperties => {
	const tint = getPriorityTint(palette, priority);
	return {
		border: `1px solid ${hexToRgba(tint, 0.4)}`,
		background: hexToRgba(tint, 0.16),
		color: hexToRgba(palette.text, 0.85),
	};
};

export const getUrgencyColor = (dueDate: string | null): string => {
	if (!dueDate) return "";
	const [y, m, d] = dueDate.split("T")[0].split("-").map(Number);
	const due = new Date(y, m - 1, d);
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

	if (diffHours < 0) return "text-red-400 border-red-400";
	if (diffHours < 24) return "text-red-300 border-red-300";
	if (diffHours < 168) return "text-yellow-300 border-yellow-300";
	return "text-green-300 border-green-300";
};

export const getDeadlineStatus = (deadline: string | null) => {
	if (!deadline) return { text: "No deadline", color: "text-gray-400" };
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
			color: "text-red-400",
		};
	if (diffDays === 0) return { text: "Due today", color: "text-red-400" };
	if (diffDays === 1) return { text: "Due tomorrow", color: "text-orange-400" };
	if (diffDays <= 7)
		return { text: `${diffDays} days remaining`, color: "text-yellow-400" };
	return {
		text: `${diffDays} days remaining`,
		color: "text-green-400",
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
