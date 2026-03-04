import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./DatabaseBrowserSidebar.module.css";
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
		<div className={styles.root}>
			<div className={styles.header}>
				<span className={styles.title}>Tables</span>
				<button
					onClick={onRefreshTables}
					disabled={loadingTables}
					className={styles.refreshButton}
				>
					<RefreshCw
						className={cn(styles.refreshIcon, loadingTables && styles.spinning)}
					/>
				</button>
			</div>

			{loadingTables ? (
				<div className={styles.loadingState}>
					<Loader2 className={cn(styles.loaderIcon, styles.spinning)} />
				</div>
			) : (
				tables.map((table) => (
					<button
						key={table.name}
						onClick={() => onSelectTable(table.name)}
						className={cn(
							styles.tableButton,
							selectedTable === table.name
								? styles.tableButtonActive
								: styles.tableButtonInactive,
						)}
					>
						<span>{table.name}</span>
						<span className={styles.rowCount}>{table.row_count}</span>
					</button>
				))
			)}
		</div>
	);
}
