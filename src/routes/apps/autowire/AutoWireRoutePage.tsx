import { ConduitRouteApp } from "@/components/apps/conduit-route/ConduitRouteApp";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";

export default function AutoWireRoutePage() {
	useRegisterPageHeader({
		title: "AutoWire",
		subtitle:
			"Unified routing workspace for conduit and cable runs, terminal workflows, and NEC checks.",
	});

	return (
		<PageFrame maxWidth="full">
			<ConduitRouteApp />
		</PageFrame>
	);
}
