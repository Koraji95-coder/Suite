import { ArrowRight, FolderKanban } from "lucide-react";
import { Link } from "react-router-dom";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame, Section } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import { Text } from "@/components/primitives/Text";
import styles from "./AppsRoutePage.module.css";
import { AppsCatalogGrid } from "./modules/AppsCatalogGrid";
import { APPS_CATALOG } from "./modules/appsCatalog";

export default function AppsRoutePage() {
	const visibleItems = APPS_CATALOG.filter(
		(item) => item.audience === "customer",
	);
	useRegisterPageHeader({
		title: "Apps Hub",
		subtitle:
			"Domain tools for drafting, transmittals, and engineering workflows.",
	});

	return (
		<PageFrame maxWidth="xl">
			<PageContextBand
				className={styles.hero}
				eyebrow="Engineering apps"
				summary={
					<Text size="sm" color="muted" block className={styles.heroCopy}>
						Use the Apps Hub to jump into the current delivery tools without
						hunting across the shell.
					</Text>
				}
				actions={
					<>
						<Link to="/app/projects" className={styles.heroLink}>
							<FolderKanban className={styles.heroLinkIcon} />
							<span>Open Projects</span>
						</Link>
						<Link to="/app/watchdog" className={styles.heroLinkSecondary}>
							<span>Open Watchdog</span>
						</Link>
					</>
				}
			>
				<div className={styles.workflowStrip} aria-label="Product workflow">
					<div className={styles.workflowFact}>
						<span className={styles.workflowLabel}>Released tools</span>
						<strong className={styles.workflowValue}>
							{visibleItems.length}
						</strong>
					</div>
					<div className={styles.workflowFact}>
						<span className={styles.workflowLabel}>Start in</span>
						<strong className={styles.workflowValue}>Projects</strong>
					</div>
					<div className={styles.workflowFact}>
						<span className={styles.workflowLabel}>Delivery flow</span>
						<strong className={styles.workflowValue}>
							Drawing List → Standards → Transmittals
						</strong>
					</div>
				</div>
			</PageContextBand>

			<Section
				title="Product tools"
				description="Released tools stay focused on drawing delivery, document control, and project execution."
				actions={
					<Link to="/app/dashboard" className={styles.heroLinkSecondary}>
						<span>Back to Dashboard</span>
						<ArrowRight className={styles.heroLinkIcon} />
					</Link>
				}
			>
				<AppsCatalogGrid items={visibleItems} />
			</Section>
		</PageFrame>
	);
}
