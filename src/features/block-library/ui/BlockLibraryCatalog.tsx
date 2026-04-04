import {
	ChevronDown,
	ChevronRight,
	Eye,
	Package,
	Star,
	Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./BlockLibraryCatalog.module.css";
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
	const isGridView = viewMode === "grid";

	if (loading) {
		return <div className={styles.loadingState}>Loading blocks…</div>;
	}

	if (filteredBlocks.length === 0) {
		return (
			<div className={styles.emptyState}>
				<Package className={styles.emptyIcon} />
				<p className={styles.emptyText}>
					{searchTerm || selectedCategory !== "all" || selectedTag !== "all"
						? "No blocks match your filters."
						: "No blocks yet. Upload your first block to get started."}
				</p>
			</div>
		);
	}

	return (
		<div className={styles.root}>
			{Object.entries(blocksByCategory).map(([category, blocks]) => (
				<div key={category} className={styles.category}>
					<button
						onClick={() => onToggleCategory(category)}
						className={styles.categoryHeader}
					>
						{expandedCategories.has(category) ? (
							<ChevronDown className={styles.categoryChevron} />
						) : (
							<ChevronRight className={styles.categoryChevron} />
						)}
						<span className={styles.categoryTitle}>{category}</span>
						<span className={styles.categoryCount}>{blocks.length}</span>
					</button>

					{expandedCategories.has(category) && (
						<div
							className={cn(
								styles.blocksContainer,
								isGridView ? styles.blocksContainerGrid : styles.blocksContainerList,
							)}
						>
							{blocks.map((block) => (
								<BlockCard
									key={block.id}
									block={block}
									viewMode={viewMode}
									onSelect={onSelectBlock}
									onToggleFavorite={onToggleFavorite}
									onDelete={onDeleteBlock}
								/>
							))}
						</div>
					)}
				</div>
			))}
		</div>
	);
}

function BlockCard({
	block,
	viewMode,
	onSelect,
	onToggleFavorite,
	onDelete,
}: {
	block: BlockFile;
	viewMode: BlockViewMode;
	onSelect: (block: BlockFile) => void;
	onToggleFavorite: (block: BlockFile) => void;
	onDelete: (block: BlockFile) => void;
}) {
	const isList = viewMode === "list";

	return (
		<div className={cn(styles.card, isList && styles.cardList)}>
			<div
				className={cn(
					styles.thumbnail,
					isList ? styles.thumbnailList : styles.thumbnailGrid,
				)}
			>
				{block.thumbnail_url ? (
					<img
						src={block.thumbnail_url}
						alt={block.name}
						className={styles.thumbnailImage}
					/>
				) : (
					<div className={styles.thumbnailFallback}>
						<Package className={styles.thumbnailFallbackIcon} />
					</div>
				)}

				<div className={styles.overlay}>
					<OverlayButton title="View" onClick={() => onSelect(block)}>
						<Eye className={styles.overlayIcon} />
					</OverlayButton>
					<OverlayButton
						title={block.is_favorite ? "Unfavorite" : "Favorite"}
						onClick={() => onToggleFavorite(block)}
						active={block.is_favorite}
					>
						<Star className={styles.overlayIcon} />
					</OverlayButton>
					<OverlayButton
						title="Delete"
						onClick={() => onDelete(block)}
						variant="danger"
					>
						<Trash2 className={styles.overlayIcon} />
					</OverlayButton>
				</div>

				{block.is_dynamic && (
					<span className={styles.dynamicBadge}>Dynamic</span>
				)}
			</div>

			<div className={cn(styles.info, isList && styles.infoList)}>
				<h4 className={styles.name}>{block.name}</h4>
				<div className={styles.meta}>
					<span>{(block.file_size / 1024).toFixed(1)} KB</span>
					<span>·</span>
					<span>{block.usage_count}× used</span>
				</div>
				{block.tags.length > 0 && (
					<div className={styles.tagRow}>
						{block.tags.slice(0, 3).map((tag, index) => (
							<span key={`${block.id}-${tag}-${index}`} className={styles.tag}>
								{tag}
							</span>
						))}
						{block.tags.length > 3 && (
							<span className={styles.tagOverflow}>
								+{block.tags.length - 3}
							</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function OverlayButton({
	children,
	title,
	onClick,
	variant,
	active,
}: {
	children: ReactNode;
	title: string;
	onClick: () => void;
	variant?: "danger";
	active?: boolean;
}) {
	return (
		<button
			onClick={onClick}
			title={title}
			className={cn(
				styles.overlayButton,
				variant === "danger"
					? styles.overlayButtonDanger
					: active
						? styles.overlayButtonActive
						: styles.overlayButtonDefault,
			)}
		>
			{children}
		</button>
	);
}
