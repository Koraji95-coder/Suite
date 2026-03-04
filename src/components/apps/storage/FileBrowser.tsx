import styles from "./FileBrowser.module.css";
import { FileBrowserBreadcrumbs } from "./FileBrowserBreadcrumbs";
import { FileBrowserDeleteDialog } from "./FileBrowserDeleteDialog";
import { FileBrowserDetailsPanel } from "./FileBrowserDetailsPanel";
import { FileBrowserTable } from "./FileBrowserTable";
import { FileBrowserToolbar } from "./FileBrowserToolbar";
import { useFileBrowserState } from "./useFileBrowserState";

export function FileBrowser() {
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
			<div className={styles.layout}>
				<div className={styles.mainPane}>
					<FileBrowserToolbar
						search={search}
						onSearchChange={setSearch}
						fileInputRef={fileInputRef}
						onFileInputChange={handleFileInputChange}
						onRefresh={() => void refresh()}
						loading={loading}
					/>

					<FileBrowserBreadcrumbs
						pathSegments={pathSegments}
						onNavigateRoot={navigateRoot}
						onNavigateTo={navigateTo}
					/>

					<FileBrowserTable
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

				{selected && (
					<FileBrowserDetailsPanel
						selected={selected}
						onClose={() => setSelected(null)}
						onDownload={(file) => void handleDownload(file)}
						onRequestDelete={requestDelete}
					/>
				)}
			</div>

			<FileBrowserDeleteDialog
				pendingDelete={pendingDelete}
				onCancel={() => setPendingDelete(null)}
				onConfirm={() => void confirmDelete()}
			/>
		</>
	);
}
