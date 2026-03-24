import { ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./StandardsChecker.module.css";
import { categories, type StandardsCategory } from "./standardsCheckerModels";

interface StandardsCheckerHeaderPanelProps {
	activeCategory: StandardsCategory;
	onCategoryChange: (category: StandardsCategory) => void;
}

export function StandardsCheckerHeaderPanel({
	activeCategory,
	onCategoryChange,
}: StandardsCheckerHeaderPanelProps) {
	return (
		<section className={styles.panel}>
			<div className={styles.headerTop}>
				<div className={styles.headerMark}>
					<div className={styles.markBox}>
						<ClipboardCheck className={styles.markIcon} />
					</div>
					<div>
						<p className={styles.headerTitle}>Standards categories</p>
						<p className={styles.headerSubtitle}>
							Verify designs against NEC, IEEE, and IEC standards.
						</p>
					</div>
				</div>
			</div>

			<div className={styles.categories}>
				{categories.map((category) => {
					const isActive = activeCategory === category;
					return (
						<button
							key={category}
							type="button"
							onClick={() => onCategoryChange(category)}
							className={cn(
								styles.categoryButton,
								isActive && styles.categoryButtonActive,
							)}
						>
							{category}
						</button>
					);
				})}
			</div>
		</section>
	);
}
