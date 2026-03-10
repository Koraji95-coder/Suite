/**
 * Agent Task Manager
 * Manages predefined tasks, task history, and execution tracking
 */

import { logger } from "@/lib/logger";

export interface ExecutedTask {
	id: string;
	name: string;
	category: string;
	prompt: string;
	result?: string;
	executedAt: string;
	status: "pending" | "running" | "complete" | "failed";
	error?: string;
}

export interface PredefinedTask {
	id: string;
	name: string;
	category: string;
	description: string;
	prompt: string;
	icon?: string;
}

// Predefined task templates
export const PREDEFINED_TASKS: PredefinedTask[] = [
	{
		id: "drawing-list-analysis",
		name: "Analyze Drawing List",
		category: "Analysis",
		description:
			"Analyze the drawing list and generate automation tools, python scripts, and excel templates",
		prompt: `Analyze the drawing list in /workspaces/Suite and provide:
1. Automated drawing list validation tools
2. Python scripts for drawing management
3. Excel templates for drawing lists
4. Recommendations for improvement
5. Standards compliance checklist

Focus on practical, implementable solutions.`,
		icon: "📋",
	},
	{
		id: "electrical-standards",
		name: "Research Electrical Standards",
		category: "Research",
		description:
			"Research electrical standards, best practices, and IEEE requirements",
		prompt: `Research and provide:
1. IEEE electrical standards for drawing lists
2. Industry best practices for drawing management
3. Electrical power system conventions
4. Compliance requirements
5. Quality assurance guidelines

Format as a comprehensive reference guide.`,
		icon: "⚡",
	},
	{
		id: "quality-check",
		name: "Quality Check Analysis",
		category: "Validation",
		description:
			"Perform quality check on drawing list and identify missing information",
		prompt: `Perform a quality check on the drawing list and:
1. Identify missing or incomplete information
2. Check for naming convention compliance
3. Validate revision numbers and dates
4. Verify cross-references
5. Suggest corrections and improvements

Provide a detailed report with actionable items.`,
		icon: "✓",
	},
	{
		id: "custom-task",
		name: "Custom Task",
		category: "Custom",
		description: "Run a custom task with your own prompt",
		prompt: "",
		icon: "🎯",
	},
];

export interface AgentConversationMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: string;
	profileId?: string;
	kind?: "chat" | "event";
	eventType?: string;
	runId?: string;
	status?: string;
	requestId?: string;
	source?: "run" | "task" | "review" | "system";
}

export interface AgentConversation {
	id: string;
	title: string;
	profileId: string;
	createdAt: string;
	updatedAt: string;
	messages: AgentConversationMessage[];
	kind?: "manual" | "run";
	runId?: string;
}

const TASK_HISTORY_KEY_PREFIX = "agent-task-history";
const CONV_KEY_PREFIX = "agent-conversations";
const MAX_HISTORY = 50;
const ENV = import.meta.env as Record<string, string | undefined>;

function parsePositiveIntEnv(
	key: string,
	fallback: number,
	{ min = 1, max = Number.MAX_SAFE_INTEGER } = {},
): number {
	const raw = Number(String(ENV[key] || "").trim());
	if (!Number.isFinite(raw)) return fallback;
	const value = Math.trunc(raw);
	if (value < min || value > max) return fallback;
	return value;
}

const MAX_CONVERSATIONS = parsePositiveIntEnv(
	"VITE_AGENT_CHAT_MAX_CONVERSATIONS",
	12,
	{ min: 4, max: 48 },
);
const MAX_MESSAGES_PER_CONVERSATION = parsePositiveIntEnv(
	"VITE_AGENT_CHAT_MAX_MESSAGES_PER_CONVERSATION",
	80,
	{ min: 20, max: 300 },
);
const MAX_MESSAGE_CHARS = parsePositiveIntEnv(
	"VITE_AGENT_CHAT_MAX_MESSAGE_CHARS",
	3_000,
	{ min: 256, max: 12_000 },
);
const MAX_CONVERSATION_STORAGE_BYTES = parsePositiveIntEnv(
	"VITE_AGENT_CHAT_STORAGE_MAX_BYTES",
	1_200_000,
	{ min: 128_000, max: 8_000_000 },
);

