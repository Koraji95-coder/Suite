import { ArchitectureMapPanel } from "@/components/architecture/ArchitectureMapPanel";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { Badge } from "@/components/primitives/Badge";
import { Panel } from "@/components/primitives/Panel";
import { Text } from "@/components/primitives/Text";
import { ARCHITECTURE_AUTOGEN, ARCHITECTURE_FIX_CANDIDATES } from "@/data/architectureModel";
import {
	ARCHITECTURE_DEPENDENCIES,
	ARCHITECTURE_DOMAINS,
	ARCHITECTURE_MODULES_BY_DOMAIN,
} from "@/data/architectureModel";
import styles from "./ArchitectureMapRoutePage.module.css";

export default function ArchitectureMapRoutePage() {
	const totalModules = ARCHITECTURE_MODULES_BY_DOMAIN.reduce(
		(acc, item) => acc + item.modules.length,
		0,
	);

	return (
		<PageFrame
			title="Architecture Map"
			description={`Repo model: ${ARCHITECTURE_DOMAINS.length} domains, ${totalModules} modules, ${ARCHITECTURE_DEPENDENCIES.length} dependency links.`}
			maxWidth="full"
		>
			<div className={styles.routeRoot}>
				<Panel variant="default" padding="lg" className={styles.routeHero}>
					<div className={styles.routeHeroHeader}>
						<div>
							<Text size="sm" weight="semibold">
								Architecture Command Surface
							</Text>
							<Text size="xs" color="muted" className={styles.routeHeroText}>
								Domain boundaries, dependency pressure, and staged refactor
								checkpoints in one map-first workspace.
							</Text>
						</div>
						<div className={styles.routeHeroBadges}>
							<Badge color="primary" variant="soft">
								Repo scan
							</Badge>
							<Badge color="accent" variant="soft">
								Command-center linked
							</Badge>
						</div>
					</div>
					<div className={styles.routeStatRow}>
						<div className={styles.routeStatChip}>
							<div className={styles.routeStatValue}>
								{ARCHITECTURE_AUTOGEN.hotspots.length}
							</div>
							<div className={styles.routeStatLabel}>Hotspots tracked</div>
						</div>
						<div className={styles.routeStatChip}>
							<div className={styles.routeStatValue}>
								{ARCHITECTURE_FIX_CANDIDATES.length}
							</div>
							<div className={styles.routeStatLabel}>Refactor checkpoints</div>
						</div>
					</div>
				</Panel>
				<Panel variant="default" padding="lg" className={styles.routeMapShell}>
					<ArchitectureMapPanel />
				</Panel>
			</div>
		</PageFrame>
	);
}
