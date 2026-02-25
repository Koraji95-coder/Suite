import { useEffect, useState } from "react";
import { AgentTaskPanel } from "@/components/apps/ai-unified/AgentTaskPanel";
import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";
import { agentService } from "@/services/agentService";
import {
	agentTaskManager,
	type ExecutedTask,
	PREDEFINED_TASKS,
} from "@/services/agentTaskManager";

const SUMMARY_KEYS = ["summary", "message", "response", "result", "output"];

type ResultKind = "success" | "warning" | "error" | "info";

const inferResultKindFromText = (text: string): ResultKind => {
	const content = text.toLowerCase();
	if (
		content.includes("error") ||
		content.includes("failed") ||
		content.includes("unauthorized") ||
		content.includes("invalid")
	) {
		return "error";
	}
	if (content.includes("warning") || content.includes("warn")) {
		return "warning";
	}
	if (
		content.includes("success") ||
		content.includes("complete") ||
		content.includes("completed") ||
		content.includes("ok")
	) {
		return "success";
	}
	return "info";
};

const inferResultKindFromRecord = (
	record: Record<string, unknown>,
): ResultKind | null => {
	if (typeof record.success === "boolean") {
		return record.success ? "success" : "error";
	}

	const errorValue = record.error;
	if (typeof errorValue === "string" && errorValue.trim().length > 0) {
		return "error";
	}

	if (record.warning === true) {
		return "warning";
	}

	const statusValue = record.status;
	if (typeof statusValue === "string") {
		const status = statusValue.toLowerCase();
		if (
			status.includes("error") ||
			status.includes("fail") ||
			status.includes("denied")
		) {
			return "error";
		}
		if (status.includes("warn")) {
			return "warning";
		}
		if (
			status.includes("success") ||
			status.includes("ok") ||
			status.includes("complete")
		) {
			return "success";
		}
	}

	return null;
};

