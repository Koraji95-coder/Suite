import { Button } from "@/components/apps/ui/button";
import { Card } from "@/components/apps/ui/card";
import { recentFiles } from "./file-manager-dashboard-models";

export function FileManagerDashboardRecentFiles() {
	return (
		<div className="mb-8">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="text-base font-medium lg:text-lg">Recently modified</h2>
				<Button
					variant="ghost"
					className="text-sm [color:var(--primary)] hover:[color:var(--primary)]"
				>
					View all →
				</Button>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{recentFiles.map((file) => (
					<Card key={file.name} className="p-4">
						<div className="flex items-center gap-3">
							<div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
								<file.icon className="text-muted-foreground h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium">{file.name}</p>
								<p className="text-muted-foreground text-xs">
									{file.size} • {file.type}
								</p>
							</div>
						</div>
					</Card>
				))}
			</div>
		</div>
	);
}
