import { useTheme } from "@/lib/palette";
import { DatabaseBrowserDataPanel } from "./DatabaseBrowserDataPanel";
import { DatabaseBrowserErrorBanner } from "./DatabaseBrowserErrorBanner";
import { DatabaseBrowserSidebar } from "./DatabaseBrowserSidebar";
import { useDatabaseBrowserState } from "./useDatabaseBrowserState";

export function DatabaseBrowser() {
	const { palette } = useTheme();
	const {
		error,
		filteredRows,
		handleSort,
		loadingData,
		loadingTables,
		loadTables,
		page,
		pageSize,
		rows,
		search,
		selectTable,
		selectedTable,
		setError,
		setPage,
		setPageSize,
		setSearch,
		sortCol,
		sortDir,
		tables,
		totalCount,
		totalPages,
		visibleKeys,
	} = useDatabaseBrowserState();

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 0,
				minHeight: 400,
			}}
		>
			<DatabaseBrowserErrorBanner
				palette={palette}
				error={error}
				onDismiss={() => setError(null)}
			/>

			<div className="flex flex-1 flex-col gap-4 xl:flex-row">
				<DatabaseBrowserSidebar
					palette={palette}
					tables={tables}
					selectedTable={selectedTable}
					loadingTables={loadingTables}
					onRefreshTables={() => {
						void loadTables();
					}}
					onSelectTable={selectTable}
				/>

				<div className="min-w-0 flex-1">
					<DatabaseBrowserDataPanel
						palette={palette}
						selectedTable={selectedTable}
						loadingData={loadingData}
						rows={rows}
						filteredRows={filteredRows}
						search={search}
						onSearchChange={setSearch}
						pageSize={pageSize}
						onPageSizeChange={(value) => {
							setPageSize(value);
							setPage(0);
						}}
						totalCount={totalCount}
						page={page}
						totalPages={totalPages}
						onPrevPage={() => setPage((prev) => prev - 1)}
						onNextPage={() => setPage((prev) => prev + 1)}
						visibleKeys={visibleKeys}
						sortCol={sortCol}
						sortDir={sortDir}
						onSort={handleSort}
					/>
				</div>
			</div>
		</div>
	);
}
