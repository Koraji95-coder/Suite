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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/apps/ui/dropdown-menu";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";

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
					size="sm"
					iconOnly
					iconLeft={<Menu className="h-5 w-5" />}
					className="lg:hidden"
					onClick={onOpenMobileSidebar}
					aria-label="Open file navigation"
				/>

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
					size="sm"
					iconOnly
					iconLeft={<BarChart3 className="h-4 w-4" />}
					className="xl:hidden"
					onClick={onOpenStoragePanel}
					aria-label="Open storage panel"
				/>

				<Button size="sm" iconLeft={<Upload className="h-4 w-4" />}>
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
				<Button
					variant="ghost"
					size="sm"
					iconOnly
					iconLeft={<Bell className="h-4 w-4" />}
					aria-label="Notifications"
				/>

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
