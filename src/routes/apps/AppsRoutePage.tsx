import { ArrowRight, Bot, FolderKanban } from "lucide-react";
import { Link } from "react-router-dom";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame, Section } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import { Text } from "@/components/primitives/Text";
import styles from "./AppsRoutePage.module.css";
import { AppsCatalogGrid } from "./modules/AppsCatalogGrid";
import { APPS_CATALOG } from "./modules/appsCatalog";

export default function AppsRoutePage() {
	const activeCount = APPS_CATALOG.filter(
		(item) => item.status === "active",
	).length;
	const automationCount = APPS_CATALOG.filter(
		(item) => item.lane === "automation",
	).length;
	const intelligenceCount = APPS_CATALOG.filter(
		(item) => item.lane === "intelligence",
	).length;
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
						Use the Apps Hub to jump into delivery work, CAD automation, and
						agent-backed intelligence without hunting across the shell.
					</Text>
				}
				actions={
					<>
						<Link to="/app/projects" className={styles.heroLink}>
							<FolderKanban className={styles.heroLinkIcon} />
							<span>Open Projects</span>
						</Link>
						<Link to="/app/agent" className={styles.heroLinkSecondary}>
							<Bot className={styles.heroLinkIcon} />
							<span>Open Agents</span>
						</Link>
					</>
				}
			>
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
						<span className={styles.signalMeta}>
							Graph, knowledge, and agents
						</span>
					</div>
				</div>
			</PageContextBand>

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
