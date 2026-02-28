import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { AgentTaskPanel } from "@/services/AgentTaskPanel";
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
		success:
			"[border-color:color-mix(in_srgb,var(--accent)_60%,var(--border))] [color:var(--accent)]",
		warning:
			"[border-color:color-mix(in_srgb,var(--warning)_60%,var(--border))] [color:var(--warning)]",
		error:
			"[border-color:color-mix(in_srgb,var(--danger)_60%,var(--border))] [color:var(--danger)]",
		info: "[border-color:var(--border)] [color:var(--text-muted)]",
	};

	return (
		<FrameSection title={title} subtitle={subtitle}>
			<div className="space-y-3">
				<div className="flex items-center justify-between gap-2">
					<span className="text-xs [color:var(--text-muted)]">
						Parsed result
					</span>
					<span
						className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${badgeClassName[parsed.kind]}`}
					>
						{badgeLabel[parsed.kind]}
					</span>
				</div>
				<div className="rounded-md border p-3 text-xs [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text)]">
					{parsed.summary}
				</div>
				{parsed.fields.length > 0 ? (
					<div className="grid gap-2 md:grid-cols-2">
						{parsed.fields.map((field) => (
							<div
								key={field.key}
								className="rounded-md border p-2 text-xs [border-color:var(--border)] [background:var(--surface)]"
							>
								<div className="uppercase tracking-wide [color:var(--text-muted)]">
									{field.key}
								</div>
								<div className="mt-1 [color:var(--text)]">{field.value}</div>
							</div>
						))}
					</div>
				) : null}
				<details>
					<summary className="cursor-pointer text-xs [color:var(--text-muted)]">
						Raw response
					</summary>
					<pre className="mt-2 max-h-72 overflow-auto rounded-md border p-3 text-xs [border-color:var(--border)] [background:var(--bg-heavy)] [color:var(--text)]">
						{parsed.raw}
					</pre>
				</details>
			</div>
		</FrameSection>
	);
}

export default function AgentRoutePage() {
	const { user } = useAuth();
	const adminRoleClaim = user?.app_metadata?.role;
	const adminRolesClaim = user?.app_metadata?.roles;
	const isAdminRoleActive =
		(typeof adminRoleClaim === "string" &&
			adminRoleClaim.trim().toLowerCase() === "admin") ||
		(Array.isArray(adminRolesClaim) &&
			adminRolesClaim.some(
				(entry) =>
					typeof entry === "string" && entry.trim().toLowerCase() === "admin",
			));
	const [healthy, setHealthy] = useState<boolean | null>(null);
	const [paired, setPaired] = useState(false);
	const [pairingCode, setPairingCode] = useState("");
	const [isPairing, setIsPairing] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
	const [pairingError, setPairingError] = useState<string | null>(null);
	const [isExecuting, setIsExecuting] = useState(false);
	const [history, setHistory] = useState<ExecutedTask[]>([]);
	const [activeTaskName, setActiveTaskName] = useState<string | null>(null);
	const [latestResult, setLatestResult] = useState<string>("");
	const [latestError, setLatestError] = useState<string | null>(null);
	const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(
		null,
	);
	const [healthError, setHealthError] = useState<string | null>(null);
	const [brokerConfig, setBrokerConfig] = useState<{
		ok: boolean;
		missing: string[];
		warnings?: string[];
		require_webhook_secret?: boolean;
	} | null>(null);
	const userId = user?.id ?? null;

	const refreshConnectionState = useCallback(async () => {
		const isHealthy = await agentService.healthCheck();
		setHealthy(isHealthy);
		setHealthError(agentService.getLastHealthError());

		if (agentService.usesBroker()) {
			const config = await agentService.getBrokerConfig();
			setBrokerConfig(config);
		}

		if (isHealthy && userId) {
			setIsRestoring(true);
			try {
				const restored = await agentService.restorePairingForActiveUser();
				if (restored.restored && restored.reason === "restored") {
					setRestoreMessage("Restored trusted pairing for this device.");
				}
			} finally {
				setIsRestoring(false);
			}
		} else {
			setIsRestoring(false);
		}

		const pairedState = await agentService.refreshPairingStatus();
		setPaired(pairedState);

		const recent = agentTaskManager.getRecentTasks(12);
		setHistory(recent);
		setSelectedHistoryId((current) => current ?? recent[0]?.id ?? null);
	}, [userId]);

	useEffect(() => {
		void refreshConnectionState();
	}, [refreshConnectionState]);

	useEffect(() => {
		if (healthy === true) return;
		if (agentService.usesBroker() && !userId) return;

		const timer = window.setInterval(() => {
			void refreshConnectionState();
		}, 4000);

		return () => {
			window.clearInterval(timer);
		};
	}, [healthy, refreshConnectionState, userId]);

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
		setRestoreMessage(null);
		setIsPairing(true);
		const ok = await agentService.pair(code);
		if (!ok) {
			setPairingError("Pairing failed. Confirm the code and gateway status.");
		} else {
			setRestoreMessage("Device trusted. Future sign-ins restore automatically.");
		}
		await refreshConnectionState();
		setIsPairing(false);
	};

	const unpairAgent = async () => {
		setRestoreMessage(null);
		await agentService.unpair();
		setPaired(false);
	};

	const healthLabel =
		healthy == null
			? "Checking gateway…"
			: healthy
				? "Gateway online"
				: "Gateway offline";
	const needsAuthForBroker =
		agentService.usesBroker() &&
		healthy === false &&
		typeof healthError === "string" &&
		healthError.toLowerCase().includes("session required");
	const selectedTask =
		history.find((task) => task.id === selectedHistoryId) ?? null;

	return (
		<PageFrame
			title="Koro Agent"
			subtitle="Gateway status and task orchestration entrypoint."
		>
			<FrameSection
				title="Gateway & Pairing"
				subtitle="Connection health, pairing state, and execution readiness."
			>
				<div className="rounded-xl border p-3 [border-color:var(--border)] [background:var(--bg-mid)]">
					<div className="flex flex-wrap items-center gap-3 text-sm">
						<span className="rounded-full border px-3 py-1 [border-color:var(--border)] [color:var(--text-muted)]">
							{healthLabel}
						</span>
						<span
							className={`rounded-full border px-3 py-1 ${
								isAdminRoleActive
									? "[border-color:color-mix(in_srgb,var(--accent)_60%,var(--border))] [color:var(--accent)]"
									: "[border-color:var(--border)] [color:var(--text-muted)]"
							}`}
						>
							{isAdminRoleActive ? "Admin role active" : "Standard access"}
						</span>
						<span className="[color:var(--text-muted)]">
							Endpoint: {agentService.getEndpoint()}
						</span>
						<span className="rounded-full border px-3 py-1 [border-color:var(--border)] [color:var(--text-muted)]">
							{paired ? "Paired" : "Not paired"}
						</span>
						<button
							type="button"
							onClick={() => void refreshConnectionState()}
							className="rounded-md border px-3 py-1.5 text-xs transition hover:[background:var(--surface-2)] [border-color:var(--border)] [color:var(--text)]"
						>
							Refresh
						</button>
					</div>
					{agentService.usesBroker() ? (
						<div className="mt-3 rounded-lg border px-3 py-2 text-xs [border-color:var(--border)]">
							{brokerConfig?.ok ? (
								<span className="[color:var(--text)]">
									Backend broker ready.
								</span>
							) : (
								<div className="space-y-1">
									<span className="[color:var(--text-muted)]">
										Backend broker needs attention.
									</span>
									{brokerConfig?.missing?.map((item) => (
										<div key={item} className="[color:var(--accent)]">
											Missing: {item}
										</div>
									))}
									{brokerConfig?.warnings?.map((item) => (
										<div key={item} className="[color:var(--text-muted)]">
											Warning: {item}
										</div>
									))}
								</div>
							)}
						</div>
					) : null}
					<div className="mt-3 flex flex-wrap items-center gap-2">
						<input
							type="text"
							value={pairingCode}
							onChange={(event) => setPairingCode(event.target.value)}
							placeholder="Enter pairing code"
							className="w-44 rounded-md border px-3 py-1.5 text-xs outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
						/>
						<button
							type="button"
							onClick={() => void pairAgent()}
							disabled={isPairing || isRestoring || !healthy}
							className="rounded-md border px-3 py-1.5 text-xs transition hover:[background:var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-50 [border-color:var(--border)] [color:var(--text)]"
						>
							{isPairing ? "Pairing…" : "Pair"}
						</button>
						<button
							type="button"
							onClick={() => void unpairAgent()}
							disabled={!paired}
							className="rounded-md border px-3 py-1.5 text-xs transition hover:[background:var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-50 [border-color:var(--border)] [color:var(--text)]"
						>
							Unpair
						</button>
						{pairingError ? (
							<span className="text-xs [color:var(--danger)]">
								{pairingError}
							</span>
						) : null}
						{isRestoring ? (
							<span className="text-xs [color:var(--text-muted)]">
								Restoring trusted pairing…
							</span>
						) : null}
						{restoreMessage ? (
							<span className="text-xs [color:var(--accent)]">
								{restoreMessage}
							</span>
						) : null}
						{agentService.usesBroker() ? (
							<span className="text-xs [color:var(--text-muted)]">
								Use the code shown by the gateway, then click Pair here to bind
								this Suite session.
							</span>
						) : null}
					</div>

					{!healthy ? (
						<div className="mt-3 rounded-md border p-3 text-xs [border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)]">
							<div className="font-medium [color:var(--text)]">
								{needsAuthForBroker
									? "Sign in to validate broker readiness."
									: "Gateway is unreachable from this container."}
							</div>
							{healthError ? (
								<div className="mt-1 [color:var(--danger)]">
									{healthError}
								</div>
							) : null}
							{!needsAuthForBroker ? (
								<>
									<div className="mt-2">
										Start ZeroClaw gateway locally and ensure it listens on port
										3000.
									</div>
									<pre className="mt-2 overflow-auto rounded border p-2 [border-color:var(--border)] [background:var(--bg-heavy)] [color:var(--text)]">
zeroclaw gateway --host 127.0.0.1 --port 3000
									</pre>
								</>
							) : null}
							<div className="mt-2">Then click Refresh.</div>
						</div>
					) : null}
				</div>
			</FrameSection>

			<FrameSection
				title="Task Console"
				subtitle="Quick tasks, custom prompts, and history powered by the shared task panel."
			>
				<div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
					<div className="min-h-96 rounded-xl border p-2 [border-color:var(--border)] [background:var(--bg-mid)]">
						<AgentTaskPanel
							onExecuteTask={(prompt, taskName) => {
								if (!healthy || !paired || isRestoring) {
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
						<div className="rounded-xl border p-3 [border-color:var(--border)] [background:var(--bg-mid)]">
							<div className="text-sm font-medium">Execution State</div>
							<div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
								<div className="[color:var(--text-muted)]">
									Task: {activeTaskName || "None"}
								</div>
								<div className="[color:var(--text-muted)]">
									Status: {isExecuting ? "Running" : "Idle"}
								</div>
								<div className="[color:var(--text-muted)]">
									History entries: {history.length}
								</div>
								<div className="[color:var(--text-muted)]">
									Selected: {selectedTask?.name || "None"}
								</div>
							</div>
							{latestError ? (
								<p className="mt-2 text-xs [color:var(--danger)]">
									{latestError}
								</p>
							) : null}
						</div>

						<div className="rounded-xl border p-3 [border-color:var(--border)] [background:var(--bg-mid)]">
							<div className="mb-2 text-sm font-medium">Recent Executions</div>
							{history.length === 0 ? (
								<p className="text-xs [color:var(--text-muted)]">
									No task history yet.
								</p>
							) : (
								<div className="space-y-2">
									{history.slice(0, 6).map((task) => (
										<button
											type="button"
											key={task.id}
											onClick={() => setSelectedHistoryId(task.id)}
											className="w-full rounded-md border px-3 py-2 text-left text-xs transition hover:[background:var(--surface-2)] [border-color:var(--border)]"
										>
											<div className="flex items-center justify-between gap-2">
												<span>{task.name}</span>
												<span className="[color:var(--text-muted)]">
													{task.status}
												</span>
											</div>
											<div className="[color:var(--text-muted)]">
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
								className="mt-3 rounded-md border px-3 py-1.5 text-xs transition hover:[background:var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-50 [border-color:var(--border)] [color:var(--text)]"
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
