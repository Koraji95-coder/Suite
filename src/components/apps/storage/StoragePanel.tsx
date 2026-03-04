import { Database, FileText, HardDrive, Shield } from "lucide-react";
import { useState } from "react";
import { BackupManager } from "./BackupManager";
import { DatabaseBrowser } from "./DatabaseBrowser";
import { FileBrowser } from "./FileBrowser";
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
		<div className="p-6">
			<div className="mb-6 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="rounded-[10px] p-2.5 [background:color-mix(in_srgb,var(--primary)_15%,transparent)]">
						<HardDrive className="h-7 w-7 [color:var(--primary)]" />
					</div>
					<div>
						<h2 className="text-[22px] font-bold [color:var(--text)]">
							Storage
						</h2>
						<p className="text-[13px] [color:var(--text-muted)]">
							{TAB_DESCRIPTIONS[tab]}
						</p>
					</div>
				</div>

				<div className="flex gap-1.5">
					{TABS.map(({ key, label, icon: Icon }) => {
						const active = tab === key;
						return (
							<button
								key={key}
								onClick={() => setTab(key)}
								className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition ${
									active
										? "[border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_18%,transparent)] [color:var(--text)]"
										: "border-[color-mix(in_srgb,var(--text-muted)_15%,transparent)] [background:color-mix(in_srgb,var(--surface)_40%,transparent)] [color:var(--text-muted)]"
								}`}
							>
								<Icon className="h-4 w-4" />
								{label}
							</button>
						);
					})}
				</div>
			</div>

			<div className="rounded-xl border p-5 border-[color-mix(in_srgb,var(--primary)_8%,transparent)] [background:color-mix(in_srgb,var(--surface)_35%,transparent)]">
				{tab === "browser" && <FileBrowser />}
				{tab === "database" && <DatabaseBrowser />}
				{tab === "backups" && <BackupManager />}
			</div>
		</div>
	);
}
