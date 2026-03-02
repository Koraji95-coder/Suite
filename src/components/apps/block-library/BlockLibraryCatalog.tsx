import {
	ChevronDown,
	ChevronRight,
	Eye,
	Layers,
	Package,
	Star,
	Trash2,
} from "lucide-react";
import type { BlockFile, BlockViewMode } from "./blockLibraryModels";

interface BlockLibraryCatalogProps {
	loading: boolean;
	filteredBlocks: BlockFile[];
	searchTerm: string;
	selectedCategory: string;
	selectedTag: string;
	blocksByCategory: Record<string, BlockFile[]>;
	expandedCategories: Set<string>;
	viewMode: BlockViewMode;
	onToggleCategory: (category: string) => void;
	onSelectBlock: (block: BlockFile) => void;
	onToggleFavorite: (block: BlockFile) => void;
	onDeleteBlock: (block: BlockFile) => void;
}

export function BlockLibraryCatalog({
	loading,
	filteredBlocks,
	searchTerm,
	selectedCategory,
	selectedTag,
	blocksByCategory,
	expandedCategories,
	viewMode,
	onToggleCategory,
	onSelectBlock,
	onToggleFavorite,
	onDeleteBlock,
}: BlockLibraryCatalogProps) {
	if (loading) {
		return (
			<div className="py-12 text-center [color:var(--text-muted)]">
				Loading blocks...
			</div>
		);
	}

	if (filteredBlocks.length === 0) {
		return (
			<div className="py-12 text-center [color:var(--text-muted)]">
				<Package className="mx-auto mb-4 h-16 w-16 [color:color-mix(in_srgb,var(--primary)_40%,transparent)]" />
				{searchTerm || selectedCategory !== "all" || selectedTag !== "all"
					? "No blocks match your filters"
					: "No blocks uploaded yet. Upload your first block to get started!"}
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{Object.entries(blocksByCategory).map(([category, categoryBlocks]) => (
				<div
					key={category}
					className="overflow-hidden rounded-lg border [border-color:var(--border)] [background:var(--bg-mid)]"
				>
					<button
						onClick={() => onToggleCategory(category)}
						className="flex w-full items-center justify-between p-4 transition hover:[background:var(--surface-2)]"
					>
						<div className="flex items-center space-x-3">
							{expandedCategories.has(category) ? (
								<ChevronDown className="h-5 w-5 [color:var(--primary)]" />
							) : (
								<ChevronRight className="h-5 w-5 [color:var(--primary)]" />
							)}
							<Layers className="h-5 w-5 [color:var(--primary)]" />
							<h3 className="text-lg font-bold capitalize [color:var(--text)]">
								{category}
							</h3>
							<span className="rounded-full px-2 py-1 text-xs [background:color-mix(in_srgb,var(--primary)_18%,transparent)] [color:var(--primary)]">
								{categoryBlocks.length}
							</span>
						</div>
					</button>

					{expandedCategories.has(category) && (
						<div
							className={`border-t p-4 [border-color:var(--border)] ${
								viewMode === "grid"
									? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
									: "space-y-2"
							}`}
						>
							{categoryBlocks.map((block) => (
								<div
									key={block.id}
									className={`overflow-hidden rounded-lg border transition hover:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] ${
										viewMode === "list" ? "flex items-center" : ""
									}`}
								>
									<div
										className={`relative group ${viewMode === "list" ? "w-24 h-24" : "w-full aspect-square"}`}
									>
										{block.thumbnail_url ? (
											<img
												src={block.thumbnail_url}
												alt={block.name}
												className="h-full w-full object-cover [background:var(--surface-2)]"
											/>
										) : (
											<div className="flex h-full w-full items-center justify-center [background:var(--surface-2)]">
												<Package className="h-12 w-12 [color:color-mix(in_srgb,var(--primary)_40%,transparent)]" />
											</div>
										)}
										<div className="absolute inset-0 flex items-center justify-center space-x-2 bg-[color:rgb(10_10_10_/_0.52)] opacity-0 transition-opacity group-hover:opacity-100">
											<button
												onClick={() => onSelectBlock(block)}
												className="rounded-lg border p-2 transition hover:[background:var(--surface)] [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_18%,transparent)] [color:var(--text)]"
												title="View Details"
											>
												<Eye className="w-4 h-4" />
											</button>
											<button
												onClick={() => onToggleFavorite(block)}
												className={`p-2 border rounded-lg transition-all ${
													block.is_favorite
														? "[background:color-mix(in_srgb,var(--warning)_30%,var(--surface))] [border-color:color-mix(in_srgb,var(--warning)_50%,transparent)] [color:var(--warning)]"
														: "[background:var(--surface-2)] [border-color:var(--border)] [color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--warning)_20%,var(--surface))]"
												}`}
												title="Toggle Favorite"
											>
												<Star className="w-4 h-4" />
											</button>
											<button
												onClick={() => onDeleteBlock(block)}
												className="rounded-lg border p-2 transition hover:[background:color-mix(in_srgb,var(--danger)_28%,transparent)] [border-color:var(--danger)] [background:color-mix(in_srgb,var(--danger)_18%,transparent)] [color:var(--danger)]"
												title="Delete"
											>
												<Trash2 className="w-4 h-4" />
											</button>
										</div>
										{block.is_dynamic && (
											<div className="absolute right-2 top-2 rounded-full px-2 py-1 text-xs font-semibold [background:var(--primary)] [color:var(--primary-contrast)]">
												Dynamic
											</div>
										)}
									</div>

									<div className={`p-3 ${viewMode === "list" ? "flex-1" : ""}`}>
										<h4 className="mb-1 truncate text-sm font-bold [color:var(--text)]">
											{block.name}
										</h4>
										<div className="mb-2 flex items-center justify-between text-xs [color:var(--text-muted)]">
											<span>{(block.file_size / 1024).toFixed(1)} KB</span>
											<span>Used: {block.usage_count}x</span>
										</div>
										{block.tags.length > 0 && (
											<div className="flex flex-wrap gap-1">
												{block.tags.slice(0, 3).map((tag, index) => (
													<span
														key={`${block.id}-${tag}-${index}`}
														className="rounded-full border px-2 py-0.5 text-xs [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text-muted)]"
													>
														{tag}
													</span>
												))}
												{block.tags.length > 3 && (
													<span className="px-2 py-0.5 text-xs [color:var(--text-muted)]">
														+{block.tags.length - 3}
													</span>
												)}
											</div>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
