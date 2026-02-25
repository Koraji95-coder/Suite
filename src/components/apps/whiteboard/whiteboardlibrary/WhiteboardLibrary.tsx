import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { SavedWhiteboard } from "../whiteboardtypes";
import { LibraryFilters } from "./LibraryFilters";
import { LibraryGrid } from "./LibraryGrid";
import { ViewWhiteboardModal } from "./ViewWhiteboardModal";

interface WhiteboardLibraryProps {
	filterByPanel?: string;
}

export function WhiteboardLibrary({ filterByPanel }: WhiteboardLibraryProps) {
	const [whiteboards, setWhiteboards] = useState<SavedWhiteboard[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedPanel, setSelectedPanel] = useState<string>(
		filterByPanel || "all",
	);
	const [selectedTag, setSelectedTag] = useState<string>("all");
	const [viewingWhiteboard, setViewingWhiteboard] =
		useState<SavedWhiteboard | null>(null);

	const loadWhiteboards = useCallback(async () => {
		setLoading(true);
		const { data, error } = await supabase
			.from("whiteboards")
			.select("*")
			.order("created_at", { ascending: false });

		if (!error && data) {
			setWhiteboards(data);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		loadWhiteboards();
	}, [loadWhiteboards]);

	const deleteWhiteboard = async (id: string) => {
		if (!confirm("Delete this whiteboard?")) return;
		const { error } = await supabase.from("whiteboards").delete().eq("id", id);
		if (!error) {
			setWhiteboards(whiteboards.filter((w) => w.id !== id));
		}
	};

	const allPanels = [
		"all",
		...Array.from(new Set(whiteboards.map((w) => w.panel_context))),
	];
	const allTags = [
		"all",
		...Array.from(new Set(whiteboards.flatMap((w) => w.tags))),
	];

	const filteredWhiteboards = whiteboards.filter((wb) => {
		const matchesSearch =
			wb.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
			wb.tags.some((tag) =>
				tag.toLowerCase().includes(searchTerm.toLowerCase()),
			);
		const matchesPanel =
			selectedPanel === "all" || wb.panel_context === selectedPanel;
		const matchesTag = selectedTag === "all" || wb.tags.includes(selectedTag);
		return matchesSearch && matchesPanel && matchesTag;
	});

	if (loading) {
		return (
			<div className="text-center text-orange-300 py-8">
				Loading whiteboards...
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<LibraryFilters
				searchTerm={searchTerm}
				onSearchChange={setSearchTerm}
				selectedPanel={selectedPanel}
				onPanelChange={setSelectedPanel}
				panels={allPanels}
				selectedTag={selectedTag}
				onTagChange={setSelectedTag}
				tags={allTags}
				totalCount={whiteboards.length}
				filteredCount={filteredWhiteboards.length}
				hidePanelFilter={!!filterByPanel}
			/>

			<LibraryGrid
				whiteboards={filteredWhiteboards}
				onView={setViewingWhiteboard}
				onDelete={deleteWhiteboard}
				emptyMessage={
					searchTerm || selectedPanel !== "all" || selectedTag !== "all"
						? "No whiteboards match your filters"
						: "No whiteboards saved yet. Create one to get started!"
				}
			/>

			<ViewWhiteboardModal
				whiteboard={viewingWhiteboard}
				onClose={() => setViewingWhiteboard(null)}
			/>
		</div>
	);
}
