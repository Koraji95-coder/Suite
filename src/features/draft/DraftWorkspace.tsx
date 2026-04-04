import { ArrowUpRight, FolderKanban, Replace, SquareLibrary, Wrench } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { PageContextBand } from "@/components/system/PageContextBand";
import { Section } from "@/components/system/PageFrame";
import { Badge } from "@/components/system/base/Badge";
import { Panel } from "@/components/system/base/Panel";
import { Text } from "@/components/system/base/Text";
import { isDevAudience } from "@/lib/audience";
import styles from "./DraftWorkspace.module.css";

type ReleasedTool = {
	id: string;
	title: string;
	summary: string;
	to: string;
	icon: typeof Replace;
	signals: string[];
};

const RELEASED_TOOLS: readonly ReleasedTool[] = [
	{
		id: "drawing-list-manager",
		title: "Drawing List Manager",
		summary:
			"Scan title blocks, preview ACADE mapping, and export project drawing indexes.",
		to: "/app/draft/drawing-list-manager",
		icon: Replace,
		signals: [
			"Released for issued-set preparation and drawing register work.",
			"Project-aware entry into release context without opening labs.",
		],
	},
	{
		id: "block-library",
		title: "Block Library",
		summary: "Central catalog for reusable engineering block assets.",
		to: "/app/draft/block-library",
		icon: SquareLibrary,
		signals: [
			"Released asset lane for repeatable drafting content.",
			"Stays separate from unfinished automation and lab tools.",
		],
	},
];

const LAB_TOOLS = [
	"Automation Studio",
	"AutoDraft Studio",
	"AutoWire",
	"Ground Grid Generation",
	"Batch Find & Replace",
] as const;

export function DraftWorkspace() {
	const { user } = useAuth();
	const showDeveloperLabs = isDevAudience(user);
	const releasedCount = RELEASED_TOOLS.length;
	const laneSignals = useMemo(
		() => [
			`${releasedCount} released drafting surface${releasedCount === 1 ? "" : "s"}`,
			"Release and transmittal context stays inside Projects",
			"Labs stay behind Developer until they pass the readiness gate",
		],
		[releasedCount],
	);

	return (
		<div className={styles.root}>
			<PageContextBand
				mode="hero"
				className={styles.hero}
				eyebrow="Draft"
				summary={
					<Text size="sm" color="muted" block className={styles.heroSummary}>
						Draft is the released customer lane for drawing indexes, reusable
						assets, and other customer-ready drafting support. It is not the
						place for unfinished automation labs.
					</Text>
				}
				meta={
					<div className={styles.heroMeta}>
						<Badge color="accent" variant="soft" size="sm">
							Released customer lane
						</Badge>
						<Badge color="default" variant="outline" size="sm">
							{releasedCount} active tool{releasedCount === 1 ? "" : "s"}
						</Badge>
					</div>
				}
				actions={
					<div className={styles.heroActions}>
						<Link to="/app/draft/drawing-list-manager" className={styles.primaryLink}>
							<span>Open Drawing List Manager</span>
							<ArrowUpRight size={14} />
						</Link>
						<Link to="/app/projects" className={styles.secondaryLink}>
							<span>Open Projects</span>
						</Link>
					</div>
				}
			>
				<div className={styles.signalStrip}>
					{laneSignals.map((signal) => (
						<div key={signal} className={styles.signalCard}>
							<span>{signal}</span>
						</div>
					))}
				</div>
			</PageContextBand>

			<Section
				title="Released drafting surfaces"
				description="Customer-ready drafting tools stay explicit here instead of hiding under a generic Apps launcher."
			>
				<div className={styles.toolGrid}>
					{RELEASED_TOOLS.map((tool) => {
						const ToolIcon = tool.icon;
						return (
							<Panel key={tool.id} variant="feature" padding="lg" className={styles.toolCard}>
								<div className={styles.toolHeader}>
									<div className={styles.toolIdentity}>
										<div className={styles.iconShell}>
											<ToolIcon size={17} />
										</div>
										<div>
											<span className={styles.toolEyebrow}>Released</span>
											<h3 className={styles.toolTitle}>{tool.title}</h3>
										</div>
									</div>
									<Badge color="accent" variant="soft" size="sm">
										Customer ready
									</Badge>
								</div>
								<p className={styles.toolSummary}>{tool.summary}</p>
								<ul className={styles.signalList}>
									{tool.signals.map((signal) => (
										<li key={signal}>{signal}</li>
									))}
								</ul>
								<Link to={tool.to} className={styles.toolAction}>
									<span>Open {tool.title}</span>
									<ArrowUpRight size={14} />
								</Link>
							</Panel>
						);
					})}
				</div>
			</Section>

			<Section
				title="Project handoff"
				description="Projects remains the notebook for notes, meetings, stage status, and release context."
			>
				<div className={styles.supportGrid}>
					<Panel variant="support" padding="lg" className={styles.supportCard}>
						<div className={styles.supportHeader}>
							<div className={styles.iconShell}>
								<FolderKanban size={17} />
							</div>
							<div>
								<span className={styles.toolEyebrow}>Projects</span>
								<h3 className={styles.toolTitle}>Release context stays project-aware</h3>
							</div>
						</div>
						<p className={styles.toolSummary}>
							Use Draft to prepare drawing content. Use Projects to keep notes,
							calendar work, linked files, stage status, and transmittal context
							tied to the project record.
						</p>
						<Link to="/app/projects" className={styles.toolAction}>
							<span>Open Projects</span>
							<ArrowUpRight size={14} />
						</Link>
					</Panel>
					<Panel variant="support" padding="lg" className={styles.supportCard}>
						<div className={styles.supportHeader}>
							<div className={styles.iconShell}>
								<Wrench size={17} />
							</div>
							<div>
								<span className={styles.toolEyebrow}>Promotion gate</span>
								<h3 className={styles.toolTitle}>Labs stay behind Developer</h3>
							</div>
						</div>
						<p className={styles.toolSummary}>
							Automation products do not graduate into Draft until the workflow
							works, the copy is clean, the happy path is stable, and you sign
							off on promotion.
						</p>
						{showDeveloperLabs ? (
							<div className={styles.labPreviewList}>
								{LAB_TOOLS.map((tool) => (
									<Badge key={tool} color="default" variant="outline" size="sm">
										{tool}
									</Badge>
								))}
							</div>
						) : null}
					</Panel>
				</div>
			</Section>
		</div>
	);
}
