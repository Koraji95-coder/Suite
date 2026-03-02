"use client";

import { useState } from "react";
import { Sheet, SheetContent } from "@/components/apps/ui/sheet";
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
		<div className="bg-background flex min-h-0">
			<div className="bg-card border-border hidden w-64 flex-col border-r lg:flex">
				<FileManagerDashboardSidebar />
			</div>

			<Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
				<SheetContent side="left" className="w-64 p-0">
					<div className="bg-card flex h-full flex-col">
						<FileManagerDashboardSidebar
							onSidebarItemClick={() => setIsMobileSidebarOpen(false)}
						/>
					</div>
				</SheetContent>
			</Sheet>

			<Sheet open={isStoragePanelOpen} onOpenChange={setIsStoragePanelOpen}>
				<SheetContent side="right" className="w-80 p-6">
					<FileManagerDashboardStoragePanel />
				</SheetContent>
			</Sheet>

			<div className="flex min-w-0 flex-1 flex-col">
				<FileManagerDashboardHeader
					searchQuery={searchQuery}
					onSearchQueryChange={setSearchQuery}
					onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
					onOpenStoragePanel={() => setIsStoragePanelOpen(true)}
				/>

				<div className="flex min-h-0 flex-1">
					<div className="flex-1 overflow-auto p-4 lg:p-6">
						<div className="mb-6">
							<h1 className="mb-1 text-xl font-semibold lg:text-2xl">
								All files
							</h1>
							<p className="text-muted-foreground text-sm lg:text-base">
								All of your files are displayed here
							</p>
						</div>

						<FileManagerDashboardRecentFiles />
						<FileManagerDashboardAllFiles />
					</div>

					<div className="border-border bg-card hidden w-80 border-l p-6 xl:block">
						<FileManagerDashboardStoragePanel />
					</div>
				</div>
			</div>
		</div>
	);
}
