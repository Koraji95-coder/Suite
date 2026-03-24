import { Grid, List, Upload } from "lucide-react";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import styles from "./BlockLibrary.module.css";
import { BlockLibraryCatalog } from "./BlockLibraryCatalog";
import { BlockLibraryDeleteDialog } from "./BlockLibraryDeleteDialog";
import { BlockLibraryDetailsDialog } from "./BlockLibraryDetailsDialog";
import { BlockLibraryFiltersPanel } from "./BlockLibraryFiltersPanel";
import { BlockLibraryUploadDialog } from "./BlockLibraryUploadDialog";
import { useBlockLibraryState } from "./useBlockLibraryState";

export function BlockLibrary() {
	const {
		allTags,
		blocks,
		blocksByCategory,
		categories,
		clearFilters,
		closeUploadModal,
		confirmDeleteBlock,
		expandedCategories,
		favoriteCount,
		filteredBlocks,
		handleFileUpload,
		hasActiveFilters,
		isUploading,
		loading,
		pendingDeleteBlock,
		searchTerm,
		selectedBlock,
		selectedCategory,
		selectedTag,
		setPendingDeleteBlock,
		setSearchTerm,
		setSelectedBlock,
		setSelectedCategory,
		setSelectedTag,
		setShowUploadModal,
		setUploadForm,
		showUploadModal,
		toggleCategory,
		toggleFavorite,
		uploadForm,
		viewMode,
		setViewMode,
	} = useBlockLibraryState();

	return (
		<PageFrame maxWidth="full">
			<PageContextBand
				eyebrow="Catalog workspace"
				summary={
					<p className={styles.summaryText}>
						Manage imports, tags, favorites, and browsing views from one CAD
						block catalog.
					</p>
				}
				actions={
					<div className={styles.actions}>
						<button
							onClick={() =>
								setViewMode((prev) => (prev === "grid" ? "list" : "grid"))
							}
							className={styles.viewModeButton}
							title={viewMode === "grid" ? "List view" : "Grid view"}
						>
							{viewMode === "grid" ? (
								<List className={styles.viewModeIcon} />
							) : (
								<Grid className={styles.viewModeIcon} />
							)}
						</button>
						<button
							onClick={() => setShowUploadModal(true)}
							className={styles.uploadButton}
						>
							<Upload className={styles.uploadIcon} />
							Upload Block
						</button>
					</div>
				}
			/>
			<BlockLibraryFiltersPanel
				searchTerm={searchTerm}
				onSearchTermChange={setSearchTerm}
				selectedCategory={selectedCategory}
				onSelectedCategoryChange={setSelectedCategory}
				selectedTag={selectedTag}
				onSelectedTagChange={setSelectedTag}
				categories={categories}
				allTags={allTags}
				totalBlocks={blocks.length}
				filteredBlocks={filteredBlocks.length}
				favorites={favoriteCount}
				hasActiveFilters={hasActiveFilters}
				onClearFilters={clearFilters}
			/>

			<BlockLibraryCatalog
				loading={loading}
				filteredBlocks={filteredBlocks}
				searchTerm={searchTerm}
				selectedCategory={selectedCategory}
				selectedTag={selectedTag}
				blocksByCategory={blocksByCategory}
				expandedCategories={expandedCategories}
				viewMode={viewMode}
				onToggleCategory={toggleCategory}
				onSelectBlock={setSelectedBlock}
				onToggleFavorite={(block) => void toggleFavorite(block)}
				onDeleteBlock={setPendingDeleteBlock}
			/>

			<BlockLibraryUploadDialog
				open={showUploadModal}
				onOpenChange={setShowUploadModal}
				uploadForm={uploadForm}
				setUploadForm={setUploadForm}
				onSubmit={(e) => void handleFileUpload(e)}
				isUploading={isUploading}
				onCancel={closeUploadModal}
			/>

			<BlockLibraryDetailsDialog
				selectedBlock={selectedBlock}
				onClose={() => setSelectedBlock(null)}
				onToggleFavorite={(block) => void toggleFavorite(block)}
			/>

			<BlockLibraryDeleteDialog
				pendingDeleteBlock={pendingDeleteBlock}
				onCancel={() => setPendingDeleteBlock(null)}
				onConfirmDelete={() => void confirmDeleteBlock()}
			/>
		</PageFrame>
	);
}
