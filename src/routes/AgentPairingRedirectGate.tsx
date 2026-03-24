import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildAgentPairingSearchFromLocation } from "@/auth/agentPairingParams";

const CALLBACK_PATHS = new Set([
	"/agent/pairing-callback",
	"/app/agent/pairing-callback",
]);

function normalizePathname(pathname: string): string {
	const value = String(pathname || "").trim();
	if (!value) {
		return "/";
	}
	if (value.length > 1 && value.endsWith("/")) {
		return value.slice(0, -1);
	}
	return value;
}

export default function AgentPairingRedirectGate() {
	const location = useLocation();
	const navigate = useNavigate();
	const pairingSearch = useMemo(
		() => buildAgentPairingSearchFromLocation(location.search, location.hash),
		[location.hash, location.search],
	);
	const normalizedPath = useMemo(
		() => normalizePathname(location.pathname),
		[location.pathname],
	);

	useEffect(() => {
		if (!pairingSearch) {
			return;
		}
		if (CALLBACK_PATHS.has(normalizedPath)) {
			return;
		}

		navigate(
			{
				pathname: "/agent/pairing-callback",
				search: pairingSearch,
			},
			{ replace: true },
		);
	}, [navigate, normalizedPath, pairingSearch]);

	return null;
}
