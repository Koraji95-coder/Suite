import { useCallback, useEffect, useState } from "react";
import { useNotification } from "@/auth/NotificationContext";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/system/dialog";
import { supabase } from "@/supabase/client";
import { SavedWhiteboard } from "../whiteboardtypes";
import { LibraryFilters } from "./LibraryFilters";
import { LibraryGrid } from "./LibraryGrid";
import { ViewWhiteboardModal } from "./ViewWhiteboardModal";
import styles from "./WhiteboardLibrary.module.css";

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
	const [pendingDelete, setPendingDelete] = useState<SavedWhiteboard | null>(
		null,
	);
	const notifications = useNotification();

	const loadWhiteboards = useCallback(async () => {
		setLoading(true);
		const { data, error } = await supabase
			.from("whiteboards")
			.select("*")
			.order("created_at", { ascending: false });

		if (!error && data) {
			setWhiteboards(data);
		} else if (error) {
			notifications.error("Failed to load whiteboards", error.message);
		}
		setLoading(false);
	}, [notifications]);

	useEffect(() => {
		void loadWhiteboards();
	}, [loadWhiteboards]);

	const requestDeleteWhiteboard = useCallback(
		(id: string) => {
			const found =
				whiteboards.find((whiteboard) => whiteboard.id === id) ?? null;
			setPendingDelete(found);
		},
		[whiteboards],
	);

	const confirmDeleteWhiteboard = async () => {
		if (!pendingDelete) return;
		const deleteId = pendingDelete.id;
		const deleteTitle = pendingDelete.title;
		const { error } = await supabase
			.from("whiteboards")
			.delete()
			.eq("id", deleteId);
		if (error) {
			notifications.error("Failed to delete whiteboard", error.message);
			return;
		}

		setWhiteboards((prev) =>
			prev.filter((whiteboard) => whiteboard.id !== deleteId),
		);
		notifications.success("Whiteboard deleted", deleteTitle);
		setPendingDelete(null);
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
		return <div className={styles.loadingState}>Loading whiteboards...</div>;
	}

	return (
		<div className={styles.root}>
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
				onDelete={requestDeleteWhiteboard}
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

			<Dialog
				open={Boolean(pendingDelete)}
				onOpenChange={(open) => !open && setPendingDelete(null)}
			>
				<DialogContent className={styles.dialogContent}>
					<DialogHeader>
						<DialogTitle>Delete whiteboard?</DialogTitle>
						<DialogDescription className="sr-only">
							Permanently remove this saved whiteboard from the library.
						</DialogDescription>
					</DialogHeader>
					<p className={styles.dialogText}>
						This permanently deletes {pendingDelete?.title ?? "this whiteboard"}
						.
					</p>
					<DialogFooter className={styles.dialogFooter}>
						<button
							onClick={() => setPendingDelete(null)}
							className={styles.cancelButton}
						>
							Cancel
						</button>
						<button
							onClick={() => void confirmDeleteWhiteboard()}
							className={styles.deleteButton}
						>
							Delete
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
