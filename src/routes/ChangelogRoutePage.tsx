import { ArrowUpRight, ClipboardCopy, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Panel } from "@/components/primitives/Panel";
import { Text } from "@/components/primitives/Text";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import { safeSupabaseQuery } from "@/supabase/utils";
import {
	buildWorktalePublishPayload,
	type WorkLedgerFilters,
	type WorkLedgerInput,
	type WorkLedgerPublishState,
	type WorkLedgerRow,
	workLedgerService,
} from "@/services/workLedgerService";
import styles from "./ChangelogRoutePage.module.css";

interface ProjectOption {
	id: string;
	name: string;
}

const PUBLISH_STATE_OPTIONS: Array<WorkLedgerPublishState | "all"> = [
	"all",
	"draft",
	"ready",
	"published",
];

function stateTone(state: string): "primary" | "accent" | "success" {
	switch (state) {
		case "published":
			return "success";
		case "ready":
			return "accent";
		default:
			return "primary";
	}
}

function formatTimestamp(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

function toCsvValue(values: string[]) {
	return values.join(", ");
}

export default function ChangelogRoutePage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const [entries, setEntries] = useState<WorkLedgerRow[]>([]);
	const [projects, setProjects] = useState<ProjectOption[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [form, setForm] = useState<WorkLedgerInput>({
		title: "",
		summary: "",
		sourceKind: "manual",
		commitRefs: [],
		projectId: null,
		appArea: "",
		architecturePaths: [],
		hotspotIds: [],
		publishState: "draft",
		externalReference: "",
		externalUrl: "",
	});

	const filters = useMemo<WorkLedgerFilters>(
		() => ({
			projectId: searchParams.get("project"),
			pathQuery:
				searchParams.get("path") ||
				searchParams.get("hotspot") ||
				undefined,
			search: searchParams.get("query") || "",
			publishState:
				(searchParams.get("publishState") as WorkLedgerPublishState | "all" | null) ||
				"all",
			limit: 40,
		}),
		[searchParams],
	);

	const loadEntries = useCallback(async () => {
		setLoading(true);
		setError(null);
		const [entriesResult, projectsResult] = await Promise.all([
			workLedgerService.fetchEntries(filters),
			safeSupabaseQuery(
				async () =>
					await supabase
						.from("projects")
						.select("id, name")
						.order("updated_at", { ascending: false }),
				"ChangelogRoutePage",
			),
		]);

		setEntries(entriesResult.data);
		setProjects(((projectsResult.data as ProjectOption[] | null) ?? []).slice(0, 100));
		setError(entriesResult.error ? String(entriesResult.error.message || "Unable to load work ledger.") : null);
		setLoading(false);
	}, [filters]);

	useEffect(() => {
		void loadEntries();
	}, [loadEntries]);

	useEffect(() => {
		return workLedgerService.subscribe((entry) => {
			setEntries((prev) => {
				const next = [entry, ...prev.filter((item) => item.id !== entry.id)];
				return next.slice(0, 40);
			});
		});
	}, []);

	const projectMap = useMemo(
		() => new Map(projects.map((project) => [project.id, project.name])),
		[projects],
	);

	const counts = useMemo(
		() => ({
			total: entries.length,
			draft: entries.filter((entry) => entry.publish_state === "draft").length,
			ready: entries.filter((entry) => entry.publish_state === "ready").length,
			published: entries.filter((entry) => entry.publish_state === "published").length,
		}),
		[entries],
	);

	const updateSearchParam = (key: string, value: string | null) => {
		const next = new URLSearchParams(searchParams);
		if (!value || value === "all") {
			next.delete(key);
		} else {
			next.set(key, value);
		}
		setSearchParams(next, { replace: true });
	};

	const copyPublishPayload = async (entry: WorkLedgerRow) => {
		try {
			await navigator.clipboard.writeText(
				buildWorktalePublishPayload(entry).markdown,
			);
		} catch (copyError) {
			logger.warn("ChangelogRoutePage", "Unable to copy publish payload", {
				copyError,
			});
		}
	};

	const handleCreate = async () => {
		if (!form.title?.trim() || !form.summary?.trim()) return;
		setSaving(true);
		const created = await workLedgerService.createEntry({
			...form,
			commitRefs: form.commitRefs ?? [],
			architecturePaths: form.architecturePaths ?? [],
			hotspotIds: form.hotspotIds ?? [],
		});
		if (created) {
			setForm({
				title: "",
				summary: "",
				sourceKind: "manual",
				commitRefs: [],
				projectId: form.projectId ?? null,
				appArea: form.appArea ?? "",
				architecturePaths: form.architecturePaths ?? [],
				hotspotIds: form.hotspotIds ?? [],
				publishState: "draft",
				externalReference: "",
				externalUrl: "",
			});
			await loadEntries();
		}
		setSaving(false);
	};

	const updateEntryState = async (
		entry: WorkLedgerRow,
		publishState: WorkLedgerPublishState,
	) => {
		await workLedgerService.updateEntry(entry.id, { publishState });
		await loadEntries();
	};

	return (
		<PageFrame
			title="Changelog"
			description="Canonical internal work ledger with architecture-linked history and outbound Worktale-ready publish payloads."
			maxWidth="full"
		>
			<div className={styles.root}>
				<Panel variant="default" padding="lg" className={styles.formPanel}>
					<div className={styles.panelHeader}>
						<div>
							<Text size="sm" weight="semibold">
								Log Work
							</Text>
							<Text size="xs" color="muted">
								Create a ledger entry that stays canonical in Suite and can be
								published outward later.
							</Text>
						</div>
						<Button
							variant="ghost"
							size="sm"
							iconRight={<RefreshCw size={14} />}
							onClick={() => void loadEntries()}
						>
							Refresh
						</Button>
					</div>

					<div className={styles.formGrid}>
						<label className={styles.field}>
							<span className={styles.label}>Title</span>
							<Input
								value={form.title ?? ""}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, title: event.target.value }))
								}
								placeholder="Conduit controller split checkpoint"
							/>
						</label>

						<label className={styles.field}>
							<span className={styles.label}>App area</span>
							<Input
								value={String(form.appArea || "")}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, appArea: event.target.value }))
								}
								placeholder="conduit-route"
							/>
						</label>

						<label className={styles.field}>
							<span className={styles.label}>Project</span>
							<select
								className={styles.select}
								value={form.projectId ?? ""}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										projectId: event.target.value || null,
									}))
								}
							>
								<option value="">Workspace</option>
								{projects.map((project) => (
									<option key={project.id} value={project.id}>
										{project.name}
									</option>
								))}
							</select>
						</label>

						<label className={styles.field}>
							<span className={styles.label}>Publish state</span>
							<select
								className={styles.select}
								value={form.publishState ?? "draft"}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										publishState: event.target.value as WorkLedgerPublishState,
									}))
								}
							>
								<option value="draft">draft</option>
								<option value="ready">ready</option>
								<option value="published">published</option>
							</select>
						</label>

						<label className={`${styles.field} ${styles.fieldWide}`}>
							<span className={styles.label}>Summary</span>
							<textarea
								className={styles.textarea}
								value={form.summary ?? ""}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, summary: event.target.value }))
								}
								placeholder="What changed, why it matters, and what it links to."
								rows={4}
							/>
						</label>

						<label className={styles.field}>
							<span className={styles.label}>Commit refs</span>
							<Input
								value={toCsvValue(form.commitRefs ?? [])}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										commitRefs: event.target.value
											.split(",")
											.map((value) => value.trim())
											.filter(Boolean),
									}))
								}
								placeholder="efc4560, a916592"
							/>
						</label>

						<label className={styles.field}>
							<span className={styles.label}>Architecture paths</span>
							<Input
								value={toCsvValue(form.architecturePaths ?? [])}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										architecturePaths: event.target.value
											.split(",")
											.map((value) => value.trim())
											.filter(Boolean),
									}))
								}
								placeholder="src/services/agentService.ts"
							/>
						</label>

						<label className={styles.field}>
							<span className={styles.label}>Hotspot ids</span>
							<Input
								value={toCsvValue(form.hotspotIds ?? [])}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										hotspotIds: event.target.value
											.split(",")
											.map((value) => value.trim())
											.filter(Boolean),
									}))
								}
								placeholder="backend/api_autodraft.py"
							/>
						</label>

						<label className={styles.field}>
							<span className={styles.label}>External reference</span>
							<Input
								value={String(form.externalReference || "")}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										externalReference: event.target.value,
									}))
								}
								placeholder="worktale draft"
							/>
						</label>
					</div>

					<div className={styles.formActions}>
						<Button
							variant="primary"
							onClick={() => void handleCreate()}
							disabled={
								saving || !form.title?.trim() || !form.summary?.trim()
							}
						>
							{saving ? "Saving…" : "Add entry"}
						</Button>
					</div>
				</Panel>

				<Panel variant="default" padding="lg" className={styles.filterPanel}>
					<div className={styles.statsGrid}>
						<div className={styles.statCard}>
							<div className={styles.statValue}>{counts.total}</div>
							<div className={styles.statLabel}>Visible entries</div>
						</div>
						<div className={styles.statCard}>
							<div className={styles.statValue}>{counts.draft}</div>
							<div className={styles.statLabel}>Draft</div>
						</div>
						<div className={styles.statCard}>
							<div className={styles.statValue}>{counts.ready}</div>
							<div className={styles.statLabel}>Ready</div>
						</div>
						<div className={styles.statCard}>
							<div className={styles.statValue}>{counts.published}</div>
							<div className={styles.statLabel}>Published</div>
						</div>
					</div>

					<div className={styles.filterGrid}>
						<label className={styles.field}>
							<span className={styles.label}>Search</span>
							<Input
								value={filters.search ?? ""}
								onChange={(event) =>
									updateSearchParam("query", event.target.value || null)
								}
								placeholder="Search title, summary, commits, paths"
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Architecture path</span>
							<Input
								value={filters.pathQuery ?? ""}
								onChange={(event) =>
									updateSearchParam("path", event.target.value || null)
								}
								placeholder="src/components/apps/autodraft-studio"
							/>
						</label>
						<label className={styles.field}>
							<span className={styles.label}>Publish state</span>
							<select
								className={styles.select}
								value={filters.publishState ?? "all"}
								onChange={(event) =>
									updateSearchParam("publishState", event.target.value || null)
								}
							>
								{PUBLISH_STATE_OPTIONS.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
						</label>
					</div>
				</Panel>

				{error ? <div className={styles.error}>{error}</div> : null}

				<div className={styles.entriesStack}>
					{loading ? (
						<div className={styles.emptyState}>Loading work ledger…</div>
					) : entries.length === 0 ? (
						<div className={styles.emptyState}>
							No work ledger entries matched the current filters.
						</div>
					) : (
						entries.map((entry) => {
							const publishPayload = buildWorktalePublishPayload(entry);
							return (
								<Panel
									key={entry.id}
									variant="default"
									padding="lg"
									className={styles.entryCard}
								>
									<div className={styles.entryHeader}>
										<div>
											<Text size="sm" weight="semibold">
												{entry.title}
											</Text>
											<div className={styles.entryMeta}>
												<Badge
													color={stateTone(entry.publish_state)}
													variant="soft"
												>
													{entry.publish_state}
												</Badge>
												<Badge color="primary" variant="soft">
													{entry.source_kind}
												</Badge>
												<span>{formatTimestamp(entry.updated_at)}</span>
												{entry.project_id ? (
													<span>
														{projectMap.get(entry.project_id) || entry.project_id}
													</span>
												) : (
													<span>Workspace</span>
												)}
											</div>
										</div>
										<div className={styles.entryActions}>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => void copyPublishPayload(entry)}
												iconRight={<ClipboardCopy size={14} />}
											>
												Copy publish note
											</Button>
											{entry.publish_state !== "ready" ? (
												<Button
													variant="ghost"
													size="sm"
													onClick={() => void updateEntryState(entry, "ready")}
												>
													Mark ready
												</Button>
											) : null}
											{entry.publish_state !== "published" ? (
												<Button
													variant="ghost"
													size="sm"
													onClick={() => void updateEntryState(entry, "published")}
												>
													Mark published
												</Button>
											) : null}
										</div>
									</div>

									<div className={styles.entrySummary}>{entry.summary}</div>

									<div className={styles.tokenRows}>
										{entry.commit_refs.length > 0 ? (
											<div className={styles.tokenGroup}>
												<span className={styles.tokenLabel}>Commits</span>
												<div className={styles.tokenWrap}>
													{entry.commit_refs.map((commitRef) => (
														<code key={commitRef} className={styles.token}>
															{commitRef}
														</code>
													))}
												</div>
											</div>
										) : null}

										{entry.architecture_paths.length > 0 ? (
											<div className={styles.tokenGroup}>
												<span className={styles.tokenLabel}>Paths</span>
												<div className={styles.tokenWrap}>
													{entry.architecture_paths.map((pathValue) => (
														<Link
															key={pathValue}
															to={`/app/apps/graph?path=${encodeURIComponent(pathValue)}`}
															className={styles.linkToken}
														>
															{pathValue}
															<ArrowUpRight size={12} />
														</Link>
													))}
												</div>
											</div>
										) : null}
									</div>

									<div className={styles.publishRow}>
										<div className={styles.publishMeta}>
											<Text size="xs" color="muted">
												Worktale-ready outbound payload
											</Text>
											<Text size="xs" color="muted">
												{publishPayload.markdown.length.toLocaleString()} chars
											</Text>
										</div>
										{entry.external_url ? (
											<a
												href={entry.external_url}
												target="_blank"
												rel="noreferrer"
												className={styles.externalLink}
											>
												Open external ref
												<ExternalLink size={14} />
											</a>
										) : null}
									</div>
								</Panel>
							);
						})
					)}
				</div>
			</div>
		</PageFrame>
	);
}
