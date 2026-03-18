import type { WorkLedgerRow, WorktalePublishPayload } from "./types";

export function buildWorktalePublishPayload(entry: WorkLedgerRow): WorktalePublishPayload {
	const lines = [
		`# ${entry.title}`,
		"",
		entry.summary,
		"",
		`- Source: ${entry.source_kind}`,
		`- Publish state: ${entry.publish_state}`,
	];

	if (entry.project_id) {
		lines.push(`- Project: ${entry.project_id}`);
	}
	if (entry.app_area) {
		lines.push(`- App area: ${entry.app_area}`);
	}
	if (entry.commit_refs.length > 0) {
		lines.push(`- Commits: ${entry.commit_refs.join(", ")}`);
	}
	if (entry.architecture_paths.length > 0) {
		lines.push(`- Paths: ${entry.architecture_paths.join(", ")}`);
	}
	if (entry.hotspot_ids.length > 0) {
		lines.push(`- Hotspots: ${entry.hotspot_ids.join(", ")}`);
	}
	if (entry.external_reference) {
		lines.push(`- External reference: ${entry.external_reference}`);
	}
	if (entry.external_url) {
		lines.push(`- External URL: ${entry.external_url}`);
	}

	return {
		title: entry.title,
		summary: entry.summary,
		markdown: lines.join("\n"),
		json: {
			id: entry.id,
			title: entry.title,
			summary: entry.summary,
			sourceKind: entry.source_kind,
			commitRefs: entry.commit_refs,
			projectId: entry.project_id,
			appArea: entry.app_area,
			architecturePaths: entry.architecture_paths,
			hotspotIds: entry.hotspot_ids,
			publishState: entry.publish_state,
			publishedAt: entry.published_at,
			externalReference: entry.external_reference,
			externalUrl: entry.external_url,
			updatedAt: entry.updated_at,
		},
	};
}
