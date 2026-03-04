import { PageFrame, Section } from "@/components/apps/ui/PageFrame";
import {
	ARCHITECTURE_AUTOGEN,
	ARCHITECTURE_DEPENDENCIES,
	ARCHITECTURE_DOMAINS,
	ARCHITECTURE_FIX_CANDIDATES,
	ARCHITECTURE_FLOWS,
	ARCHITECTURE_MODULES_BY_DOMAIN,
} from "@/data/architectureModel";
import { cn } from "@/lib/utils";
import styles from "./ArchitectureMapRoutePage.module.css";

export default function ArchitectureMapRoutePage() {
	const topHotspots = ARCHITECTURE_AUTOGEN.hotspots.slice(0, 12);
	const totalModules = ARCHITECTURE_MODULES_BY_DOMAIN.reduce(
		(acc, item) => acc + item.modules.length,
		0,
	);

	return (
		<PageFrame
			title="Architecture Map"
			description={`Repo model: ${ARCHITECTURE_DOMAINS.length} domains, ${totalModules} modules, ${ARCHITECTURE_DEPENDENCIES.length} dependency links.`}
		>
			<div className={styles.root}>
				<Section
					title="System Domains"
					description="Major boundaries and where each part lives in the repo."
				>
					<div className={styles.domainsGrid}>
						{ARCHITECTURE_DOMAINS.map((domain) => {
							const moduleCount =
								ARCHITECTURE_MODULES_BY_DOMAIN.find(
									(item) => item.domain.id === domain.id,
								)?.modules.length ?? 0;
							return (
								<div key={domain.id} className={styles.domainCard}>
									<h3 className={styles.title}>{domain.label}</h3>
									<div className={styles.mutedText}>{domain.summary}</div>
									<div className={styles.smallText}>
										{moduleCount} module{moduleCount === 1 ? "" : "s"}
									</div>
									<div className={styles.chipRow}>
										{domain.repoRoots.map((root) => (
											<span key={root} className={styles.chip}>
												{root}
											</span>
										))}
									</div>
								</div>
							);
						})}
					</div>
				</Section>

				<Section
					title="Repository Modules"
					description="Concrete map of modules and responsibilities."
				>
					<div className={styles.modulesStack}>
						{ARCHITECTURE_MODULES_BY_DOMAIN.map(({ domain, modules }) => {
							const curated = modules.filter(
								(module) => !module.id.startsWith("auto-"),
							);
							const auto = modules.filter((module) =>
								module.id.startsWith("auto-"),
							);
							const visibleModules = [...curated, ...auto.slice(0, 12)];

							return (
								<div key={domain.id} className={styles.moduleGroupCard}>
									<h3 className={styles.title}>{domain.label}</h3>
									<div className={styles.mutedText}>
										Showing {visibleModules.length} of {modules.length} module
										{modules.length === 1 ? "" : "s"}
									</div>
									<div className={styles.moduleGrid}>
										{visibleModules.map((module) => (
											<div key={module.id} className={styles.moduleCard}>
												<h4 className={styles.moduleName}>{module.label}</h4>
												<div className={styles.modulePath}>{module.path}</div>
												<div className={styles.moduleSummary}>
													{module.summary}
												</div>
												{module.id.startsWith("auto-") && (
													<div className={styles.autoBadge}>Auto</div>
												)}
											</div>
										))}
									</div>
								</div>
							);
						})}
					</div>
				</Section>

				<Section
					title="Critical Flows"
					description="Key end-to-end paths across frontend, backend, data, and agent systems."
				>
					<div className={styles.flowList}>
						{ARCHITECTURE_FLOWS.map((flow) => (
							<div key={flow.id} className={styles.flowCard}>
								<h3 className={styles.title}>{flow.title}</h3>
								<div className={styles.flowSteps}>
									{flow.steps.map((step, index) => (
										<div key={`${flow.id}-${step}`} className={styles.flowStep}>
											<span className={styles.chip}>{step}</span>
											{index < flow.steps.length - 1 && (
												<span className={styles.arrow}>→</span>
											)}
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</Section>

				<Section
					title="Auto-Generated Snapshot"
					description="Filesystem scan generated from the current repo state."
				>
					<div className={styles.snapshotCard}>
						<div className={styles.smallText}>
							Generated at:{" "}
							<span className={styles.mono}>
								{ARCHITECTURE_AUTOGEN.generatedAt}
							</span>
						</div>
						<div className={styles.smallText}>
							Backup routes present:{" "}
							<span
								className={
									ARCHITECTURE_AUTOGEN.backupRoutes.routeImplemented
										? styles.statusYes
										: styles.statusNo
								}
							>
								{ARCHITECTURE_AUTOGEN.backupRoutes.routeImplemented
									? "yes"
									: "no"}
							</span>
						</div>
					</div>

					<div className={styles.snapshotSubCard}>
						<h3 className={styles.title}>Largest File Hotspots</h3>
						<div className={styles.hotspots}>
							{topHotspots.map((hotspot) => (
								<div key={hotspot.path} className={styles.hotspotRow}>
									<span className={styles.hotspotPath}>{hotspot.path}</span>
									<span className={styles.hotspotLines}>
										{hotspot.lines.toLocaleString()} lines
									</span>
								</div>
							))}
						</div>
					</div>

					<div className={styles.snapshotSubCard}>
						<h3 className={styles.title}>Batch Find/Replace Module</h3>
						<div className={styles.mutedText}>
							{ARCHITECTURE_AUTOGEN.batchFindReplace.namingNote}
						</div>
						<div className={styles.chipRow}>
							{[
								ARCHITECTURE_AUTOGEN.batchFindReplace.moduleDir,
								ARCHITECTURE_AUTOGEN.batchFindReplace.routeFile,
							].map((pathValue) => (
								<span key={pathValue} className={styles.chip}>
									{pathValue}
								</span>
							))}
						</div>
						<div className={styles.smallText}>
							Frontend module files:{" "}
							{ARCHITECTURE_AUTOGEN.batchFindReplace.moduleFileCount} | Backend
							route refs:{" "}
							{ARCHITECTURE_AUTOGEN.batchFindReplace.backendRouteCount}
						</div>
					</div>
				</Section>

				<Section
					title="Refactor Checkpoints"
					description="Likely issues to verify after your recent refactor."
				>
					<div className={styles.checkpoints}>
						{ARCHITECTURE_FIX_CANDIDATES.map((item) => (
							<div
								key={item.id}
								className={cn(
									styles.checkpointCard,
									item.priority === "high" && styles.checkpointHigh,
								)}
							>
								<div className={styles.checkpointHeader}>
									<span
										className={cn(
											styles.checkpointBadge,
											item.priority === "high"
												? styles.badgeHigh
												: styles.badgeDefault,
										)}
									>
										{item.priority}
									</span>
									<h3 className={styles.title}>{item.title}</h3>
								</div>
								<div className={styles.mutedText}>{item.detail}</div>
								<div className={styles.chipRow}>
									{item.paths.map((path) => (
										<span key={path} className={styles.chip}>
											{path}
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				</Section>
			</div>
		</PageFrame>
	);
}
