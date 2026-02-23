import { Database, FileText, HardDrive, Shield } from "lucide-react";
import { useState } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { BackupManager } from "./BackupManager";
import { DatabaseBrowser } from "./DatabaseBrowser";
import { FileBrowser } from "./FileBrowser";
import type { StorageTab } from "./storageTypes";

const TABS: { key: StorageTab; label: string; icon: typeof FileText }[] = [
	{ key: "browser", label: "Files", icon: FileText },
	{ key: "database", label: "Database", icon: Database },
	{ key: "backups", label: "Backups", icon: Shield },
];

export function StoragePanel() {
	const { palette } = useTheme();
	const [tab, setTab] = useState<StorageTab>("browser");

	return (
		<div style={{ padding: 24 }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 24,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
					<div
						style={{
							padding: 10,
							borderRadius: 10,
							background: `linear-gradient(135deg, ${hexToRgba(palette.primary, 0.2)}, ${hexToRgba(palette.primary, 0.05)})`,
						}}
					>
						<HardDrive className="w-7 h-7" style={{ color: palette.primary }} />
					</div>
					<div>
						<h2
							style={{
								margin: 0,
								fontSize: 22,
								fontWeight: 700,
								color: palette.text,
							}}
						>
							Storage
						</h2>
						<p style={{ margin: 0, fontSize: 13, color: palette.textMuted }}>
							{tab === "browser" && "File management"}
							{tab === "database" && "Database browser"}
							{tab === "backups" && "Backup & restore"}
						</p>
					</div>
				</div>

				<div style={{ display: "flex", gap: 6 }}>
					{TABS.map(({ key, label, icon: Icon }) => {
						const active = tab === key;
						return (
							<button
								key={key}
								onClick={() => setTab(key)}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
									padding: "8px 16px",
									borderRadius: 8,
									fontSize: 14,
									fontWeight: 500,
									cursor: "pointer",
									transition: "all 0.2s",
									background: active
										? hexToRgba(palette.primary, 0.18)
										: hexToRgba(palette.surface, 0.4),
									border: active
										? `1px solid ${palette.primary}`
										: `1px solid ${hexToRgba(palette.textMuted, 0.15)}`,
									color: active ? palette.text : palette.textMuted,
								}}
							>
								<Icon className="w-4 h-4" />
								{label}
							</button>
						);
					})}
				</div>
			</div>

			<div
				style={{
					padding: 20,
					borderRadius: 12,
					background: hexToRgba(palette.surface, 0.35),
					border: `1px solid ${hexToRgba(palette.primary, 0.08)}`,
				}}
			>
				{tab === "browser" && <FileBrowser />}
				{tab === "database" && <DatabaseBrowser />}
				{tab === "backups" && <BackupManager />}
			</div>
		</div>
	);
}
