import {
	ClipboardList,
	FileCheck2,
	FolderTree,
} from "lucide-react";
import {
	TrustStateBadge,
} from "@/components/apps/ui/TrustStateBadge";
import { cn } from "@/lib/utils";
import { useProjectSetupReadinessState } from "./useProjectSetupReadinessState";
import { DEFAULT_PROJECT_SETUP_TITLE_BLOCK_NAME } from "./wizard";
import type { ProjectWatchdogTelemetry } from "@/features/project-watchdog";
import styles from "./ProjectSetupReadinessPanel.module.css";
import type { Project } from "@/features/project-core";

interface ProjectSetupReadinessPanelProps {
	project: Project;
	telemetry: ProjectWatchdogTelemetry;
	compact?: boolean;
	embedded?: boolean;
}

export function ProjectSetupReadinessPanel({
	project,
	telemetry,
	compact = false,
	embedded = false,
}: ProjectSetupReadinessPanelProps) {
	const {
		state,
		cards,
		overallState,
		acadeProjectFile,
		acadeSupportStatus,
		canOpenAcadeProject,
		isOpeningAcadeProject,
		openAcadeActionLabel,
		setupFlowSummary,
		visibleNotices,
		openAcadeProject,
	} = useProjectSetupReadinessState(project, telemetry);

	return (
		<section className={cn(styles.root, compact && styles.compactRoot)}>
			{embedded ? (
				<div className={styles.embeddedHeader}>
					<div className={styles.embeddedHeaderCopy}>
						<p className={styles.embeddedEyebrow}>Setup checklist</p>
						<h4 className={styles.embeddedTitle}>Project setup</h4>
					</div>
					<TrustStateBadge state={overallState} size="sm" />
				</div>
			) : (
				<div className={cn(styles.header, compact && styles.compactHeader)}>
					<div className={cn(styles.headerCopy, compact && styles.compactHeaderCopy)}>
						<p className={styles.eyebrow}>Setup details</p>
						<h4 className={styles.title}>
							{compact ? "Setup checklist" : "Project setup"}
						</h4>
						<p className={cn(styles.description, compact && styles.compactDescription)}>
							{compact
								? "Tracking roots, title block defaults, and revision history for this project workflow."
								: "Tracking roots, title block defaults, and revision history that feed review and package work."}
						</p>
					</div>
					<TrustStateBadge state={overallState} />
				</div>
			)}

			<div className={styles.cardGrid}>
				{cards.map((card) => (
					<article
						key={card.id}
						className={cn(
							styles.statusRow,
							card.state === "ready" && styles.statusRowReady,
							card.state === "needs-attention" && styles.statusRowNeedsAttention,
							card.state === "background" && styles.statusRowBackground,
						)}
					>
						<div className={styles.cardIconShell}>
							{card.id === "tracking" ? (
								<FolderTree className={styles.cardIcon} aria-hidden="true" />
							) : card.id === "defaults" ? (
								<ClipboardList className={styles.cardIcon} aria-hidden="true" />
							) : (
								<FileCheck2 className={styles.cardIcon} aria-hidden="true" />
							)}
						</div>
						<div className={styles.statusCopy}>
							<p className={styles.cardEyebrow}>{card.title}</p>
							<h5 className={styles.cardTitle}>{card.summary}</h5>
							<p className={styles.cardDetail}>{card.detail}</p>
						</div>
						<div className={styles.statusAside}>
							<TrustStateBadge state={card.state} size="sm" />
						</div>
					</article>
				))}
			</div>

			<div className={styles.supportPanel}>
				<div className={styles.supportHeader}>
					<div className={styles.supportHeaderCopy}>
						<p className={styles.supportEyebrow}>ACADE setup</p>
						<h5 className={styles.supportTitle}>ACADE project setup</h5>
						<p className={styles.supportDescription}>
							Suite uses the project root and project defaults to derive the
							ACADE support files. Drawing titles stay drawing-specific and
							come from the title block scan or workbook rows.
						</p>
					</div>
				</div>

				<div className={styles.supportGrid}>
					<div className={styles.supportCard}>
						<div className={styles.supportCardHeader}>
							<p className={styles.supportCardEyebrow}>Defaults and mapping</p>
							<p className={styles.supportCardCopy}>
								Project defaults that feed the support files.
							</p>
						</div>
						<dl className={styles.definitionList}>
							<div>
								<dt>Block name</dt>
								<dd>
									{state.profile?.block_name ||
										DEFAULT_PROJECT_SETUP_TITLE_BLOCK_NAME}
								</dd>
							</div>
							<div>
								<dt>Client / Utility</dt>
								<dd>{state.profile?.acade_line1 || "Not set"}</dd>
							</div>
							<div>
								<dt>Facility / Site</dt>
								<dd>{state.profile?.acade_line2 || "Not set"}</dd>
							</div>
							<div>
								<dt>Project number</dt>
								<dd>{state.profile?.acade_line4 || "Not set"}</dd>
							</div>
							<div>
								<dt>Drawing title</dt>
								<dd>Comes from each drawing row and TITLE3 / DWGDESC.</dd>
							</div>
						</dl>
					</div>

					<div className={styles.supportCard}>
						<div className={styles.supportCardHeader}>
							<p className={styles.supportCardEyebrow}>Support files</p>
							<p className={styles.supportCardCopy}>
								Current project definition and companion files.
							</p>
						</div>
						<div
							className={cn(
								styles.artifactStatus,
								acadeSupportStatus.tone === "existing" &&
									styles.artifactStatusExisting,
								acadeSupportStatus.tone === "starter" &&
									styles.artifactStatusStarter,
								acadeSupportStatus.tone === "pending" &&
									styles.artifactStatusPending,
							)}
						>
							<strong>{acadeSupportStatus.label}</strong>
							<p>{acadeSupportStatus.detail}</p>
						</div>
						<dl className={styles.definitionList}>
							<div>
								<dt>.wdp</dt>
								<dd>{acadeProjectFile.path}</dd>
							</div>
							<div>
								<dt>.wdt</dt>
								<dd>{state.artifacts?.wdtPath || "Will derive from the .wdp stem."}</dd>
							</div>
							<div>
								<dt>.wdl</dt>
								<dd>{state.artifacts?.wdlPath || "Will derive from the .wdp stem."}</dd>
							</div>
						</dl>
						<p className={styles.supportDetail}>{acadeProjectFile.state}</p>
						<div className={styles.supportActions}>
							<button
								type="button"
								className={styles.supportActionButton}
								onClick={() => void openAcadeProject()}
								disabled={!canOpenAcadeProject || isOpeningAcadeProject}
							>
								{openAcadeActionLabel}
							</button>
						</div>
						<ul className={styles.artifactGuide}>
							<li>
								<strong>.wdp</strong> is the AutoCAD Electrical project
								definition and drawing list. Drawings themselves still open as
								{" "}
								<strong>.dwg</strong> files.
							</li>
							<li>
								<strong>.wdt</strong> maps title block attribute tags.
							</li>
							<li>
								<strong>.wdl</strong> stores the line labels ACADE uses for
								project defaults.
							</li>
						</ul>
					</div>

					<div className={styles.supportCard}>
						<div className={styles.supportCardHeader}>
							<p className={styles.supportCardEyebrow}>Setup flow</p>
							<p className={styles.supportCardCopy}>
								Recommended order before issue sets and transmittals.
							</p>
						</div>
						<p className={styles.supportDetail}>{setupFlowSummary}</p>
						<ul className={styles.artifactGuide}>
							<li>Set the DWG root, PDF package root, and signer defaults first.</li>
							<li>
								{state.artifacts?.wdpState === "existing" ? (
									<>
										Review the existing <strong>.wdp</strong>, <strong>.wdt</strong>,
										and <strong>.wdl</strong> alignment before you rely on
										ACADE report checks.
									</>
								) : (
									<>
										Review the derived <strong>.wdp</strong>, <strong>.wdt</strong>,
										and <strong>.wdl</strong> before you rely on ACADE report
										checks.
									</>
								)}
							</li>
							<li>Run title block scan to capture the live drawing truth.</li>
							<li>
								Import an ACADE report only as verification, then clear the
								review lane before issue sets and transmittals.
							</li>
						</ul>
					</div>
				</div>
			</div>

			{visibleNotices.length > 0 ? (
				<div className={styles.noticeList}>
					{visibleNotices.map((message) => (
						<p key={message} className={styles.notice}>
							{message}
						</p>
					))}
				</div>
			) : null}
		</section>
	);
}
