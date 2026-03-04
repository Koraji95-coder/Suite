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
import styles from "./file-manager-dashboard-header.module.css";

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
		<header className={styles.root}>
			<div className={styles.start}>
				<Button
					variant="ghost"
					size="sm"
					iconOnly
					iconLeft={<Menu size={20} />}
					className={styles.mobileMenuButton}
					onClick={onOpenMobileSidebar}
					aria-label="Open file navigation"
				/>

				<div className={styles.searchWrap}>
					<Search className={styles.searchIcon} />
					<Input
						placeholder="Search files..."
						value={searchQuery}
						onChange={(event) => onSearchQueryChange(event.target.value)}
						className={styles.searchInput}
					/>
				</div>
			</div>

			<div className={styles.actions}>
				<Button
					variant="ghost"
					size="sm"
					iconOnly
					iconLeft={<BarChart3 size={16} />}
					className={styles.mobileStorageButton}
					onClick={onOpenStoragePanel}
					aria-label="Open storage panel"
				/>

				<Button size="sm" iconLeft={<Upload size={16} />}>
					<span className={styles.uploadLabel}>Upload file</span>
				</Button>
				<Button variant="outline" size="sm" className={styles.createButton}>
					<Plus size={16} className={styles.buttonIcon} />
					Create
				</Button>
				<Button
					variant="ghost"
					size="sm"
					iconOnly
					iconLeft={<Bell size={16} />}
					aria-label="Notifications"
				/>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className={styles.profileTrigger}>
							<Avatar className={styles.avatar}>
								<AvatarImage src="/robert-fox-profile.png" />
								<AvatarFallback>RF</AvatarFallback>
							</Avatar>
							<span className={styles.profileName}>Robert Fox</span>
							<ChevronDown className={styles.profileChevron} />
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
