import type {
	CheckResult,
	Standard,
} from "@/features/standards-checker/standardsCheckerModels";
import { cn } from "@/lib/utils";
import styles from "./StandardsChecker.module.css";
import { StandardsCheckerStatusIcon } from "./StandardsCheckerStatusIcon";

interface StandardsCheckerStandardsListProps {
	activeCategory: string;
	filteredStandards: Standard[];
	selectedStandards: Set<string>;
	onToggleStandard: (id: string) => void;
	getResultForStandard: (id: string) => CheckResult | undefined;
}

export function StandardsCheckerStandardsList({
	activeCategory,
	filteredStandards,
	selectedStandards,
	onToggleStandard,
	getResultForStandard,
}: StandardsCheckerStandardsListProps) {
	const statusClass: Record<CheckResult["status"], string> = {
		pass: styles.statusPass,
		warning: styles.statusWarning,
		fail: styles.statusFail,
	};

	return (
		<section className={styles.panel}>
			<div className={styles.listHead}>{activeCategory} Standards</div>

			<div className={styles.list}>
				{filteredStandards.map((standard) => {
					const result = getResultForStandard(standard.id);
					const isSelected = selectedStandards.has(standard.id);

					return (
						<button
							key={standard.id}
							type="button"
							onClick={() => onToggleStandard(standard.id)}
							className={cn(
								styles.listItem,
								isSelected && styles.listItemSelected,
							)}
						>
							<div className={styles.listRow}>
								<div
									className={cn(styles.tick, isSelected && styles.tickSelected)}
								/>

								<div className={styles.itemMain}>
									<div className={styles.itemHead}>
										<div>
											<p className={styles.standardName}>{standard.name}</p>
											<p className={styles.standardCode}>{standard.code}</p>
										</div>

										{result ? (
											<span
												className={cn(
													styles.statusBadge,
													statusClass[result.status],
												)}
											>
												<StandardsCheckerStatusIcon status={result.status} />
												{result.status}
											</span>
										) : null}
									</div>

									<p className={styles.standardDesc}>{standard.description}</p>

									{result ? (
										<p
											className={cn(
												styles.resultText,
												statusClass[result.status],
											)}
										>
											{result.message}
										</p>
									) : null}
								</div>
							</div>
						</button>
					);
				})}
			</div>
		</section>
	);
}
