import { Folder, HelpCircle, MessageCircle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { sidebarItems } from "./file-manager-dashboard-models";
import styles from "./file-manager-dashboard-sidebar.module.css";

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
			<div className={styles.header}>
				<div className={styles.brandRow}>
					<div className={styles.brandBadge}>
						<Folder size={16} />
					</div>
					<span className={styles.brandTitle}>File Manager</span>
				</div>
			</div>

			<div className={styles.body}>
				<div className={styles.label}>Menu</div>
				<nav className={styles.nav}>
					{sidebarItems.map((item) => (
						<button
							key={item.label}
							className={cn(
								styles.menuItem,
								item.active ? styles.menuItemActive : styles.menuItemInactive,
							)}
							onClick={handleItemClick}
						>
							<item.icon size={16} />
							{item.label}
						</button>
					))}
				</nav>
			</div>

			<div className={styles.footer}>
				<div className={styles.label}>Other</div>
				<nav className={styles.nav}>
					<button className={cn(styles.menuItem, styles.menuItemInactive)}>
						<Settings size={16} />
						Settings
					</button>
					<button className={cn(styles.menuItem, styles.menuItemInactive)}>
						<MessageCircle size={16} />
						Chat & Support
					</button>
					<button className={cn(styles.menuItem, styles.menuItemInactive)}>
						<HelpCircle size={16} />
						Help Center
					</button>
				</nav>
			</div>
		</>
	);
}
