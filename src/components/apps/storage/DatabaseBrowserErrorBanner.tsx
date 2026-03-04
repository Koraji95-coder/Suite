import { AlertTriangle } from "lucide-react";

interface DatabaseBrowserErrorBannerProps {
	error: string | null;
	onDismiss: () => void;
}

export function DatabaseBrowserErrorBanner({
	error,
	onDismiss,
}: DatabaseBrowserErrorBannerProps) {
	if (!error) return null;

	return (
		<div className="mb-3 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] border-[color-mix(in_srgb,var(--danger)_30%,transparent)] [background:color-mix(in_srgb,var(--danger)_12%,transparent)] [color:var(--danger)]">
			<AlertTriangle className="h-4 w-4 shrink-0" />
			<span className="flex-1">{error}</span>
			<button
				onClick={onDismiss}
				className="border-none bg-transparent text-[13px] font-semibold [color:var(--danger)]"
			>
				Dismiss
			</button>
		</div>
	);
}
