import { Link } from "react-router-dom";
import { PageFrame, Section } from "@/components/apps/ui/PageFrame";
import styles from "./KnowledgeRoutePage.module.css";
import { KNOWLEDGE_SECTIONS } from "./modules/knowledgeSections";

export default function KnowledgeRoutePage() {
	return (
		<PageFrame
			title="Knowledge"
			description="References, docs, and standards aligned to current workflows."
		>
			<Section
				title="Libraries"
				description="Quick access to curated tool collections."
			>
				<div className={styles.libraryGrid}>
					<article className={styles.libraryCard}>
						<h3 className={styles.libraryTitle}>Math Tools Library</h3>
						<p className={styles.libraryDescription}>
							Legacy engineering calculators and references in one route.
						</p>
						<Link
							to="/app/knowledge/math-tools"
							className={styles.libraryAction}
						>
							Open Library
						</Link>
					</article>
					<article className={styles.libraryCard}>
						<h3 className={styles.libraryTitle}>Whiteboard</h3>
						<p className={styles.libraryDescription}>
							Sketch, tag, and review saved whiteboard snapshots.
						</p>
						<Link
							to="/app/knowledge/whiteboard"
							className={styles.libraryAction}
						>
							Open Whiteboard
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
