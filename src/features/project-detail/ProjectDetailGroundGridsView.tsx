import { MapPin, Plus } from "lucide-react";
import type { GridDesign } from "@/features/ground-grid-generation/ui/types";
import { cn } from "@/lib/utils";
import styles from "./ProjectDetailGroundGridsView.module.css";

interface ProjectDetailGroundGridsViewProps {
	gridDesigns: GridDesign[];
	onCreateDesign: () => void;
	onOpenDesign: (designId: string) => void;
}

export function ProjectDetailGroundGridsView({
	gridDesigns,
	onCreateDesign,
	onOpenDesign,
}: ProjectDetailGroundGridsViewProps) {
	const statusClassName = (status: GridDesign["status"]) => {
		if (status === "finalized") {
			return styles.statusFinalized;
		}

		if (status === "archived") {
			return styles.statusArchived;
		}

		return styles.statusDraft;
	};

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<h4 className={styles.title}>Ground Grid Designs</h4>
				<button onClick={onCreateDesign} className={styles.createButton}>
					<Plus className={styles.createIcon} />
					<span>New Design</span>
				</button>
			</div>

			{gridDesigns.length === 0 ? (
				<div className={styles.empty}>
					<MapPin className={styles.emptyIcon} />
					<p className={styles.emptyTitle}>No ground grid designs linked</p>
					<p className={styles.emptyCopy}>
						Create a new design or link an existing one from the Grid Generator
					</p>
				</div>
			) : (
				<div className={styles.list}>
					{gridDesigns.map((design) => (
						<button
							key={design.id}
							onClick={() => onOpenDesign(design.id)}
							className={styles.designRow}
						>
							<div className={styles.designMain}>
								<MapPin className={styles.designIcon} />
								<div className={styles.designMeta}>
									<p className={styles.designName}>{design.name}</p>
									<div className={styles.designDate}>
										{new Date(design.updated_at).toLocaleDateString()}
									</div>
								</div>
							</div>
							<span
								className={cn(styles.status, statusClassName(design.status))}
							>
								{design.status}
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
