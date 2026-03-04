import { GraphVisualization } from "@/components/apps/graph/GraphVisualization";
import { PageFrame } from "@/components/apps/ui/PageFrame";

export default function GraphRoutePage() {
	return (
		<PageFrame
			title="Graph Explorer"
			description="Architecture and agent-memory graph visualization."
			maxWidth="full"
		>
			<div style={{ minHeight: 520, height: "clamp(520px, 70dvh, 980px)" }}>
				<GraphVisualization />
			</div>
		</PageFrame>
	);
}
