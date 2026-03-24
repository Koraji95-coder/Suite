import { Link } from "react-router-dom";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import { Panel } from "@/components/primitives/Panel";
import styles from "./KnowledgeRoutePage.module.css";
import { KNOWLEDGE_SECTIONS } from "./modules/knowledgeSections";

export default function KnowledgeRoutePage() {
	useRegisterPageHeader({
		title: "Knowledge",
		subtitle: "References, formulas, standards context, and reusable guidance.",
	});

	return (
		<PageFrame maxWidth="full">
			<div className={styles.root}>
				<PageContextBand
					mode="compact"
					eyebrow="Workspace directory"
					summary={
						<p className={styles.bandSummary}>
							Open the tools, reusable formulas, and field-ready references that
							support the work already in motion.
						</p>
					}
					meta={
						<div className={styles.bandStats}>
							<div className={styles.bandStat}>
								<strong>2</strong>
								<span>Interactive tools</span>
							</div>
							<div className={styles.bandStat}>
								<strong>{KNOWLEDGE_SECTIONS.length}</strong>
								<span>Reference sets</span>
							</div>
						</div>
					}
				>
					<div className={styles.featuredGrid}>
						<Panel
							variant="feature"
							padding="lg"
							className={styles.featuredCard}
						>
							<span className={styles.featuredLabel}>Featured tool</span>
							<h3 className={styles.libraryTitle}>Math tools</h3>
							<p className={styles.libraryDescription}>
								Calculators, plots, and formula banks for drafting, grounding,
								and electrical analysis.
							</p>
							<Link
								to="/app/knowledge/math-tools"
								className={styles.libraryAction}
							>
								Open math tools
							</Link>
						</Panel>
						<Panel
							variant="support"
							padding="lg"
							className={styles.libraryCard}
						>
							<span className={styles.featuredLabel}>Capture surface</span>
							<h3 className={styles.libraryTitle}>Whiteboard</h3>
							<p className={styles.libraryDescription}>
								Sketch, tag, and review whiteboard snapshots alongside active
								designs.
							</p>
							<Link
								to="/app/knowledge/whiteboard"
								className={styles.libraryAction}
							>
								Open whiteboard
							</Link>
						</Panel>
					</div>
					<div className={styles.referenceStrip}>
						{KNOWLEDGE_SECTIONS.slice(0, 3).map((section) => (
							<div key={section.title} className={styles.referencePill}>
								<strong>{section.title}</strong>
								<span>{section.items[0]}</span>
							</div>
						))}
					</div>
				</PageContextBand>

				<div className={styles.sectionGrid}>
					{KNOWLEDGE_SECTIONS.map((section) => (
						<Panel
							key={section.title}
							variant="support"
							padding="lg"
							className={styles.sectionCard}
						>
							<p className={styles.sectionEyebrow}>Reference set</p>
							<h3 className={styles.sectionTitle}>{section.title}</h3>
							<p className={styles.sectionDescription}>{section.description}</p>
							<ul className={styles.sectionList}>
								{section.items.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						</Panel>
					))}
				</div>
			</div>
		</PageFrame>
	);
}