const toText = (value: unknown): string => {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

const parseStructuredResult = (raw: string) => {
	let parsed: unknown = raw;
	if (typeof raw === "string") {
		try {
			parsed = JSON.parse(raw);
		} catch {
			parsed = raw;
		}
	}

	if (typeof parsed === "string") {
		const kind = inferResultKindFromText(parsed);
		return {
			summary: parsed,
			fields: [] as Array<{ key: string; value: string }>,
			kind,
			raw,
		};
	}

	if (!parsed || typeof parsed !== "object") {
		return {
			summary: "Task completed.",
			fields: [] as Array<{ key: string; value: string }>,
			kind: "info" as ResultKind,
			raw,
		};
	}

	const record = parsed as Record<string, unknown>;
	const summary =
		SUMMARY_KEYS.map((key) => toText(record[key])).find(Boolean) ||
		"Task completed.";

	const fields = Object.entries(record)
		.filter(([key, value]) => {
			if (SUMMARY_KEYS.includes(key)) return false;
			return ["string", "number", "boolean"].includes(typeof value);
		})
		.slice(0, 6)
		.map(([key, value]) => ({ key, value: toText(value) }));

	const kind =
		inferResultKindFromRecord(record) ??
		inferResultKindFromText(`${summary} ${raw}`);

	return { summary, fields, kind, raw };
};

function StructuredResultSection({
	title,
	subtitle,
	rawResult,
}: {
	title: string;
	subtitle?: string;
	rawResult: string;
}) {
	const parsed = parseStructuredResult(rawResult);
	const badgeLabel: Record<ResultKind, string> = {
		success: "Success",
		warning: "Warning",
		error: "Error",
		info: "Info",
	};

	const badgeClassName: Record<ResultKind, string> = {
		success: "border-emerald-300/35 text-emerald-200",
		warning: "border-amber-300/35 text-amber-200",
		error: "border-red-300/40 text-red-200",
		info: "border-white/25 text-slate-200",
	};

	return (
		<FrameSection title={title} subtitle={subtitle}>
			<div className="space-y-3">
				<div className="flex items-center justify-between gap-2">
					<span className="text-xs" style={{ color: "var(--white-dim)" }}>
						Parsed result
					</span>
					<span
						className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${badgeClassName[parsed.kind]}`}
					>
						{badgeLabel[parsed.kind]}
					</span>
				</div>
				<div className="rounded-md border border-white/10 bg-black/20 p-3 text-xs text-slate-200">
					{parsed.summary}
				</div>
				{parsed.fields.length > 0 ? (
					<div className="grid gap-2 md:grid-cols-2">
						{parsed.fields.map((field) => (
							<div
								key={field.key}
								className="rounded-md border border-white/10 bg-black/25 p-2 text-xs"
							>
								<div
									className="uppercase tracking-wide"
									style={{ color: "var(--white-dim)" }}
								>
									{field.key}
								</div>
								<div className="mt-1 text-slate-200">{field.value}</div>
							</div>
						))}
					</div>
				) : null}
				<details>
					<summary
						className="cursor-pointer text-xs"
						style={{ color: "var(--white-dim)" }}
					>
						Raw response
					</summary>
					<pre className="mt-2 max-h-72 overflow-auto rounded-md border border-white/10 bg-black/35 p-3 text-xs text-slate-200">
						{parsed.raw}
					</pre>
				</details>
			</div>
		</FrameSection>
	);
}

export default function AgentRoutePage() {
	const [healthy, setHealthy] = useState<boolean | null>(null);
	const [paired, setPaired] = useState(false);
	const [pairingCode, setPairingCode] = useState("");
	const [isPairing, setIsPairing] = useState(false);
	const [pairingError, setPairingError] = useState<string | null>(null);
	const [isExecuting, setIsExecuting] = useState(false);
	const [history, setHistory] = useState<ExecutedTask[]>([]);
	const [activeTaskName, setActiveTaskName] = useState<string | null>(null);
	const [latestResult, setLatestResult] = useState<string>("");
	const [latestError, setLatestError] = useState<string | null>(null);
	const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(
		null,
	);

	useEffect(() => {
		let mounted = true;
		const bootstrap = async () => {
			const isHealthy = await agentService.healthCheck();
			if (!mounted) return;
			setHealthy(isHealthy);
			setPaired(agentService.checkPairing());
			const recent = agentTaskManager.getRecentTasks(12);
			setHistory(recent);
			setSelectedHistoryId((current) => current ?? recent[0]?.id ?? null);
		};
		void bootstrap();
		return () => {
			mounted = false;
		};
	}, []);

	const refreshHistory = () => {
		const recent = agentTaskManager.getRecentTasks(12);
		setHistory(recent);
		setSelectedHistoryId((current) => {
			if (current && recent.some((task) => task.id === current)) {
				return current;
			}
			return recent[0]?.id ?? null;
		});
	};

	const refreshConnectionState = async () => {
		const isHealthy = await agentService.healthCheck();
		setHealthy(isHealthy);
		setPaired(agentService.checkPairing());
	};

	const serializeResult = (payload: unknown): string => {
		if (!payload) {
			return "Task completed without response payload.";
		}
		if (typeof payload === "string") {
			return payload;
		}
		try {
			return JSON.stringify(payload, null, 2);
		} catch {
			return String(payload);
		}
	};

	const handleExecuteTask = async (prompt: string, taskName: string) => {
		const trimmedPrompt = prompt.trim();
		if (!trimmedPrompt) return;

		const predefinedTask = PREDEFINED_TASKS.find(
			(task) => task.name === taskName,
		);
		const taskId = predefinedTask?.id ?? "custom-task";

		setIsExecuting(true);
		setActiveTaskName(taskName);
		setLatestError(null);

		const taskRecord = agentTaskManager.createTaskRecord(taskId, trimmedPrompt);
		taskRecord.status = "running";
		taskRecord.name = taskName;
		agentTaskManager.saveTaskToHistory(taskRecord);
		refreshHistory();

		try {
			const response = await agentService.sendMessage(trimmedPrompt);
			if (response.success) {
				const resultText = serializeResult(response.data);
				agentTaskManager.updateTaskResult(
					taskRecord.id,
					resultText,
					"complete",
				);
				setLatestResult(resultText);
				setSelectedHistoryId(taskRecord.id);
			} else {
				const errorMessage = response.error || "Agent request failed";
				agentTaskManager.updateTaskResult(
					taskRecord.id,
					errorMessage,
					"failed",
					errorMessage,
				);
				setLatestError(errorMessage);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: "Unknown agent execution error";
			agentTaskManager.updateTaskResult(
				taskRecord.id,
				errorMessage,
				"failed",
				errorMessage,
			);
			setLatestError(errorMessage);
		} finally {
			refreshHistory();
			setIsExecuting(false);
		}
	};

	const clearHistory = () => {
		agentTaskManager.clearHistory();
		setHistory([]);
		setSelectedHistoryId(null);
	};

	const pairAgent = async () => {
		const code = pairingCode.trim();
		if (!code) {
			setPairingError("Enter your 6-digit pairing code.");
			return;
		}

		setPairingError(null);
		setIsPairing(true);
		const ok = await agentService.pair(code);
		if (!ok) {
			setPairingError("Pairing failed. Confirm the code and gateway status.");
		}
		await refreshConnectionState();
		setIsPairing(false);
	};

	const unpairAgent = () => {
		agentService.unpair();
		setPaired(false);
	};

	const healthLabel =
		healthy == null
			? "Checking gateway…"
			: healthy
				? "Gateway online"
				: "Gateway offline";
	const selectedTask =
		history.find((task) => task.id === selectedHistoryId) ?? null;

	return (
		<PageFrame
			title="Agent"
			subtitle="Gateway status and task orchestration entrypoint."
		>
			<FrameSection
				title="Gateway & Pairing"
				subtitle="Connection health, pairing state, and execution readiness."
			>
				<div className="glass rounded-xl border border-white/10 p-3">
					<div className="flex flex-wrap items-center gap-3 text-sm">
						<span
							className="rounded-full border border-white/20 px-3 py-1"
							style={{ color: "var(--white-dim)" }}
						>
							{healthLabel}
						</span>
						<span style={{ color: "var(--white-dim)" }}>
							Endpoint:{" "}
							{import.meta.env.VITE_AGENT_GATEWAY_URL ||
								import.meta.env.VITE_AGENT_URL ||
								"http://127.0.0.1:3000"}
						</span>
						<span
							className="rounded-full border border-white/20 px-3 py-1"
							style={{ color: "var(--white-dim)" }}
						>
							{paired ? "Paired" : "Not paired"}
						</span>
						<button
							type="button"
							onClick={() => void refreshConnectionState()}
							className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10"
						>
							Refresh
						</button>
					</div>
					<div className="mt-3 flex flex-wrap items-center gap-2">
						<input
							type="text"
							value={pairingCode}
							onChange={(event) => setPairingCode(event.target.value)}
							placeholder="Enter pairing code"
							className="w-44 rounded-md border border-white/20 bg-black/25 px-3 py-1.5 text-xs outline-none"
						/>
						<button
							type="button"
							onClick={() => void pairAgent()}
							disabled={isPairing || !healthy}
							className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{isPairing ? "Pairing…" : "Pair"}
						</button>
						<button
							type="button"
							onClick={unpairAgent}
							disabled={!paired}
							className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Unpair
						</button>
						{pairingError ? (
							<span className="text-xs text-red-300">{pairingError}</span>
						) : null}
					</div>
				</div>
			</FrameSection>

			<FrameSection
				title="Task Console"
				subtitle="Quick tasks, custom prompts, and history powered by the shared task panel."
			>
				<div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
					<div className="glass min-h-96 rounded-xl p-2">
						<AgentTaskPanel
							onExecuteTask={(prompt, taskName) => {
								if (!healthy || !paired) {
									setLatestError(
										"Gateway must be online and paired before running tasks.",
									);
									return;
								}
								void handleExecuteTask(prompt, taskName);
							}}
							isExecuting={isExecuting}
						/>
					</div>
					<div className="space-y-3">
						<div className="glass rounded-xl p-3">
							<div className="text-sm font-medium">Execution State</div>
							<div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
								<div style={{ color: "var(--white-dim)" }}>
									Task: {activeTaskName || "None"}
								</div>
								<div style={{ color: "var(--white-dim)" }}>
									Status: {isExecuting ? "Running" : "Idle"}
								</div>
								<div style={{ color: "var(--white-dim)" }}>
									History entries: {history.length}
								</div>
								<div style={{ color: "var(--white-dim)" }}>
									Selected: {selectedTask?.name || "None"}
								</div>
							</div>
							{latestError ? (
								<p className="mt-2 text-xs text-red-300">{latestError}</p>
							) : null}
						</div>

						<div className="glass rounded-xl p-3">
							<div className="mb-2 text-sm font-medium">Recent Executions</div>
							{history.length === 0 ? (
								<p className="text-xs" style={{ color: "var(--white-dim)" }}>
									No task history yet.
								</p>
							) : (
								<div className="space-y-2">
									{history.slice(0, 6).map((task) => (
										<button
											type="button"
											key={task.id}
											onClick={() => setSelectedHistoryId(task.id)}
											className="w-full rounded-md border border-white/15 px-3 py-2 text-left text-xs hover:bg-white/5"
										>
											<div className="flex items-center justify-between gap-2">
												<span>{task.name}</span>
												<span style={{ color: "var(--white-dim)" }}>
													{task.status}
												</span>
											</div>
											<div style={{ color: "var(--white-dim)" }}>
												{new Date(task.executedAt).toLocaleString()}
											</div>
										</button>
									))}
								</div>
							)}
							<button
								type="button"
								onClick={clearHistory}
								disabled={history.length === 0}
								className="mt-3 rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
							>
								Clear Stored History
							</button>
						</div>
					</div>
				</div>
			</FrameSection>

			{latestResult ? (
				<StructuredResultSection
					title="Latest Output"
					subtitle="Structured summary for the most recent successful task."
					rawResult={latestResult}
				/>
			) : null}

			{selectedTask?.result ? (
				<StructuredResultSection
					title="Selected History Output"
					subtitle={selectedTask.name}
					rawResult={selectedTask.result}
				/>
			) : null}
		</PageFrame>
	);
}
