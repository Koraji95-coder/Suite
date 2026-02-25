import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";

export default function RouteLoadingFallback() {
	return (
		<PageFrame title="Loading…" subtitle="Preparing workspace module.">
			<FrameSection>
				<p className="text-sm" style={{ color: "var(--white-dim)" }}>
					One moment while we assemble the workspace view.
				</p>
			</FrameSection>
		</PageFrame>
	);
}
