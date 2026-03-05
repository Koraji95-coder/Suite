import { ConduitRouteApp } from "@/components/apps/conduit-route/ConduitRouteApp";
import { PageFrame } from "@/components/apps/ui/PageFrame";

export default function ConduitRouteRoutePage() {
	return (
		<PageFrame
			title="Conduit Route"
			description="Creative routing workspace for conduit/cable runs, NEC checks, and section previews."
			maxWidth="full"
		>
			<ConduitRouteApp />
		</PageFrame>
	);
}
