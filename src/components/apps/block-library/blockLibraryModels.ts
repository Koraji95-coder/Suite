import type { Database } from "@/supabase/database";

export type BlockFile = Database["public"]["Tables"]["block_library"]["Row"];

export type BlockViewMode = "grid" | "list";

export interface BlockUploadForm {
	name: string;
	category: string;
	tags: string;
	is_dynamic: boolean;
}

export const DEFAULT_UPLOAD_FORM: BlockUploadForm = {
	name: "",
	category: "electrical",
	tags: "",
	is_dynamic: false,
};

export const UPLOAD_CATEGORY_OPTIONS = [
	"electrical",
	"mechanical",
	"structural",
	"instrumentation",
	"symbols",
	"other",
];

export const getBlockCategories = (blocks: BlockFile[]) => [
	"all",
	...Array.from(new Set(blocks.map((block) => block.category))),
];

export const getBlockTags = (blocks: BlockFile[]) => [
	"all",
	...Array.from(new Set(blocks.flatMap((block) => block.tags))),
];

export const filterBlocks = (
	blocks: BlockFile[],
	searchTerm: string,
	selectedCategory: string,
	selectedTag: string,
) => {
	return blocks.filter((block) => {
		const normalizedSearch = searchTerm.toLowerCase();
		const matchesSearch =
			block.name.toLowerCase().includes(normalizedSearch) ||
			block.tags.some((tag) => tag.toLowerCase().includes(normalizedSearch));
		const matchesCategory =
			selectedCategory === "all" || block.category === selectedCategory;
		const matchesTag =
			selectedTag === "all" || block.tags.includes(selectedTag);

		return matchesSearch && matchesCategory && matchesTag;
	});
};

export const groupBlocksByCategory = (blocks: BlockFile[]) => {
	return blocks.reduce(
		(acc, block) => {
			if (!acc[block.category]) {
				acc[block.category] = [];
			}
			acc[block.category].push(block);
			return acc;
		},
		{} as Record<string, BlockFile[]>,
	);
};

export const buildUploadPayload = (
	form: BlockUploadForm,
	userId: string,
): Database["public"]["Tables"]["block_library"]["Insert"] => {
	return {
		name: form.name,
		file_path: `/blocks/${form.name}.dwg`,
		category: form.category,
		tags: form.tags
			.split(",")
			.map((tag) => tag.trim())
			.filter((tag) => tag),
		is_dynamic: form.is_dynamic,
		file_size: Math.floor(Math.random() * 1000000) + 50000,
		usage_count: 0,
		is_favorite: false,
		user_id: userId,
	};
};
