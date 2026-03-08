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
}

export interface AgentConversation {
	id: string;
	title: string;
	profileId: string;
	createdAt: string;
	updatedAt: string;
	messages: AgentConversationMessage[];
}

const TASK_HISTORY_KEY_PREFIX = "agent-task-history";
const CONV_KEY_PREFIX = "agent-conversations";
const MAX_HISTORY = 50;
const MAX_CONVERSATIONS = 30;

class AgentTaskManager {
	private scope = "anon";
	private conversationScope = "koro";

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
	): AgentConversationMessage | null {
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		const item = value as Record<string, unknown>;
		const role = String(item.role || "").trim();
		if (role !== "user" && role !== "assistant") return null;

		const content = String(item.content ?? "");
		if (!content.trim()) return null;

		const messageId = String(item.id || "").trim() || `${conversationId}-msg-${index}`;
		const timestamp = this.toIsoTimestamp(item.timestamp);
		return {
			id: messageId,
			role,
			content,
			timestamp,
		};
	}

	private sanitizeConversation(value: unknown, index: number): AgentConversation | null {
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		const item = value as Record<string, unknown>;

		const conversationId =
			String(item.id || "").trim() || `conv-${Date.now()}-${index}`;
		const profileId =
			String(item.profileId || "").trim() || this.conversationScope || "koro";
		const createdAt = this.toIsoTimestamp(item.createdAt);
		const updatedAt = this.toIsoTimestamp(item.updatedAt, createdAt);
		const rawMessages = Array.isArray(item.messages) ? item.messages : [];
		const messages = rawMessages
			.map((entry, messageIndex) =>
				this.sanitizeConversationMessage(entry, messageIndex, conversationId),
			)
			.filter((entry): entry is AgentConversationMessage => Boolean(entry));
		const firstUserMessage = messages.find((message) => message.role === "user");
		const titleFromMessage = firstUserMessage
			? `${firstUserMessage.content.slice(0, 60)}${firstUserMessage.content.length > 60 ? "..." : ""}`
			: "New conversation";
		const title = String(item.title || "").trim() || titleFromMessage;

		return {
			id: conversationId,
			title,
			profileId,
			createdAt,
			updatedAt,
			messages,
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
			const sanitized = parsed
				.map((entry, index) => this.sanitizeConversation(entry, index))
				.filter((entry): entry is AgentConversation => Boolean(entry));
			const rewritten =
				sanitized.length !== parsed.length ||
				JSON.stringify(parsed) !== JSON.stringify(sanitized);
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
				localStorage.setItem(key, JSON.stringify(conversations));
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
				convs[idx] = sanitized;
			} else {
				convs.unshift(sanitized);
			}
			if (convs.length > MAX_CONVERSATIONS) convs.splice(MAX_CONVERSATIONS);
			localStorage.setItem(this.getConversationsKey(), JSON.stringify(convs));
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
			localStorage.setItem(this.getConversationsKey(), JSON.stringify(convs));
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

	createConversation(profileId: string, title?: string): AgentConversation {
		const now = new Date().toISOString();
		return {
			id: this.generateId(),
			title: title || "New conversation",
			profileId,
			createdAt: now,
			updatedAt: now,
			messages: [],
		};
	}

	addMessageToConversation(
		conversationId: string,
		role: "user" | "assistant",
		content: string,
	): AgentConversation | null {
		const conv = this.getConversation(conversationId);
		if (!conv) return null;

		conv.messages.push({
			id: this.generateId(),
			role,
			content,
			timestamp: new Date().toISOString(),
		});
		conv.updatedAt = new Date().toISOString();

		if (conv.messages.length === 1 && role === "user") {
			conv.title = content.slice(0, 60) + (content.length > 60 ? "..." : "");
		}

		this.saveConversation(conv);
		return conv;
	}

	private generateId(): string {
		return `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}
}

export const agentTaskManager = new AgentTaskManager();
