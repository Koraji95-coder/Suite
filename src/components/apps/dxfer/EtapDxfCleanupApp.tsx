import {
	AlertTriangle,
	CheckCircle2,
	Clock3,
	FileCode2,
	LoaderCircle,
	PlugZap,
	RefreshCw,
	Save,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Badge,
	Button,
	Input,
	Panel,
	Stack,
	Text,
} from "@/components/primitives";
import styles from "./EtapDxfCleanupApp.module.css";
import type {
	EtapCleanupCommand,
	EtapCleanupRunResponse,
} from "./etapCleanupService";
import { etapCleanupService } from "./etapCleanupService";

const DEFAULT_TIMEOUT_MS = 90_000;
const HISTORY_MAX = 12;

const COMMAND_OPTIONS: ReadonlyArray<{
	value: EtapCleanupCommand;
	label: string;
	description: string;
}> = [
	{
		value: "ETAPFIX",
		label: "Full Cleanup",
		description: "Run the full ETAP cleanup pipeline.",
	},
	{
		value: "ETAPTEXT",
		label: "Text Only",
		description: "Fix text alignment and label overlap.",
	},
	{
		value: "ETAPBLOCKS",
		label: "Blocks Only",
		description: "Normalize ETAP block scale and orientation.",
	},
	{
		value: "ETAPLAYERFIX",
		label: "Layers Only",
		description: "Rebuild layer mapping for ETAP entities.",
	},
	{
		value: "ETAPOVERLAP",
		label: "Overlap Only",
		description: "Detect and resolve overlapping entities.",
	},
	{
		value: "ETAPIMPORT",
		label: "Import Workflow",
		description: "Run ETAP import + preparation command.",
	},
];

type RunHistoryEntry = {
	id: string;
	at: number;
	command: EtapCleanupCommand;
	success: boolean;
	code: string;
	message: string;
	drawingName: string;
	warningCount: number;
	elapsedMs: number | null;
};

function coerceNumber(value: unknown, fallback: number): number {
	const candidate = Number(value);
	return Number.isFinite(candidate) ? candidate : fallback;
}

function clampTimeoutMs(value: number): number {
	return Math.max(
		1_000,
		Math.min(600_000, Math.trunc(value || DEFAULT_TIMEOUT_MS)),
	);
}

