import { Dialog, DialogContent } from "@/components/apps/ui/dialog";
import { cn } from "@/lib/utils";
import styles from "./StandardsDrawingDialogs.module.css";
import type { QARule } from "./standardsDrawingModels";

interface StandardsDrawingRulesDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	rules: QARule[];
	onToggleRule: (ruleId: string) => void;
	onClose: () => void;
}

export function StandardsDrawingRulesDialog({
	open,
	onOpenChange,
	rules,
	onToggleRule,
	onClose,
}: StandardsDrawingRulesDialogProps) {
	const severityClass: Record<QARule["severity"], string> = {
		error: styles.chipError,
		warning: styles.chipWarning,
		info: styles.chipInfo,
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className={cn(styles.dialogShell, styles.scroll)}
				showCloseButton={false}
			>
				<div className={styles.header}>
					<h3 className={styles.title}>Standards Rules Configuration</h3>
					<button
						onClick={onClose}
						className={styles.closeButton}
						type="button"
					>
						<span className={styles.closeGlyph}>×</span>
					</button>
				</div>

				<div className={styles.body}>
					<div className={styles.rulesList}>
						{rules.map((rule) => (
							<div
								key={rule.id}
								className={cn(
									styles.ruleCard,
									rule.enabled
										? styles.ruleCardEnabled
										: styles.ruleCardDisabled,
								)}
							>
								<div className={styles.ruleHead}>
									<div className={styles.ruleMain}>
										<div className={styles.ruleTop}>
											<input
												type="checkbox"
												checked={rule.enabled}
												onChange={() => onToggleRule(rule.id)}
												className={styles.toggle}
											name="standardsdrawingrulesdialog_input_59"
											/>
											<h4 className={styles.ruleName}>{rule.name}</h4>
											<span
												className={cn(
													styles.chip,
													severityClass[rule.severity],
												)}
											>
												{rule.severity}
											</span>
										</div>
										<p className={styles.ruleDesc}>{rule.description}</p>
										<span className={styles.categoryChip}>
											{rule.category.replace("_", " ")}
										</span>
									</div>
								</div>
							</div>
						))}
					</div>

					<div className={styles.tightFooter}>
						<button
							onClick={onClose}
							className={`${styles.actionButton} ${styles.primaryButton}`}
							type="button"
						>
							Done
						</button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
