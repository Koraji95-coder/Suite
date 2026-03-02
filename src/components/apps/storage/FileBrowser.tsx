import { useTheme } from "@/lib/palette";
import { FileBrowserBreadcrumbs } from "./FileBrowserBreadcrumbs";
import { FileBrowserDeleteDialog } from "./FileBrowserDeleteDialog";
import { FileBrowserDetailsPanel } from "./FileBrowserDetailsPanel";
import { FileBrowserTable } from "./FileBrowserTable";
import { FileBrowserToolbar } from "./FileBrowserToolbar";
import { useFileBrowserState } from "./useFileBrowserState";

export function FileBrowser() {
	const { palette } = useTheme();
	const {
		confirmDelete,
		dragging,
		error,
		fileInputRef,
		files,
		filteredFiles,
		handleDownload,
		handleDrop,
		handleFileClick,
		handleFileInputChange,
		loading,
		navigateRoot,
		navigateTo,
		pathSegments,
		pendingDelete,
		refresh,
		requestDelete,
		search,
		selected,
		setDragging,
		setPendingDelete,
		setSearch,
		setSelected,
		sortAsc,
		sortKey,
		toggleSort,
	} = useFileBrowserState();

	return (
		<>
			<div className="flex min-h-[400px] flex-col gap-4 lg:flex-row">
				<div className="min-w-0 flex-1">
					<FileBrowserToolbar
						palette={palette}
						search={search}
						onSearchChange={setSearch}
						fileInputRef={fileInputRef}
						onFileInputChange={handleFileInputChange}
						onRefresh={() => {
							void refresh();
						}}
						loading={loading}
					/>

					<FileBrowserBreadcrumbs
						palette={palette}
						pathSegments={pathSegments}
						onNavigateRoot={navigateRoot}
						onNavigateTo={navigateTo}
					/>

					<FileBrowserTable
						palette={palette}
						dragging={dragging}
						onDragStateChange={setDragging}
						onDrop={handleDrop}
						sortKey={sortKey}
						sortAsc={sortAsc}
						onSort={toggleSort}
						error={error}
						loading={loading}
						filesLength={files.length}
						filteredFiles={filteredFiles}
						search={search}
						selectedName={selected?.name ?? null}
						onFileClick={handleFileClick}
						onRequestDelete={requestDelete}
					/>
				</div>

				{selected ? (
					<FileBrowserDetailsPanel
						palette={palette}
						selected={selected}
						onClose={() => setSelected(null)}
						onDownload={(file) => {
							void handleDownload(file);
						}}
						onRequestDelete={requestDelete}
					/>
				) : null}
			</div>

			<FileBrowserDeleteDialog
				pendingDelete={pendingDelete}
				onCancel={() => setPendingDelete(null)}
				onConfirm={() => {
					void confirmDelete();
				}}
			/>
		</>
	);
}
