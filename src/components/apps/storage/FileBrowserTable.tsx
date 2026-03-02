import { ArrowDown, ArrowUp, ArrowUpDown, Trash2 } from "lucide-react";
import type { CSSProperties, DragEvent } from "react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";
import { formatSize, getFileIcon, type SortKey } from "./fileBrowserModels";
import type { StorageFile } from "./storageTypes";

interface FileBrowserTableProps {
	palette: ColorScheme;
	dragging: boolean;
	onDragStateChange: (dragging: boolean) => void;
	onDrop: (event: DragEvent) => void;
	sortKey: SortKey;
	sortAsc: boolean;
	onSort: (key: SortKey) => void;
	error: string | null;
	loading: boolean;
	filesLength: number;
	filteredFiles: StorageFile[];
	search: string;
	selectedName: string | null;
	onFileClick: (file: StorageFile) => void;
	onRequestDelete: (file: StorageFile) => void;
}

export function FileBrowserTable({
	palette,
	dragging,
	onDragStateChange,
	onDrop,
	sortKey,
	sortAsc,
	onSort,
	error,
	loading,
	filesLength,
	filteredFiles,
	search,
	selectedName,
	onFileClick,
	onRequestDelete,
}: FileBrowserTableProps) {
	const listGridColumns = "minmax(220px, 1fr) 80px 120px 40px";

	const sortIcon = (column: SortKey) => {
		if (sortKey !== column)
			return <ArrowUpDown className="w-3 h-3 opacity-40" />;
		return sortAsc ? (
			<ArrowUp className="w-3 h-3" />
		) : (
			<ArrowDown className="w-3 h-3" />
		);
	};

	return (
		<div
			onDragOver={(event) => {
				event.preventDefault();
				onDragStateChange(true);
			}}
			onDragLeave={() => onDragStateChange(false)}
			onDrop={onDrop}
			style={{
				border: `2px dashed ${dragging ? palette.primary : hexToRgba(palette.primary, 0.15)}`,
				borderRadius: 10,
				transition: "border-color 0.2s",
				background: dragging ? hexToRgba(palette.primary, 0.05) : "transparent",
				overflowX: "auto",
			}}
		>
			<div style={{ minWidth: 520 }}>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: listGridColumns,
						padding: "8px 16px",
						fontSize: 12,
						fontWeight: 600,
						color: palette.textMuted,
						borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
					}}
				>
					<button
						onClick={() => onSort("name")}
						style={headerButtonStyle(palette)}
					>
						Name {sortIcon("name")}
					</button>
					<button
						onClick={() => onSort("size")}
						style={headerButtonStyle(palette)}
					>
						Size {sortIcon("size")}
					</button>
					<button
						onClick={() => onSort("created_at")}
						style={headerButtonStyle(palette)}
					>
						Date {sortIcon("created_at")}
					</button>
					<span />
				</div>

				{error && (
					<div style={{ padding: 12, color: palette.accent, fontSize: 13 }}>
						{error}
					</div>
				)}

				{loading && !filesLength ? (
					<div
						style={{
							padding: 32,
							textAlign: "center",
							color: palette.textMuted,
						}}
					>
						Loading...
					</div>
				) : null}

				{!loading && filteredFiles.length === 0 ? (
					<div
						style={{
							padding: 32,
							textAlign: "center",
							color: palette.textMuted,
							fontSize: 14,
						}}
					>
						{search
							? "No files match your search"
							: "Drop files here or click Upload"}
					</div>
				) : null}

				{filteredFiles.map((file) => (
					<div
						key={file.id || file.name}
						onClick={() => onFileClick(file)}
						style={{
							display: "grid",
							gridTemplateColumns: listGridColumns,
							alignItems: "center",
							padding: "10px 16px",
							cursor: "pointer",
							background:
								selectedName === file.name
									? hexToRgba(palette.primary, 0.08)
									: "transparent",
							borderBottom: `1px solid ${hexToRgba(palette.primary, 0.05)}`,
							transition: "background 0.15s",
						}}
						onMouseEnter={(event) => {
							event.currentTarget.style.background = hexToRgba(
								palette.primary,
								0.06,
							);
						}}
						onMouseLeave={(event) => {
							event.currentTarget.style.background =
								selectedName === file.name
									? hexToRgba(palette.primary, 0.08)
									: "transparent";
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								color: palette.text,
								overflow: "hidden",
							}}
						>
							<span style={{ color: palette.primary, flexShrink: 0 }}>
								{getFileIcon(file.type)}
							</span>
							<span
								style={{
									fontSize: 14,
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{file.name}
							</span>
						</div>
						<span style={{ fontSize: 13, color: palette.textMuted }}>
							{file.size ? formatSize(file.size) : "--"}
						</span>
						<span style={{ fontSize: 13, color: palette.textMuted }}>
							{file.created_at
								? new Date(file.created_at).toLocaleDateString()
								: "--"}
						</span>
						<button
							onClick={(event) => {
								event.stopPropagation();
								onRequestDelete(file);
							}}
							style={{
								background: "none",
								border: "none",
								cursor: "pointer",
								padding: 4,
								color: palette.textMuted,
							}}
						>
							<Trash2 className="w-4 h-4" />
						</button>
					</div>
				))}
			</div>
		</div>
	);
}

function headerButtonStyle(palette: ColorScheme): CSSProperties {
	return {
		display: "flex",
		alignItems: "center",
		gap: 4,
		background: "none",
		border: "none",
		color: palette.textMuted,
		cursor: "pointer",
		padding: 0,
		fontSize: 12,
		fontWeight: 600,
	};
}
