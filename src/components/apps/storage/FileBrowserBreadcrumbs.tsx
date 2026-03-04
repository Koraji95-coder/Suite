import { ChevronRight } from "lucide-react";
import styles from "./FileBrowserBreadcrumbs.module.css";

interface FileBrowserBreadcrumbsProps {
	pathSegments: string[];
	onNavigateRoot: () => void;
	onNavigateTo: (index: number) => void;
}

export function FileBrowserBreadcrumbs({
	pathSegments,
	onNavigateRoot,
	onNavigateTo,
}: FileBrowserBreadcrumbsProps) {
	return (
		<div className={styles.root}>
			<button onClick={onNavigateRoot} className={styles.crumbButton}>
				root
			</button>
			{pathSegments.map((segment, index) => (
				<span key={`${segment}-${index}`} className={styles.segment}>
					<ChevronRight className={styles.chevronIcon} />
					<button
						onClick={() => onNavigateTo(index)}
						className={styles.crumbButton}
					>
						{segment}
					</button>
				</span>
			))}
		</div>
	);
}
