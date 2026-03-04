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

const cellClass =
	"max-w-[240px] truncate whitespace-nowrap px-3 py-2 text-[13px] [color:var(--text)]";

const thClass =
	"max-w-[240px] truncate whitespace-nowrap px-3 py-2 text-[13px] font-semibold select-none [color:var(--text-muted)]";

const pageBtnClass =
	"inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs disabled:opacity-40 [border-color:color-mix(in_srgb,var(--primary)_20%,transparent)] [background:color-mix(in_srgb,var(--primary)_12%,transparent)] [color:var(--text)]";

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
			<div className="flex h-full flex-col items-center justify-center [color:var(--text-muted)]">
				<DatabaseIcon className="mb-3 h-12 w-12 opacity-30" />
				<span className="text-sm">Select a table to view data</span>
			</div>
		);
	}

	return (
		<>
			{/* Toolbar */}
			<div className="mb-3 flex flex-wrap items-center gap-2">
				<span className="text-[15px] font-semibold [color:var(--text)]">
					{selectedTable}
				</span>
				<span className="text-xs [color:var(--text-muted)]">
					{loadingData ? "Loading..." : `${totalCount} rows`}
				</span>
				<div className="hidden sm:block sm:flex-1" />
				<select
					value={pageSize}
					onChange={(event) => onPageSizeChange(Number(event.target.value))}
					className="rounded-md border px-2 py-1 text-xs border-[color-mix(in_srgb,var(--primary)_20%,transparent)] [background:color-mix(in_srgb,var(--background)_60%,transparent)] [color:var(--text)]"
				>
					{[25, 50, 100].map((value) => (
						<option key={value} value={value}>
							{value} / page
						</option>
					))}
				</select>
			</div>

			{/* Search */}
			{rows.length > 0 && (
				<div className="relative mb-2.5">
					<Search className="absolute left-2.5 top-2.25 h-4 w-4 [color:var(--primary)]" />
					<input
						value={search}
						onChange={(event) => onSearchChange(event.target.value)}
						placeholder="Filter rows..."
						className="w-full rounded-lg border py-2 pr-3 pl-8.5 text-[13px] outline-none border-[color-mix(in_srgb,var(--primary)_20%,transparent)] [background:color-mix(in_srgb,var(--background)_60%,transparent)] [color:var(--text)]"
					/>
					{search && (
						<span className="absolute right-2.5 top-2.5 hidden text-[11px] sm:block [color:var(--text-muted)]">
							{filteredRows.length} of {rows.length}
						</span>
					)}
				</div>
			)}

			{/* States */}
			{loadingData ? (
				<div className="py-10 text-center [color:var(--text-muted)]">
					<Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
					Loading...
				</div>
			) : rows.length === 0 ? (
				<div className="py-10 text-center [color:var(--text-muted)]">
					No data in this table
				</div>
			) : filteredRows.length === 0 ? (
				<div className="py-10 text-center [color:var(--text-muted)]">
					No rows match "{search}"
				</div>
			) : (
				<div className="overflow-x-auto rounded-lg border border-[color-mix(in_srgb,var(--primary)_10%,transparent)]">
					<table className="w-full border-collapse">
						<thead>
							<tr className="[background:color-mix(in_srgb,var(--primary)_8%,transparent)]">
								{visibleKeys.map((key) => (
									<th
										key={key}
										onClick={() => onSort(key)}
										className={`${thClass} cursor-pointer`}
									>
										<span className="inline-flex items-center gap-1">
											{key}
											{sortCol === key ? (
												sortDir === "asc" ? (
													<ArrowUp className="h-3 w-3" />
												) : (
													<ArrowDown className="h-3 w-3" />
												)
											) : (
												<ArrowUpDown className="h-3 w-3 opacity-30" />
											)}
										</span>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{filteredRows.map((row, rowIndex) => (
								<tr
									key={`row-${rowIndex}`}
									className="border-b border-[color-mix(in_srgb,var(--primary)_4%,transparent)]"
								>
									{visibleKeys.map((key) => {
										const value = row[key];
										return (
											<td key={key} className={cellClass}>
												{value === null ? (
													<span className="italic [color:var(--text-muted)]">
														null
													</span>
												) : typeof value === "boolean" ? (
													<span
														className={
															value
																? "[color:var(--success)]"
																: "[color:var(--danger)]"
														}
													>
														{String(value)}
													</span>
												) : typeof value === "object" ? (
													<span className="[color:var(--text-muted)]">
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

			{/* Pagination */}
			{totalCount > pageSize && (
				<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
					<span className="text-xs [color:var(--text-muted)]">
						{page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)}{" "}
						of {totalCount}
					</span>
					<div className="flex items-center gap-2">
						<button
							disabled={page === 0}
							onClick={onPrevPage}
							className={pageBtnClass}
						>
							<ChevronLeft className="h-3.5 w-3.5" /> Prev
						</button>
						<span className="text-xs [color:var(--text-muted)]">
							Page {page + 1} / {totalPages}
						</span>
						<button
							disabled={page >= totalPages - 1}
							onClick={onNextPage}
							className={pageBtnClass}
						>
							Next <ChevronRight className="h-3.5 w-3.5" />
						</button>
					</div>
				</div>
			)}
		</>
	);
}
