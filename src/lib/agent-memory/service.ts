import { logger } from "../../lib/errorLogger";
import { supabase } from "@/supabase/client";
import type { Database, Json } from "@/supabase/database";
import type { Memory } from "./types";

export async function loadMemories(
	memoryType?: Memory["memory_type"],
): Promise<Memory[]> {
	try {
		let query = supabase
			.from("ai_memory")
			.select("*")
			.order("strength", { ascending: false });

		if (memoryType) {
			query = query.eq("memory_type", memoryType);
		}

		const { data, error } = await query;

		if (error) throw error;

		return (data ?? []).map(
			(row: Database["public"]["Tables"]["ai_memory"]["Row"]) => {
				const content =
					typeof row.content === "string"
						? row.content
						: JSON.stringify(row.content ?? {});
				const connections = Array.isArray(row.connections)
					? (row.connections as string[])
					: [];
				return {
					id: row.id,
					memory_type: row.memory_type,
					content,
					connections,
					strength: row.strength ?? 50,
					created_at: row.created_at,
				};
			},
		);
	} catch (err) {
		logger.error("AIService", "Failed to load memories", { error: err });
		return [];
	}
}

export async function saveMemory(
	memory: Omit<Memory, "id" | "created_at">,
): Promise<Memory | null> {
	try {
		const payload: Database["public"]["Tables"]["ai_memory"]["Insert"] = {
			memory_type: memory.memory_type,
			content: memory.content as unknown as Json,
			connections: memory.connections as unknown as Json,
			strength: memory.strength,
		};
		const { data, error } = await supabase
			.from("ai_memory")
			.insert(payload)
			.select()
			.maybeSingle();

		if (error) throw error;

		if (data) {
			const content =
				typeof data.content === "string"
					? data.content
					: JSON.stringify(data.content ?? {});
			const connections = Array.isArray(data.connections)
				? (data.connections as string[])
				: [];
			return {
				id: data.id,
				memory_type: data.memory_type,
				content,
				connections,
				strength: data.strength ?? 50,
				created_at: data.created_at,
			};
		}

		return null;
	} catch (err) {
		logger.error("AIService", "Failed to save memory", { error: err });
		return null;
	}
}

export async function deleteMemory(id: string): Promise<boolean> {
	try {
		const { error } = await supabase.from("ai_memory").delete().eq("id", id);

		if (error) throw error;
		return true;
	} catch (err) {
		logger.error("AIService", "Failed to delete memory", { error: err });
		return false;
	}
}
