import { PageFrame } from "@/components/apps/ui/PageFrame";
import { Text } from "@/components/primitives";

export default function RouteLoadingFallback() {
	return (
		<PageFrame
			title={"Loading\u2026"}
			description="Preparing workspace module."
		>
			<Text size="sm" color="muted">
				One moment while we assemble the workspace view.
			</Text>
		</PageFrame>
	);
}
