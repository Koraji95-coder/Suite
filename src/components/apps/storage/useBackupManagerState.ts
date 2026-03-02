import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import {
	type BackupFileInfo,
	deleteBackupFile,
	downloadYaml,
	getLastBackupTimestamp,
	listBackupFiles,
	readBackupFile,
	restoreFromYaml,
	runFullBackup,
} from "@/supabase/backupManager";
import { formatSize, loadHistory, saveHistory } from "./backupManagerModels";
import type { BackupHistoryEntry } from "./storageTypes";

type BackupStatus = "idle" | "running" | "done" | "error";

export function useBackupManagerState() {
	const { showToast } = useToast();
	const [status, setStatus] = useState<BackupStatus>("idle");
	const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
	const [lastBackup, setLastBackup] = useState(getLastBackupTimestamp());
	const [files, setFiles] = useState<BackupFileInfo[]>([]);
	const [loadingFiles, setLoadingFiles] = useState(false);
	const [history, setHistory] = useState<BackupHistoryEntry[]>(loadHistory);
	const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	const refreshFiles = useCallback(async () => {
		setLoadingFiles(true);
		setFiles(await listBackupFiles());
		setLoadingFiles(false);
	}, []);

	useEffect(() => {
		void refreshFiles();
	}, [refreshFiles]);

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
			setHistory((previous) => {
				const next = [entry, ...previous];
				saveHistory(next);
				return next;
			});
			await refreshFiles();
			setStatus("done");
			setTimeout(() => setStatus("idle"), 3000);
		} catch {
			setStatus("error");
			setTimeout(() => setStatus("idle"), 3000);
		}
	};

	const handleFileRestore = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
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

	const confirmDelete = async () => {
		if (!pendingDelete) return;
		if (await deleteBackupFile(pendingDelete)) {
			setFiles((prev) => prev.filter((file) => file.name !== pendingDelete));
			showToast("success", `Deleted "${pendingDelete}".`);
		} else {
			showToast("error", `Failed to delete "${pendingDelete}".`);
		}
		setPendingDelete(null);
	};

	const handleDownloadFile = async (filename: string) => {
		const content = await readBackupFile(filename);
		if (content) downloadYaml(content, filename);
	};

	return {
		confirmDelete,
		confirmRestore,
		fileRef,
		files,
		formatSize,
		handleBackup,
		handleDownloadFile,
		handleFileRestore,
		handleRestoreFromBackup,
		history,
		lastBackup,
		loadingFiles,
		pendingDelete,
		refreshFiles,
		restoreMsg,
		setConfirmRestore,
		setPendingDelete,
		status,
	};
}
