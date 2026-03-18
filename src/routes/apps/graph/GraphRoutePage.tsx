import { Link, useSearchParams } from "react-router-dom";
import { GraphVisualization } from "@/components/apps/graph/GraphVisualization";
import type { SourceFilter } from "@/components/apps/graph/types";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { Text } from "@/components/primitives/Text";
import {
	ARCHITECTURE_DEPENDENCIES,
	ARCHITECTURE_MODULES_BY_DOMAIN,
} from "@/data/architectureModel";
import styles from "./GraphRoutePage.module.css";

function parseSourceFilter(value: string | null): SourceFilter {
	if (value === "memory" || value === "both") return value;
	return "architecture";
}

export default function GraphRoutePage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const sourceFilter = parseSourceFilter(searchParams.get("source"));
	const searchQuery = searchParams.get("query") ?? "";

	const setFilter = (value: SourceFilter) => {
		const next = new URLSearchParams(searchParams);
		if (value === "architecture") {
			next.delete("source");
		} else {
			next.set("source", value);
		}
		setSearchParams(next, { replace: true });
	};

	const setQuery = (value: string) => {
		const next = new URLSearchParams(searchParams);
		if (!value.trim()) {
			next.delete("query");
		} else {
			next.set("query", value);
		}
		setSearchParams(next, { replace: true });
	};

	const moduleCount = ARCHITECTURE_MODULES_BY_DOMAIN.reduce(
		(acc, item) => acc + item.modules.length,
		0,
	);

	return (
		<PageFrame
			title="Graph Explorer"
			description="Architecture and agent-memory graph visualization."
			maxWidth="full"
		>
			<div className={styles.root}>
				<Panel variant="default" padding="lg" className={styles.heroPanel}>
					<div className={styles.heroHeader}>
						<div>
							<Text size="sm" weight="semibold">
								Graph Explorer (Alternate View)
							</Text>
							<Text size="xs" color="muted" className={styles.summaryText}>
								Use this for node-link exploration. Architecture Map is the
								primary deep-dive surface for hotspot triage and checkpoints.
							</Text>
						</div>
						<div className={styles.heroMeta}>
							<Badge color="primary" variant="soft">
								Architecture
							</Badge>
							<Badge color="accent" variant="soft">
								Agent memory
							</Badge>
							<Link to="/app/architecture">
								<Button size="sm" variant="secondary">
									Open Architecture Map
								</Button>
							</Link>
						</div>
					</div>
					<div className={styles.statRow}>
						<div className={styles.statChip}>
							<div className={styles.statValue}>{moduleCount}</div>
							<div className={styles.statLabel}>Mapped modules</div>
						</div>
						<div className={styles.statChip}>
							<div className={styles.statValue}>
								{ARCHITECTURE_DEPENDENCIES.length}
							</div>
							<div className={styles.statLabel}>Dependency links</div>
						</div>
					</div>
				</Panel>
				<Panel variant="default" padding="md" className={styles.graphShell}>
					<div className={styles.graphViewport}>
						<GraphVisualization
							sourceFilter={sourceFilter}
							onSourceFilterChange={setFilter}
							searchQuery={searchQuery}
							onSearchQueryChange={setQuery}
						/>
					</div>
				</Panel>
			</div>
		</PageFrame>
	);
}
