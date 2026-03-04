import { Download, Loader2, Shield, Trash2, Upload } from "lucide-react";
import type { BackupFileInfo } from "@/supabase/backupManager";

interface BackupManagerFilesListProps {
	files: BackupFileInfo[];
	loadingFiles: boolean;
	formatSize: (bytes: number) => string;
	onDownloadFile: (filename: string) => void;
	onRequestRestore: (filename: string) => void;
	onRequestDelete: (filename: string) => void;
}

export function BackupManagerFilesList({
	files,
	loadingFiles,
	formatSize,
	onDownloadFile,
	onRequestRestore,
	onRequestDelete,
}: BackupManagerFilesListProps) {
	return (
		<div className="mb-5">
			<div className="mb-2.5 flex items-center gap-2 text-sm font-semibold [color:var(--text)]">
				<Shield className="h-4 w-4 [color:var(--primary)]" /> Backup Files
			</div>

			{loadingFiles ? (
				<div className="py-6 text-center [color:var(--text-muted)]">
					<Loader2 className="mx-auto h-5 w-5 animate-spin" />
				</div>
			) : files.length === 0 ? (
				<div className="py-6 text-center text-[13px] [color:var(--text-muted)]">
					No backup files yet
				</div>
			) : (
				<div className="grid gap-1.5">
					{files.map((file) => (
						<div
							key={file.name}
							className="flex flex-wrap items-center gap-2 rounded-lg border px-3.5 py-2.5 sm:gap-3
								border-[color-mix(in_srgb,var(--primary)_8%,transparent)]
								[background:color-mix(in_srgb,var(--surface)_50%,transparent)]"
						>
							<span className="min-w-0 flex-1 basis-full truncate text-[13px] sm:basis-auto [color:var(--text)]">
								{file.name}
							</span>
							<div className="flex items-center gap-3 [color:var(--text-muted)]">
								<span className="text-xs">{formatSize(file.size)}</span>
								<span className="hidden text-xs sm:inline">
									{new Date(file.modified).toLocaleDateString()}
								</span>
							</div>
							<div className="ml-auto flex items-center gap-1">
								<button
									onClick={() => onDownloadFile(file.name)}
									className="border-none bg-transparent p-1 [color:var(--primary)]"
								>
									<Download className="h-4 w-4" />
								</button>
								<button
									onClick={() => onRequestRestore(file.name)}
									className="border-none bg-transparent p-1 [color:var(--secondary)]"
								>
									<Upload className="h-4 w-4" />
								</button>
								<button
									onClick={() => onRequestDelete(file.name)}
									className="border-none bg-transparent p-1 [color:var(--danger)]"
								>
									<Trash2 className="h-4 w-4" />
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
