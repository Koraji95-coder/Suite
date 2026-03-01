import { FrameSection, PageFrame } from "./PageFrame";

type SkeletonBlockProps = {
	className?: string;
};

export function SkeletonBlock({ className = "" }: SkeletonBlockProps) {
	return (
		<div
			className={`animate-[suite-glow-pulse_3.8s_ease-in-out_infinite] rounded-2xl border [border-color:color-mix(in_srgb,var(--primary)_22%,var(--border))] [background:linear-gradient(145deg,color-mix(in_srgb,var(--surface)_90%,transparent),color-mix(in_srgb,var(--surface-2)_86%,transparent))] ${className}`}
			aria-hidden="true"
		/>
	);
}

export function DashboardLoadingState() {
	return (
		<div className="grid gap-4">
			<SkeletonBlock className="h-24" />
			<div className="grid gap-4 lg:grid-cols-2">
				<SkeletonBlock className="h-64" />
				<SkeletonBlock className="h-64" />
			</div>
			<SkeletonBlock className="h-56" />
		</div>
	);
}

export function ShellRouteLoadingMask({
	className = "",
	compact = false,
}: {
	className?: string;
	compact?: boolean;
}) {
	return (
		<div
			className={`relative h-full w-full overflow-hidden rounded-3xl border p-4 [border-color:color-mix(in_srgb,var(--primary)_34%,var(--border))] [background:linear-gradient(150deg,color-mix(in_srgb,var(--bg-base)_88%,var(--surface)_12%),color-mix(in_srgb,var(--surface)_82%,transparent))] backdrop-blur-[6px] ${className}`}
			aria-hidden="true"
		>
			<div className="pointer-events-none absolute inset-x-0 top-0 h-px [background:linear-gradient(90deg,transparent,color-mix(in_srgb,var(--primary)_65%,transparent),transparent)]" />
			<div className="pointer-events-none absolute -left-1/4 top-0 h-full w-1/2 [background:linear-gradient(95deg,transparent,color-mix(in_srgb,var(--primary)_12%,transparent),transparent)] animate-[suite-grid-pan_18s_linear_infinite]" />
			<div className="grid gap-3">
				<div className="flex items-center gap-2">
					<SkeletonBlock className="h-8 w-8 rounded-lg" />
					<SkeletonBlock className="h-8 w-44 rounded-lg" />
					<div className="ml-auto flex items-center gap-2">
						<SkeletonBlock className="h-8 w-20 rounded-lg" />
						<SkeletonBlock className="h-8 w-24 rounded-lg" />
					</div>
				</div>
				<div className={`grid gap-3 ${compact ? "" : "md:grid-cols-2"}`}>
					<SkeletonBlock className="h-24" />
					<SkeletonBlock className="h-24" />
				</div>
				<SkeletonBlock className="h-16" />
				{compact ? null : <SkeletonBlock className="h-40" />}
			</div>
		</div>
	);
}

export function RouteModuleLoadingState({
	title = "Loading Module...",
	subtitle = "Preparing workspace surface and data channels.",
}: {
	title?: string;
	subtitle?: string;
}) {
	return (
		<PageFrame title={title} subtitle={subtitle}>
			<FrameSection title="Loading workspace">
				<ShellRouteLoadingMask compact />
			</FrameSection>
		</PageFrame>
	);
}

export function ProtectedRouteLoadingState() {
	return (
		<div className="min-h-dvh p-6 [background:var(--bg-base)]">
			<div className="mx-auto w-full max-w-[980px]">
				<div className="grid gap-4">
					<SkeletonBlock className="h-14" />
					<SkeletonBlock className="h-44" />
					<SkeletonBlock className="h-44" />
				</div>
			</div>
		</div>
	);
}
