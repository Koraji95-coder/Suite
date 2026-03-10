import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	ChevronLeft,
	ChevronRight,
	Database as DatabaseIcon,
	Loader2,
	Search,
} from "lucide-react";
import styles from "./DatabaseBrowserDataPanel.module.css";

interface DatabaseBrowserDataPanelProps {
	selectedTable: string;
	loadingData: boolean;
	rows: Record<string, unknown>[];
	filteredRows: Record<string, unknown>[];
	search: string;
	onSearchChange: (value: string) => void;
	pageSize: number;
	onPageSizeChange: (value: number) => void;
	totalCount: number;
	page: number;
	totalPages: number;
	onPrevPage: () => void;
	onNextPage: () => void;
	visibleKeys: string[];
	sortCol: string | null;
	sortDir: "asc" | "desc";
	onSort: (column: string) => void;
}

export function DatabaseBrowserDataPanel({
	selectedTable,
	loadingData,
	rows,
	filteredRows,
	search,
	onSearchChange,
	pageSize,
	onPageSizeChange,
	totalCount,
	page,
	totalPages,
	onPrevPage,
	onNextPage,
	visibleKeys,
	sortCol,
	sortDir,
	onSort,
}: DatabaseBrowserDataPanelProps) {
	if (!selectedTable) {
		return (
			<div className={styles.emptyTableState}>
				<DatabaseIcon className={styles.emptyTableIcon} />
				<span className={styles.emptyTableText}>
					Select a table to view data
				</span>
			</div>
		);
	}

	return (
		<>
			<div className={styles.toolbar}>
				<span className={styles.tableName}>{selectedTable}</span>
				<span className={styles.rowCount}>
					{loadingData ? "Loading..." : `${totalCount} rows`}
				</span>
				<div className={styles.spacer} />
				<select
					value={pageSize}
					onChange={(event) => onPageSizeChange(Number(event.target.value))}
					className={styles.pageSizeSelect}
				 name="databasebrowserdatapanel_select_71">
					{[25, 50, 100].map((value) => (
						<option key={value} value={value}>
							{value} / page
						</option>
					))}
				</select>
			</div>

			{rows.length > 0 && (
				<div className={styles.searchWrap}>
					<Search className={styles.searchIcon} />
					<input
						value={search}
						onChange={(event) => onSearchChange(event.target.value)}
						placeholder="Filter rows..."
						className={styles.searchInput}
					name="databasebrowserdatapanel_input_87"
					/>
					{search && (
						<span className={styles.searchMeta}>
							{filteredRows.length} of {rows.length}
						</span>
					)}
				</div>
			)}

			{loadingData ? (
				<div className={styles.stateMessage}>
					<Loader2 className={styles.loaderIcon} />
					Loading...
				</div>
			) : rows.length === 0 ? (
				<div className={styles.stateMessage}>No data in this table</div>
			) : filteredRows.length === 0 ? (
				<div className={styles.stateMessage}>No rows match "{search}"</div>
			) : (
				<div className={styles.tableContainer}>
					<table className={styles.table}>
						<thead>
							<tr className={styles.headerRow}>
								{visibleKeys.map((key) => (
									<th
										key={key}
										onClick={() => onSort(key)}
										className={styles.headerCell}
									>
										<span className={styles.headerCellInner}>
											{key}
											{sortCol === key ? (
												sortDir === "asc" ? (
													<ArrowUp className={styles.sortIcon} />
												) : (
													<ArrowDown className={styles.sortIcon} />
												)
											) : (
												<ArrowUpDown className={styles.sortIconMuted} />
											)}
										</span>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{filteredRows.map((row, rowIndex) => (
								<tr key={`row-${rowIndex}`} className={styles.dataRow}>
									{visibleKeys.map((key) => {
										const value = row[key];
										return (
											<td key={key} className={styles.dataCell}>
												{value === null ? (
													<span className={styles.nullValue}>null</span>
												) : typeof value === "boolean" ? (
													<span
														className={
															value ? styles.booleanTrue : styles.booleanFalse
														}
													>
														{String(value)}
													</span>
												) : typeof value === "object" ? (
													<span className={styles.objectValue}>
														{JSON.stringify(value)}
													</span>
												) : (
													String(value)
												)}
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{totalCount > pageSize && (
				<div className={styles.pagination}>
					<span className={styles.paginationCount}>
						{page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)}{" "}
						of {totalCount}
					</span>
					<div className={styles.paginationControls}>
						<button
							disabled={page === 0}
							onClick={onPrevPage}
							className={styles.pageButton}
						>
							<ChevronLeft className={styles.pageButtonIcon} /> Prev
						</button>
						<span className={styles.paginationPage}>
							Page {page + 1} / {totalPages}
						</span>
						<button
							disabled={page >= totalPages - 1}
							onClick={onNextPage}
							className={styles.pageButton}
						>
							Next <ChevronRight className={styles.pageButtonIcon} />
						</button>
					</div>
				</div>
			)}
		</>
	);
}
