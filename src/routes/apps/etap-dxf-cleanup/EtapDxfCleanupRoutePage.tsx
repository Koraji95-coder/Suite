import { EtapDxfCleanupApp } from "@/components/apps/dxfer/EtapDxfCleanupApp";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";

export default function EtapDxfCleanupRoutePage() {
	useRegisterPageHeader({
		title: "ETAP DXF Cleanup",
		subtitle:
			"Run ETAP cleanup commands through the AutoCAD bridge with presets, timeout control, and execution history.",
	});

	return (
		<PageFrame maxWidth="xl">
			<EtapDxfCleanupApp />
		</PageFrame>
	);
}
