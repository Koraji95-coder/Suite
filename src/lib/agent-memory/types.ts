export interface Memory {
	id: string;
	memory_type: "preference" | "knowledge" | "pattern" | "relationship";
	content: string;
	connections: string[];
	strength: number;
	created_at: string;
}
