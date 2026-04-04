import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import {
	getAppDiagnostics,
	subscribeAppDiagnostics,
} from "@/lib/appDiagnostics";
import {
	updateSuiteJamAuthContext,
	updateSuiteJamDiagnostics,
	updateSuiteJamRouteContext,
} from "@/lib/jamMetadataState";

export default function JamMetadataSync() {
	const location = useLocation();
	const { loading, profile, profileHydrating, sessionAuthMethod, user } =
		useAuth();

	useEffect(() => {
		updateSuiteJamRouteContext(location);
	}, [location]);

	useEffect(() => {
		updateSuiteJamAuthContext({
			displayName: profile?.display_name ?? null,
			email: user?.email ?? profile?.email ?? null,
			isAuthenticated: Boolean(user),
			loading,
			profileHydrating,
			sessionAuthMethod,
			userId: user?.id ?? null,
		});
	}, [
		loading,
		profile?.display_name,
		profile?.email,
		profileHydrating,
		sessionAuthMethod,
		user,
	]);

	useEffect(() => {
		updateSuiteJamDiagnostics(getAppDiagnostics());
		return subscribeAppDiagnostics((entries) => {
			updateSuiteJamDiagnostics(entries);
		});
	}, []);

	return null;
}
