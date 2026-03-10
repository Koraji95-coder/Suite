import { ConduitRouteApp } from "@/components/apps/conduit-route/ConduitRouteApp";
import { PageFrame } from "@/components/apps/ui/PageFrame";

export default function AutoWireRoutePage() {
	return (
		<PageFrame
			title="AutoWire"
			description="Unified routing workspace for conduit/cable runs, terminal workflows, and NEC checks."
			maxWidth="full"
		>
			<ConduitRouteApp />
		</PageFrame>
	);
}
