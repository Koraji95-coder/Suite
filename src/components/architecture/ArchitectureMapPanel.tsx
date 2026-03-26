import { Check, Copy, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Section } from "@/components/apps/ui/PageFrame";
import {
	ARCHITECTURE_AUTOGEN,
	ARCHITECTURE_DEPENDENCIES,
	ARCHITECTURE_DOMAINS,
	ARCHITECTURE_FIX_CANDIDATES,
	ARCHITECTURE_FLOWS,
	ARCHITECTURE_MODULES_BY_DOMAIN,
	type ArchitectureDomainId,
	type ArchitectureFlow,
} from "@/data/architectureModel";
import { cn } from "@/lib/utils";
import styles from "@/routes/architecture/ArchitectureMapRoutePage.module.css";

type DomainFilter = "all" | ArchitectureDomainId;

function normalizeText(value: string): string {
	return value.trim().toLowerCase();
}

function matchesQuery(query: string, values: Array<string | undefined>): boolean {
	if (!query) return true;
	return values.some((value) =>
		String(value || "")
			.toLowerCase()
			.includes(query),
	);
}

function includesDomainPath(pathValue: string, domainId: DomainFilter): boolean {
	if (domainId === "all") return true;
	const domain = ARCHITECTURE_DOMAINS.find((item) => item.id === domainId);
	if (!domain) return true;
	const lowerPath = pathValue.toLowerCase().replace(/\\/g, "/");
	return domain.repoRoots.some((root) =>
		lowerPath.includes(root.replace(/\\/g, "/").toLowerCase()),
	);
}

function flowMatchesDomain(flow: ArchitectureFlow, domainId: DomainFilter): boolean {
	if (domainId === "all") return true;
	const domain = ARCHITECTURE_DOMAINS.find((item) => item.id === domainId);
	if (!domain) return true;
	const haystack = `${flow.title} ${flow.steps.join(" ")}`.toLowerCase();
	const tokens = [domain.label, domain.id, ...domain.repoRoots].map((value) =>
		value.toLowerCase(),
	);
	return tokens.some((token) => haystack.includes(token));
}

