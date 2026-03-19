import { supabase } from "@/supabase/client";
import type { Database, Json } from "@/supabase/database";
import { logger } from "../../lib/errorLogger";
import type { Memory } from "./types";

const AGENT_PROFILE_IDS = new Set([
	"koro",
	"devstral",
	"sentinel",
	"forge",
	"draftsmith",
	"gridsage",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveObjectText(content: Record<string, unknown>): string {
	const preferredKeys = [
		"title",
		"summary",
		"content",
		"note",
		"text",
		"description",
		"name",
	];
	for (const key of preferredKeys) {
		const value = content[key];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}

	const stringValues = Object.values(content)
		.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
		.slice(0, 3)
		.map((value) => value.trim());
	if (stringValues.length > 0) {
		return stringValues.join(" • ");
	}

	return JSON.stringify(content);
}

function resolveAgentProfileId(content: Record<string, unknown>): string | null {
	const candidates = [
		content.agent_profile_id,
		content.agentProfileId,
		content.profile_id,
		content.profileId,
		content.namespace,
	];
	for (const candidate of candidates) {
		if (typeof candidate !== "string") continue;
		const normalized = candidate.trim().toLowerCase();
		if (AGENT_PROFILE_IDS.has(normalized)) {
			return normalized;
		}
	}
	return null;
}

function normalizeMemoryContent(
	rawContent: Database["public"]["Tables"]["ai_memory"]["Row"]["content"],
): Pick<Memory, "content" | "scope" | "agent_profile_id" | "project_id" | "content_raw"> {
	let parsedContent: unknown = rawContent;
	if (typeof rawContent === "string") {
		const trimmed = rawContent.trim();
		if (
			(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
			(trimmed.startsWith("[") && trimmed.endsWith("]"))
		) {
			try {
				parsedContent = JSON.parse(trimmed);
			} catch {
				parsedContent = rawContent;
			}
		}
	}

	if (typeof parsedContent === "string") {
		return {
			content: parsedContent,
			scope: "shared",
			agent_profile_id: null,
			project_id: null,
			content_raw: parsedContent,
		};
	}

	if (isRecord(parsedContent)) {
		const agentProfileId = resolveAgentProfileId(parsedContent);
		const projectIdCandidate = parsedContent.project_id ?? parsedContent.projectId;
		const scopeCandidate = parsedContent.scope ?? parsedContent.visibility;
		const sharedCandidate = parsedContent.shared;
		const scope =
			typeof scopeCandidate === "string"
				? scopeCandidate.trim().toLowerCase() === "private"
					? "private"
					: "shared"
				: sharedCandidate === true
					? "shared"
					: agentProfileId
						? "private"
						: "shared";

		return {
			content: resolveObjectText(parsedContent),
			scope,
			agent_profile_id: agentProfileId,
			project_id:
				typeof projectIdCandidate === "string" && projectIdCandidate.trim()
					? projectIdCandidate.trim()
					: null,
			content_raw: parsedContent,
		};
	}

	return {
		content: JSON.stringify(parsedContent ?? {}),
		scope: "shared",
		agent_profile_id: null,
		project_id: null,
		content_raw: parsedContent,
	};
}

async function requireUserId(): Promise<string> {
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();

	if (error) throw error;
	if (!user) throw new Error("Not authenticated");
	return user.id;
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
				const normalizedContent = normalizeMemoryContent(row.content);
				const connections = Array.isArray(row.connections)
					? (row.connections as string[])
					: [];
				return {
					id: row.id,
					memory_type: row.memory_type,
					content: normalizedContent.content,
					connections,
					strength: row.strength ?? 50,
					created_at: row.created_at,
					scope: normalizedContent.scope,
					agent_profile_id: normalizedContent.agent_profile_id,
					project_id: normalizedContent.project_id,
					content_raw: normalizedContent.content_raw,
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
		const userId = await requireUserId();
		const payload: Database["public"]["Tables"]["ai_memory"]["Insert"] = {
			memory_type: memory.memory_type,
			content: ((memory.content_raw ?? memory.content) as unknown) as Json,
			connections: memory.connections as unknown as Json,
			strength: memory.strength,
			user_id: userId,
		};
		const { data, error } = await supabase
			.from("ai_memory")
			.insert(payload)
			.select()
			.maybeSingle();

		if (error) throw error;

		if (data) {
			const normalizedContent = normalizeMemoryContent(data.content);
			const connections = Array.isArray(data.connections)
				? (data.connections as string[])
				: [];
			return {
				id: data.id,
				memory_type: data.memory_type,
				content: normalizedContent.content,
				connections,
				strength: data.strength ?? 50,
				created_at: data.created_at,
				scope: normalizedContent.scope,
				agent_profile_id: normalizedContent.agent_profile_id,
				project_id: normalizedContent.project_id,
				content_raw: normalizedContent.content_raw,
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
