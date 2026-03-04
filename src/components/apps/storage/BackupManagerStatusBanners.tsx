import styles from "./BackupManagerStatusBanners.module.css";

interface BackupManagerStatusBannersProps {
	status: "idle" | "running" | "done" | "error";
	restoreMsg: string | null;
}

export function BackupManagerStatusBanners({
	status,
	restoreMsg,
}: BackupManagerStatusBannersProps) {
	return (
		<>
			{status === "done" && (
				<div className={styles.successBanner}>Backup saved successfully</div>
			)}

			{status === "error" && (
				<div className={styles.errorBanner}>Backup failed</div>
			)}

			{restoreMsg && <div className={styles.restoreBanner}>{restoreMsg}</div>}
		</>
	);
}