class AgentTaskManager {
	private scope = "anon";
	private conversationScope = "koro";

	private buildRunConversationTitle(runId: string): string {
		const normalized = String(runId || "").trim();
		if (!normalized) return "Run";
		const suffix =
			normalized.length > 12 ? normalized.slice(-8) : normalized;
		return `Run ${suffix}`;
	}

	private normalizeMessageContent(value: unknown): string {
		const trimmed = String(value ?? "").trim();
		if (!trimmed) return "";
		if (trimmed.length <= MAX_MESSAGE_CHARS) return trimmed;
		const suffix = "\n\n[message truncated for chat stability]";
		const available = Math.max(0, MAX_MESSAGE_CHARS - suffix.length);
		return `${trimmed.slice(0, available)}${suffix}`;
	}

	private toIsoTimestamp(value: unknown, fallback?: string): string {
		const text = String(value ?? "").trim();
		if (!text) return fallback || new Date().toISOString();
		const parsed = new Date(text);
		if (Number.isNaN(parsed.getTime())) {
			return fallback || new Date().toISOString();
		}
		return parsed.toISOString();
	}

	private sanitizeConversationMessage(
		value: unknown,
		index: number,
		conversationId: string,
		defaultRunId = "",
	): AgentConversationMessage | null {
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		const item = value as Record<string, unknown>;
		const role = String(item.role || "").trim();
		if (role !== "user" && role !== "assistant") return null;

		const content = this.normalizeMessageContent(item.content);
		if (!content) return null;

		const messageId = String(item.id || "").trim() || `${conversationId}-msg-${index}`;
		const timestamp = this.toIsoTimestamp(item.timestamp);
		const profileId = String(item.profileId || "").trim();
		const kind =
			String(item.kind || "").trim().toLowerCase() === "event"
				? "event"
				: "chat";
		const eventType = String(item.eventType || "").trim();
		const runId = String(item.runId || defaultRunId || "").trim();
		const status = String(item.status || "").trim();
		const requestId = String(item.requestId || "").trim();
		const sourceText = String(item.source || "").trim().toLowerCase();
		const source =
			sourceText === "run" ||
			sourceText === "task" ||
			sourceText === "review" ||
			sourceText === "system"
				? sourceText
				: "";
		return {
			id: messageId,
			role,
			content,
			timestamp,
			...(profileId ? { profileId } : {}),
			...(kind !== "chat" ? { kind } : {}),
			...(eventType ? { eventType } : {}),
			...(runId ? { runId } : {}),
			...(status ? { status } : {}),
			...(requestId ? { requestId } : {}),
			...(source ? { source } : {}),
		};
	}

	private sanitizeConversation(value: unknown, index: number): AgentConversation | null {
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		const item = value as Record<string, unknown>;

		const conversationId =
			String(item.id || "").trim() || `conv-${Date.now()}-${index}`;
		const kind =
			String(item.kind || "").trim().toLowerCase() === "run"
				? "run"
				: "manual";
		const runId = String(item.runId || "").trim();
		const profileId =
			String(item.profileId || "").trim() || this.conversationScope || "koro";
		const createdAt = this.toIsoTimestamp(item.createdAt);
		const updatedAt = this.toIsoTimestamp(item.updatedAt, createdAt);
		const rawMessages = Array.isArray(item.messages) ? item.messages : [];
		const messages = rawMessages
			.map((entry, messageIndex) =>
				this.sanitizeConversationMessage(
					entry,
					messageIndex,
					conversationId,
					runId,
				),
			)
			.filter((entry): entry is AgentConversationMessage => Boolean(entry))
			.slice(-MAX_MESSAGES_PER_CONVERSATION);
		const firstUserMessage = messages.find((message) => message.role === "user");
		const titleFromMessage = firstUserMessage
			? `${firstUserMessage.content.slice(0, 60)}${firstUserMessage.content.length > 60 ? "..." : ""}`
			: kind === "run"
				? this.buildRunConversationTitle(runId || conversationId)
				: "New conversation";
		const title = String(item.title || "").trim() || titleFromMessage;

		return {
			id: conversationId,
			title,
			profileId,
			createdAt,
			updatedAt,
			messages,
			...(kind !== "manual" ? { kind } : {}),
			...(runId ? { runId } : {}),
		};
	}

