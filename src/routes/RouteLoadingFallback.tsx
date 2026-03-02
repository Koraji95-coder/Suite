import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";

export default function RouteLoadingFallback() {
	return (
		<PageFrame title="Loading\u2026" subtitle="Preparing workspace module.">
			<FrameSection>
				<p className="text-sm [color:var(--text-muted)]">
					One moment while we assemble the workspace view.
				</p>
			</FrameSection>
		</PageFrame>
	);
}
