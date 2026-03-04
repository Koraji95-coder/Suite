import styles from "./DatabaseBrowser.module.css";
import { DatabaseBrowserDataPanel } from "./DatabaseBrowserDataPanel";
import { DatabaseBrowserErrorBanner } from "./DatabaseBrowserErrorBanner";
import { DatabaseBrowserSidebar } from "./DatabaseBrowserSidebar";
import { useDatabaseBrowserState } from "./useDatabaseBrowserState";

export function DatabaseBrowser() {
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
		<div className={styles.root}>
			<DatabaseBrowserErrorBanner
				error={error}
				onDismiss={() => setError(null)}
			/>

			<div className={styles.layout}>
				<DatabaseBrowserSidebar
					tables={tables}
					selectedTable={selectedTable}
					loadingTables={loadingTables}
					onRefreshTables={() => void loadTables()}
					onSelectTable={selectTable}
				/>

				<div className={styles.mainPane}>
					<DatabaseBrowserDataPanel
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
