import {
	Archive,
	FileSpreadsheet,
	FileText,
	Film,
	Folder,
	Image,
} from "lucide-react";
import type { StorageFile } from "./storageTypes";

export type SortKey = "name" | "size" | "created_at";

export function getFileIcon(type: string) {
	if (type === "folder") return <Folder size={20} />;
	if (type.startsWith("image/")) return <Image size={20} />;
	if (type.startsWith("video/")) return <Film size={20} />;
	if (type.includes("zip") || type.includes("rar") || type.includes("tar")) {
		return <Archive size={20} />;
	}
	if (
		type.includes("spreadsheet") ||
		type.includes("excel") ||
		type.includes("csv")
	) {
		return <FileSpreadsheet size={20} />;
	}
	return <FileText size={20} />;
}

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function filterAndSortFiles(
	files: StorageFile[],
	search: string,
	sortKey: SortKey,
	sortAsc: boolean,
) {
	return files
		.filter((file) => file.name.toLowerCase().includes(search.toLowerCase()))
		.sort((a, b) => {
			const direction = sortAsc ? 1 : -1;
			if (sortKey === "name") return a.name.localeCompare(b.name) * direction;
			if (sortKey === "size") return (a.size - b.size) * direction;
			return (
				(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) *
				direction
			);
		});
}
