import {
	BarChart3,
	Bell,
	ChevronDown,
	Menu,
	Plus,
	Search,
	Upload,
} from "lucide-react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/apps/ui/avatar";
import { Button } from "@/components/apps/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/apps/ui/dropdown-menu";
import { Input } from "@/components/apps/ui/input";

interface FileManagerDashboardHeaderProps {
	searchQuery: string;
	onSearchQueryChange: (value: string) => void;
	onOpenMobileSidebar: () => void;
	onOpenStoragePanel: () => void;
}

export function FileManagerDashboardHeader({
	searchQuery,
	onSearchQueryChange,
	onOpenMobileSidebar,
	onOpenStoragePanel,
}: FileManagerDashboardHeaderProps) {
	return (
		<header className="border-border flex h-16 items-center justify-between border-b px-4 lg:px-6">
			<div className="flex flex-1 items-center gap-4">
				<Button
					variant="ghost"
					size="icon"
					className="lg:hidden"
					onClick={onOpenMobileSidebar}
				>
					<Menu className="h-5 w-5" />
				</Button>

				<div className="relative max-w-md flex-1">
					<Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform" />
					<Input
						placeholder="Search files..."
						value={searchQuery}
						onChange={(event) => onSearchQueryChange(event.target.value)}
						className="pl-10"
					/>
				</div>
			</div>

			<div className="flex items-center gap-2 lg:gap-4">
				<Button
					variant="ghost"
					size="icon"
					className="xl:hidden"
					onClick={onOpenStoragePanel}
				>
					<BarChart3 className="h-4 w-4" />
				</Button>

				<Button
					className="bg-primary hover:[background:color-mix(in_srgb,var(--primary)_80%,var(--surface))]"
					size="sm"
				>
					<Upload className="h-4 w-4 lg:mr-2" />
					<span className="hidden sm:inline">Upload file</span>
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="hidden bg-transparent sm:flex"
				>
					<Plus className="mr-2 h-4 w-4" />
					Create
				</Button>
				<Button variant="ghost" size="icon">
					<Bell className="h-4 w-4" />
				</Button>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="flex items-center gap-2">
							<Avatar className="h-8 w-8">
								<AvatarImage src="/robert-fox-profile.png" />
								<AvatarFallback>RF</AvatarFallback>
							</Avatar>
							<span className="hidden md:inline">Robert Fox</span>
							<ChevronDown className="hidden h-4 w-4 md:inline" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem>Profile</DropdownMenuItem>
						<DropdownMenuItem>Settings</DropdownMenuItem>
						<DropdownMenuItem>Sign out</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	);
}
