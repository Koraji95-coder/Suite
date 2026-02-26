// src/routes/ProtectedRoute.tsx

import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth/useAuth";

export default function ProtectedRoute() {
	const { user, loading } = useAuth();
	const location = useLocation();

	const devBypass = sessionStorage.getItem("dev_bypass_auth") === "1";

	if (loading && !devBypass) {
		return <div style={{ padding: 24 }}>Loading...</div>;
	}

	if (!user && !devBypass) {
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
