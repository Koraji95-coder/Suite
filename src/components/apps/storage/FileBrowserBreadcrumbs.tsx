import { ChevronRight } from "lucide-react";

interface FileBrowserBreadcrumbsProps {
	pathSegments: string[];
	onNavigateRoot: () => void;
	onNavigateTo: (index: number) => void;
}

const crumbClass =
	"rounded border-none px-2 py-0.5 text-[13px] [background:color-mix(in_srgb,var(--primary)_10%,transparent)] [color:var(--primary)]";

export function FileBrowserBreadcrumbs({
	pathSegments,
	onNavigateRoot,
	onNavigateTo,
}: FileBrowserBreadcrumbsProps) {
	return (
		<div className="mb-3 flex flex-wrap items-center gap-1 overflow-x-auto">
			<button onClick={onNavigateRoot} className={crumbClass}>
				root
			</button>
			{pathSegments.map((segment, index) => (
				<span key={`${segment}-${index}`} className="flex items-center gap-0.5">
					<ChevronRight className="h-3 w-3 [color:var(--text-muted)]" />
					<button onClick={() => onNavigateTo(index)} className={crumbClass}>
						{segment}
					</button>
				</span>
			))}
		</div>
	);
}