	private parseAndSanitizeConversations(stored: string | null): {
		conversations: AgentConversation[];
		rewritten: boolean;
	} {
		if (!stored) return { conversations: [], rewritten: false };
		try {
			const parsed = JSON.parse(stored) as unknown;
			if (!Array.isArray(parsed)) {
				return { conversations: [], rewritten: true };
			}
			let sanitized = parsed
				.map((entry, index) => this.sanitizeConversation(entry, index))
				.filter((entry): entry is AgentConversation => Boolean(entry));
			let rewritten = sanitized.length !== parsed.length;
			if (sanitized.length > MAX_CONVERSATIONS) {
				sanitized = sanitized.slice(0, MAX_CONVERSATIONS);
				rewritten = true;
			}
			if (!rewritten) {
				outer: for (const rawConversation of parsed) {
					if (
						!rawConversation ||
						typeof rawConversation !== "object" ||
						Array.isArray(rawConversation)
					) {
						rewritten = true;
						break;
					}
					const conversationRecord = rawConversation as Record<string, unknown>;
					if (
						typeof conversationRecord.id !== "string" ||
						("title" in conversationRecord &&
							typeof conversationRecord.title !== "string")
					) {
						rewritten = true;
						break;
					}
					const messages = Array.isArray(
						(rawConversation as { messages?: unknown }).messages,
					)
						? ((rawConversation as { messages: unknown[] }).messages ?? [])
						: [];
					if (messages.length > MAX_MESSAGES_PER_CONVERSATION) {
						rewritten = true;
						break;
					}
					for (const rawMessage of messages) {
						if (
							!rawMessage ||
							typeof rawMessage !== "object" ||
							Array.isArray(rawMessage)
						) {
							rewritten = true;
							break outer;
						}
						const rawRole = (rawMessage as { role?: unknown }).role;
						const rawContent = (rawMessage as { content?: unknown }).content;
						if (rawRole !== "user" && rawRole !== "assistant") {
							rewritten = true;
							break outer;
						}
						if (typeof rawContent !== "string" || !rawContent.trim()) {
							rewritten = true;
							break outer;
						}
						if (rawContent.trim().length > MAX_MESSAGE_CHARS) {
							rewritten = true;
							continue;
						}
					}
				}
			}
			return { conversations: sanitized, rewritten };
		} catch (error) {
			logger.warn(
				"Failed to parse conversations payload; resetting scope conversations.",
				"AgentTaskManager",
				error,
			);
			return { conversations: [], rewritten: true };
		}
	}

	private estimateSerializedBytes(value: string): number {
		return new TextEncoder().encode(value).length;
	}

	private isStorageQuotaError(error: unknown): boolean {
		return (
			error instanceof DOMException &&
			(error.name === "QuotaExceededError" || error.code === 22)
		);
	}

	private enforceConversationStorageBudget(
		conversations: AgentConversation[],
	): {
		conversations: AgentConversation[];
		trimmedConversations: number;
		trimmedMessages: number;
		bytes: number;
	} {
		const working = conversations.map((conversation) => ({
			...conversation,
			messages: [...conversation.messages],
		}));

		let serialized = JSON.stringify(working);
		let bytes = this.estimateSerializedBytes(serialized);
		let trimmedConversations = 0;
		let trimmedMessages = 0;
		let safetyCounter = 0;

		while (
			bytes > MAX_CONVERSATION_STORAGE_BYTES &&
			working.length > 0 &&
			safetyCounter < 50_000
		) {
			safetyCounter += 1;
			const oldestConversation = working[working.length - 1];
			if (!oldestConversation) break;

			if (oldestConversation.messages.length > 1) {
				oldestConversation.messages.shift();
				oldestConversation.updatedAt = new Date().toISOString();
				trimmedMessages += 1;
			} else {
				working.pop();
				trimmedConversations += 1;
			}

			serialized = JSON.stringify(working);
			bytes = this.estimateSerializedBytes(serialized);
		}

		return {
			conversations: working,
			trimmedConversations,
			trimmedMessages,
			bytes,
		};
	}

