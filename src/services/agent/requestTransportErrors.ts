export function formatAgentGatewayFailureMessage(
	status: number,
	details: string,
): string {
	const message = String(details || "").trim();
	if (message && !/internal server error/i.test(message)) {
		if (status >= 500 && /llm request failed/i.test(message)) {
			return (
				"Agent model request failed in the gateway. " +
				"Try another agent/profile or restart the gateway/provider runtime."
			);
		}
		return message;
	}
	if (status >= 500) {
		return (
			"Agent request failed in the gateway/provider runtime. " +
			"Try another profile or restart gateway/provider services."
		);
	}
	if (status === 429) {
		return "Agent request is rate-limited. Please retry in a few seconds.";
	}
	return message || `Agent request failed (status ${status}).`;
}
