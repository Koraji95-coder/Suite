import { ConduitRouteApp } from "@/features/autowire/ui/ConduitRouteApp";
import { PageFrame } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";

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
