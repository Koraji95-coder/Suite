import { Link } from "react-router-dom";
import { PageFrame, Section } from "@/components/apps/ui/PageFrame";
import styles from "./KnowledgeRoutePage.module.css";
import { KNOWLEDGE_SECTIONS } from "./modules/knowledgeSections";

export default function KnowledgeRoutePage() {
	return (
		<PageFrame
			title="Knowledge"
			description="References, docs, and standards aligned to current workflows."
			maxWidth="xl"
		>
			<Section
				title="Knowledge workspaces"
				description="Open the engineering tools and references used by your current workflows."
			>
				<div className={styles.libraryGrid}>
					<article className={styles.libraryCard}>
						<h3 className={styles.libraryTitle}>Math tools</h3>
						<p className={styles.libraryDescription}>
							Calculators, plots, and formula references for drafting,
							grounding, and electrical analysis.
						</p>
						<Link
							to="/app/knowledge/math-tools"
							className={styles.libraryAction}
						>
							Open library
						</Link>
					</article>
					<article className={styles.libraryCard}>
						<h3 className={styles.libraryTitle}>Whiteboard</h3>
						<p className={styles.libraryDescription}>
							Sketch, tag, and review whiteboard snapshots alongside your
							designs.
						</p>
						<Link
							to="/app/knowledge/whiteboard"
							className={styles.libraryAction}
						>
							Open whiteboard
						</Link>
					</article>
				</div>
			</Section>

			{KNOWLEDGE_SECTIONS.map((section) => (
				<Section
					key={section.title}
					title={section.title}
					description={section.description}
				>
					<ul className={styles.sectionList}>
						{section.items.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</Section>
			))}
		</PageFrame>
	);
}
