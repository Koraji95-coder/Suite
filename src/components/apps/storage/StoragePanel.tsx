import { Database, FileText, HardDrive, Shield } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BackupManager } from "./BackupManager";
import { DatabaseBrowser } from "./DatabaseBrowser";
import { FileBrowser } from "./FileBrowser";
import styles from "./StoragePanel.module.css";
import type { StorageTab } from "./storageTypes";

const TABS: { key: StorageTab; label: string; icon: typeof FileText }[] = [
	{ key: "browser", label: "Files", icon: FileText },
	{ key: "database", label: "Database", icon: Database },
	{ key: "backups", label: "Backups", icon: Shield },
];

const TAB_DESCRIPTIONS: Record<StorageTab, string> = {
	browser: "File management",
	database: "Database browser",
	backups: "Backup & restore",
};

export function StoragePanel() {
	const [tab, setTab] = useState<StorageTab>("browser");

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<div className={styles.titleRow}>
					<div className={styles.iconWrap}>
						<HardDrive className={styles.icon} />
					</div>
					<div>
						<h2 className={styles.title}>Storage</h2>
						<p className={styles.subtitle}>{TAB_DESCRIPTIONS[tab]}</p>
					</div>
				</div>

				<div className={styles.tabs}>
					{TABS.map(({ key, label, icon: Icon }) => {
						const active = tab === key;
						return (
							<button
								key={key}
								onClick={() => setTab(key)}
								className={cn(
									styles.tabButton,
									active ? styles.tabButtonActive : styles.tabButtonInactive,
								)}
							>
								<Icon className={styles.tabIcon} />
								{label}
							</button>
						);
					})}
				</div>
			</div>

			<div className={styles.panel}>
				{tab === "browser" && <FileBrowser />}
				{tab === "database" && <DatabaseBrowser />}
				{tab === "backups" && <BackupManager />}
			</div>
		</div>
	);
}
