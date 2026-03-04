import { PageFrame, Section } from "@/components/apps/ui/PageFrame";
import { AppsCatalogGrid } from "./modules/AppsCatalogGrid";
import { APPS_CATALOG } from "./modules/appsCatalog";

export default function AppsRoutePage() {
	return (
		<PageFrame
			title="Apps Hub"
			description="Launch workspace tools from a consistent page frame."
		>
			<Section title="Workspace Apps">
				<AppsCatalogGrid items={APPS_CATALOG} />
			</Section>
		</PageFrame>
	);
}
