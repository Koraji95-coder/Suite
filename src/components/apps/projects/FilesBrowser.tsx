import { Download, Search, Upload } from "lucide-react";
import { ProjectFile } from "./projectmanagertypes";
import { formatDateOnly, getFileIcon } from "./projectmanagerutils";

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
	const filteredFiles = files.filter(
		(f) =>
			f.name.toLowerCase().includes(filter.toLowerCase()) ||
			f.mime_type.toLowerCase().includes(filter.toLowerCase()),
	);

	return (
		<div className="bg-black/30 backdrop-blur-md border border-orange-500/30 rounded-lg p-6">
			<div className="flex items-center justify-between mb-4">
				<h4 className="text-xl font-bold text-white/90">File Storage</h4>
				<div className="flex items-center space-x-3">
					<div className="relative">
						<Search className="w-4 h-4 absolute left-3 top-2.5 text-orange-400" />
						<input
							type="text"
							value={filter}
							onChange={(e) => onFilterChange(e.target.value)}
							placeholder="Search files..."
							className="pl-10 pr-4 py-2 bg-black/50 border border-orange-500/30 rounded-lg text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
						/>
					</div>
					<label className="bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-white/90 px-4 py-2 rounded-lg transition-all flex items-center space-x-2 cursor-pointer">
						<Upload className="w-4 h-4" />
						<span>Upload</span>
						<input type="file" onChange={onUpload} className="hidden" />
					</label>
				</div>
			</div>

			<div className="space-y-2">
				{filteredFiles.length === 0 ? (
					<div className="text-center py-12 text-white/35">
						{filter ? "No files match your search" : "No files uploaded yet"}
					</div>
				) : (
					filteredFiles.map((file) => (
						<div
							key={file.id}
							className="flex items-center space-x-3 p-4 bg-black/30 border border-white/10 rounded-lg hover:border-orange-500/40 transition-all"
						>
							<span className="text-2xl">{getFileIcon(file.mime_type)}</span>
							<div className="flex-1">
								<p className="text-white/90 font-medium">{file.name}</p>
								<div className="flex items-center space-x-4 text-xs text-white/35 mt-1">
									<span>{(file.size / 1024).toFixed(2)} KB</span>
									<span>{file.mime_type}</span>
									<span>{formatDateOnly(file.uploaded_at)}</span>
									<span className="text-orange-400">{projectName}</span>
								</div>
							</div>
							<Download
								className="w-5 h-5 text-orange-400 cursor-pointer hover:text-white/60"
								onClick={() => onDownload(file)}
							/>
						</div>
					))
				)}
			</div>
		</div>
	);
}
