import { isCommandCenterAuthorized } from "./devAccess";
import { hasAdminClaim } from "./roles";

type AuthLikeUser =
	| {
			email?: string | null;
			app_metadata?: Record<string, unknown> | null;
	  }
	| null
	| undefined;

export type AppAudience = "customer" | "dev";
export type AppReleaseState = "released" | "developer_beta" | "lab";

const AUDIENCE_ORDER: Record<AppAudience, number> = {
	customer: 0,
	dev: 1,
};

export function getUserAudience(user: AuthLikeUser): AppAudience {
	if (hasAdminClaim(user) && isCommandCenterAuthorized(user)) {
		return "dev";
	}
	return "customer";
}

export function canAccessAudience(
	user: AuthLikeUser,
	audience: AppAudience,
): boolean {
	return AUDIENCE_ORDER[getUserAudience(user)] >= AUDIENCE_ORDER[audience];
}

export function isDevAudience(user: AuthLikeUser): boolean {
	return canAccessAudience(user, "dev");
}

export function normalizeReleaseState(
	value: AppReleaseState | string | null | undefined,
): AppReleaseState {
	switch (value) {
		case "developer_beta":
		case "internal_beta":
			return "developer_beta";
		case "lab":
			return "lab";
		default:
			return "released";
	}
}

export function formatReleaseState(value: AppReleaseState | string): string {
	switch (normalizeReleaseState(value)) {
		case "released":
			return "Released";
		case "developer_beta":
			return "Developer beta";
		default:
			return "Lab";
	}
}
