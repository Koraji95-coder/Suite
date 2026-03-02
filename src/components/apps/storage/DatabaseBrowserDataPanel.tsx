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
import type { CSSProperties } from "react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";

interface DatabaseBrowserDataPanelProps {
	palette: ColorScheme;
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
	palette,
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
	const cellStyle: CSSProperties = {
		padding: "8px 12px",
		fontSize: 13,
		color: palette.text,
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
		maxWidth: 240,
	};

	const thStyle: CSSProperties = {
		...cellStyle,
		fontWeight: 600,
		color: palette.textMuted,
		cursor: "pointer",
		userSelect: "none",
	};

	if (!selectedTable) {
		return (
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					height: "100%",
					color: palette.textMuted,
				}}
			>
				<DatabaseIcon
					className="w-12 h-12"
					style={{ opacity: 0.3, marginBottom: 12 }}
				/>
				<span style={{ fontSize: 14 }}>Select a table to view data</span>
			</div>
		);
	}

	return (
		<>
			<div className="mb-3 flex flex-wrap items-center gap-2">
				<span style={{ fontWeight: 600, fontSize: 15, color: palette.text }}>
					{selectedTable}
				</span>
				<span style={{ fontSize: 12, color: palette.textMuted }}>
					{loadingData ? "Loading..." : `${totalCount} rows`}
				</span>
				<div className="hidden sm:block sm:flex-1" />
				<select
					value={pageSize}
					onChange={(event) => onPageSizeChange(Number(event.target.value))}
					style={{
						padding: "4px 8px",
						borderRadius: 6,
						fontSize: 12,
						background: hexToRgba(palette.background, 0.6),
						border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
						color: palette.text,
					}}
				>
					{[25, 50, 100].map((value) => (
						<option key={value} value={value}>
							{value} / page
						</option>
					))}
				</select>
			</div>

			{rows.length > 0 ? (
				<div style={{ position: "relative", marginBottom: 10 }}>
					<Search
						className="w-4 h-4"
						style={{
							position: "absolute",
							left: 10,
							top: 9,
							color: palette.primary,
						}}
					/>
					<input
						value={search}
						onChange={(event) => onSearchChange(event.target.value)}
						placeholder="Filter rows..."
						style={{
							width: "100%",
							padding: "8px 12px 8px 34px",
							borderRadius: 8,
							fontSize: 13,
							background: hexToRgba(palette.background, 0.6),
							border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
							color: palette.text,
							outline: "none",
						}}
					/>
					{search ? (
						<span
							style={{
								position: "absolute",
								right: 10,
								top: 10,
								fontSize: 11,
								color: palette.textMuted,
							}}
							className="hidden sm:block"
						>
							{filteredRows.length} of {rows.length}
						</span>
					) : null}
				</div>
			) : null}

			{loadingData ? (
				<div
					style={{ textAlign: "center", padding: 40, color: palette.textMuted }}
				>
					<Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
					Loading...
				</div>
			) : rows.length === 0 ? (
				<div
					style={{ textAlign: "center", padding: 40, color: palette.textMuted }}
				>
					No data in this table
				</div>
			) : filteredRows.length === 0 ? (
				<div
					style={{ textAlign: "center", padding: 40, color: palette.textMuted }}
				>
					No rows match "{search}"
				</div>
			) : (
				<div
					style={{
						overflowX: "auto",
						borderRadius: 8,
						border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
					}}
				>
					<table style={{ width: "100%", borderCollapse: "collapse" }}>
						<thead>
							<tr style={{ background: hexToRgba(palette.primary, 0.08) }}>
								{visibleKeys.map((key) => (
									<th key={key} onClick={() => onSort(key)} style={thStyle}>
										<span
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: 4,
											}}
										>
											{key}
											{sortCol === key ? (
												sortDir === "asc" ? (
													<ArrowUp className="w-3 h-3" />
												) : (
													<ArrowDown className="w-3 h-3" />
												)
											) : (
												<ArrowUpDown className="w-3 h-3 opacity-30" />
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
									style={{
										borderBottom: `1px solid ${hexToRgba(palette.primary, 0.04)}`,
									}}
								>
									{visibleKeys.map((key) => {
										const value = row[key];
										return (
											<td key={key} style={cellStyle}>
												{value === null ? (
													<span
														style={{
															color: palette.textMuted,
															fontStyle: "italic",
														}}
													>
														null
													</span>
												) : typeof value === "boolean" ? (
													<span
														style={{
															color: value ? "#22c55e" : palette.accent,
														}}
													>
														{String(value)}
													</span>
												) : typeof value === "object" ? (
													<span style={{ color: palette.textMuted }}>
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

			{totalCount > pageSize ? (
				<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
					<span style={{ fontSize: 12, color: palette.textMuted }}>
						{page * pageSize + 1}--{Math.min((page + 1) * pageSize, totalCount)}{" "}
						of {totalCount}
					</span>
					<div className="flex items-center gap-2">
						<button
							disabled={page === 0}
							onClick={onPrevPage}
							style={pageButtonStyle(palette, page === 0)}
						>
							<ChevronLeft className="w-3.5 h-3.5" /> Prev
						</button>
						<span style={{ fontSize: 12, color: palette.textMuted }}>
							Page {page + 1} / {totalPages}
						</span>
						<button
							disabled={page >= totalPages - 1}
							onClick={onNextPage}
							style={pageButtonStyle(palette, page >= totalPages - 1)}
						>
							Next <ChevronRight className="w-3.5 h-3.5" />
						</button>
					</div>
				</div>
			) : null}
		</>
	);
}

function pageButtonStyle(
	palette: ColorScheme,
	disabled: boolean,
): CSSProperties {
	return {
		display: "flex",
		alignItems: "center",
		gap: 4,
		padding: "4px 10px",
		borderRadius: 6,
		fontSize: 12,
		cursor: "pointer",
		background: hexToRgba(palette.primary, 0.12),
		border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
		color: palette.text,
		opacity: disabled ? 0.4 : 1,
	};
}
