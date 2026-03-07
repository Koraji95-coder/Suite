import { EtapDxfCleanupApp } from "@/components/apps/dxfer/EtapDxfCleanupApp";
import { PageFrame } from "@/components/apps/ui/PageFrame";

export default function EtapDxfCleanupRoutePage() {
	return (
		<PageFrame
			title="ETAP DXF Cleanup"
			description="Run ETAP cleanup commands through the AutoCAD bridge with command presets, timeout control, and execution history."
			maxWidth="xl"
		>
			<EtapDxfCleanupApp />
		</PageFrame>
	);
}
