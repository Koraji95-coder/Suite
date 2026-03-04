import { Folder } from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { storageData } from "./file-manager-dashboard-models";
import styles from "./file-manager-dashboard-storage-panel.module.css";

export function FileManagerDashboardStoragePanel() {
	return (
		<>
			<Panel className={styles.usagePanel} padding="lg">
				<h3 className={styles.title}>Storage usage</h3>
				<div className={styles.chartBlock}>
					<div className={styles.chartWrap}>
						<svg className={styles.chartSvg} viewBox="0 0 36 36">
							<path
								d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								className={styles.chartTrack}
							/>
							<path
								d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeDasharray="65, 100"
								className={styles.chartProgress}
							/>
						</svg>
						<div className={styles.chartCenter}>
							<Folder className={styles.chartIcon} />
							<div className={styles.chartUsed}>104.6 GB</div>
							<div className={styles.chartTotal}>of 256 GB</div>
						</div>
					</div>
				</div>

				<div className={styles.list}>
					{storageData.map((item) => (
						<div key={item.type} className={styles.listItem}>
							<div className={styles.itemIconWrap}>
								<item.icon className={styles.itemIcon} />
							</div>
							<div className={styles.itemInfo}>
								<div className={styles.itemHeader}>
									<span className={styles.itemType}>{item.type}</span>
								</div>
								<div className={styles.itemMeta}>
									{item.files} Files | {item.size}
								</div>
							</div>
						</div>
					))}
				</div>
			</Panel>

			<Panel padding="lg">
				<div className={styles.upgradeContent}>
					<div className={styles.upgradeBadgeOuter}>
						<div className={styles.upgradeBadgeInner}>
							<span className={styles.upgradeBadgeText}>$</span>
						</div>
					</div>
					<h3 className={styles.upgradeTitle}>Get more space for your files</h3>
					<p className={styles.upgradeDescription}>
						Upgrade your account to pro to get more storage
					</p>
					<Button variant="secondary" fluid>
						Upgrade to pro
					</Button>
				</div>
			</Panel>
		</>
	);
}
