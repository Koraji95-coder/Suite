type ProxyEnv = Record<string, string | undefined>;

function pickFirstNonEmpty(values: Array<string | undefined>, fallback: string) {
	for (const value of values) {
		const trimmed = String(value || "").trim();
		if (trimmed) {
			return trimmed;
		}
	}

	return fallback;
}

export function resolveViteProxyTargets(env: ProxyEnv) {
	return {
		backendUrl: pickFirstNonEmpty(
			[env.BACKEND_PROXY_TARGET, env.VITE_BACKEND_URL, env.BACKEND_URL],
			"http://127.0.0.1:5000",
		),
	};
}
