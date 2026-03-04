import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";
import {
	ARCHITECTURE_AUTOGEN,
	ARCHITECTURE_DEPENDENCIES,
	ARCHITECTURE_DOMAINS,
	ARCHITECTURE_FIX_CANDIDATES,
	ARCHITECTURE_FLOWS,
	ARCHITECTURE_MODULES_BY_DOMAIN,
} from "@/data/architectureModel";
import { hexToRgba, useTheme } from "@/lib/palette";

export default function ArchitectureMapRoutePage() {
	const { palette } = useTheme();
	const topHotspots = ARCHITECTURE_AUTOGEN.hotspots.slice(0, 12);
	const totalModules = ARCHITECTURE_MODULES_BY_DOMAIN.reduce(
		(acc, item) => acc + item.modules.length,
		0,
	);

	return (
		<PageFrame
			title="Architecture Map"
			subtitle={`Repo model: ${ARCHITECTURE_DOMAINS.length} domains, ${totalModules} modules, ${ARCHITECTURE_DEPENDENCIES.length} dependency links.`}
		>
			<FrameSection
				title="System Domains"
				subtitle="Major boundaries and where each part lives in the repo."
			>
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{ARCHITECTURE_DOMAINS.map((domain) => {
						const moduleCount =
							ARCHITECTURE_MODULES_BY_DOMAIN.find(
								(item) => item.domain.id === domain.id,
							)?.modules.length ?? 0;
						return (
							<div
								key={domain.id}
								className="rounded-xl border p-3"
								style={{
									borderColor: hexToRgba(palette.primary, 0.16),
									background: hexToRgba(palette.surfaceLight, 0.26),
								}}
							>
								<div className="text-sm font-semibold text-[var(--text)]">
									{domain.label}
								</div>
								<div
									className="mt-1 text-xs"
									style={{ color: "var(--text-muted)" }}
								>
									{domain.summary}
								</div>
								<div className="mt-2 text-xs text-[var(--text)]">
									{moduleCount} module{moduleCount === 1 ? "" : "s"}
								</div>
								<div className="mt-2 flex flex-wrap gap-1.5">
									{domain.repoRoots.map((root) => (
										<span
											key={root}
											className="rounded-md border px-2 py-1 font-mono text-[11px]"
											style={{
												borderColor: hexToRgba(palette.primary, 0.14),
												background: hexToRgba(palette.surface, 0.62),
												color: "var(--text-muted)",
											}}
										>
											{root}
										</span>
									))}
								</div>
							</div>
						);
					})}
				</div>
			</FrameSection>

			<FrameSection
				title="Repository Modules"
				subtitle="Concrete map of modules and responsibilities."
			>
				<div className="space-y-4">
					{ARCHITECTURE_MODULES_BY_DOMAIN.map(({ domain, modules }) => {
						const curated = modules.filter(
							(module) => !module.id.startsWith("auto-"),
						);
						const auto = modules.filter((module) =>
							module.id.startsWith("auto-"),
						);
						const visibleModules = [...curated, ...auto.slice(0, 12)];

						return (
							<div key={domain.id} className="rounded-xl border p-3">
								<div className="text-sm font-semibold text-[var(--text)]">
									{domain.label}
								</div>
								<div className="mt-1 text-xs text-[var(--text-muted)]">
									Showing {visibleModules.length} of {modules.length} module
									{modules.length === 1 ? "" : "s"}
								</div>
								<div className="mt-2 grid gap-2 md:grid-cols-2">
									{visibleModules.map((module) => (
										<div
											key={module.id}
											className="rounded-lg border p-2.5"
											style={{
												borderColor: hexToRgba(palette.primary, 0.12),
												background: hexToRgba(palette.surfaceLight, 0.22),
											}}
										>
											<div className="text-xs font-semibold text-[var(--text)]">
												{module.label}
											</div>
											<div
												className="mt-1 font-mono text-[11px]"
												style={{ color: "var(--text-muted)" }}
											>
												{module.path}
											</div>
											<div
												className="mt-1.5 text-xs"
												style={{ color: "var(--text-muted)" }}
											>
												{module.summary}
											</div>
											{module.id.startsWith("auto-") ? (
												<div
													className="mt-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
													style={{
														background: hexToRgba(palette.primary, 0.16),
														color: palette.primary,
													}}
												>
													Auto
												</div>
											) : null}
										</div>
									))}
								</div>
							</div>
						);
					})}
				</div>
			</FrameSection>

			<FrameSection
				title="Critical Flows"
				subtitle="Key end-to-end paths across frontend, backend, data, and agent systems."
			>
				<div className="space-y-3">
					{ARCHITECTURE_FLOWS.map((flow) => (
						<div
							key={flow.id}
							className="rounded-xl border p-3"
							style={{
								borderColor: hexToRgba(palette.primary, 0.16),
								background: hexToRgba(palette.surface, 0.5),
							}}
						>
							<div className="text-sm font-semibold text-[var(--text)]">
								{flow.title}
							</div>
							<div className="mt-2 flex flex-wrap items-center gap-1.5">
								{flow.steps.map((step, index) => (
									<div key={`${flow.id}-${step}`} className="contents">
										<span
											className="rounded-md border px-2 py-1 font-mono text-[11px]"
											style={{
												borderColor: hexToRgba(palette.primary, 0.14),
												background: hexToRgba(palette.background, 0.52),
												color: "var(--text-muted)",
											}}
										>
											{step}
										</span>
										{index < flow.steps.length - 1 ? (
											<span
												className="text-xs"
												style={{ color: "var(--text-muted)" }}
											>
												→
											</span>
										) : null}
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</FrameSection>

			<FrameSection
				title="Auto-Generated Snapshot"
				subtitle="Filesystem scan generated from the current repo state."
			>
				<div className="rounded-xl border p-3">
					<div className="text-xs text-[var(--text)]">
						Generated at:{" "}
						<span className="font-mono" style={{ color: "var(--text-muted)" }}>
							{ARCHITECTURE_AUTOGEN.generatedAt}
						</span>
					</div>
					<div className="mt-1 text-xs text-[var(--text)]">
						Backup routes present:{" "}
						<span
							style={{
								color: ARCHITECTURE_AUTOGEN.backupRoutes.routeImplemented
									? palette.primary
									: palette.tertiary,
							}}
						>
							{ARCHITECTURE_AUTOGEN.backupRoutes.routeImplemented
								? "yes"
								: "no"}
						</span>
					</div>
				</div>
				<div className="mt-3 rounded-xl border p-3">
					<div className="text-sm font-semibold text-[var(--text)]">
						Largest File Hotspots
					</div>
					<div className="mt-2 grid gap-1.5">
						{topHotspots.map((hotspot) => (
							<div
								key={hotspot.path}
								className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
								style={{
									borderColor: hexToRgba(palette.primary, 0.12),
									background: hexToRgba(palette.surface, 0.5),
								}}
							>
								<span
									className="font-mono text-[11px]"
									style={{ color: "var(--text-muted)" }}
								>
									{hotspot.path}
								</span>
								<span className="text-xs text-[var(--text)]">
									{hotspot.lines.toLocaleString()} lines
								</span>
							</div>
						))}
					</div>
				</div>
				<div className="mt-3 rounded-xl border p-3">
					<div className="text-sm font-semibold text-[var(--text)]">
						Batch Find/Replace Module
					</div>
					<div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
						{ARCHITECTURE_AUTOGEN.batchFindReplace.namingNote}
					</div>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{[
							ARCHITECTURE_AUTOGEN.batchFindReplace.moduleDir,
							ARCHITECTURE_AUTOGEN.batchFindReplace.routeFile,
						].map((pathValue) => (
							<span
								key={pathValue}
								className="rounded-md border px-2 py-1 font-mono text-[11px]"
								style={{
									borderColor: hexToRgba(palette.primary, 0.14),
									background: hexToRgba(palette.surface, 0.62),
									color: "var(--text-muted)",
								}}
							>
								{pathValue}
							</span>
						))}
					</div>
					<div className="mt-2 text-xs text-[var(--text)]">
						Frontend module files:{" "}
						{ARCHITECTURE_AUTOGEN.batchFindReplace.moduleFileCount} | Backend
						route refs:{" "}
						{ARCHITECTURE_AUTOGEN.batchFindReplace.backendRouteCount}
					</div>
				</div>
			</FrameSection>

			<FrameSection
				title="Refactor Checkpoints"
				subtitle="Likely issues to verify after your recent refactor."
			>
				<div className="space-y-2.5">
					{ARCHITECTURE_FIX_CANDIDATES.map((item) => (
						<div
							key={item.id}
							className="rounded-xl border p-3"
							style={{
								borderColor:
									item.priority === "high"
										? hexToRgba(palette.tertiary, 0.35)
										: hexToRgba(palette.primary, 0.18),
								background: hexToRgba(palette.surfaceLight, 0.24),
							}}
						>
							<div className="flex flex-wrap items-center gap-2">
								<span
									className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
									style={{
										background:
											item.priority === "high"
												? hexToRgba(palette.tertiary, 0.2)
												: hexToRgba(palette.primary, 0.2),
										color:
											item.priority === "high"
												? palette.tertiary
												: palette.primary,
									}}
								>
									{item.priority}
								</span>
								<div className="text-sm font-semibold text-[var(--text)]">
									{item.title}
								</div>
							</div>
							<div
								className="mt-1 text-xs"
								style={{ color: "var(--text-muted)" }}
							>
								{item.detail}
							</div>
							<div className="mt-2 flex flex-wrap gap-1.5">
								{item.paths.map((path) => (
									<span
										key={path}
										className="rounded-md border px-2 py-1 font-mono text-[11px]"
										style={{
											borderColor: hexToRgba(palette.primary, 0.14),
											background: hexToRgba(palette.surface, 0.62),
											color: "var(--text-muted)",
										}}
									>
										{path}
									</span>
								))}
							</div>
						</div>
					))}
				</div>
			</FrameSection>
		</PageFrame>
	);
}
