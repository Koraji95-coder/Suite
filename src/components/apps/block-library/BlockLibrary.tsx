import {
	ChevronDown,
	ChevronRight,
	Download,
	Eye,
	Grid,
	Layers,
	List,
	Package,
	Search,
	Star,
	Tag,
	Trash2,
	Upload,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";

type BlockFile = Database["public"]["Tables"]["block_library"]["Row"];

export function BlockLibrary() {
	const [blocks, setBlocks] = useState<BlockFile[]>([]);
	const [loading, setLoading] = useState(true);
	const [isUploading, setIsUploading] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string>("all");
	const [selectedTag, setSelectedTag] = useState<string>("all");
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [showUploadModal, setShowUploadModal] = useState(false);
	const [selectedBlock, setSelectedBlock] = useState<BlockFile | null>(null);
	const [uploadForm, setUploadForm] = useState({
		name: "",
		category: "electrical",
		tags: "",
		is_dynamic: false,
	});
	const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
		new Set(["electrical"]),
	);
	const panelClass =
		"rounded-lg border p-6 [border-color:var(--border)] [background:var(--bg-mid)]";
	const inputClass =
		"w-full rounded-lg border px-4 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]";
	const primaryButtonClass =
		"inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition [background:var(--primary)] [color:var(--primary-contrast)] hover:opacity-90";
	const secondaryButtonClass =
		"rounded-lg border px-6 py-2 text-sm font-medium transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]";

	const loadBlocks = useCallback(async () => {
		setLoading(true);
		const { data, error } = await supabase
			.from("block_library")
			.select("*")
			.order("created_at", { ascending: false });

		if (!error && data) {
			setBlocks(data);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		loadBlocks();
	}, [loadBlocks]);

	const handleFileUpload = async (e: React.FormEvent) => {
		e.preventDefault();
		if (isUploading) return;
		setIsUploading(true);

		try {
			const payload: Database["public"]["Tables"]["block_library"]["Insert"] = {
				name: uploadForm.name,
				file_path: `/blocks/${uploadForm.name}.dwg`,
				category: uploadForm.category,
				tags: uploadForm.tags
					.split(",")
					.map((t) => t.trim())
					.filter((t) => t),
				is_dynamic: uploadForm.is_dynamic,
				file_size: Math.floor(Math.random() * 1000000) + 50000,
				usage_count: 0,
				is_favorite: false,
			};

			const { error } = await supabase.from("block_library").insert(payload);

			if (!error) {
				await loadBlocks();
				setShowUploadModal(false);
				setUploadForm({
					name: "",
					category: "electrical",
					tags: "",
					is_dynamic: false,
				});
			}
		} finally {
			setIsUploading(false);
		}
	};

	const deleteBlock = async (id: string) => {
		if (!confirm("Delete this block?")) return;

		const { error } = await supabase
			.from("block_library")
			.delete()
			.eq("id", id);

		if (!error) {
			setBlocks(blocks.filter((b) => b.id !== id));
			if (selectedBlock?.id === id) {
				setSelectedBlock(null);
			}
		}
	};

	const toggleFavorite = async (block: BlockFile) => {
		const { error } = await supabase
			.from("block_library")
			.update({ is_favorite: !block.is_favorite })
			.eq("id", block.id);

		if (!error) {
			setBlocks(
				blocks.map((b) =>
					b.id === block.id ? { ...b, is_favorite: !b.is_favorite } : b,
				),
			);
		}
	};

	const categories = [
		"all",
		...Array.from(new Set(blocks.map((b) => b.category))),
	];
	const allTags = [
		"all",
		...Array.from(new Set(blocks.flatMap((b) => b.tags))),
	];

	const filteredBlocks = blocks.filter((block) => {
		const matchesSearch =
			block.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			block.tags.some((tag) =>
				tag.toLowerCase().includes(searchTerm.toLowerCase()),
			);
		const matchesCategory =
			selectedCategory === "all" || block.category === selectedCategory;
		const matchesTag =
			selectedTag === "all" || block.tags.includes(selectedTag);

		return matchesSearch && matchesCategory && matchesTag;
	});

	const blocksByCategory = filteredBlocks.reduce(
		(acc, block) => {
			if (!acc[block.category]) {
				acc[block.category] = [];
			}
			acc[block.category].push(block);
			return acc;
		},
		{} as Record<string, BlockFile[]>,
	);

	const toggleCategory = (category: string) => {
		const newExpanded = new Set(expandedCategories);
		if (newExpanded.has(category)) {
			newExpanded.delete(category);
		} else {
			newExpanded.add(category);
		}
		setExpandedCategories(newExpanded);
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center space-x-3">
					<div className="rounded-lg p-3 [background:var(--surface-2)]">
						<Package className="h-8 w-8 [color:var(--primary)]" />
					</div>
					<div>
						<h2 className="text-3xl font-bold [color:var(--text)]">
							Block Library
						</h2>
						<p className="[color:var(--text-muted)]">
							Manage your CAD block collection
						</p>
					</div>
				</div>
				<div className="flex items-center space-x-3">
					<button
						onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
						className="rounded-lg border p-2 transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)]"
						title={viewMode === "grid" ? "List View" : "Grid View"}
					>
						{viewMode === "grid" ? (
							<List className="h-5 w-5 [color:var(--primary)]" />
						) : (
							<Grid className="h-5 w-5 [color:var(--primary)]" />
						)}
					</button>
					<button
						onClick={() => setShowUploadModal(true)}
						className={primaryButtonClass}
					>
						<Upload className="w-5 h-5" />
						<span>Upload Block</span>
					</button>
				</div>
			</div>

			<div className={panelClass}>
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
					<div className="relative md:col-span-2">
						<Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform [color:var(--text-muted)]" />
						<input
							type="text"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							placeholder="Search blocks..."
							className={`${inputClass} pl-10`}
						/>
					</div>

					<div>
						<select
							value={selectedCategory}
							onChange={(e) => setSelectedCategory(e.target.value)}
							className={inputClass}
						>
							{categories.map((cat) => (
								<option key={cat} value={cat}>
									{cat === "all" ? "All Categories" : cat}
								</option>
							))}
						</select>
					</div>

					<div>
						<select
							value={selectedTag}
							onChange={(e) => setSelectedTag(e.target.value)}
							className={inputClass}
						>
							{allTags.map((tag) => (
								<option key={tag} value={tag}>
									{tag === "all" ? "All Tags" : tag}
								</option>
							))}
						</select>
					</div>
				</div>

				<div className="mt-4 flex items-center justify-between text-sm [color:var(--text-muted)]">
					<div className="flex items-center space-x-4">
						<span>Total: {blocks.length}</span>
						<span>Filtered: {filteredBlocks.length}</span>
						<span>Favorites: {blocks.filter((b) => b.is_favorite).length}</span>
					</div>
					{(selectedCategory !== "all" || selectedTag !== "all") && (
						<button
							onClick={() => {
								setSelectedCategory("all");
								setSelectedTag("all");
							}}
							className="transition hover:opacity-80 [color:var(--primary)]"
						>
							Clear Filters
						</button>
					)}
				</div>
			</div>

			{loading ? (
				<div className="py-12 text-center [color:var(--text-muted)]">
					Loading blocks...
				</div>
			) : filteredBlocks.length === 0 ? (
				<div className="py-12 text-center [color:var(--text-muted)]">
					<Package className="mx-auto mb-4 h-16 w-16 [color:color-mix(in_srgb,var(--primary)_40%,transparent)]" />
					{searchTerm || selectedCategory !== "all" || selectedTag !== "all"
						? "No blocks match your filters"
						: "No blocks uploaded yet. Upload your first block to get started!"}
				</div>
			) : (
				<div className="space-y-4">
					{Object.entries(blocksByCategory).map(
						([category, categoryBlocks]) => (
							<div
								key={category}
								className="overflow-hidden rounded-lg border [border-color:var(--border)] [background:var(--bg-mid)]"
							>
								<button
									onClick={() => toggleCategory(category)}
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
															onClick={() => setSelectedBlock(block)}
															className="rounded-lg border p-2 transition hover:[background:var(--surface)] [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_18%,transparent)] [color:var(--text)]"
															title="View Details"
														>
															<Eye className="w-4 h-4" />
														</button>
														<button
															onClick={() => toggleFavorite(block)}
															className={`p-2 border rounded-lg transition-all ${
																block.is_favorite
																	? "bg-yellow-500/30 border-yellow-500/50 text-yellow-200"
																	: "bg-gray-500/20 border-gray-500/40 text-gray-300 hover:bg-yellow-500/20"
															}`}
															title="Toggle Favorite"
														>
															<Star className="w-4 h-4" />
														</button>
														<button
															onClick={() => deleteBlock(block.id)}
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

												<div
													className={`p-3 ${viewMode === "list" ? "flex-1" : ""}`}
												>
													<h4 className="mb-1 truncate text-sm font-bold [color:var(--text)]">
														{block.name}
													</h4>
													<div className="mb-2 flex items-center justify-between text-xs [color:var(--text-muted)]">
														<span>
															{(block.file_size / 1024).toFixed(1)} KB
														</span>
														<span>Used: {block.usage_count}x</span>
													</div>
													{block.tags.length > 0 && (
														<div className="flex flex-wrap gap-1">
															{block.tags.slice(0, 3).map((tag, idx) => (
																<span
																	key={idx}
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
						),
					)}
				</div>
			)}

			{showUploadModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgb(10_10_10_/_0.62)] p-4 backdrop-blur-sm">
					<div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-heavy)] p-6 backdrop-blur-xl">
						<h3 className="mb-4 text-2xl font-bold [color:var(--text)]">
							Upload Block
						</h3>
						<form onSubmit={handleFileUpload} className="space-y-4">
							<div>
								<label className="mb-2 block text-sm font-medium [color:var(--text-muted)]">
									Block Name *
								</label>
								<input
									type="text"
									value={uploadForm.name}
									onChange={(e) =>
										setUploadForm({ ...uploadForm, name: e.target.value })
									}
									required
									className={inputClass}
									placeholder="e.g., Transformer-3Phase"
								/>
							</div>

							<div>
								<label className="mb-2 block text-sm font-medium [color:var(--text-muted)]">
									Category *
								</label>
								<select
									value={uploadForm.category}
									onChange={(e) =>
										setUploadForm({ ...uploadForm, category: e.target.value })
									}
									className={inputClass}
								>
									<option value="electrical">Electrical</option>
									<option value="mechanical">Mechanical</option>
									<option value="structural">Structural</option>
									<option value="instrumentation">Instrumentation</option>
									<option value="symbols">Symbols</option>
									<option value="other">Other</option>
								</select>
							</div>

							<div>
								<label className="mb-2 block text-sm font-medium [color:var(--text-muted)]">
									Tags (comma separated)
								</label>
								<input
									type="text"
									value={uploadForm.tags}
									onChange={(e) =>
										setUploadForm({ ...uploadForm, tags: e.target.value })
									}
									className={inputClass}
									placeholder="e.g., transformer, 3phase, 480v"
								/>
							</div>

							<div className="flex items-center space-x-2">
								<input
									type="checkbox"
									id="is_dynamic"
									checked={uploadForm.is_dynamic}
									onChange={(e) =>
										setUploadForm({
											...uploadForm,
											is_dynamic: e.target.checked,
										})
									}
									className="h-4 w-4 rounded border [border-color:var(--border)] [background:var(--surface)]"
								/>
								<label
									htmlFor="is_dynamic"
									className="text-sm [color:var(--text-muted)]"
								>
									Dynamic Block (with variations)
								</label>
							</div>

							<div className="flex gap-3 mt-6">
								<button
									type="submit"
									disabled={isUploading}
									className={`flex-1 ${primaryButtonClass}`}
								>
									{isUploading ? "Uploading..." : "Upload Block"}
								</button>
								<button
									type="button"
									disabled={isUploading}
									onClick={() => {
										setShowUploadModal(false);
										setUploadForm({
											name: "",
											category: "electrical",
											tags: "",
											is_dynamic: false,
										});
									}}
									className={secondaryButtonClass}
								>
									Cancel
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{selectedBlock && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgb(10_10_10_/_0.72)] p-4 backdrop-blur-sm">
					<div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-heavy)] backdrop-blur-xl">
						<div className="sticky top-0 z-10 flex items-center justify-between border-b p-6 backdrop-blur-sm [border-color:var(--border)] [background:color-mix(in_srgb,var(--bg-base)_95%,transparent)]">
							<div>
								<h3 className="text-2xl font-bold [color:var(--text)]">
									{selectedBlock.name}
								</h3>
								<div className="mt-2 flex items-center space-x-4 text-sm [color:var(--text-muted)]">
									<span className="capitalize">{selectedBlock.category}</span>
									<span>•</span>
									<span>{(selectedBlock.file_size / 1024).toFixed(1)} KB</span>
									<span>•</span>
									<span>Used {selectedBlock.usage_count}x</span>
								</div>
							</div>
							<button
								onClick={() => setSelectedBlock(null)}
								className="rounded-lg p-2 transition hover:[background:color-mix(in_srgb,var(--danger)_18%,transparent)]"
							>
								<span className="text-2xl [color:var(--danger)]">×</span>
							</button>
						</div>

						<div className="p-6 space-y-6">
							<div className="aspect-video flex items-center justify-center rounded-lg border [border-color:var(--border)] [background:var(--surface-2)]">
								{selectedBlock.thumbnail_url ? (
									<img
										src={selectedBlock.thumbnail_url}
										alt={selectedBlock.name}
										className="max-w-full max-h-full object-contain"
									/>
								) : (
									<div className="text-center">
										<Package className="mx-auto mb-4 h-24 w-24 [color:color-mix(in_srgb,var(--primary)_35%,transparent)]" />
										<p className="[color:var(--text-muted)]">
											Preview not available
										</p>
									</div>
								)}
							</div>

							{selectedBlock.tags.length > 0 && (
								<div>
									<h4 className="mb-3 text-lg font-bold [color:var(--text)]">
										Tags
									</h4>
									<div className="flex flex-wrap gap-2">
										{selectedBlock.tags.map((tag, idx) => (
											<span
												key={idx}
												className="flex items-center space-x-1 rounded-full border px-3 py-1 [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text-muted)]"
											>
												<Tag className="w-3 h-3" />
												<span>{tag}</span>
											</span>
										))}
									</div>
								</div>
							)}

							{selectedBlock.is_dynamic && (
								<div className="rounded-lg border p-4 [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_12%,transparent)]">
									<h4 className="mb-2 text-lg font-bold [color:var(--text)]">
										Dynamic Block
									</h4>
									<p className="text-sm [color:var(--text-muted)]">
										This block includes dynamic variations and can be customized
										with different parameters.
									</p>
								</div>
							)}

							<div className="flex gap-3">
								<button className="flex flex-1 items-center justify-center space-x-2 rounded-lg border px-6 py-3 text-sm font-medium transition hover:[background:var(--surface-2)] [border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_18%,transparent)] [color:var(--text)]">
									<Download className="w-5 h-5" />
									<span>Download</span>
								</button>
								<button
									onClick={() => toggleFavorite(selectedBlock)}
									className={`px-6 py-3 border rounded-lg transition-all flex items-center space-x-2 ${
										selectedBlock.is_favorite
											? "bg-yellow-500/30 border-yellow-500/50 text-yellow-200"
											: "bg-gray-500/20 border-gray-500/40 text-gray-300 hover:bg-yellow-500/20"
									}`}
								>
									<Star className="w-5 h-5" />
									<span>
										{selectedBlock.is_favorite ? "Favorited" : "Favorite"}
									</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
