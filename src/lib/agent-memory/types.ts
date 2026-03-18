export type MemoryScope = "shared" | "private";

export interface Memory {
	id: string;
	memory_type: "preference" | "knowledge" | "pattern" | "relationship";
	content: string;
	connections: string[];
	strength: number;
	created_at: string;
	scope?: MemoryScope;
	agent_profile_id?: string | null;
	project_id?: string | null;
	content_raw?: unknown;
}
