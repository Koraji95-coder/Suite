type AuthLikeUser = {
	app_metadata?: Record<string, unknown> | null;
} | null | undefined;

export type AppRole = "Admin" | "User";

export function hasAdminClaim(user: AuthLikeUser): boolean {
	if (!user) return false;
	const metadata = user.app_metadata || {};

	const role = metadata.role;
	if (typeof role === "string" && role.trim().toLowerCase() === "admin") {
		return true;
	}

	const roles = metadata.roles;
	if (Array.isArray(roles)) {
		return roles.some(
			(entry) =>
				typeof entry === "string" && entry.trim().toLowerCase() === "admin",
		);
	}

	return false;
}

export function getAppRole(user: AuthLikeUser): AppRole {
	return hasAdminClaim(user) ? "Admin" : "User";
}
