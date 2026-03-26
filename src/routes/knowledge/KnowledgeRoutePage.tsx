import { Link } from "react-router-dom";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import { Panel } from "@/components/primitives/Panel";
import styles from "./KnowledgeRoutePage.module.css";
import { CUSTOMER_KNOWLEDGE_SECTIONS } from "./modules/knowledgeSections";

export default function KnowledgeRoutePage() {
	const referenceSections = CUSTOMER_KNOWLEDGE_SECTIONS;
	const referenceItemCount = referenceSections.reduce(
		(total, section) => total + section.items.length,
		0,
	);

	useRegisterPageHeader({
		title: "Knowledge",
		subtitle: "References, formulas, standards context, and reusable guidance.",
	});

	return (
		<PageFrame maxWidth="full">
			<div className={styles.root}>
				<PageContextBand
					mode="compact"
					eyebrow="Reference library"
					summary={
						<p className={styles.bandSummary}>
							Open the tools, reusable formulas, and field-ready references that
							support the work already in motion.
						</p>
					}
					meta={
						<div className={styles.bandFacts}>
							<div className={styles.bandFact}>
								<strong>2</strong>
								<span>Interactive tools</span>
							</div>
							<div className={styles.bandFact}>
								<strong>{referenceSections.length}</strong>
								<span>Reference sets</span>
							</div>
							<div className={styles.bandFact}>
								<strong>{referenceItemCount}</strong>
								<span>Reference items</span>
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
							<span className={styles.featuredLabel}>Workflow reference</span>
							<h3 className={styles.libraryTitle}>Standards guidance</h3>
							<p className={styles.libraryDescription}>
								Keep standards context and issue-set reminders close to the
								active project workflow.
							</p>
							<Link
								to="/app/apps/standards-checker"
								className={styles.libraryAction}
							>
								Open standards checker
							</Link>
						</Panel>
					</div>
				</PageContextBand>

				<div className={styles.sectionGrid}>
					{referenceSections.map((section) => (
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
