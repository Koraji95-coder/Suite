import {
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { supabase } from "@/supabase/client";
import {
	type BlockFile,
	type BlockUploadForm,
	type BlockViewMode,
	buildUploadPayload,
	DEFAULT_UPLOAD_FORM,
	filterBlocks,
	getBlockCategories,
	getBlockTags,
	groupBlocksByCategory,
} from "./blockLibraryModels";

export function useBlockLibraryState() {
	const { showToast } = useToast();
	const [blocks, setBlocks] = useState<BlockFile[]>([]);
	const [loading, setLoading] = useState(true);
	const [isUploading, setIsUploading] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string>("all");
	const [selectedTag, setSelectedTag] = useState<string>("all");
	const [viewMode, setViewMode] = useState<BlockViewMode>("grid");
	const [showUploadModal, setShowUploadModal] = useState(false);
	const [selectedBlock, setSelectedBlock] = useState<BlockFile | null>(null);
	const [pendingDeleteBlock, setPendingDeleteBlock] =
		useState<BlockFile | null>(null);
	const [uploadForm, setUploadForm] =
		useState<BlockUploadForm>(DEFAULT_UPLOAD_FORM);
	const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
		new Set(["electrical"]),
	);

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
		void loadBlocks();
	}, [loadBlocks]);

	const handleFileUpload = async (event: FormEvent) => {
		event.preventDefault();
		if (isUploading) return;
		setIsUploading(true);

		try {
			const {
				data: { user },
				error: userError,
			} = await supabase.auth.getUser();
			if (userError || !user) {
				showToast("error", "Sign in to upload blocks.");
				return;
			}

			const payload = buildUploadPayload(uploadForm, user.id);
			const { error } = await supabase.from("block_library").insert(payload);

			if (!error) {
				await loadBlocks();
				setShowUploadModal(false);
				setUploadForm(DEFAULT_UPLOAD_FORM);
			}
		} finally {
			setIsUploading(false);
		}
	};

	const confirmDeleteBlock = async () => {
		if (!pendingDeleteBlock) return;
		const id = pendingDeleteBlock.id;
		const { error } = await supabase
			.from("block_library")
			.delete()
			.eq("id", id);

		if (!error) {
			setBlocks((prev) => prev.filter((block) => block.id !== id));
			setSelectedBlock((prev) => (prev?.id === id ? null : prev));
			showToast("success", "Block deleted.");
		} else {
			showToast("error", "Failed to delete block.");
		}
		setPendingDeleteBlock(null);
	};

	const toggleFavorite = async (block: BlockFile) => {
		const { error } = await supabase
			.from("block_library")
			.update({ is_favorite: !block.is_favorite })
			.eq("id", block.id);

		if (!error) {
			setBlocks((prev) =>
				prev.map((entry) =>
					entry.id === block.id
						? { ...entry, is_favorite: !entry.is_favorite }
						: entry,
				),
			);
			setSelectedBlock((prev) =>
				prev?.id === block.id
					? { ...prev, is_favorite: !prev.is_favorite }
					: prev,
			);
		}
	};

	const toggleCategory = (category: string) => {
		setExpandedCategories((prev) => {
			const next = new Set(prev);
			if (next.has(category)) {
				next.delete(category);
			} else {
				next.add(category);
			}
			return next;
		});
	};

	const filteredBlocks = useMemo(
		() => filterBlocks(blocks, searchTerm, selectedCategory, selectedTag),
		[blocks, searchTerm, selectedCategory, selectedTag],
	);
	const categories = useMemo(() => getBlockCategories(blocks), [blocks]);
	const allTags = useMemo(() => getBlockTags(blocks), [blocks]);
	const blocksByCategory = useMemo(
		() => groupBlocksByCategory(filteredBlocks),
		[filteredBlocks],
	);
	const favoriteCount = useMemo(
		() => blocks.filter((block) => block.is_favorite).length,
		[blocks],
	);
	const hasActiveFilters = selectedCategory !== "all" || selectedTag !== "all";

	const clearFilters = () => {
		setSelectedCategory("all");
		setSelectedTag("all");
	};

	const closeUploadModal = () => {
		setShowUploadModal(false);
		setUploadForm(DEFAULT_UPLOAD_FORM);
	};

	return {
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
	};
}
