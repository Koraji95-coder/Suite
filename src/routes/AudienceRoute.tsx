import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { type AppAudience, canAccessAudience } from "@/lib/audience";

interface AudienceRouteProps {
	audience: AppAudience;
	children: ReactNode;
}

export default function AudienceRoute({
	audience,
	children,
}: AudienceRouteProps) {
	const { user } = useAuth();
	const location = useLocation();

	if (canAccessAudience(user, audience)) {
		return <>{children}</>;
	}

	return <Navigate to="/app/dashboard" replace state={{ from: location }} />;
}
