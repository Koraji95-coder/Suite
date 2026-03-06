import { ArchitectureMapPanel } from "@/components/architecture/ArchitectureMapPanel";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import {
	ARCHITECTURE_DEPENDENCIES,
	ARCHITECTURE_DOMAINS,
	ARCHITECTURE_MODULES_BY_DOMAIN,
} from "@/data/architectureModel";

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
			<ArchitectureMapPanel />
		</PageFrame>
	);
}
