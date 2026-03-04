import { Grid, List, Upload } from "lucide-react";
import { PageFrame } from "@/components/apps/ui/PageFrame";
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
		<PageFrame
			title="Block Library"
			description="Manage your CAD block collection"
			actions={
				<div className="flex items-center gap-2">
					<button
						onClick={() =>
							setViewMode((prev) => (prev === "grid" ? "list" : "grid"))
						}
						className="rounded-lg border p-2 transition
							[border-color:var(--border)] [background:var(--surface)]
							hover:[background:var(--surface-2)]"
						title={viewMode === "grid" ? "List view" : "Grid view"}
					>
						{viewMode === "grid" ? (
							<List className="h-4 w-4 [color:var(--text-muted)]" />
						) : (
							<Grid className="h-4 w-4 [color:var(--text-muted)]" />
						)}
					</button>
					<button
						onClick={() => setShowUploadModal(true)}
						className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition
							[background:var(--primary)] [color:var(--primary-contrast)] hover:opacity-90"
					>
						<Upload className="h-4 w-4" />
						Upload Block
					</button>
				</div>
			}
		>
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
