import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";
import { AppsCatalogGrid } from "./modules/AppsCatalogGrid";
import { APPS_CATALOG } from "./modules/appsCatalog";

export default function AppsRoutePage() {
	return (
		<PageFrame
			title="Apps Hub"
			subtitle="Launch workspace tools from a consistent page frame."
		>
			<FrameSection title="Workspace Apps">
				<AppsCatalogGrid items={APPS_CATALOG} />
			</FrameSection>
		</PageFrame>
	);
}
