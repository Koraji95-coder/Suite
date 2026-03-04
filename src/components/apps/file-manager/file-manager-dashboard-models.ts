import {
	Archive,
	BarChart3,
	Clock,
	FileText,
	Headphones,
	ImageIcon,
	type LucideIcon,
	Video,
} from "lucide-react";

export interface FileManagerSidebarItem {
	icon: LucideIcon;
	label: string;
	active?: boolean;
}

export interface FileManagerRecentFile {
	name: string;
	size: string;
	type: string;
	icon: LucideIcon;
}

export interface FileManagerFile {
	name: string;
	owner: string;
	size: string;
	date: string;
	icon: LucideIcon;
}

export interface FileManagerStorageItem {
	type: string;
	files: number;
	size: string;
	icon: LucideIcon;
}

export interface FileManagerLegendItem {
	label: string;
	color: string;
}

export const sidebarItems: FileManagerSidebarItem[] = [
	{ icon: BarChart3, label: "Dashboard", active: true },
	{ icon: Clock, label: "Recent files" },
	{ icon: FileText, label: "Documents" },
	{ icon: ImageIcon, label: "Image" },
	{ icon: Video, label: "Videos" },
	{ icon: Headphones, label: "Audios" },
	{ icon: Archive, label: "Deleted files" },
];

export const recentFiles: FileManagerRecentFile[] = [
	{
		name: "Campaign Analysis - Q3.docx",
		size: "2.7 MB",
		type: "Document",
		icon: FileText,
	},
	{
		name: "HR_meeting_notes_2024.docx",
		size: "8.4 MB",
		type: "Image",
		icon: FileText,
	},
	{ name: "landscape_002.jpg", size: "4.2 MB", type: "Image", icon: ImageIcon },
];

export const allFiles: FileManagerFile[] = [
	{
		name: "Campaign Analysis - Q3.docx",
		owner: "Brooklyn Simmons",
		size: "2.7 MB",
		date: "Apr 14, 2024",
		icon: FileText,
	},
	{
		name: "rebrand_mockup_v2_20241025.jpg",
		owner: "Cameron Williamson",
		size: "6.7 MB",
		date: "Apr 14, 2024",
		icon: ImageIcon,
	},
	{
		name: "proposal_new_product_jdoe.docx",
		owner: "Brooklyn Simmons",
		size: "1.5 MB",
		date: "Apr 13, 2024",
		icon: FileText,
	},
	{
		name: "landscape_002.jpg",
		owner: "Esther Howard",
		size: "8.4 MB",
		date: "Apr 13, 2024",
		icon: ImageIcon,
	},
	{
		name: "sunset_beach_20241025.jpg",
		owner: "Cameron Williamson",
		size: "7.3 MB",
		date: "Apr 11, 2024",
		icon: ImageIcon,
	},
	{
		name: "social_media_report_20241025.docx",
		owner: "Leslie Alexander",
		size: "2.3 MB",
		date: "Apr 10, 2024",
		icon: FileText,
	},
	{
		name: "HR_meeting_notes_20241025.docx",
		owner: "Jenny Wilson",
		size: "3.1 MB",
		date: "Apr 10, 2024",
		icon: FileText,
	},
	{
		name: "interview_downtown_20241025.mp4",
		owner: "Brooklyn Simmons",
		size: "15.2 MB",
		date: "Apr 10, 2024",
		icon: Video,
	},
	{
		name: "project_files_backup_2024-11-05.zip",
		owner: "Cameron Williamson",
		size: "21.6 MB",
		date: "Apr 09, 2024",
		icon: Archive,
	},
	{
		name: "landscape_003.jpg",
		owner: "Esther Howard",
		size: "3.6 MB",
		date: "Apr 09, 2024",
		icon: ImageIcon,
	},
];

export const storageData: FileManagerStorageItem[] = [
	{ type: "Documents", files: 42, size: "112.8 MB", icon: FileText },
	{ type: "Image", files: 75, size: "286.8 MB", icon: ImageIcon },
	{ type: "Video", files: 32, size: "639.2 MB", icon: Video },
	{ type: "Audio", files: 20, size: "23.6 MB", icon: Headphones },
	{ type: "ZIP", files: 14, size: "213.3 MB", icon: Archive },
];

export const fileTypeLegendItems: FileManagerLegendItem[] = [
	{
		label: "Documents",
		color: "color-mix(in srgb, var(--primary) 70%, var(--surface))",
	},
	{
		label: "Image",
		color: "color-mix(in srgb, var(--primary) 50%, var(--surface))",
	},
	{
		label: "Video",
		color: "color-mix(in srgb, var(--primary) 30%, var(--surface))",
	},
	{
		label: "Audio",
		color: "color-mix(in srgb, var(--warning) 70%, var(--surface))",
	},
	{
		label: "ZIP",
		color: "color-mix(in srgb, var(--danger) 70%, var(--surface))",
	},
];
