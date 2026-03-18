import {
	ChevronRight,
	History,
	RotateCcw,
	Target,
	Trash2,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import { useToast } from "@/components/notification-system/ToastProvider";
import { cn } from "@/lib/utils";
import {
	agentTaskManager,
	type ExecutedTask,
	PREDEFINED_TASKS,
	type PredefinedTask,
} from "@/services/agentTaskManager";
import styles from "./AgentTaskPanel.module.css";

interface AgentTaskPanelProps {
	onExecuteTask: (prompt: string, taskName: string) => void;
	isExecuting?: boolean;
}

type AgentTaskTab = "quick" | "custom" | "history";

const TAB_META: Array<{
	id: AgentTaskTab;
	label: string;
	icon: typeof Zap;
}> = [
	{ id: "quick", label: "Quick Tasks", icon: Zap },
	{ id: "custom", label: "Custom", icon: Target },
	{ id: "history", label: "History", icon: History },
];

function formatTaskTimestamp(timestamp: string): string {
	const date = new Date(timestamp);
	return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export function AgentTaskPanel({
	onExecuteTask,
	isExecuting = false,
}: AgentTaskPanelProps) {
	const { showToast } = useToast();
	const [activeTab, setActiveTab] = useState<AgentTaskTab>("quick");
	const [customPrompt, setCustomPrompt] = useState("");
	const [taskHistory, setTaskHistory] = useState<ExecutedTask[]>([]);
	const [selectedPredefinedTask, setSelectedPredefinedTask] = useState<
		string | null
	>(null);
	const [confirmClearHistory, setConfirmClearHistory] = useState(false);

	useEffect(() => {
		setTaskHistory(agentTaskManager.getTaskHistory());
	}, []);

	const refreshHistorySoon = () => {
		window.setTimeout(() => {
			setTaskHistory(agentTaskManager.getTaskHistory());
		}, 1000);
	};

	const handleExecutePredefinedTask = (task: PredefinedTask) => {
		setSelectedPredefinedTask(task.id);
		onExecuteTask(task.prompt, task.name);
		refreshHistorySoon();
	};

	const handleExecuteCustomTask = () => {
		if (!customPrompt.trim()) return;
		onExecuteTask(customPrompt, "Custom Task");
		setCustomPrompt("");
		setSelectedPredefinedTask(null);
		refreshHistorySoon();
	};

	const handleRerunTask = (task: ExecutedTask) => {
		onExecuteTask(task.prompt, task.name);
		refreshHistorySoon();
	};

	const confirmClearTaskHistory = () => {
		agentTaskManager.clearHistory();
		setTaskHistory([]);
		setConfirmClearHistory(false);
		showToast("success", "Task history cleared.");
	};

	return (
		<>
			<div className={styles.root}>
				<div className={styles.tabs} role="tablist" aria-label="Agent tasks">
					{TAB_META.map((tab) => {
						const Icon = tab.icon;
						return (
							<button
								key={tab.id}
								type="button"
								role="tab"
								aria-selected={activeTab === tab.id}
								className={cn(
									styles.tabButton,
									activeTab === tab.id && styles.tabButtonActive,
								)}
								onClick={() => setActiveTab(tab.id)}
							>
								<Icon size={14} className={styles.tabIcon} />
								<span>{tab.label}</span>
							</button>
						);
					})}
				</div>

				<div className={styles.content}>
					{activeTab === "quick" && (
						<div className={styles.stack}>
							{PREDEFINED_TASKS.filter((task) => task.id !== "custom-task").map(
								(task) => (
									<button
										key={task.id}
										type="button"
										onClick={() => handleExecutePredefinedTask(task)}
										disabled={isExecuting}
										className={cn(
											styles.taskButton,
											selectedPredefinedTask === task.id &&
												styles.taskButtonActive,
											isExecuting && styles.taskButtonDisabled,
										)}
									>
										<div className={styles.taskIcon}>{task.icon}</div>
										<div className={styles.taskBody}>
											<div className={styles.taskName}>{task.name}</div>
											<div className={styles.taskDescription}>
												{task.description}
											</div>
										</div>
										<ChevronRight size={16} className={styles.taskChevron} />
									</button>
								),
							)}
						</div>
					)}

					{activeTab === "custom" && (
						<div className={styles.customPanel}>
							<label htmlFor="agent-task-custom-prompt" className={styles.fieldLabel}>
								Enter custom task prompt
							</label>
							<textarea
								id="agent-task-custom-prompt"
								value={customPrompt}
								onChange={(event) => setCustomPrompt(event.target.value)}
								placeholder="Describe the task you want the agent to perform..."
								disabled={isExecuting}
								className={cn(
									styles.textarea,
									isExecuting && styles.textareaDisabled,
								)}
							/>
							<button
								type="button"
								onClick={handleExecuteCustomTask}
								disabled={!customPrompt.trim() || isExecuting}
								className={styles.primaryButton}
							>
								{isExecuting ? "Running..." : "Run Task"}
							</button>
						</div>
					)}

					{activeTab === "history" && (
						<div className={styles.historyPanel}>
							{taskHistory.length === 0 ? (
								<div className={styles.emptyState}>
									No task history yet. Run a task to see it here.
								</div>
							) : (
								<>
									<div className={styles.historyToolbar}>
										<span className={styles.historyCount}>
											{taskHistory.length} task
											{taskHistory.length !== 1 ? "s" : ""}
										</span>
										<button
											type="button"
											onClick={() => setConfirmClearHistory(true)}
											className={styles.clearHistoryButton}
										>
											<Trash2 size={14} />
											Clear
										</button>
									</div>

									<div className={styles.historyList}>
										{taskHistory.map((task) => (
											<div key={task.id} className={styles.historyItem}>
												<div className={styles.historyItemHeader}>
													<div className={styles.historyInfo}>
														<div className={styles.historyName}>{task.name}</div>
														<div className={styles.historyTimestamp}>
															{formatTaskTimestamp(task.executedAt)}
														</div>
													</div>
													<div
														className={cn(
															styles.historyStatus,
															task.status === "complete"
																? styles.historyStatusComplete
																: styles.historyStatusError,
														)}
													>
														{task.status}
													</div>
												</div>

												{task.result && (
													<div className={styles.resultPreview}>
														{task.result.slice(0, 150)}
														{task.result.length > 150 ? "..." : ""}
													</div>
												)}

												<button
													type="button"
													onClick={() => handleRerunTask(task)}
													disabled={isExecuting}
													className={styles.rerunButton}
												>
													<RotateCcw size={12} />
													Re-run
												</button>
											</div>
										))}
									</div>
								</>
							)}
						</div>
					)}
				</div>
			</div>

			<Dialog open={confirmClearHistory} onOpenChange={setConfirmClearHistory}>
				<DialogContent className={styles.confirmDialogContent}>
					<DialogHeader>
						<DialogTitle>Clear task history?</DialogTitle>
					</DialogHeader>
					<p className={styles.confirmText}>
						This permanently removes all saved task runs.
					</p>
					<DialogFooter className={styles.confirmFooter}>
						<button
							type="button"
							onClick={() => setConfirmClearHistory(false)}
							className={styles.cancelButton}
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={confirmClearTaskHistory}
							className={styles.clearButton}
						>
							Clear
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
