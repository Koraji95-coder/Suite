import { GraphVisualization } from "@/components/apps/graph/GraphVisualization";
import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";

export default function GraphRoutePage() {
	return (
		<PageFrame
			title="Graph Explorer"
			subtitle="Architecture and agent-memory graph visualization."
		>
			<FrameSection>
				<div style={{ minHeight: 520, height: "clamp(520px, 70dvh, 980px)" }}>
					<GraphVisualization />
				</div>
			</FrameSection>
		</PageFrame>
	);
}
