import { RefreshCw, Search, Upload } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";
import { cn } from "@/lib/utils";
import styles from "./FileBrowserToolbar.module.css";

interface FileBrowserToolbarProps {
	search: string;
	onSearchChange: (value: string) => void;
	fileInputRef: RefObject<HTMLInputElement | null>;
	onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onRefresh: () => void;
	loading: boolean;
}

export function FileBrowserToolbar({
	search,
	onSearchChange,
	fileInputRef,
	onFileInputChange,
	onRefresh,
	loading,
}: FileBrowserToolbarProps) {
	return (
		<div className={styles.root}>
			<div className={styles.searchWrap}>
				<Search className={styles.searchIcon} />
				<input
					value={search}
					onChange={(event) => onSearchChange(event.target.value)}
					placeholder="Search files..."
					className={styles.searchInput}
				/>
			</div>
			<button
				onClick={() => fileInputRef.current?.click()}
				className={styles.uploadButton}
			>
				<Upload className={styles.buttonIcon} /> Upload
			</button>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				className={styles.hiddenInput}
				onChange={onFileInputChange}
			/>
			<button
				onClick={onRefresh}
				disabled={loading}
				className={styles.refreshButton}
			>
				<RefreshCw
					className={cn(styles.buttonIcon, loading && styles.spinning)}
				/>
			</button>
		</div>
	);
}
