import { ArrowRight, Bot, FolderKanban } from "lucide-react";
import { Link } from "react-router-dom";
import { PageFrame, Section } from "@/components/apps/ui/PageFrame";
import { AppsCatalogGrid } from "./modules/AppsCatalogGrid";
import { APPS_CATALOG } from "./modules/appsCatalog";
import styles from "./AppsRoutePage.module.css";

export default function AppsRoutePage() {
	const activeCount = APPS_CATALOG.filter((item) => item.status === "active").length;
	const automationCount = APPS_CATALOG.filter(
		(item) => item.lane === "automation",
	).length;
	const intelligenceCount = APPS_CATALOG.filter(
		(item) => item.lane === "intelligence",
	).length;

	return (
		<PageFrame
			title="Apps Hub"
			description="Launch workspace tools from a command-center surface that matches the rest of Suite."
			maxWidth="xl"
		>
			<Section>
				<div className={styles.hero}>
					<div className={styles.heroIntro}>
						<div>
							<p className={styles.eyebrow}>Engineering apps</p>
							<h2 className={styles.heroTitle}>
								One launch surface for projects, automation, and intelligence.
							</h2>
							<p className={styles.heroCopy}>
								The Apps Hub is the route-level control surface for Suite. Use
								it to jump into delivery work, CAD automation, and agent-backed
								intelligence without hunting across the shell.
							</p>
						</div>
						<div className={styles.heroActions}>
							<Link to="/app/projects" className={styles.heroLink}>
								<FolderKanban className={styles.heroLinkIcon} />
								<span>Open Projects</span>
							</Link>
							<Link to="/app/agent" className={styles.heroLinkSecondary}>
								<Bot className={styles.heroLinkIcon} />
								<span>Open Agents</span>
							</Link>
						</div>
					</div>

					<div className={styles.signalGrid}>
						<div className={styles.signalCard}>
							<span className={styles.signalLabel}>Active tools</span>
							<strong className={styles.signalValue}>{activeCount}</strong>
							<span className={styles.signalMeta}>Ready to launch now</span>
						</div>
						<div className={styles.signalCard}>
							<span className={styles.signalLabel}>Automation lanes</span>
							<strong className={styles.signalValue}>{automationCount}</strong>
							<span className={styles.signalMeta}>CAD and backend execution</span>
						</div>
						<div className={styles.signalCard}>
							<span className={styles.signalLabel}>Intelligence lanes</span>
							<strong className={styles.signalValue}>{intelligenceCount}</strong>
							<span className={styles.signalMeta}>Graph, knowledge, and agents</span>
						</div>
					</div>
				</div>
			</Section>

			<Section
				title="Launch Stack"
				description="Route into the current Suite surfaces without leaving the command-center layout."
				actions={
					<Link to="/app/dashboard" className={styles.heroLinkSecondary}>
						<span>Back to Dashboard</span>
						<ArrowRight className={styles.heroLinkIcon} />
					</Link>
				}
			>
				<p className={styles.sectionCopy}>
					Each module below is grouped by the role it plays in the workspace:
					project execution, engineering automation, or operational
					intelligence.
				</p>
				<AppsCatalogGrid items={APPS_CATALOG} />
			</Section>
		</PageFrame>
	);
}
