import { Loader2, RefreshCw } from "lucide-react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";
import type { TableInfo } from "./storageTypes";

interface DatabaseBrowserSidebarProps {
	palette: ColorScheme;
	tables: TableInfo[];
	selectedTable: string;
	loadingTables: boolean;
	onRefreshTables: () => void;
	onSelectTable: (table: string) => void;
}

export function DatabaseBrowserSidebar({
	palette,
	tables,
	selectedTable,
	loadingTables,
	onRefreshTables,
	onSelectTable,
}: DatabaseBrowserSidebarProps) {
	return (
		<div
			className="w-full xl:w-[220px] xl:shrink-0"
			style={{
				padding: 12,
				borderRadius: 10,
				background: hexToRgba(palette.surface, 0.5),
				border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
				overflowY: "auto",
				maxHeight: 600,
			}}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 10,
				}}
			>
				<span style={{ fontWeight: 600, fontSize: 13, color: palette.text }}>
					Tables
				</span>
				<button
					onClick={onRefreshTables}
					disabled={loadingTables}
					style={{
						background: "none",
						border: "none",
						cursor: "pointer",
						color: palette.primary,
					}}
				>
					<RefreshCw
						className={`w-3.5 h-3.5 ${loadingTables ? "animate-spin" : ""}`}
					/>
				</button>
			</div>

			{loadingTables ? (
				<div
					style={{ textAlign: "center", padding: 24, color: palette.textMuted }}
				>
					<Loader2 className="w-5 h-5 animate-spin mx-auto" />
				</div>
			) : (
				tables.map((table) => (
					<button
						key={table.name}
						onClick={() => onSelectTable(table.name)}
						style={{
							display: "flex",
							justifyContent: "space-between",
							width: "100%",
							padding: "8px 10px",
							borderRadius: 6,
							marginBottom: 4,
							fontSize: 13,
							cursor: "pointer",
							background:
								selectedTable === table.name
									? hexToRgba(palette.primary, 0.15)
									: "transparent",
							border:
								selectedTable === table.name
									? `1px solid ${palette.primary}`
									: "1px solid transparent",
							color: palette.text,
							transition: "all 0.15s",
						}}
					>
						<span>{table.name}</span>
						<span style={{ color: palette.textMuted, fontSize: 12 }}>
							{table.row_count}
						</span>
					</button>
				))
			)}
		</div>
	);
}
