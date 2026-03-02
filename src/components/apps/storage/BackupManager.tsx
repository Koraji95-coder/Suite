import { useTheme } from "@/lib/palette";
import { BackupManagerActionBar } from "./BackupManagerActionBar";
import { BackupManagerDeleteDialog } from "./BackupManagerDeleteDialog";
import { BackupManagerFilesList } from "./BackupManagerFilesList";
import { BackupManagerHistoryList } from "./BackupManagerHistoryList";
import { BackupManagerRestoreDialog } from "./BackupManagerRestoreDialog";
import { BackupManagerStatusBanners } from "./BackupManagerStatusBanners";
import { useBackupManagerState } from "./useBackupManagerState";

export function BackupManager() {
	const { palette } = useTheme();
	const {
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
	} = useBackupManagerState();

	return (
		<div>
			<BackupManagerActionBar
				palette={palette}
				status={status}
				lastBackup={lastBackup}
				loadingFiles={loadingFiles}
				fileRef={fileRef}
				onBackup={() => {
					void handleBackup();
				}}
				onFileRestore={handleFileRestore}
				onRefreshFiles={() => {
					void refreshFiles();
				}}
			/>

			<BackupManagerStatusBanners
				palette={palette}
				status={status}
				restoreMsg={restoreMsg}
			/>

			<BackupManagerFilesList
				palette={palette}
				files={files}
				loadingFiles={loadingFiles}
				formatSize={formatSize}
				onDownloadFile={(filename) => {
					void handleDownloadFile(filename);
				}}
				onRequestRestore={setConfirmRestore}
				onRequestDelete={setPendingDelete}
			/>

			<BackupManagerHistoryList
				palette={palette}
				history={history}
				formatSize={formatSize}
			/>

			<BackupManagerRestoreDialog
				confirmRestore={confirmRestore}
				onCancel={() => setConfirmRestore(null)}
				onConfirm={(filename) => {
					void handleRestoreFromBackup(filename);
				}}
			/>

			<BackupManagerDeleteDialog
				pendingDelete={pendingDelete}
				onCancel={() => setPendingDelete(null)}
				onConfirm={() => {
					void confirmDelete();
				}}
			/>
		</div>
	);
}
