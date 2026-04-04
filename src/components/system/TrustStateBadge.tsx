import { Badge, type BadgeProps } from "@/components/system/base/Badge";

export type TrustState =
	| "ready"
	| "background"
	| "needs-attention"
	| "unavailable";

const TRUST_STATE_META: Record<
	TrustState,
	{ label: string; color: "success" | "default" | "warning" | "danger" }
> = {
	ready: { label: "Ready", color: "success" },
	background: { label: "Background", color: "default" },
	"needs-attention": { label: "Needs attention", color: "warning" },
	unavailable: { label: "Unavailable", color: "danger" },
};

export function resolveTrustStateMeta(state: TrustState) {
	return TRUST_STATE_META[state];
}

export interface TrustStateBadgeProps
	extends Omit<BadgeProps, "children" | "color"> {
	state: TrustState;
	label?: string;
}

export function TrustStateBadge({
	state,
	label,
	variant = "soft",
	size = "sm",
	...props
}: TrustStateBadgeProps) {
	const meta = resolveTrustStateMeta(state);
	return (
		<Badge color={meta.color} variant={variant} size={size} {...props}>
			{label ?? meta.label}
		</Badge>
	);
}