function runId(): string {
	try {
		if (
			typeof crypto !== "undefined" &&
			typeof crypto.randomUUID === "function"
		) {
			return crypto.randomUUID();
		}
	} catch {
		// Ignore and use fallback.
	}
	return `run-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function EtapDxfCleanupApp() {
	const [command, setCommand] = useState<EtapCleanupCommand>("ETAPFIX");
	const [pluginDllPath, setPluginDllPath] = useState("");
	const [waitForCompletion, setWaitForCompletion] = useState(true);
	const [saveDrawing, setSaveDrawing] = useState(false);
	const [timeoutMs, setTimeoutMs] = useState(DEFAULT_TIMEOUT_MS);
	const [running, setRunning] = useState(false);
	const [refreshingStatus, setRefreshingStatus] = useState(false);
	const [lastStatusAt, setLastStatusAt] = useState<number | null>(null);
	const [statusMessage, setStatusMessage] = useState("");
	const [lastRun, setLastRun] = useState<EtapCleanupRunResponse | null>(null);
	const [history, setHistory] = useState<RunHistoryEntry[]>([]);
	const [cadStatus, setCadStatus] = useState({
		connected: false,
		autocadRunning: false,
		drawingOpen: false,
		drawingName: "",
		error: "",
		providerConfigured: "",
		providerPath: "",
	});

	const selectedCommand = useMemo(
		() =>
			COMMAND_OPTIONS.find((entry) => entry.value === command) ||
			COMMAND_OPTIONS[0],
		[command],
	);

	const cadReady = cadStatus.autocadRunning && cadStatus.drawingOpen;
	const normalizedTimeoutMs = clampTimeoutMs(timeoutMs);

	const refreshStatus = useCallback(async () => {
		setRefreshingStatus(true);
		const response = await etapCleanupService.getAutoCadStatus();
		setCadStatus(response.status);
		setLastStatusAt(Date.now());
		setStatusMessage(
			response.message ||
				(response.status.autocadRunning
					? "AutoCAD bridge reachable."
					: "AutoCAD not detected. Start AutoCAD and open a drawing."),
		);
		setRefreshingStatus(false);
	}, []);

	useEffect(() => {
		void refreshStatus();
	}, [refreshStatus]);

	const runCleanup = async () => {
		if (running) return;
		setRunning(true);
		const startedAt = Date.now();
		const response = await etapCleanupService.runCleanup({
			command,
			pluginDllPath: pluginDllPath.trim() || undefined,
			waitForCompletion,
			timeoutMs: normalizedTimeoutMs,
			saveDrawing,
		});
		const elapsedCandidate = coerceNumber(response.meta?.elapsedMs, NaN);
		const elapsedMs = Number.isFinite(elapsedCandidate)
			? elapsedCandidate
			: null;
		const drawingName = response.data?.drawing?.name || "";
		const message =
			response.message ||
			(response.success ? "Command queued." : "Command failed.");
		const code = response.code || "";

		setLastRun(response);
		setHistory((current) =>
			[
				{
					id: runId(),
					at: startedAt,
					command,
					success: Boolean(response.success),
					code,
					message,
					drawingName,
					warningCount: response.warnings?.length ?? 0,
					elapsedMs,
				},
				...current,
			].slice(0, HISTORY_MAX),
		);
		setStatusMessage(
			response.success
				? `${command} completed${drawingName ? ` for ${drawingName}` : ""}.`
				: `${command} failed (${code || "unknown"}).`,
		);
		if (response.success) {
			void refreshStatus();
		}
		setRunning(false);
	};

	return (
		<div className={styles.root}>
			<div className={styles.grid}>
				<Panel variant="elevated" padding="md" className={styles.controlsPanel}>
					<Stack gap={3}>
						<div className={styles.panelHeader}>
							<Text size="sm" weight="semibold">
								Execution Controls
							</Text>
							<Badge
								color="primary"
								variant="outline"
								size="sm"
								icon={<PlugZap size={12} />}
							>
								{command}
							</Badge>
						</div>

						<div className={styles.commandRail}>
							{COMMAND_OPTIONS.map((entry) => (
								<button
									key={entry.value}
									type="button"
									onClick={() => setCommand(entry.value)}
									className={
										entry.value === command
											? `${styles.commandChip} ${styles.commandChipActive}`
											: styles.commandChip
									}
									disabled={running}
								>
									<span>{entry.value}</span>
									<small>{entry.label}</small>
								</button>
							))}
						</div>

						<div className={styles.commandInfo}>
							<FileCode2 size={14} />
							<span>{selectedCommand.description}</span>
						</div>

						<label className={styles.fieldLabel}>
							Command
							<select
								className={styles.selectControl}
								value={command}
								onChange={(event) =>
									setCommand(event.target.value as EtapCleanupCommand)
								}
								disabled={running}
							>
								{COMMAND_OPTIONS.map((entry) => (
									<option key={entry.value} value={entry.value}>
										{entry.value} - {entry.label}
									</option>
								))}
							</select>
						</label>

						<Input
							label="Plugin DLL Path (Optional)"
							placeholder="C:\\AutoCAD\\Plugins\\EtapDxfCleanup.dll"
							value={pluginDllPath}
							onChange={(event) => setPluginDllPath(event.target.value)}
							disabled={running}
						/>

						<Input
							label="Timeout (ms)"
							type="number"
							min={1000}
							max={600000}
							step={1000}
							value={String(timeoutMs)}
							onChange={(event) =>
								setTimeoutMs(
									coerceNumber(event.target.value, DEFAULT_TIMEOUT_MS),
								)
							}
							disabled={running}
						/>

						<div className={styles.toggles}>
							<label className={styles.toggleRow}>
								<input
									type="checkbox"
									checked={waitForCompletion}
									onChange={(event) =>
										setWaitForCompletion(event.target.checked)
									}
									disabled={running}
								/>
								<span>Wait for completion</span>
							</label>
							<label className={styles.toggleRow}>
								<input
									type="checkbox"
									checked={saveDrawing}
									onChange={(event) => setSaveDrawing(event.target.checked)}
									disabled={running}
								/>
								<span>Save drawing after run</span>
							</label>
						</div>

						<div className={styles.actionRow}>
							<Button
								variant="primary"
								size="sm"
								iconLeft={
									running ? <LoaderCircle size={14} /> : <PlugZap size={14} />
								}
								onClick={runCleanup}
								loading={running}
								disabled={!cadStatus.connected && !cadStatus.autocadRunning}
							>
								Run Cleanup
							</Button>
							<Button
								variant="outline"
								size="sm"
								iconLeft={
									refreshingStatus ? (
										<LoaderCircle size={14} />
									) : (
										<RefreshCw size={14} />
									)
								}
								onClick={() => void refreshStatus()}
								loading={refreshingStatus}
								disabled={running}
							>
								Refresh Status
							</Button>
						</div>
					</Stack>
				</Panel>

				<Panel variant="glass" padding="md" className={styles.statusPanel}>
					<Stack gap={3}>
						<div className={styles.panelHeader}>
							<Text size="sm" weight="semibold">
								Runtime Status
							</Text>
							<Badge
								color={cadReady ? "success" : "warning"}
								variant="outline"
								size="sm"
								icon={
									cadReady ? (
										<CheckCircle2 size={12} />
									) : (
										<AlertTriangle size={12} />
									)
								}
							>
								{cadReady ? "Ready" : "Attention"}
							</Badge>
						</div>

						<div className={styles.badges}>
							<Badge
								color={cadStatus.connected ? "success" : "default"}
								variant="outline"
								size="sm"
							>
								Bridge: {cadStatus.connected ? "Connected" : "Offline"}
							</Badge>
							<Badge
								color={cadStatus.autocadRunning ? "success" : "warning"}
								variant="outline"
								size="sm"
							>
								AutoCAD: {cadStatus.autocadRunning ? "Running" : "Not Running"}
							</Badge>
							<Badge
								color={cadStatus.drawingOpen ? "success" : "warning"}
								variant="outline"
								size="sm"
							>
								Drawing: {cadStatus.drawingOpen ? "Open" : "Closed"}
							</Badge>
							<Badge color="default" variant="outline" size="sm">
								Provider: {cadStatus.providerConfigured || "unknown"}
							</Badge>
						</div>

						<div className={styles.statusCard}>
							<Text size="xs" color="muted">
								Current Drawing
							</Text>
							<Text size="sm" weight="semibold">
								{cadStatus.drawingName || "No active drawing"}
							</Text>
							{cadStatus.error ? (
								<Text size="xs" color="danger">
									{cadStatus.error}
								</Text>
							) : null}
							{lastStatusAt ? (
								<Text size="xs" color="muted">
									Last checked {new Date(lastStatusAt).toLocaleTimeString()}
								</Text>
							) : null}
						</div>

						<div className={styles.statusCard}>
							<Text size="xs" color="muted">
								Last Run Result
							</Text>
							{lastRun ? (
								<>
									<Text
										size="sm"
										weight="semibold"
										color={lastRun.success ? "default" : "danger"}
									>
										{lastRun.success ? "Success" : "Failed"}{" "}
										{lastRun.code ? `(${lastRun.code})` : ""}
									</Text>
									<Text size="xs" color="muted">
										{lastRun.message || "No response message."}
									</Text>
									{lastRun.warnings && lastRun.warnings.length > 0 ? (
										<div className={styles.warningList}>
											{lastRun.warnings.map((warning, index) => (
												<div
													key={`${index}-${warning}`}
													className={styles.warningItem}
												>
													<AlertTriangle size={12} />
													<span>{warning}</span>
												</div>
											))}
										</div>
									) : null}
								</>
							) : (
								<Text size="xs" color="muted">
									No cleanup run yet.
								</Text>
							)}
						</div>

						<div className={styles.statusLine}>
							<Clock3 size={12} />
							<span>{statusMessage || "Ready."}</span>
						</div>
					</Stack>
				</Panel>
			</div>

			<Panel variant="outline" padding="md" className={styles.historyPanel}>
				<div className={styles.panelHeader}>
					<Text size="sm" weight="semibold">
						Run History
					</Text>
					<Badge
						color="default"
						variant="outline"
						size="sm"
						icon={<Save size={12} />}
					>
						{history.length} entries
					</Badge>
				</div>
				{history.length === 0 ? (
					<div className={styles.emptyHistory}>No runs captured yet.</div>
				) : (
					<div className={styles.historyList}>
						{history.map((entry) => (
							<div key={entry.id} className={styles.historyItem}>
								<div className={styles.historyTop}>
									<div>
										<strong>{entry.command}</strong>
										<span>{new Date(entry.at).toLocaleString()}</span>
									</div>
									<Badge
										color={entry.success ? "success" : "danger"}
										variant="outline"
										size="sm"
									>
										{entry.success ? "Success" : "Failed"}
									</Badge>
								</div>
								<div className={styles.historyMeta}>
									<span>Code: {entry.code || "none"}</span>
									<span>Drawing: {entry.drawingName || "n/a"}</span>
									<span>
										Duration:{" "}
										{entry.elapsedMs !== null
											? `${Math.round(entry.elapsedMs)}ms`
											: "n/a"}
									</span>
									<span>Warnings: {entry.warningCount}</span>
								</div>
								<div className={styles.historyMessage}>{entry.message}</div>
							</div>
						))}
					</div>
				)}
			</Panel>
		</div>
	);
}
