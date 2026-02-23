import {
	AlertTriangle,
	Download,
	Loader2,
	RefreshCw,
	Shield,
	Trash2,
	Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	type BackupFileInfo,
	deleteBackupFile,
	downloadYaml,
	getLastBackupTimestamp,
	listBackupFiles,
	readBackupFile,
	restoreFromYaml,
	runFullBackup,
} from "@/lib/backupManager";
import { hexToRgba, useTheme } from "@/lib/palette";
import type { BackupHistoryEntry } from "./storageTypes";

const HISTORY_KEY = "backup_history";

function loadHistory(): BackupHistoryEntry[] {
	try {
		return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
	} catch {
		return [];
	}
}
function saveHistory(h: BackupHistoryEntry[]) {
	localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50)));
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function BackupManager() {
	const { palette } = useTheme();
	const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
		"idle",
	);
	const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
	const [lastBackup, setLastBackup] = useState(getLastBackupTimestamp());
	const [files, setFiles] = useState<BackupFileInfo[]>([]);
	const [loadingFiles, setLoadingFiles] = useState(false);
	const [history, setHistory] = useState(loadHistory);
	const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	const refreshFiles = async () => {
		setLoadingFiles(true);
		setFiles(await listBackupFiles());
		setLoadingFiles(false);
	};

	useEffect(() => {
		refreshFiles();
	}, []);

	const handleBackup = async () => {
		setStatus("running");
		try {
			const yaml = await runFullBackup();
			setLastBackup(getLastBackupTimestamp());
			const entry: BackupHistoryEntry = {
				timestamp: new Date().toISOString(),
				tableCount: 15,
				size: new Blob([yaml]).size,
			};
			const next = [entry, ...history];
			setHistory(next);
			saveHistory(next);
			await refreshFiles();
			setStatus("done");
			setTimeout(() => setStatus("idle"), 3000);
		} catch {
			setStatus("error");
			setTimeout(() => setStatus("idle"), 3000);
		}
	};

	const handleFileRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setRestoreMsg("Reading file...");
		try {
			const text = await file.text();
			setRestoreMsg("Restoring data...");
			const { restored, errors } = await restoreFromYaml(text);
			setRestoreMsg(
				errors.length
					? `Restored ${restored} rows with ${errors.length} errors`
					: `Restored ${restored} rows successfully`,
			);
		} catch {
			setRestoreMsg("Restore failed");
		}
		setTimeout(() => setRestoreMsg(null), 5000);
		if (fileRef.current) fileRef.current.value = "";
	};

	const handleRestoreFromBackup = async (filename: string) => {
		setConfirmRestore(null);
		setRestoreMsg(`Restoring ${filename}...`);
		try {
			const content = await readBackupFile(filename);
			if (!content) {
				setRestoreMsg("Failed to read backup");
				return;
			}
			const { restored, errors } = await restoreFromYaml(content);
			setRestoreMsg(
				errors.length
					? `Restored ${restored} rows with ${errors.length} errors`
					: `Restored ${restored} rows successfully`,
			);
		} catch {
			setRestoreMsg("Restore failed");
		}
		setTimeout(() => setRestoreMsg(null), 5000);
	};

	const handleDelete = async (filename: string) => {
		if (!confirm(`Delete "${filename}"?`)) return;
		if (await deleteBackupFile(filename)) {
			setFiles((prev) => prev.filter((f) => f.name !== filename));
		}
	};

	const handleDownloadFile = async (filename: string) => {
		const content = await readBackupFile(filename);
		if (content) downloadYaml(content, filename);
	};

	const btnBase: React.CSSProperties = {
		display: "flex",
		alignItems: "center",
		gap: 6,
		padding: "8px 14px",
		borderRadius: 8,
		fontSize: 13,
		cursor: "pointer",
		transition: "all 0.15s",
	};

	return (
		<div>
			{confirmRestore && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						zIndex: 50,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: "rgba(0,0,0,0.6)",
					}}
				>
					<div
						style={{
							padding: 24,
							borderRadius: 12,
							width: 360,
							background: palette.surface,
							border: `1px solid ${hexToRgba(palette.accent, 0.3)}`,
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								marginBottom: 12,
								color: palette.accent,
							}}
						>
							<AlertTriangle className="w-5 h-5" />
							<span style={{ fontWeight: 600, fontSize: 15 }}>
								Confirm Restore
							</span>
						</div>
						<p
							style={{
								fontSize: 13,
								color: palette.textMuted,
								marginBottom: 16,
							}}
						>
							This will upsert data from{" "}
							<strong style={{ color: palette.text }}>{confirmRestore}</strong>{" "}
							into your database. Existing rows with matching IDs will be
							overwritten.
						</p>
						<div
							style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
						>
							<button
								onClick={() => setConfirmRestore(null)}
								style={{
									...btnBase,
									background: hexToRgba(palette.surface, 0.8),
									border: `1px solid ${hexToRgba(palette.textMuted, 0.3)}`,
									color: palette.text,
								}}
							>
								Cancel
							</button>
							<button
								onClick={() => handleRestoreFromBackup(confirmRestore)}
								style={{
									...btnBase,
									background: hexToRgba(palette.accent, 0.2),
									border: `1px solid ${hexToRgba(palette.accent, 0.4)}`,
									color: palette.accent,
								}}
							>
								Restore
							</button>
						</div>
					</div>
				</div>
			)}

			<div
				style={{
					display: "flex",
					gap: 8,
					marginBottom: 16,
					alignItems: "center",
				}}
			>
				<button
					onClick={handleBackup}
					disabled={status === "running"}
					style={{
						...btnBase,
						background: hexToRgba(palette.primary, 0.15),
						border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
						color: palette.text,
						opacity: status === "running" ? 0.6 : 1,
					}}
				>
					{status === "running" ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : (
						<Download className="w-4 h-4" />
					)}
					{status === "running" ? "Backing up..." : "New Backup"}
				</button>
				<button
					onClick={() => fileRef.current?.click()}
					style={{
						...btnBase,
						background: hexToRgba(palette.secondary, 0.15),
						border: `1px solid ${hexToRgba(palette.secondary, 0.3)}`,
						color: palette.text,
					}}
				>
					<Upload className="w-4 h-4" /> Restore from File
				</button>
				<input
					ref={fileRef}
					type="file"
					accept=".yaml,.yml"
					onChange={handleFileRestore}
					className="hidden"
				/>
				<button
					onClick={refreshFiles}
					disabled={loadingFiles}
					style={{
						...btnBase,
						background: hexToRgba(palette.primary, 0.1),
						border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
						color: palette.text,
					}}
				>
					<RefreshCw
						className={`w-4 h-4 ${loadingFiles ? "animate-spin" : ""}`}
					/>
				</button>
				<div style={{ flex: 1 }} />
				{lastBackup && (
					<span style={{ fontSize: 12, color: palette.textMuted }}>
						Last: {new Date(lastBackup).toLocaleString()}
					</span>
				)}
			</div>

			{status === "done" && (
				<div
					style={{
						marginBottom: 12,
						padding: "8px 14px",
						borderRadius: 8,
						fontSize: 13,
						background: hexToRgba("#22c55e", 0.12),
						border: `1px solid ${hexToRgba("#22c55e", 0.3)}`,
						color: "#4ade80",
					}}
				>
					Backup saved successfully
				</div>
			)}
			{status === "error" && (
				<div
					style={{
						marginBottom: 12,
						padding: "8px 14px",
						borderRadius: 8,
						fontSize: 13,
						background: hexToRgba(palette.accent, 0.12),
						border: `1px solid ${hexToRgba(palette.accent, 0.3)}`,
						color: palette.accent,
					}}
				>
					Backup failed
				</div>
			)}
			{restoreMsg && (
				<div
					style={{
						marginBottom: 12,
						padding: "8px 14px",
						borderRadius: 8,
						fontSize: 13,
						background: hexToRgba(palette.secondary, 0.12),
						border: `1px solid ${hexToRgba(palette.secondary, 0.3)}`,
						color: palette.secondary,
					}}
				>
					{restoreMsg}
				</div>
			)}

			<div style={{ marginBottom: 20 }}>
				<div
					style={{
						fontWeight: 600,
						fontSize: 14,
						color: palette.text,
						marginBottom: 10,
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					<Shield className="w-4 h-4" style={{ color: palette.primary }} />{" "}
					Backup Files
				</div>
				{loadingFiles ? (
					<div
						style={{
							textAlign: "center",
							padding: 24,
							color: palette.textMuted,
						}}
					>
						<Loader2 className="w-5 h-5 animate-spin mx-auto" />
					</div>
				) : files.length === 0 ? (
					<div
						style={{
							textAlign: "center",
							padding: 24,
							color: palette.textMuted,
							fontSize: 13,
						}}
					>
						No backup files yet
					</div>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
						{files.map((f) => (
							<div
								key={f.name}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 12,
									padding: "10px 14px",
									borderRadius: 8,
									background: hexToRgba(palette.surface, 0.5),
									border: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
								}}
							>
								<span
									style={{
										flex: 1,
										fontSize: 13,
										color: palette.text,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
								>
									{f.name}
								</span>
								<span
									style={{
										fontSize: 12,
										color: palette.textMuted,
										flexShrink: 0,
									}}
								>
									{formatSize(f.size)}
								</span>
								<span
									style={{
										fontSize: 12,
										color: palette.textMuted,
										flexShrink: 0,
									}}
								>
									{new Date(f.modified).toLocaleDateString()}
								</span>
								<button
									onClick={() => handleDownloadFile(f.name)}
									style={{
										background: "none",
										border: "none",
										cursor: "pointer",
										color: palette.primary,
										padding: 4,
									}}
								>
									<Download className="w-4 h-4" />
								</button>
								<button
									onClick={() => setConfirmRestore(f.name)}
									style={{
										background: "none",
										border: "none",
										cursor: "pointer",
										color: palette.secondary,
										padding: 4,
									}}
								>
									<Upload className="w-4 h-4" />
								</button>
								<button
									onClick={() => handleDelete(f.name)}
									style={{
										background: "none",
										border: "none",
										cursor: "pointer",
										color: palette.accent,
										padding: 4,
									}}
								>
									<Trash2 className="w-4 h-4" />
								</button>
							</div>
						))}
					</div>
				)}
			</div>

			{history.length > 0 && (
				<div>
					<div
						style={{
							fontWeight: 600,
							fontSize: 14,
							color: palette.text,
							marginBottom: 10,
						}}
					>
						Backup History
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						{history.slice(0, 10).map((h, i) => (
							<div
								key={i}
								style={{
									display: "flex",
									gap: 16,
									padding: "6px 12px",
									borderRadius: 6,
									fontSize: 12,
									background: hexToRgba(palette.surface, 0.3),
									color: palette.textMuted,
								}}
							>
								<span>{new Date(h.timestamp).toLocaleString()}</span>
								<span>{h.tableCount} tables</span>
								<span>{formatSize(h.size)}</span>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
