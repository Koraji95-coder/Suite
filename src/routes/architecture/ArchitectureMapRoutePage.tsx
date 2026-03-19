import { Link } from "react-router-dom";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { ArchitectureMapPanel } from "@/components/architecture/ArchitectureMapPanel";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { Text } from "@/components/primitives/Text";
import {
	ARCHITECTURE_AUTOGEN,
	ARCHITECTURE_DEPENDENCIES,
	ARCHITECTURE_DOMAINS,
	ARCHITECTURE_FIX_CANDIDATES,
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
								Architecture Deep Dive (Primary)
							</Text>
							<Text size="xs" color="muted" className={styles.routeHeroText}>
								Domain boundaries, dependency pressure, and staged refactor
								checkpoints live in this primary map-first workspace. When you
								need a lightweight node-link exploration, open the Architecture
								Graph compatibility view on the same data model.
							</Text>
						</div>
						<div className={styles.routeHeroBadges}>
							<Badge color="primary" variant="soft">
								Repo scan
							</Badge>
							<Badge color="accent" variant="soft">
								Command-center linked
							</Badge>
							<Link to="/app/apps/graph?source=architecture">
								<Button size="sm" variant="secondary">
									Open Architecture Graph
								</Button>
							</Link>
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
							<div className={styles.routeStatLabel}>Checkpoint watchlist</div>
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
