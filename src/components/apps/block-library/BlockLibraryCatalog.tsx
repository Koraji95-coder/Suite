import {
	ChevronDown,
	ChevronRight,
	Eye,
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
			<div className="py-16 text-center text-sm [color:var(--text-muted)]">
				Loading blocks…
			</div>
		);
	}

	if (filteredBlocks.length === 0) {
		return (
			<div className="py-16 text-center">
				<Package className="mx-auto mb-3 h-12 w-12 text-[color-mix(in_srgb,var(--primary)_30%,transparent)]" />
				<p className="text-sm [color:var(--text-muted)]">
					{searchTerm || selectedCategory !== "all" || selectedTag !== "all"
						? "No blocks match your filters."
						: "No blocks yet. Upload your first block to get started."}
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{Object.entries(blocksByCategory).map(([category, blocks]) => (
				<div
					key={category}
					className="overflow-hidden rounded-lg border [border-color:var(--border)]"
				>
					{/* Category header */}
					<button
						onClick={() => onToggleCategory(category)}
						className="flex w-full items-center gap-2 px-4 py-3 text-left transition
							[background:var(--surface)] hover:[background:var(--surface-2)]"
					>
						{expandedCategories.has(category) ? (
							<ChevronDown className="h-4 w-4 shrink-0 [color:var(--text-muted)]" />
						) : (
							<ChevronRight className="h-4 w-4 shrink-0 [color:var(--text-muted)]" />
						)}
						<span className="text-sm font-semibold capitalize [color:var(--text)]">
							{category}
						</span>
						<span className="rounded-full px-2 py-0.5 text-xs [background:color-mix(in_srgb,var(--primary)_14%,transparent)] [color:var(--primary)]">
							{blocks.length}
						</span>
					</button>

					{/* Blocks grid/list */}
					{expandedCategories.has(category) && (
						<div
							className={`border-t p-3 [border-color:var(--border)] [background:var(--bg-base)] ${
								viewMode === "grid"
									? "grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
									: "space-y-2"
							}`}
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

/* ── Card ── */

function BlockCard({
	block,
	viewMode,
	onSelect,
	onToggleFavorite,
	onDelete,
}: {
	block: BlockFile;
	viewMode: BlockViewMode;
	onSelect: (b: BlockFile) => void;
	onToggleFavorite: (b: BlockFile) => void;
	onDelete: (b: BlockFile) => void;
}) {
	const isList = viewMode === "list";

	return (
		<div
			className={`group overflow-hidden rounded-lg border transition
				[border-color:var(--border)] [background:var(--surface)]
				hover:border-[color-mix(in_srgb,var(--primary)_40%,var(--border))]
				${isList ? "flex items-center" : ""}`}
		>
			{/* Thumbnail */}
			<div className={`relative ${isList ? "h-20 w-20 shrink-0" : "aspect-square w-full"}`}>
				{block.thumbnail_url ? (
					<img
						src={block.thumbnail_url}
						alt={block.name}
						className="h-full w-full object-cover [background:var(--surface-2)]"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center [background:var(--surface-2)]">
						<Package className="h-8 w-8 text-[color-mix(in_srgb,var(--primary)_30%,transparent)]" />
					</div>
				)}

				{/* Hover overlay */}
				<div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
					<OverlayButton title="View" onClick={() => onSelect(block)}>
						<Eye className="h-3.5 w-3.5" />
					</OverlayButton>
					<OverlayButton
						title={block.is_favorite ? "Unfavorite" : "Favorite"}
						onClick={() => onToggleFavorite(block)}
						active={block.is_favorite}
					>
						<Star className="h-3.5 w-3.5" />
					</OverlayButton>
					<OverlayButton title="Delete" onClick={() => onDelete(block)} variant="danger">
						<Trash2 className="h-3.5 w-3.5" />
					</OverlayButton>
				</div>

				{/* Dynamic badge */}
				{block.is_dynamic && (
					<span className="absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold [background:var(--primary)] [color:var(--primary-contrast)]">
						Dynamic
					</span>
				)}
			</div>

			{/* Info */}
			<div className={`p-2.5 ${isList ? "flex-1 min-w-0" : ""}`}>
				<h4 className="truncate text-sm font-medium [color:var(--text)]">{block.name}</h4>
				<div className="mt-0.5 flex items-center gap-2 text-xs [color:var(--text-muted)]">
					<span>{(block.file_size / 1024).toFixed(1)} KB</span>
					<span>·</span>
					<span>{block.usage_count}× used</span>
				</div>
				{block.tags.length > 0 && (
					<div className="mt-1.5 flex flex-wrap gap-1">
						{block.tags.slice(0, 3).map((tag, i) => (
							<span
								key={`${block.id}-${tag}-${i}`}
								className="rounded-full px-2 py-0.5 text-[10px]
									[background:var(--surface-2)] [color:var(--text-muted)]"
							>
								{tag}
							</span>
						))}
						{block.tags.length > 3 && (
							<span className="px-1 py-0.5 text-[10px] [color:var(--text-muted)]">
								+{block.tags.length - 3}
							</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

/* ── Overlay button ── */

function OverlayButton({
	children,
	title,
	onClick,
	variant,
	active,
}: {
	children: React.ReactNode;
	title: string;
	onClick: () => void;
	variant?: "danger";
	active?: boolean;
}) {
	const base = "rounded-md p-1.5 transition backdrop-blur-sm";
	const colors =
		variant === "danger"
			? "[background:color-mix(in_srgb,var(--danger)_25%,transparent)] [color:var(--danger)] hover:[background:color-mix(in_srgb,var(--danger)_40%,transparent)]"
			: active
				? "[background:color-mix(in_srgb,var(--warning)_35%,transparent)] [color:var(--warning)]"
				: "[background:rgba(255,255,255,0.15)] [color:white] hover:[background:rgba(255,255,255,0.25)]";

	return (
		<button onClick={onClick} title={title} className={`${base} ${colors}`}>
			{children}
		</button>
	);
}