	private persistConversations(
		key: string,
		conversations: AgentConversation[],
		{
			stage,
			allowAggressiveRetry = true,
		}: {
			stage: string;
			allowAggressiveRetry?: boolean;
		},
	): void {
		const budgeted = this.enforceConversationStorageBudget(conversations);
		if (budgeted.trimmedConversations > 0 || budgeted.trimmedMessages > 0) {
			logger.warn(
				"Conversation cache trimmed to enforce byte budget.",
				"AgentTaskManager",
				{
					stage,
					maxBytes: MAX_CONVERSATION_STORAGE_BYTES,
					bytesAfterTrim: budgeted.bytes,
					trimmedConversations: budgeted.trimmedConversations,
					trimmedMessages: budgeted.trimmedMessages,
				},
			);
		}

		const serialized = JSON.stringify(budgeted.conversations);
		try {
			localStorage.setItem(key, serialized);
		} catch (error) {
			if (!this.isStorageQuotaError(error) || !allowAggressiveRetry) {
				throw error;
			}

			logger.warn(
				"Conversation cache hit storage quota; applying aggressive trim retry.",
				"AgentTaskManager",
				{
					stage,
					maxBytes: MAX_CONVERSATION_STORAGE_BYTES,
				},
			);

			const aggressivelyTrimmed = this.enforceConversationStorageBudget(
				budgeted.conversations.slice(0, Math.max(1, Math.floor(budgeted.conversations.length / 2))),
			);
			localStorage.setItem(
				key,
				JSON.stringify(aggressivelyTrimmed.conversations),
			);
		}
	}

	setScope(scope: string | null): void {
		this.scope = scope?.trim() || "anon";
	}

	private getStorageKey(): string {
		return `${TASK_HISTORY_KEY_PREFIX}:${this.scope}`;
	}

	/**
	 * Get predefined tasks
	 */
	getPredefinedTasks(): PredefinedTask[] {
		return PREDEFINED_TASKS;
	}

	/**
	 * Get a predefined task by ID
	 */
	getTaskById(id: string): PredefinedTask | undefined {
		return PREDEFINED_TASKS.find((t) => t.id === id);
	}

	/**
	 * Save executed task to history
	 */
	saveTaskToHistory(task: ExecutedTask): void {
		try {
			const history = this.getTaskHistory();
			history.unshift(task); // Add to beginning

			// Keep only max number of tasks
			if (history.length > MAX_HISTORY) {
				history.splice(MAX_HISTORY);
			}

			localStorage.setItem(this.getStorageKey(), JSON.stringify(history));
		} catch (error) {
			logger.error("Failed to save task to history", "AgentTaskManager", error);
		}
	}

	/**
	 * Get task execution history
	 */
	getTaskHistory(): ExecutedTask[] {
		try {
			const stored = localStorage.getItem(this.getStorageKey());
			return stored ? JSON.parse(stored) : [];
		} catch (error) {
			logger.error("Failed to load task history", "AgentTaskManager", error);
			return [];
		}
	}

	/**
	 * Get tasks by category
	 */
	getTasksByCategory(category: string): ExecutedTask[] {
		return this.getTaskHistory().filter((t) => t.category === category);
	}

	/**
	 * Delete a task from history
	 */
	deleteTask(taskId: string): void {
		try {
			const history = this.getTaskHistory();
			const filtered = history.filter((t) => t.id !== taskId);
			localStorage.setItem(this.getStorageKey(), JSON.stringify(filtered));
		} catch (error) {
			logger.error("Failed to delete task", "AgentTaskManager", error);
		}
	}

	/**
	 * Clear all task history
	 */
	clearHistory(): void {
		try {
			localStorage.removeItem(this.getStorageKey());
		} catch (error) {
			logger.error("Failed to clear history", "AgentTaskManager", error);
		}
	}

