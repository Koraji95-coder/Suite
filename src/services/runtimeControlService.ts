import {
	fetchWithTimeout,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";

function resolveRuntimeControlPath(): string {
	if (import.meta.env.DEV) {
		return "/api/runtime/open-control";
	}
	const configuredBackendUrl = String(
		import.meta.env.VITE_BACKEND_URL || "",
	).trim();
	return configuredBackendUrl
		? `${configuredBackendUrl.replace(/\/+$/, "")}/api/runtime/open-control`
		: "/api/runtime/open-control";
}

export async function openRuntimeControlShell(): Promise<void> {
	const response = await fetchWithTimeout(resolveRuntimeControlPath(), {
		method: "POST",
		credentials: "include",
		requestName: "Runtime Control launcher",
		timeoutMs: 15_000,
	});

	if (response.ok) {
		return;
	}

	throw new Error(
		await parseResponseErrorMessage(
			response,
			`Runtime Control launcher failed (${response.status}).`,
		),
	);
}
