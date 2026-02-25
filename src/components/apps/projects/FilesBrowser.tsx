import { Download, Search, Upload } from "lucide-react";
import type { CSSProperties } from "react";
import { glassCardInnerStyle, hexToRgba, useTheme } from "@/lib/palette";
import { ProjectFile } from "./projectmanagertypes";
import { formatDateOnly, getFileIcon } from "./projectmanagerutils";
import { GlassPanel } from "../ui/GlassPanel";

interface FilesBrowserProps {
	files: ProjectFile[];
	filter: string;
	onFilterChange: (filter: string) => void;
	onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onDownload: (file: ProjectFile) => void;
	projectName: string;
}

export function FilesBrowser({
	files,
	filter,
	onFilterChange,
	onUpload,
	onDownload,
	projectName,
}: FilesBrowserProps) {
	const { palette } = useTheme();
	const filteredFiles = files.filter(
		(f) =>
			f.name.toLowerCase().includes(filter.toLowerCase()) ||
			f.mime_type.toLowerCase().includes(filter.toLowerCase()),
	);

	return (
		<GlassPanel tint={palette.secondary} hoverEffect={false} className="p-6">
			<div className="flex items-center justify-between mb-4">
				<h4
					className="text-xl font-bold"
					style={{ color: hexToRgba(palette.text, 0.9) }}
				>
					File Storage
				</h4>
				<div className="flex items-center space-x-3">
					<div className="relative">
						<Search
							className="w-4 h-4 absolute left-3 top-2.5"
							style={{ color: hexToRgba(palette.primary, 0.8) }}
						/>
						<input
							type="text"
							value={filter}
							onChange={(e) => onFilterChange(e.target.value)}
							placeholder="Search files..."
							className="pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2"
							style={
								{
									background: hexToRgba(palette.surface, 0.35),
									border: `1px solid ${hexToRgba(palette.primary, 0.22)}`,
									color: hexToRgba(palette.text, 0.9),
									"--tw-ring-color": hexToRgba(palette.primary, 0.45),
								} as CSSProperties
							}
						/>
					</div>
					<label
						className="px-4 py-2 rounded-lg transition-all flex items-center space-x-2 cursor-pointer"
						style={glassCardInnerStyle(palette, palette.primary)}
					>
						<Upload className="w-4 h-4" />
						<span>Upload</span>
						<input type="file" onChange={onUpload} className="hidden" />
					</label>
				</div>
			</div>

			<div className="space-y-2">
				{filteredFiles.length === 0 ? (
					<div
						className="text-center py-12"
						style={{ color: hexToRgba(palette.text, 0.4) }}
					>
						{filter ? "No files match your search" : "No files uploaded yet"}
					</div>
				) : (
					filteredFiles.map((file) => (
						<div
							key={file.id}
							className="flex items-center space-x-3 p-4 rounded-lg transition-all"
							style={{
								...glassCardInnerStyle(palette, palette.secondary),
								border: `1px solid ${hexToRgba(palette.text, 0.08)}`,
							}}
						>
							<span className="text-2xl">{getFileIcon(file.mime_type)}</span>
							<div className="flex-1">
								<p
									className="font-medium"
									style={{ color: hexToRgba(palette.text, 0.9) }}
								>
									{file.name}
								</p>
								<div
									className="flex items-center space-x-4 text-xs mt-1"
									style={{ color: hexToRgba(palette.text, 0.45) }}
								>
									<span>{(file.size / 1024).toFixed(2)} KB</span>
									<span>{file.mime_type}</span>
									<span>{formatDateOnly(file.uploaded_at)}</span>
									<span style={{ color: hexToRgba(palette.primary, 0.85) }}>
										{projectName}
									</span>
								</div>
							</div>
							<Download
								className="w-5 h-5 cursor-pointer"
								style={{ color: hexToRgba(palette.primary, 0.85) }}
								onClick={() => onDownload(file)}
							/>
						</div>
					))
				)}
			</div>
		</GlassPanel>
	);
}