	/**
	 * Create task execution record
	 */
	createTaskRecord(
		predefinedTaskId: string,
		customPrompt?: string,
	): ExecutedTask {
		const predefinedTask = this.getTaskById(predefinedTaskId);
		const prompt = customPrompt || predefinedTask?.prompt || "";

		return {
			id: this.generateId(),
			name: predefinedTask?.name || "Custom Task",
			category: predefinedTask?.category || "Custom",
			prompt,
			status: "pending",
			executedAt: new Date().toISOString(),
		};
	}

	/**
	 * Update task with result
	 */
	updateTaskResult(
		taskId: string,
		result: string,
		status: "complete" | "failed" = "complete",
		error?: string,
	): ExecutedTask {
		const history = this.getTaskHistory();
		const taskIndex = history.findIndex((t) => t.id === taskId);

		if (taskIndex === -1) {
			throw new Error(`Task ${taskId} not found`);
		}

		const task = history[taskIndex];
		task.result = result;
		task.status = status;
		if (error) task.error = error;

		history[taskIndex] = task;
		localStorage.setItem(this.getStorageKey(), JSON.stringify(history));

		return task;
	}

	/**
	 * Get recent tasks (limit)
	 */
	getRecentTasks(limit: number = 10): ExecutedTask[] {
		return this.getTaskHistory().slice(0, limit);
	}

	setConversationScope(scope: string): void {
		this.conversationScope = scope.trim() || "koro";
	}

	// Backward-compatible alias for older call sites.
	setProfileScope(profileId: string): void {
		this.setConversationScope(profileId);
	}

	private getConversationsKey(): string {
		return `${CONV_KEY_PREFIX}:${this.scope}:${this.conversationScope}`;
	}

	getConversations(): AgentConversation[] {
		try {
			const key = this.getConversationsKey();
			const stored = localStorage.getItem(key);
			const { conversations, rewritten } = this.parseAndSanitizeConversations(stored);
			if (rewritten) {
				this.persistConversations(key, conversations, {
					stage: "getConversations.rewrite",
				});
				return this.parseAndSanitizeConversations(localStorage.getItem(key))
					.conversations;
			}
			return conversations;
		} catch (error) {
			logger.warn(
				"Failed to load conversations; returning empty list.",
				"AgentTaskManager",
				error,
			);
			return [];
		}
	}

	getConversation(conversationId: string): AgentConversation | null {
		return this.getConversations().find((c) => c.id === conversationId) ?? null;
	}

	saveConversation(conversation: AgentConversation): void {
		try {
			const sanitized = this.sanitizeConversation(conversation, 0);
			if (!sanitized) {
				logger.warn(
					"Dropped invalid conversation payload during save.",
					"AgentTaskManager",
					{ conversationId: String((conversation as { id?: string }).id || "") },
				);
				return;
			}
			const convs = this.getConversations();
			const idx = convs.findIndex((c) => c.id === sanitized.id);
			if (idx >= 0) {
				convs.splice(idx, 1);
			}
			convs.unshift(sanitized);
			if (convs.length > MAX_CONVERSATIONS) convs.splice(MAX_CONVERSATIONS);
			this.persistConversations(this.getConversationsKey(), convs, {
				stage: "saveConversation",
			});
		} catch (error) {
			logger.warn(
				"Failed to save conversation.",
				"AgentTaskManager",
				error,
			);
		}
	}

	deleteConversation(conversationId: string): void {
		try {
			const convs = this.getConversations().filter(
				(c) => c.id !== conversationId,
			);
			this.persistConversations(this.getConversationsKey(), convs, {
				stage: "deleteConversation",
			});
		} catch (error) {
			logger.warn(
				"Failed to delete conversation.",
				"AgentTaskManager",
				error,
			);
		}
	}

	clearConversationCacheForCurrentScope(): void {
		try {
			const scopePrefix = `${CONV_KEY_PREFIX}:${this.scope}:`;
			const keysToRemove: string[] = [];
			for (let index = 0; index < localStorage.length; index += 1) {
				const key = localStorage.key(index);
				if (key && key.startsWith(scopePrefix)) {
					keysToRemove.push(key);
				}
			}
			for (const key of keysToRemove) {
				localStorage.removeItem(key);
			}
		} catch (error) {
			logger.warn(
				"Failed to clear conversation cache for scope.",
				"AgentTaskManager",
				error,
			);
		}
	}

