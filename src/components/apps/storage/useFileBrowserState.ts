import {
	type ChangeEvent,
	type DragEvent,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { useFiles } from "@/hooks/useFiles";
import { filterAndSortFiles, type SortKey } from "./fileBrowserModels";
import type { StorageFile } from "./storageTypes";

export function useFileBrowserState() {
	const { showToast } = useToast();
	const [currentPath, setCurrentPath] = useState("");
	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>("name");
	const [sortAsc, setSortAsc] = useState(true);
	const [selected, setSelected] = useState<StorageFile | null>(null);
	const [pendingDelete, setPendingDelete] = useState<StorageFile | null>(null);
	const [dragging, setDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { files, loading, error, refresh, upload, download, remove } = useFiles(
		"project-files",
		currentPath,
	);

	const pathSegments = useMemo(
		() => (currentPath ? currentPath.split("/") : []),
		[currentPath],
	);

	const filteredFiles = useMemo(
		() => filterAndSortFiles(files, search, sortKey, sortAsc),
		[files, search, sortKey, sortAsc],
	);

	const navigateRoot = () => {
		setCurrentPath("");
		setSelected(null);
	};

	const navigateTo = (index: number) => {
		setCurrentPath(pathSegments.slice(0, index + 1).join("/"));
		setSelected(null);
	};

	const handleFileClick = (file: StorageFile) => {
		if (file.type === "folder") {
			setCurrentPath(currentPath ? `${currentPath}/${file.name}` : file.name);
			setSelected(null);
		} else {
			setSelected(file);
		}
	};

	const toggleSort = (key: SortKey) => {
		if (sortKey === key) {
			setSortAsc((prev) => !prev);
		} else {
			setSortKey(key);
			setSortAsc(true);
		}
	};

	const handleUpload = useCallback(
		async (fileList: FileList | null) => {
			if (!fileList) return;
			for (const file of Array.from(fileList)) {
				await upload(file.name, file);
			}
		},
		[upload],
	);

	const handleDrop = useCallback(
		(event: DragEvent) => {
			event.preventDefault();
			setDragging(false);
			void handleUpload(event.dataTransfer.files);
		},
		[handleUpload],
	);

	const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
		void handleUpload(event.target.files);
	};

	const handleDownload = async (file: StorageFile) => {
		const blob = await download(file.name);
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = file.name;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	const requestDelete = (file: StorageFile) => {
		setPendingDelete(file);
	};

	const confirmDelete = async () => {
		if (!pendingDelete) return;
		const ok = await remove(pendingDelete.name);
		if (ok) {
			showToast("success", `Deleted "${pendingDelete.name}".`);
			if (selected?.name === pendingDelete.name) setSelected(null);
		} else {
			showToast("error", `Failed to delete "${pendingDelete.name}".`);
		}
		setPendingDelete(null);
	};

	return {
		confirmDelete,
		currentPath,
		dragging,
		error,
		fileInputRef,
		files,
		filteredFiles,
		handleDownload,
		handleDrop,
		handleFileClick,
		handleFileInputChange,
		handleUpload,
		loading,
		navigateRoot,
		navigateTo,
		pathSegments,
		pendingDelete,
		refresh,
		requestDelete,
		search,
		selected,
		setDragging,
		setPendingDelete,
		setSearch,
		setSelected,
		sortAsc,
		sortKey,
		toggleSort,
	};
}
