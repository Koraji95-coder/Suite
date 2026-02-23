import { ChevronRight, History, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import {
	agentTaskManager,
	type ExecutedTask,
	PREDEFINED_TASKS,
	type PredefinedTask,
} from "@/services/agentTaskManager";

interface AgentTaskPanelProps {
	onExecuteTask: (prompt: string, taskName: string) => void;
	isExecuting?: boolean;
}

export function AgentTaskPanel({
	onExecuteTask,
	isExecuting = false,
}: AgentTaskPanelProps) {
	const { palette } = useTheme();
	const [activeTab, setActiveTab] = useState<"quick" | "custom" | "history">(
		"quick",
	);
	const [customPrompt, setCustomPrompt] = useState("");
	const [taskHistory, setTaskHistory] = useState<ExecutedTask[]>([]);
	const [selectedPredefinedTask, setSelectedPredefinedTask] = useState<
		string | null
	>(null);

	useEffect(() => {
		setTaskHistory(agentTaskManager.getTaskHistory());
	}, []);

	const handleExecutePredefinedTask = (task: PredefinedTask) => {
		setSelectedPredefinedTask(task.id);
		onExecuteTask(task.prompt, task.name);
		// Update history after execution
		setTimeout(() => {
			setTaskHistory(agentTaskManager.getTaskHistory());
		}, 1000);
	};

	const handleExecuteCustomTask = () => {
		if (!customPrompt.trim()) return;
		onExecuteTask(customPrompt, "Custom Task");
		setCustomPrompt("");
		setSelectedPredefinedTask(null);
		// Update history after execution
		setTimeout(() => {
			setTaskHistory(agentTaskManager.getTaskHistory());
		}, 1000);
	};

	const handleRerunTask = (task: ExecutedTask) => {
		onExecuteTask(task.prompt, task.name);
		setTimeout(() => {
			setTaskHistory(agentTaskManager.getTaskHistory());
		}, 1000);
	};

	const handleClearHistory = () => {
		if (confirm("Clear all task history? This cannot be undone.")) {
			agentTaskManager.clearHistory();
			setTaskHistory([]);
		}
	};

	const tabButtonStyle = (isActive: boolean) => ({
		padding: "8px 16px",
		border: "none",
		background: isActive ? hexToRgba(palette.primary, 0.1) : "transparent",
		color: isActive ? palette.primary : palette.text,
		cursor: "pointer",
		fontSize: "14px",
		fontWeight: isActive ? 600 : 400,
		borderBottom: isActive
			? `2px solid ${palette.primary}`
			: "2px solid transparent",
		transition: "all 0.2s ease",
	});

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100%",
				background: hexToRgba(palette.surfaceLight, 0.5),
				borderRadius: "8px",
				overflow: "hidden",
			}}
		>
			{/* Tab Navigation */}
			<div
				style={{
					display: "flex",
					borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
					background: palette.background,
				}}
			>
				<button
					onClick={() => setActiveTab("quick")}
					style={tabButtonStyle(activeTab === "quick")}
				>
					⚡ Quick Tasks
				</button>
				<button
					onClick={() => setActiveTab("custom")}
					style={tabButtonStyle(activeTab === "custom")}
				>
					🎯 Custom
				</button>
				<button
					onClick={() => setActiveTab("history")}
					style={tabButtonStyle(activeTab === "history")}
				>
					<History
						size={16}
						style={{ display: "inline", marginRight: "4px" }}
					/>
					History
				</button>
			</div>

			{/* Tab Content */}
			<div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
				{/* Quick Tasks Tab */}
				{activeTab === "quick" && (
					<div
						style={{ display: "flex", flexDirection: "column", gap: "12px" }}
					>
						{PREDEFINED_TASKS.filter((t) => t.id !== "custom-task").map(
							(task) => (
								<button
									key={task.id}
									onClick={() => handleExecutePredefinedTask(task)}
									disabled={isExecuting}
									style={{
										padding: "12px 16px",
										background:
											selectedPredefinedTask === task.id
												? hexToRgba(palette.primary, 0.2)
												: hexToRgba(palette.primary, 0.05),
										border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
										borderRadius: "6px",
										cursor: isExecuting ? "not-allowed" : "pointer",
										textAlign: "left",
										opacity: isExecuting ? 0.6 : 1,
										transition: "all 0.2s ease",
										fontSize: "14px",
									}}
									onMouseEnter={(e) => {
										if (!isExecuting) {
											e.currentTarget.style.background = hexToRgba(
												palette.primary,
												0.15,
											);
										}
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background =
											selectedPredefinedTask === task.id
												? hexToRgba(palette.primary, 0.2)
												: hexToRgba(palette.primary, 0.05);
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: "8px",
										}}
									>
										<span>{task.icon}</span>
										<div style={{ flex: 1 }}>
											<div style={{ fontWeight: 600, color: palette.primary }}>
												{task.name}
											</div>
											<div
												style={{
													fontSize: "12px",
													color: palette.textMuted,
													marginTop: "2px",
												}}
											>
												{task.description}
											</div>
										</div>
										<ChevronRight size={16} />
									</div>
								</button>
							),
						)}
					</div>
				)}

				{/* Custom Task Tab */}
				{activeTab === "custom" && (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "12px",
							height: "100%",
						}}
					>
						<div>
							<label
								style={{
									fontSize: "12px",
									color: palette.textMuted,
									fontWeight: 600,
								}}
							>
								Enter Custom Task Prompt
							</label>
							<textarea
								value={customPrompt}
								onChange={(e) => setCustomPrompt(e.target.value)}
								placeholder="Describe the task you want the agent to perform..."
								disabled={isExecuting}
								style={{
									width: "100%",
									minHeight: "120px",
									padding: "12px",
									marginTop: "8px",
									border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
									borderRadius: "6px",
									background: palette.background,
									color: palette.text,
									fontFamily: "inherit",
									fontSize: "14px",
									resize: "none",
									opacity: isExecuting ? 0.6 : 1,
								}}
							/>
						</div>
						<button
							onClick={handleExecuteCustomTask}
							disabled={!customPrompt.trim() || isExecuting}
							style={{
								padding: "12px 16px",
								background: palette.primary,
								color: palette.background,
								border: "none",
								borderRadius: "6px",
								cursor:
									customPrompt.trim() && !isExecuting
										? "pointer"
										: "not-allowed",
								fontWeight: 600,
								opacity: !customPrompt.trim() || isExecuting ? 0.5 : 1,
								transition: "opacity 0.2s ease",
							}}
						>
							{isExecuting ? "Running..." : "Run Task"}
						</button>
					</div>
				)}

				{/* History Tab */}
				{activeTab === "history" && (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "12px",
							height: "100%",
						}}
					>
						{taskHistory.length === 0 ? (
							<div
								style={{
									color: palette.textMuted,
									fontSize: "14px",
									textAlign: "center",
									paddingTop: "20px",
								}}
							>
								No task history yet. Run a task to see it here.
							</div>
						) : (
							<>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
									}}
								>
									<span style={{ fontSize: "12px", color: palette.textMuted }}>
										{taskHistory.length} task
										{taskHistory.length !== 1 ? "s" : ""}
									</span>
									<button
										onClick={handleClearHistory}
										style={{
											background: "transparent",
											border: "none",
											color: palette.textMuted,
											cursor: "pointer",
											fontSize: "12px",
											padding: "4px 8px",
											display: "flex",
											alignItems: "center",
											gap: "4px",
										}}
									>
										<Trash2 size={14} />
										Clear
									</button>
								</div>

								<div
									style={{
										flex: 1,
										overflowY: "auto",
										display: "flex",
										flexDirection: "column",
										gap: "8px",
									}}
								>
									{taskHistory.map((task) => (
										<div
											key={task.id}
											style={{
												padding: "12px",
												background: hexToRgba(palette.primary, 0.05),
												border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
												borderRadius: "6px",
												fontSize: "13px",
											}}
										>
											<div
												style={{
													display: "flex",
													justifyContent: "space-between",
													alignItems: "start",
													marginBottom: "8px",
												}}
											>
												<div style={{ flex: 1 }}>
													<div
														style={{ fontWeight: 600, color: palette.primary }}
													>
														{task.name}
													</div>
													<div
														style={{
															fontSize: "11px",
															color: palette.textMuted,
															marginTop: "2px",
														}}
													>
														{new Date(task.executedAt).toLocaleDateString()}{" "}
														{new Date(task.executedAt).toLocaleTimeString()}
													</div>
												</div>
												<div
													style={{
														fontSize: "11px",
														padding: "2px 8px",
														borderRadius: "3px",
														background:
															task.status === "complete"
																? hexToRgba("#22c55e", 0.1)
																: hexToRgba("#ef4444", 0.1),
														color:
															task.status === "complete"
																? "#22c55e"
																: "#ef4444",
													}}
												>
													{task.status}
												</div>
											</div>

											{task.result && (
												<div
													style={{
														fontSize: "12px",
														color: palette.textMuted,
														marginBottom: "8px",
														maxHeight: "60px",
														overflowY: "auto",
														padding: "8px",
														background: hexToRgba(palette.background, 0.5),
														borderRadius: "4px",
													}}
												>
													{task.result.substring(0, 150)}...
												</div>
											)}

											<button
												onClick={() => handleRerunTask(task)}
												disabled={isExecuting}
												style={{
													width: "100%",
													padding: "6px 12px",
													background: "transparent",
													border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
													borderRadius: "4px",
													color: palette.primary,
													cursor: isExecuting ? "not-allowed" : "pointer",
													fontSize: "12px",
													fontWeight: 500,
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													gap: "4px",
													opacity: isExecuting ? 0.5 : 1,
												}}
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
	);
}
