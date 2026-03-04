import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { recentFiles } from "./file-manager-dashboard-models";
import styles from "./file-manager-dashboard-recent-files.module.css";

export function FileManagerDashboardRecentFiles() {
	return (
		<section className={styles.root}>
			<div className={styles.headerRow}>
				<h2 className={styles.title}>Recently modified</h2>
				<Button variant="ghost" className={styles.viewAllButton}>
					View all →
				</Button>
			</div>
			<div className={styles.grid}>
				{recentFiles.map((file) => (
					<Panel key={file.name} padding="none" className={styles.card}>
						<div className={styles.fileRow}>
							<div className={styles.fileIconWrap}>
								<file.icon className={styles.fileIcon} />
							</div>
							<div className={styles.fileInfo}>
								<p className={styles.fileName}>{file.name}</p>
								<p className={styles.fileMeta}>
									{file.size} • {file.type}
								</p>
							</div>
						</div>
					</Panel>
				))}
			</div>
		</section>
	);
}
