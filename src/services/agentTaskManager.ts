/**
 * Agent Task Manager
 * Manages predefined tasks, task history, and execution tracking
 */

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

const TASK_HISTORY_KEY_PREFIX = "agent-task-history";
const MAX_HISTORY = 50; // Keep last 50 tasks

class AgentTaskManager {
	private scope = "anon";

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
			console.error("Failed to save task to history:", error);
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
			console.error("Failed to load task history:", error);
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
			console.error("Failed to delete task:", error);
		}
	}

	/**
	 * Clear all task history
	 */
	clearHistory(): void {
		try {
			localStorage.removeItem(this.getStorageKey());
		} catch (error) {
			console.error("Failed to clear history:", error);
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

	/**
	 * Generate unique ID
	 */
	private generateId(): string {
		return `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}
}

export const agentTaskManager = new AgentTaskManager();
