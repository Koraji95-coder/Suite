import type { Database } from "@/supabase/database";

export interface DrawAction {
	tool: "pen" | "eraser" | "rectangle" | "circle" | "text";
	points?: { x: number; y: number }[];
	color?: string;
	width?: number;
	text?: string;
	position?: { x: number; y: number };
	size?: { width: number; height: number };
}

export type SavedWhiteboard =
	Database["public"]["Tables"]["whiteboards"]["Row"];
