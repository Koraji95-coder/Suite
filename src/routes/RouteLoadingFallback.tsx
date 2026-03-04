import { PageFrame } from "@/components/apps/ui/PageFrame";

export default function RouteLoadingFallback() {
	return (
		<PageFrame title="Loading\u2026" description="Preparing workspace module.">
			<p className="text-sm [color:var(--text-muted)]">
				One moment while we assemble the workspace view.
			</p>
		</PageFrame>
	);
}
