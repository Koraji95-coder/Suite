import {
	Archive,
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	ChevronRight,
	Download,
	FileSpreadsheet,
	FileText,
	Film,
	Folder,
	Image,
	RefreshCw,
	Search,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useFiles } from "@/hooks/useFiles";
import { hexToRgba, useTheme } from "@/lib/palette";
import type { StorageFile } from "./storageTypes";

type SortKey = "name" | "size" | "created_at";

function getFileIcon(type: string) {
	if (type === "folder") return <Folder className="w-5 h-5" />;
	if (type.startsWith("image/")) return <Image className="w-5 h-5" />;
	if (type.startsWith("video/")) return <Film className="w-5 h-5" />;
	if (type.includes("zip") || type.includes("rar") || type.includes("tar"))
		return <Archive className="w-5 h-5" />;
	if (
		type.includes("spreadsheet") ||
		type.includes("excel") ||
		type.includes("csv")
	)
		return <FileSpreadsheet className="w-5 h-5" />;
	return <FileText className="w-5 h-5" />;
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function FileBrowser() {
	const { palette } = useTheme();
	const [currentPath, setCurrentPath] = useState("");
	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>("name");
	const [sortAsc, setSortAsc] = useState(true);
	const [selected, setSelected] = useState<StorageFile | null>(null);
	const [dragging, setDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { files, loading, error, refresh, upload, download, remove } = useFiles(
		"project-files",
		currentPath,
	);

	const pathSegments = currentPath ? currentPath.split("/") : [];

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
			setSortAsc((p) => !p);
		} else {
			setSortKey(key);
			setSortAsc(true);
		}
	};

	const handleUpload = useCallback(
		async (fileList: FileList | null) => {
			if (!fileList) return;
			for (const f of Array.from(fileList)) {
				await upload(f.name, f);
			}
		},
		[upload],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setDragging(false);
			handleUpload(e.dataTransfer.files);
		},
		[handleUpload],
	);

	const handleDownload = async (file: StorageFile) => {
		const blob = await download(file.name);
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = file.name;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	const handleDelete = async (file: StorageFile) => {
		if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
		await remove(file.name);
		if (selected?.name === file.name) setSelected(null);
	};

	const filtered = files
		.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
		.sort((a, b) => {
			const dir = sortAsc ? 1 : -1;
			if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
			if (sortKey === "size") return (a.size - b.size) * dir;
			return (
				(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) *
				dir
			);
		});

	const SortIcon = ({ col }: { col: SortKey }) => {
		if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
		return sortAsc ? (
			<ArrowUp className="w-3 h-3" />
		) : (
			<ArrowDown className="w-3 h-3" />
		);
	};

	return (
		<div style={{ display: "flex", gap: 16, minHeight: 400 }}>
			<div style={{ flex: 1 }}>
				<div
					style={{
						display: "flex",
						gap: 8,
						marginBottom: 12,
						alignItems: "center",
					}}
				>
					<div style={{ position: "relative", flex: 1 }}>
						<Search
							className="w-4 h-4"
							style={{
								position: "absolute",
								left: 10,
								top: 10,
								color: palette.primary,
							}}
						/>
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search files..."
							style={{
								width: "100%",
								padding: "8px 12px 8px 34px",
								background: hexToRgba(palette.background, 0.6),
								border: `1px solid ${hexToRgba(palette.primary, 0.25)}`,
								borderRadius: 8,
								color: palette.text,
								outline: "none",
								fontSize: 14,
							}}
						/>
					</div>
					<button
						onClick={() => fileInputRef.current?.click()}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							padding: "8px 14px",
							background: hexToRgba(palette.primary, 0.15),
							border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
							borderRadius: 8,
							color: palette.text,
							cursor: "pointer",
							fontSize: 14,
						}}
					>
						<Upload className="w-4 h-4" /> Upload
					</button>
					<input
						ref={fileInputRef}
						type="file"
						multiple
						className="hidden"
						onChange={(e) => handleUpload(e.target.files)}
					/>
					<button
						onClick={() => refresh()}
						disabled={loading}
						style={{
							padding: 8,
							background: hexToRgba(palette.primary, 0.1),
							border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
							borderRadius: 8,
							color: palette.text,
							cursor: "pointer",
						}}
					>
						<RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
					</button>
				</div>

				<div
					style={{
						display: "flex",
						gap: 4,
						marginBottom: 12,
						alignItems: "center",
						flexWrap: "wrap",
					}}
				>
					<button
						onClick={() => {
							setCurrentPath("");
							setSelected(null);
						}}
						style={{
							padding: "2px 8px",
							borderRadius: 4,
							cursor: "pointer",
							background: hexToRgba(palette.primary, 0.1),
							border: "none",
							color: palette.primary,
							fontSize: 13,
						}}
					>
						root
					</button>
					{pathSegments.map((seg, i) => (
						<span
							key={i}
							style={{ display: "flex", alignItems: "center", gap: 2 }}
						>
							<ChevronRight
								className="w-3 h-3"
								style={{ color: palette.textMuted }}
							/>
							<button
								onClick={() => navigateTo(i)}
								style={{
									padding: "2px 8px",
									borderRadius: 4,
									cursor: "pointer",
									background: hexToRgba(palette.primary, 0.1),
									border: "none",
									color: palette.primary,
									fontSize: 13,
								}}
							>
								{seg}
							</button>
						</span>
					))}
				</div>

				<div
					onDragOver={(e) => {
						e.preventDefault();
						setDragging(true);
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={handleDrop}
					style={{
						border: `2px dashed ${dragging ? palette.primary : hexToRgba(palette.primary, 0.15)}`,
						borderRadius: 10,
						transition: "border-color 0.2s",
						background: dragging
							? hexToRgba(palette.primary, 0.05)
							: "transparent",
					}}
				>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1fr 80px 120px 40px",
							padding: "8px 16px",
							fontSize: 12,
							fontWeight: 600,
							color: palette.textMuted,
							borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
						}}
					>
						<button
							onClick={() => toggleSort("name")}
							style={{
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
							}}
						>
							Name <SortIcon col="name" />
						</button>
						<button
							onClick={() => toggleSort("size")}
							style={{
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
							}}
						>
							Size <SortIcon col="size" />
						</button>
						<button
							onClick={() => toggleSort("created_at")}
							style={{
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
							}}
						>
							Date <SortIcon col="created_at" />
						</button>
						<span />
					</div>

					{error && (
						<div style={{ padding: 12, color: palette.accent, fontSize: 13 }}>
							{error}
						</div>
					)}

					{loading && !files.length && (
						<div
							style={{
								padding: 32,
								textAlign: "center",
								color: palette.textMuted,
							}}
						>
							Loading...
						</div>
					)}

					{!loading && filtered.length === 0 && (
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
					)}

					{filtered.map((file) => (
						<div
							key={file.id || file.name}
							onClick={() => handleFileClick(file)}
							style={{
								display: "grid",
								gridTemplateColumns: "1fr 80px 120px 40px",
								alignItems: "center",
								padding: "10px 16px",
								cursor: "pointer",
								background:
									selected?.name === file.name
										? hexToRgba(palette.primary, 0.08)
										: "transparent",
								borderBottom: `1px solid ${hexToRgba(palette.primary, 0.05)}`,
								transition: "background 0.15s",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = hexToRgba(
									palette.primary,
									0.06,
								);
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background =
									selected?.name === file.name
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
								onClick={(e) => {
									e.stopPropagation();
									handleDelete(file);
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

			{selected && (
				<div
					style={{
						width: 260,
						flexShrink: 0,
						padding: 16,
						borderRadius: 10,
						background: hexToRgba(palette.surface, 0.6),
						border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginBottom: 16,
						}}
					>
						<span
							style={{ fontWeight: 600, fontSize: 14, color: palette.text }}
						>
							Details
						</span>
						<button
							onClick={() => setSelected(null)}
							style={{
								background: "none",
								border: "none",
								cursor: "pointer",
								color: palette.textMuted,
							}}
						>
							<X className="w-4 h-4" />
						</button>
					</div>
					<div
						style={{
							display: "flex",
							justifyContent: "center",
							marginBottom: 16,
							color: palette.primary,
						}}
					>
						{getFileIcon(selected.type)}
					</div>
					{[
						["Name", selected.name],
						["Type", selected.type || "Unknown"],
						["Size", selected.size ? formatSize(selected.size) : "--"],
						[
							"Created",
							selected.created_at
								? new Date(selected.created_at).toLocaleString()
								: "--",
						],
						[
							"Updated",
							selected.updated_at
								? new Date(selected.updated_at).toLocaleString()
								: "--",
						],
					].map(([label, value]) => (
						<div key={label} style={{ marginBottom: 10 }}>
							<div
								style={{
									fontSize: 11,
									color: palette.textMuted,
									marginBottom: 2,
								}}
							>
								{label}
							</div>
							<div
								style={{
									fontSize: 13,
									color: palette.text,
									wordBreak: "break-all",
								}}
							>
								{value}
							</div>
						</div>
					))}
					<div style={{ display: "flex", gap: 8, marginTop: 16 }}>
						<button
							onClick={() => handleDownload(selected)}
							style={{
								flex: 1,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 4,
								padding: "8px 0",
								borderRadius: 6,
								fontSize: 13,
								cursor: "pointer",
								background: hexToRgba(palette.primary, 0.15),
								border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
								color: palette.text,
							}}
						>
							<Download className="w-3.5 h-3.5" /> Download
						</button>
						<button
							onClick={() => handleDelete(selected)}
							style={{
								padding: "8px 12px",
								borderRadius: 6,
								cursor: "pointer",
								background: hexToRgba(palette.accent, 0.15),
								border: `1px solid ${hexToRgba(palette.accent, 0.3)}`,
								color: palette.accent,
							}}
						>
							<Trash2 className="w-3.5 h-3.5" />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