export function ArchitectureMapPanel() {
	const [searchValue, setSearchValue] = useState("");
	const [selectedDomain, setSelectedDomain] = useState<DomainFilter>("all");
	const [copiedPath, setCopiedPath] = useState<string | null>(null);

	const query = useMemo(() => normalizeText(searchValue), [searchValue]);
	const totalModules = ARCHITECTURE_MODULES_BY_DOMAIN.reduce(
		(acc, item) => acc + item.modules.length,
		0,
	);

	const copyPathValue = async (pathValue: string) => {
		try {
			await navigator.clipboard.writeText(pathValue);
			setCopiedPath(pathValue);
			window.setTimeout(() => {
				setCopiedPath((current) => (current === pathValue ? null : current));
			}, 1100);
		} catch {
			// Clipboard APIs can fail in restricted environments.
		}
	};

	const filteredDomains = useMemo(
		() =>
			ARCHITECTURE_DOMAINS.filter(
				(domain) => selectedDomain === "all" || domain.id === selectedDomain,
			).filter((domain) =>
				matchesQuery(query, [domain.label, domain.summary, ...domain.repoRoots]),
			),
		[query, selectedDomain],
	);

	const filteredModuleGroups = useMemo(
		() =>
			ARCHITECTURE_MODULES_BY_DOMAIN.filter(
				({ domain }) => selectedDomain === "all" || domain.id === selectedDomain,
			)
				.map(({ domain, modules }) => {
					const curated = modules.filter((module) => !module.id.startsWith("auto-"));
					const auto = modules.filter((module) => module.id.startsWith("auto-"));
					const baseModules = query ? modules : [...curated, ...auto.slice(0, 12)];
					const visibleModules = baseModules.filter((module) =>
						matchesQuery(query, [
							domain.label,
							domain.summary,
							module.label,
							module.path,
							module.summary,
						]),
					);
					return {
						domain,
						modules,
						visibleModules,
					};
				})
				.filter((item) => item.visibleModules.length > 0 || !query),
		[query, selectedDomain],
	);

	const filteredFlows = useMemo(
		() =>
			ARCHITECTURE_FLOWS.filter((flow) =>
				flowMatchesDomain(flow, selectedDomain),
			).filter((flow) => matchesQuery(query, [flow.title, ...flow.steps])),
		[query, selectedDomain],
	);

	const filteredHotspots = useMemo(
		() =>
			ARCHITECTURE_AUTOGEN.hotspots
				.filter((hotspot) => includesDomainPath(hotspot.path, selectedDomain))
				.filter((hotspot) => matchesQuery(query, [hotspot.path]))
				.slice(0, 12),
		[query, selectedDomain],
	);

	const filteredFixCandidates = useMemo(
		() =>
			ARCHITECTURE_FIX_CANDIDATES.filter((item) => {
				if (selectedDomain === "all") return true;
				return item.paths.some((pathValue) =>
					includesDomainPath(pathValue, selectedDomain),
				);
			}).filter((item) =>
				matchesQuery(query, [item.title, item.detail, ...item.paths]),
			),
		[query, selectedDomain],
	);

	const batchPaths = useMemo(
		() =>
			[
				ARCHITECTURE_AUTOGEN.batchFindReplace.moduleDir,
				ARCHITECTURE_AUTOGEN.batchFindReplace.routeFile,
			]
				.filter((pathValue) => includesDomainPath(pathValue, selectedDomain))
				.filter((pathValue) => matchesQuery(query, [pathValue])),
		[query, selectedDomain],
	);

	return (
		<div className={styles.root}>
			<div className={styles.archToolbar}>
				<label className={styles.archSearchWrap}>
					<Search size={13} />
					<input
						type="search"
						value={searchValue}
						onChange={(event) => setSearchValue(event.target.value)}
						placeholder="Search domains, modules, flows, and paths..."
						className={styles.archSearchInput}
					name="architecturemappanel_input_160"
					/>
				</label>
				<div className={styles.archDomainFilters}>
					<button
						type="button"
						className={cn(
							styles.archDomainChip,
							selectedDomain === "all" && styles.archDomainChipActive,
						)}
						onClick={() => setSelectedDomain("all")}
					>
						All
					</button>
					{ARCHITECTURE_DOMAINS.map((domain) => (
						<button
							key={domain.id}
							type="button"
							className={cn(
								styles.archDomainChip,
								selectedDomain === domain.id && styles.archDomainChipActive,
							)}
							onClick={() => setSelectedDomain(domain.id)}
						>
							{domain.label}
						</button>
					))}
				</div>
			</div>

			<Section
				title="System Domains"
				description="Major boundaries and where each part lives in the repo."
			>
				<div className={styles.domainsGrid}>
					{filteredDomains.length === 0 && (
						<div className={styles.emptyState}>No matching domains.</div>
					)}
					{filteredDomains.map((domain) => {
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
										<button
											key={root}
											type="button"
											className={styles.copyChip}
											onClick={() => void copyPathValue(root)}
										>
											<span className={styles.copyChipValue}>{root}</span>
											<span className={styles.copyChipState}>
												{copiedPath === root ? "Copied" : "Copy"}
											</span>
										</button>
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
					{filteredModuleGroups.length === 0 && (
						<div className={styles.emptyState}>No matching modules.</div>
					)}
					{filteredModuleGroups.map(({ domain, modules, visibleModules }) => (
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
										<div className={styles.modulePathRow}>
											<div className={styles.modulePath}>{module.path}</div>
											<button
												type="button"
												className={styles.pathCopyButton}
												onClick={() => void copyPathValue(module.path)}
												aria-label={`Copy ${module.path}`}
											>
												{copiedPath === module.path ? (
													<Check size={11} />
												) : (
													<Copy size={11} />
												)}
											</button>
										</div>
										<div className={styles.moduleSummary}>{module.summary}</div>
										{module.id.startsWith("auto-") && (
											<div className={styles.autoBadge}>Auto</div>
										)}
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</Section>

			<Section
				title="Critical Flows"
				description="Key end-to-end paths across frontend, backend, data, and agent systems."
			>
				<div className={styles.flowList}>
					{filteredFlows.length === 0 && (
						<div className={styles.emptyState}>No matching flows.</div>
					)}
					{filteredFlows.map((flow) => (
						<div key={flow.id} className={styles.flowCard}>
							<h3 className={styles.title}>{flow.title}</h3>
							<div className={styles.flowSteps}>
								{flow.steps.map((step, index) => (
									<div key={`${flow.id}-${step}`} className={styles.flowStep}>
										<button
											type="button"
											className={styles.copyChip}
											onClick={() => void copyPathValue(step)}
										>
											<span className={styles.copyChipValue}>{step}</span>
											<span className={styles.copyChipState}>
												{copiedPath === step ? "Copied" : "Copy"}
											</span>
										</button>
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
				description={`Filesystem scan generated from the current repo state (${ARCHITECTURE_DOMAINS.length} domains, ${totalModules} modules, ${ARCHITECTURE_DEPENDENCIES.length} dependency links).`}
			>
				<div className={styles.snapshotCard}>
					<div className={styles.smallText}>
						Generated at:{" "}
						<span className={styles.mono}>{ARCHITECTURE_AUTOGEN.generatedAt}</span>
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
							{ARCHITECTURE_AUTOGEN.backupRoutes.routeImplemented ? "yes" : "no"}
						</span>
					</div>
				</div>

				<div className={styles.snapshotSubCard}>
					<h3 className={styles.title}>Largest File Hotspots</h3>
					<div className={styles.hotspots}>
						{filteredHotspots.length === 0 && (
							<div className={styles.emptyState}>No matching hotspots.</div>
						)}
						{filteredHotspots.map((hotspot) => (
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
						{batchPaths.length === 0 && (
							<div className={styles.emptyState}>No matching paths.</div>
						)}
						{batchPaths.map((pathValue) => (
							<button
								key={pathValue}
								type="button"
								className={styles.copyChip}
								onClick={() => void copyPathValue(pathValue)}
							>
								<span className={styles.copyChipValue}>{pathValue}</span>
								<span className={styles.copyChipState}>
									{copiedPath === pathValue ? "Copied" : "Copy"}
								</span>
							</button>
						))}
					</div>
					<div className={styles.smallText}>
						Frontend module files:{" "}
						{ARCHITECTURE_AUTOGEN.batchFindReplace.moduleFileCount} | Backend
						route refs: {ARCHITECTURE_AUTOGEN.batchFindReplace.backendRouteCount}
					</div>
				</div>
			</Section>

			<Section
				title="Refactor Checkpoints"
				description="Curated watchlist to validate alongside the generated architecture snapshot."
			>
				<div className={styles.checkpoints}>
					{filteredFixCandidates.length === 0 && (
						<div className={styles.emptyState}>No matching checkpoints.</div>
					)}
					{filteredFixCandidates.map((item) => (
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
								{item.paths.map((pathValue) => (
									<button
										key={pathValue}
										type="button"
										className={styles.copyChip}
										onClick={() => void copyPathValue(pathValue)}
									>
										<span className={styles.copyChipValue}>{pathValue}</span>
										<span className={styles.copyChipState}>
											{copiedPath === pathValue ? "Copied" : "Copy"}
										</span>
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			</Section>
		</div>
	);
}
