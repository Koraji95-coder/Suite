import { RefreshCw, Search, Upload } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";
import { type ColorScheme, hexToRgba } from "@/lib/palette";

interface FileBrowserToolbarProps {
	palette: ColorScheme;
	search: string;
	onSearchChange: (value: string) => void;
	fileInputRef: RefObject<HTMLInputElement | null>;
	onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onRefresh: () => void;
	loading: boolean;
}

export function FileBrowserToolbar({
	palette,
	search,
	onSearchChange,
	fileInputRef,
	onFileInputChange,
	onRefresh,
	loading,
}: FileBrowserToolbarProps) {
	return (
		<div className="mb-3 flex flex-wrap items-center gap-2">
			<div className="relative min-w-[220px] flex-1 basis-full sm:basis-auto">
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
					onChange={(event) => onSearchChange(event.target.value)}
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
				onChange={onFileInputChange}
			/>
			<button
				onClick={onRefresh}
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
	);
}
