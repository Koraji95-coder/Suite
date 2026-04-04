import { Link, useSearchParams } from "react-router-dom";
import { GraphVisualization } from "@/features/graph/ui/GraphVisualization";
import type { SourceFilter } from "@/features/graph/ui/types";
import { PageFrame } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";
import { Badge } from "@/components/system/base/Badge";
import { Button } from "@/components/system/base/Button";
import { Panel } from "@/components/system/base/Panel";
import { Text } from "@/components/system/base/Text";
import {
	ARCHITECTURE_DEPENDENCIES,
	ARCHITECTURE_MODULES_BY_DOMAIN,
} from "@/data/architectureModel";
import styles from "./GraphRoutePage.module.css";

function parseSourceFilter(_value: string | null): SourceFilter {
	return "architecture";
}

export default function GraphRoutePage() {
	const [searchParams, setSearchParams] = useSearchParams();
	useRegisterPageHeader({
		title: "Architecture Graph",
		subtitle:
			"Alternate node-link view over the architecture model used by Architecture Map.",
	});
	const sourceFilter = parseSourceFilter(searchParams.get("source"));
	const searchQuery = searchParams.get("query") ?? "";

	const setFilter = (_value: SourceFilter) => {};

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
		<PageFrame maxWidth="full">
			<div className={styles.root}>
				<Panel variant="default" padding="lg" className={styles.heroPanel}>
					<div className={styles.heroHeader}>
						<div>
							<Text size="sm" weight="semibold">
								Architecture Graph (Compatibility View)
							</Text>
							<Text size="xs" color="muted" className={styles.summaryText}>
								Use this node-link visualization for targeted exploration while
								Architecture Map stays the primary hotspot and dependency triage
								surface.
							</Text>
						</div>
						<div className={styles.heroMeta}>
							<Badge color="primary" variant="soft">
								Architecture-first
							</Badge>
							<Link to="/app/developer/architecture/map">
								<Button size="sm" variant="secondary">
									Open architecture workspace
								</Button>
							</Link>
						</div>
					</div>
					<div className={styles.statRow}>
						<div className={styles.statChip}>
							<div className={styles.statValue}>{moduleCount}</div>
							<div className={styles.statLabel}>Architecture modules</div>
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
