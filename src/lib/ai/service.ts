import { logger } from "@/lib/errorLogger";
import { supabase } from "@/lib/supabase";
import type { Database, Json } from "@/types/database";
import { createProvider } from "./providers";
import type { AIConfig, Conversation, Memory, Message } from "./types";
import { DEFAULT_AI_CONFIG } from "./types";

const CONFIG_KEY = "ai-config";

export function getConfig(): AIConfig {
	try {
		const stored = localStorage.getItem(CONFIG_KEY);
		if (stored) {
			return { ...DEFAULT_AI_CONFIG, ...JSON.parse(stored) };
		}
	} catch {
		// corrupted storage, fall through to default
	}
	return { ...DEFAULT_AI_CONFIG };
}

export function saveConfig(config: AIConfig): void {
	localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export async function sendMessage(
	messages: Message[],
	onChunk?: (chunk: string) => void,
): Promise<string> {
	const config = getConfig();
	const provider = createProvider(config);
	const activeModel =
		config.provider === "openai" ? config.openaiModel : config.ollamaModel;
	try {
		return await provider.chat(messages, onChunk);
	} catch (err) {
		logger.error("AIService", "Provider chat failed", {
			error: err,
			provider: config.provider,
			model: activeModel,
		});
		throw err;
	}
}

type ConversationRow = Database["public"]["Tables"]["ai_conversations"]["Row"];

export async function loadConversations(): Promise<Conversation[]> {
	try {
		const { data, error } = await supabase
			.from("ai_conversations")
			.select("*")
			.order("updated_at", { ascending: false });

		if (error) throw error;

		return (data ?? []).map((row: ConversationRow) => {
			// Rehydrate message timestamps that may have been serialized as strings
			const rawMessages = Array.isArray(row.messages)
				? (row.messages as unknown as Message[])
				: [];
			const messages = rawMessages.map((msg: Message) => ({
				...msg,
				timestamp:
					typeof msg.timestamp === "string"
						? new Date(msg.timestamp)
						: msg.timestamp,
			}));

			return {
				id: row.id,
				title: (row.title ?? row.panel_context ?? "Untitled") as string,
				messages,
				created_at: row.created_at,
				updated_at: row.updated_at,
			};
		});
	} catch (err) {
		logger.error("AIService", "Failed to load conversations", { error: err });
		return [];
	}
}

export async function saveConversation(
	conversation: Conversation,
): Promise<Conversation> {
	try {
		const payload: Database["public"]["Tables"]["ai_conversations"]["Insert"] =
			{
				id: conversation.id,
				title: conversation.title,
				messages: conversation.messages as unknown as Json,
				updated_at: new Date().toISOString(),
			};
		const { data, error } = await supabase
			.from("ai_conversations")
			.upsert(payload)
			.select()
			.maybeSingle();

		if (error) throw error;

		if (data) {
			const rawMessages = Array.isArray(data.messages)
				? (data.messages as unknown as Message[])
				: [];
			const messages = rawMessages.map((msg: Message) => ({
				...msg,
				timestamp:
					typeof msg.timestamp === "string"
						? new Date(msg.timestamp)
						: msg.timestamp,
			}));
			return {
				id: data.id,
				title: data.title ?? "Untitled",
				messages,
				created_at: data.created_at,
				updated_at: data.updated_at,
			};
		}

		return conversation;
	} catch (err) {
		logger.error("AIService", "Failed to save conversation", { error: err });
		return conversation;
	}
}

export async function deleteConversation(id: string): Promise<boolean> {
	try {
		const { error } = await supabase
			.from("ai_conversations")
			.delete()
			.eq("id", id);

		if (error) throw error;
		return true;
	} catch (err) {
		logger.error("AIService", "Failed to delete conversation", { error: err });
		return false;
	}
}

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

export function buildSystemPrompt(memories: Memory[]): string {
	let prompt = `You are an expert AI assistant specialized in electrical engineering, helping with:
- Power system analysis and calculations
- Three-phase system analysis
- Circuit design and analysis
- Electrical standards (NEC, IEEE)
- Equipment specifications and selection
- AutoCAD and CAD file management
- Engineering calculations and formulas
- Project management for electrical projects

You provide clear, accurate, and practical advice while maintaining technical accuracy.`;

	const preferences = memories.filter((m) => m.memory_type === "preference");
	const knowledge = memories.filter((m) => m.memory_type === "knowledge");
	const patterns = memories.filter((m) => m.memory_type === "pattern");
	const relationships = memories.filter(
		(m) => m.memory_type === "relationship",
	);

	if (preferences.length > 0) {
		prompt += "\n\nUser preferences:\n";
		prompt += preferences.map((m) => `- ${m.content}`).join("\n");
	}

	if (knowledge.length > 0) {
		prompt += "\n\nRelevant knowledge:\n";
		prompt += knowledge.map((m) => `- ${m.content}`).join("\n");
	}

	if (patterns.length > 0) {
		prompt += "\n\nObserved patterns:\n";
		prompt += patterns.map((m) => `- ${m.content}`).join("\n");
	}

	if (relationships.length > 0) {
		prompt += "\n\nKnown relationships:\n";
		prompt += relationships.map((m) => `- ${m.content}`).join("\n");
	}

	return prompt;
}
