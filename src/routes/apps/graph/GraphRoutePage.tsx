import { GraphVisualization } from "@/components/apps/graph/GraphVisualization";
import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";

export default function GraphRoutePage() {
	return (
		<PageFrame
			title="Graph Explorer"
			subtitle="Architecture and agent-memory graph visualization."
		>
			<FrameSection>
				<div style={{ height: "72vh", minHeight: 520 }}>
					<GraphVisualization />
				</div>
			</FrameSection>
		</PageFrame>
	);
}
