import { Link } from "react-router-dom";
import { PageContextBand } from "@/components/system/PageContextBand";
import { PageFrame } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";
import { Panel } from "@/components/system/base/Panel";
import { Text } from "@/components/system/base/Text";
import styles from "./DeveloperDocsRoutePage.module.css";
import {
	DEVELOPER_DOC_COUNT,
	DEVELOPER_DOC_SECTIONS,
} from "../modules/developerDocsManifest";

export default function DeveloperDocsRoutePage() {
	useRegisterPageHeader({
		title: "Developer Docs",
		subtitle: "Developer docs, runbooks, and environment guidance.",
	});

	return (
		<PageFrame maxWidth="full">
			<div className={styles.root}>
				<PageContextBand
					mode="compact"
					eyebrow="Developer docs"
					summary={
						<p className={styles.bandSummary}>
							Keep runbooks, support notes, and developer guidance in one
							separate library instead of mixing them into the customer-facing
							reference route.
						</p>
					}
					meta={
						<div className={styles.bandFacts}>
							<div className={styles.bandFact}>
								<strong>1</strong>
								<span>Developer surface</span>
							</div>
							<div className={styles.bandFact}>
								<strong>{DEVELOPER_DOC_COUNT}</strong>
								<span>Tracked docs</span>
							</div>
							<div className={styles.bandFact}>
								<strong>{DEVELOPER_DOC_SECTIONS.length}</strong>
								<span>Doc groups</span>
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
							<span className={styles.featuredLabel}>Developer surface</span>
							<h3 className={styles.libraryTitle}>Developer Portal</h3>
							<p className={styles.libraryDescription}>
								Jump into the developer workshop for staged tools, publishing
								evidence, and launcher cards.
							</p>
							<Link to="/app/developer" className={styles.libraryAction}>
								Open developer portal
							</Link>
						</Panel>
					</div>
					<div className={styles.referenceStrip}>
						{DEVELOPER_DOC_SECTIONS.slice(0, 3).map((section) => (
							<div key={section.id} className={styles.referencePill}>
								<strong>{section.title}</strong>
								<span>
									{section.count} doc{section.count === 1 ? "" : "s"} ·{" "}
									{section.docs[0]?.title ?? "No docs indexed"}
								</span>
							</div>
						))}
					</div>
				</PageContextBand>

				<div className={styles.sectionGrid}>
					{DEVELOPER_DOC_SECTIONS.map((section) => (
						<Panel
							key={section.id}
							variant="support"
							padding="lg"
							className={styles.sectionCard}
						>
							<div className={styles.sectionHeader}>
								<div>
									<p className={styles.sectionEyebrow}>Developer docs</p>
									<h3 className={styles.sectionTitle}>{section.title}</h3>
								</div>
								<div className={styles.sectionCount}>
									{section.count} doc{section.count === 1 ? "" : "s"}
								</div>
							</div>
							<p className={styles.sectionDescription}>{section.description}</p>
							<ul className={styles.docList}>
								{section.docs.slice(0, 5).map((doc) => (
									<li key={doc.id} className={styles.docItem}>
										<strong className={styles.docTitle}>{doc.title}</strong>
										<span className={styles.docSummary}>{doc.summary}</span>
										<span className={styles.docPath}>{doc.relativePath}</span>
									</li>
								))}
							</ul>
						</Panel>
					))}
				</div>
				<Panel variant="support" padding="lg" className={styles.developerNote}>
					<Text size="sm" weight="semibold" block>
						Keep developer docs separate from customer-facing guidance.
					</Text>
					<Text size="xs" color="muted" block>
						This library is generated from the repo docs tree so developer
						runbooks, security notes, and workshop references stay current
						without placeholder lists inside the customer knowledge route.
					</Text>
				</Panel>
			</div>
		</PageFrame>
	);
}
