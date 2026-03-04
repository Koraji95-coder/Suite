"use client";

import { useState } from "react";
import { Sheet, SheetContent } from "@/components/apps/ui/sheet";
import styles from "./file-manager-dashboard.module.css";
import { FileManagerDashboardAllFiles } from "./file-manager-dashboard-all-files";
import { FileManagerDashboardHeader } from "./file-manager-dashboard-header";
import { FileManagerDashboardRecentFiles } from "./file-manager-dashboard-recent-files";
import { FileManagerDashboardSidebar } from "./file-manager-dashboard-sidebar";
import { FileManagerDashboardStoragePanel } from "./file-manager-dashboard-storage-panel";

export default function FileManagerDashboard() {
	const [searchQuery, setSearchQuery] = useState("");
	const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
	const [isStoragePanelOpen, setIsStoragePanelOpen] = useState(false);

	return (
		<div className={styles.root}>
			<div className={styles.desktopSidebar}>
				<FileManagerDashboardSidebar />
			</div>

			<Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
				<SheetContent side="left" className={styles.mobileSheetContent}>
					<div className={styles.mobileSidebarShell}>
						<FileManagerDashboardSidebar
							onSidebarItemClick={() => setIsMobileSidebarOpen(false)}
						/>
					</div>
				</SheetContent>
			</Sheet>

			<Sheet open={isStoragePanelOpen} onOpenChange={setIsStoragePanelOpen}>
				<SheetContent side="right" className={styles.storageSheetContent}>
					<FileManagerDashboardStoragePanel />
				</SheetContent>
			</Sheet>

			<div className={styles.main}>
				<FileManagerDashboardHeader
					searchQuery={searchQuery}
					onSearchQueryChange={setSearchQuery}
					onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
					onOpenStoragePanel={() => setIsStoragePanelOpen(true)}
				/>

				<div className={styles.contentRow}>
					<div className={styles.scrollArea}>
						<div className={styles.headingBlock}>
							<h1 className={styles.title}>All files</h1>
							<p className={styles.subtitle}>
								All of your files are displayed here
							</p>
						</div>

						<FileManagerDashboardRecentFiles />
						<FileManagerDashboardAllFiles />
					</div>

					<div className={styles.desktopStoragePanel}>
						<FileManagerDashboardStoragePanel />
					</div>
				</div>
			</div>
		</div>
	);
}
