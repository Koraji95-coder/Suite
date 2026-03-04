import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableInfo } from "./storageTypes";

interface DatabaseBrowserSidebarProps {
	tables: TableInfo[];
	selectedTable: string;
	loadingTables: boolean;
	onRefreshTables: () => void;
	onSelectTable: (table: string) => void;
}

export function DatabaseBrowserSidebar({
	tables,
	selectedTable,
	loadingTables,
	onRefreshTables,
	onSelectTable,
}: DatabaseBrowserSidebarProps) {
	return (
		<div className="max-h-150 w-full overflow-y-auto rounded-[10px] border p-3 xl:w-55 xl:shrink-0 border-[color-mix(in_srgb,var(--primary)_10%,transparent)] [background:color-mix(in_srgb,var(--surface)_50%,transparent)]">
			<div className="mb-2.5 flex items-center justify-between">
				<span className="text-[13px] font-semibold [color:var(--text)]">
					Tables
				</span>
				<button
					onClick={onRefreshTables}
					disabled={loadingTables}
					className="border-none bg-transparent [color:var(--primary)]"
				>
					<RefreshCw
						className={`h-3.5 w-3.5 ${loadingTables ? "animate-spin" : ""}`}
					/>
				</button>
			</div>

			{loadingTables ? (
				<div className="py-6 text-center [color:var(--text-muted)]">
					<Loader2 className="mx-auto h-5 w-5 animate-spin" />
				</div>
			) : (
				tables.map((table) => (
					<button
						key={table.name}
						onClick={() => onSelectTable(table.name)}
						className={cn(
							"mb-1 flex w-full justify-between rounded-md border px-2.5 py-2 text-[13px] transition [color:var(--text)]",
							selectedTable === table.name
								? "[border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_15%,transparent)]"
								: "border-transparent bg-transparent",
						)}
					>
						<span>{table.name}</span>
						<span className="text-xs [color:var(--text-muted)]">
							{table.row_count}
						</span>
					</button>
				))
			)}
		</div>
	);
}
