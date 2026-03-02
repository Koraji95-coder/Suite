import { BlockLibraryCatalog } from "./BlockLibraryCatalog";
import { BlockLibraryDeleteDialog } from "./BlockLibraryDeleteDialog";
import { BlockLibraryDetailsDialog } from "./BlockLibraryDetailsDialog";
import { BlockLibraryFiltersPanel } from "./BlockLibraryFiltersPanel";
import { BlockLibraryHeader } from "./BlockLibraryHeader";
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
		<div className="space-y-6">
			<BlockLibraryHeader
				viewMode={viewMode}
				onToggleViewMode={() =>
					setViewMode((prev) => (prev === "grid" ? "list" : "grid"))
				}
				onOpenUpload={() => setShowUploadModal(true)}
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
				onToggleFavorite={(block) => {
					void toggleFavorite(block);
				}}
				onDeleteBlock={setPendingDeleteBlock}
			/>

			<BlockLibraryUploadDialog
				open={showUploadModal}
				onOpenChange={setShowUploadModal}
				uploadForm={uploadForm}
				setUploadForm={setUploadForm}
				onSubmit={(event) => {
					void handleFileUpload(event);
				}}
				isUploading={isUploading}
				onCancel={closeUploadModal}
			/>

			<BlockLibraryDetailsDialog
				selectedBlock={selectedBlock}
				onClose={() => setSelectedBlock(null)}
				onToggleFavorite={(block) => {
					void toggleFavorite(block);
				}}
			/>

			<BlockLibraryDeleteDialog
				pendingDeleteBlock={pendingDeleteBlock}
				onCancel={() => setPendingDeleteBlock(null)}
				onConfirmDelete={() => {
					void confirmDeleteBlock();
				}}
			/>
		</div>
	);
}