	getConversationByRunId(runId: string): AgentConversation | null {
		const normalizedRunId = String(runId || "").trim();
		if (!normalizedRunId) return null;
		return (
			this.getConversations().find(
				(conversation) => String(conversation.runId || "").trim() === normalizedRunId,
			) ?? null
		);
	}

	getOrCreateRunConversation(
		runId: string,
		options?: { profileId?: string; title?: string },
	): AgentConversation {
		const normalizedRunId = String(runId || "").trim();
		const normalizedProfile = String(options?.profileId || "").trim() || "team";
		const preferredTitle =
			String(options?.title || "").trim() ||
			this.buildRunConversationTitle(normalizedRunId);
		const existing = this.getConversationByRunId(normalizedRunId);
		if (existing) {
			const updated: AgentConversation = {
				...existing,
				profileId: normalizedProfile,
				kind: "run",
				runId: normalizedRunId,
				title: preferredTitle || existing.title,
				updatedAt: new Date().toISOString(),
			};
			this.saveConversation(updated);
			return this.getConversation(updated.id) || updated;
		}

		const created = this.createConversation(normalizedProfile, preferredTitle, {
			kind: "run",
			runId: normalizedRunId,
		});
		this.saveConversation(created);
		return created;
	}

	createConversation(
		profileId: string,
		title?: string,
		options?: { kind?: "manual" | "run"; runId?: string },
	): AgentConversation {
		const now = new Date().toISOString();
		const kind = options?.kind === "run" ? "run" : "manual";
		const runId = String(options?.runId || "").trim();
		const resolvedTitle =
			String(title || "").trim() ||
			(kind === "run"
				? this.buildRunConversationTitle(runId)
				: "New conversation");
		return {
			id: this.generateId(),
			title: resolvedTitle,
			profileId,
			createdAt: now,
			updatedAt: now,
			messages: [],
			...(kind !== "manual" ? { kind } : {}),
			...(runId ? { runId } : {}),
		};
	}

	addMessageToConversation(
		conversationId: string,
		role: "user" | "assistant",
		content: string,
		options?: {
			profileId?: string;
			kind?: "chat" | "event";
			eventType?: string;
			runId?: string;
			status?: string;
			requestId?: string;
			source?: "run" | "task" | "review" | "system";
		},
	): AgentConversation | null {
		const conv = this.getConversation(conversationId);
		if (!conv) return null;

		const normalizedContent = this.normalizeMessageContent(content);
		if (!normalizedContent) return conv;
		const profileId = String(options?.profileId || "").trim();
		const kind = options?.kind === "event" ? "event" : "chat";
		const eventType = String(options?.eventType || "").trim();
		const runId =
			String(options?.runId || "").trim() || String(conv.runId || "").trim();
		const status = String(options?.status || "").trim();
		const requestId = String(options?.requestId || "").trim();
		const source =
			options?.source === "run" ||
			options?.source === "task" ||
			options?.source === "review" ||
			options?.source === "system"
				? options.source
				: undefined;

		conv.messages.push({
			id: this.generateId(),
			role,
			content: normalizedContent,
			timestamp: new Date().toISOString(),
			...(profileId ? { profileId } : {}),
			...(kind !== "chat" ? { kind } : {}),
			...(eventType ? { eventType } : {}),
			...(runId ? { runId } : {}),
			...(status ? { status } : {}),
			...(requestId ? { requestId } : {}),
			...(source ? { source } : {}),
		});
		if (conv.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
			conv.messages.splice(
				0,
				conv.messages.length - MAX_MESSAGES_PER_CONVERSATION,
			);
		}
		conv.updatedAt = new Date().toISOString();
		if (runId && (!conv.runId || conv.kind === "run")) {
			conv.runId = runId;
		}
		if (runId && !conv.kind) {
			conv.kind = "manual";
		}

		if (conv.messages.length === 1 && role === "user" && kind === "chat") {
			conv.title =
				normalizedContent.slice(0, 60) +
				(normalizedContent.length > 60 ? "..." : "");
		}

		this.saveConversation(conv);
		return conv;
	}

	private generateId(): string {
		return `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}
}

export const agentTaskManager = new AgentTaskManager();
