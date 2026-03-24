// src/routes/ProtectedRoute.tsx

import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth/useAuth";
import { AuthGateLoadingScreen } from "./AuthGateLoadingScreen";

export default function ProtectedRoute() {
	const { user, loading } = useAuth();
	const location = useLocation();

	if (loading) {
		return <AuthGateLoadingScreen />;
	}

	if (!user) {
		return (
			<Navigate
				to="/login"
				replace
				state={{ from: location.pathname + location.search }}
			/>
		);
	}

	return <Outlet />;
}
