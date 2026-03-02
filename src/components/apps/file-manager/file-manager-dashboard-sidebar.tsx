import { Folder, HelpCircle, MessageCircle, Settings } from "lucide-react";
import { sidebarItems } from "./file-manager-dashboard-models";

interface FileManagerDashboardSidebarProps {
	onSidebarItemClick?: () => void;
}

export function FileManagerDashboardSidebar({
	onSidebarItemClick,
}: FileManagerDashboardSidebarProps) {
	const handleItemClick = () => {
		onSidebarItemClick?.();
	};

	return (
		<>
			<div className="border-border border-b p-6">
				<div className="flex items-center gap-2">
					<div className="bg-primary flex h-8 w-8 items-center justify-center rounded-lg">
						<Folder className="size-4 [color:var(--text)]" />
					</div>
					<span className="text-lg font-semibold">File Manager</span>
				</div>
			</div>

			<div className="flex-1 p-4">
				<div className="text-muted-foreground mb-4 text-xs font-medium">
					Menu
				</div>
				<nav className="space-y-1">
					{sidebarItems.map((item) => (
						<button
							key={item.label}
							className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
								item.active
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:text-foreground hover:bg-accent"
							}`}
							onClick={handleItemClick}
						>
							<item.icon className="h-4 w-4" />
							{item.label}
						</button>
					))}
				</nav>
			</div>

			<div className="border-border border-t p-4">
				<div className="text-muted-foreground mb-4 text-xs font-medium">
					Other
				</div>
				<nav className="space-y-1">
					<button className="text-muted-foreground hover:text-foreground hover:bg-accent flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors">
						<Settings className="h-4 w-4" />
						Settings
					</button>
					<button className="text-muted-foreground hover:text-foreground hover:bg-accent flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors">
						<MessageCircle className="h-4 w-4" />
						Chat & Support
					</button>
					<button className="text-muted-foreground hover:text-foreground hover:bg-accent flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors">
						<HelpCircle className="h-4 w-4" />
						Help Center
					</button>
				</nav>
			</div>
		</>
	);
}
