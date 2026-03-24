import { Checkbox } from "@/components/apps/ui/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
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
					<DialogHeader className={styles.headerText}>
						<DialogTitle className={styles.title}>
							Standards Rules Configuration
						</DialogTitle>
						<DialogDescription className={styles.subtitle}>
							Enable or disable the rules that run when this drawing is checked.
						</DialogDescription>
					</DialogHeader>
					<DialogClose asChild>
						<button
							onClick={onClose}
							className={styles.closeButton}
							type="button"
							aria-label="Close standards rules configuration"
						>
							<span className={styles.closeGlyph}>×</span>
						</button>
					</DialogClose>
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
											<Checkbox
												id={`standards-rule-${rule.id}`}
												checked={rule.enabled}
												onCheckedChange={(checked) => {
													if (checked === "indeterminate") return;
													onToggleRule(rule.id);
												}}
												className={styles.toggle}
											/>
											<label
												htmlFor={`standards-rule-${rule.id}`}
												className={styles.ruleName}
											>
												{rule.name}
											</label>
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
