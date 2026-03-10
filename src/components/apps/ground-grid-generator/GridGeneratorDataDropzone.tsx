import { Upload } from "lucide-react";
import type { ChangeEvent, DragEvent, RefObject } from "react";
import { hexToRgba } from "@/lib/palette";

interface GridGeneratorDataDropzoneProps {
	isDragging: boolean;
	fileInputRef: RefObject<HTMLInputElement | null>;
	palettePrimary: string;
	paletteSurfaceLight: string;
	paletteText: string;
	paletteTextMuted: string;
	onDragStateChange: (dragging: boolean) => void;
	onFileDrop: (event: DragEvent<HTMLDivElement>) => void;
	onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function GridGeneratorDataDropzone({
	isDragging,
	fileInputRef,
	palettePrimary,
	paletteSurfaceLight,
	paletteText,
	paletteTextMuted,
	onDragStateChange,
	onFileDrop,
	onFileSelect,
}: GridGeneratorDataDropzoneProps) {
	return (
		<div
			onDragOver={(event) => {
				event.preventDefault();
				onDragStateChange(true);
			}}
			onDragLeave={() => onDragStateChange(false)}
			onDrop={(event) => {
				onDragStateChange(false);
				onFileDrop(event);
			}}
			onClick={() => fileInputRef.current?.click()}
			style={{
				padding: 24,
				borderRadius: 10,
				border: `2px dashed ${isDragging ? "#f59e0b" : hexToRgba(palettePrimary, 0.25)}`,
				background: isDragging
					? hexToRgba("#f59e0b", 0.08)
					: hexToRgba(paletteSurfaceLight, 0.2),
				cursor: "pointer",
				textAlign: "center",
				transition: "all 0.2s",
			}}
		>
			<Upload
				size={28}
				color={isDragging ? "#f59e0b" : paletteTextMuted}
				style={{ margin: "0 auto 8px" }}
			/>
			<div style={{ fontSize: 13, fontWeight: 600, color: paletteText }}>
				Drop CSV file here or click to browse
			</div>
			<div style={{ fontSize: 11, color: paletteTextMuted, marginTop: 4 }}>
				Supports rod tables and conductor tables (.csv, .txt)
			</div>
			<input
				ref={fileInputRef}
				type="file"
				accept=".csv,.txt"
				onChange={onFileSelect}
				style={{ display: "none" }}
			name="gridgeneratordatadropzone_input_63"
			/>
		</div>
	);
}
