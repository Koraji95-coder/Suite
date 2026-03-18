import { Badge } from "@/components/primitives/Badge";
import { Panel } from "@/components/primitives/Panel";
import { Text } from "@/components/primitives/Text";
import { GraphVisualization } from "@/components/apps/graph/GraphVisualization";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import {
	ARCHITECTURE_DEPENDENCIES,
	ARCHITECTURE_MODULES_BY_DOMAIN,
} from "@/data/architectureModel";
import styles from "./GraphRoutePage.module.css";

export default function GraphRoutePage() {
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
								Command-Center Deep Dive
							</Text>
							<Text size="xs" color="muted" className={styles.summaryText}>
								Explore architecture hotspots and agent-memory context in one
								graph-focused surface.
							</Text>
						</div>
						<div className={styles.heroMeta}>
							<Badge color="primary" variant="soft">
								Architecture
							</Badge>
							<Badge color="accent" variant="soft">
								Agent memory
							</Badge>
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
						<GraphVisualization />
					</div>
				</Panel>
			</div>
		</PageFrame>
	);
}
