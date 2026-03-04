import { ChevronDown, Filter, List, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { allFiles, fileTypeLegendItems } from "./file-manager-dashboard-models";

export function FileManagerDashboardAllFiles() {
	return (
		<div>
			<div className="mb-4 flex items-center justify-between">
				<h2 className="text-base font-medium lg:text-lg">All files</h2>
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm">
						<Filter className="h-4 w-4 sm:mr-2" />
						<span className="hidden sm:inline">Filter</span>
					</Button>
					<Button variant="outline" size="sm">
						<List className="h-4 w-4 sm:mr-2" />
						<span className="hidden sm:inline">List</span>
						<ChevronDown className="ml-1 hidden h-4 w-4 sm:inline" />
					</Button>
				</div>
			</div>

			<div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2">
				{fileTypeLegendItems.map((item) => (
					<div
						key={item.label}
						className="flex items-center gap-1 whitespace-nowrap"
					>
						<div className={item.colorClassName} />
						<span className="text-muted-foreground text-sm">{item.label}</span>
					</div>
				))}
			</div>

			<div className="space-y-3 lg:hidden">
				{allFiles.map((file) => (
					<Panel key={file.name} padding="none" className="p-4">
						<div className="flex items-center gap-3">
							<div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
								<file.icon className="text-muted-foreground h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="mb-1 truncate text-sm font-medium">{file.name}</p>
								<div className="text-muted-foreground flex items-center gap-2 text-xs">
									<span>{file.owner}</span>
									<span>•</span>
									<span>{file.size}</span>
									<span>•</span>
									<span>{file.date}</span>
								</div>
							</div>
							<Button
								variant="ghost"
								size="sm"
								iconOnly
								iconLeft={<MoreHorizontal className="h-4 w-4" />}
								aria-label={`More actions for ${file.name}`}
							/>
						</div>
					</Panel>
				))}
			</div>

			<div className="border-border hidden overflow-x-auto rounded-lg border lg:block">
				<div className="bg-muted/50 border-border text-muted-foreground grid grid-cols-12 gap-4 border-b p-4 text-sm font-medium">
					<div className="col-span-5">Name</div>
					<div className="col-span-3">Owner</div>
					<div className="col-span-2">File Size</div>
					<div className="col-span-2">Date modified</div>
				</div>
				{allFiles.map((file) => (
					<div
						key={file.name}
						className="border-border hover:bg-muted/50 grid grid-cols-12 gap-4 border-b p-4 transition-colors last:border-b-0"
					>
						<div className="col-span-5 flex items-center gap-3">
							<div className="bg-muted flex h-8 w-8 items-center justify-center rounded-lg">
								<file.icon className="text-muted-foreground h-4 w-4" />
							</div>
							<span className="truncate text-sm font-medium">{file.name}</span>
						</div>
						<div className="text-muted-foreground col-span-3 text-sm">
							{file.owner}
						</div>
						<div className="text-muted-foreground col-span-2 text-sm">
							{file.size}
						</div>
						<div className="text-muted-foreground col-span-1 text-sm">
							{file.date}
						</div>
						<div className="col-span-1 flex justify-end">
							<Button
								variant="ghost"
								size="sm"
								iconOnly
								iconLeft={<MoreHorizontal className="h-4 w-4" />}
								aria-label={`More actions for ${file.name}`}
							/>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
