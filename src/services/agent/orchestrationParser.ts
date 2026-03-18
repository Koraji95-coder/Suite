import type { AgentRunEvent } from "./types";

export function parseRunEventBlock(block: string): AgentRunEvent | null {
	const lines = block.split("\n");
	let eventType = "message";
	let rawId = "";
	const dataLines: string[] = [];

	for (const line of lines) {
		if (!line || line.startsWith(":")) continue;
		const separator = line.indexOf(":");
		const field =
			separator >= 0 ? line.slice(0, separator).trim() : line.trim();
		const value =
			separator >= 0 ? line.slice(separator + 1).trimStart() : "";

		if (field === "event") {
			eventType = value || eventType;
			continue;
		}
		if (field === "id") {
			rawId = value;
			continue;
		}
		if (field === "data") {
			dataLines.push(value);
		}
	}

	if (dataLines.length === 0) return null;
	const dataText = dataLines.join("\n").trim();
	if (!dataText) return null;

	let parsed: Record<string, unknown> = {};
	try {
		const decoded = JSON.parse(dataText) as unknown;
		if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
			parsed = decoded as Record<string, unknown>;
		}
	} catch {
		parsed = {};
	}

	const payloadCandidate = parsed.payload;
	const payload =
		payloadCandidate &&
		typeof payloadCandidate === "object" &&
		!Array.isArray(payloadCandidate)
			? (payloadCandidate as Record<string, unknown>)
			: {};

	const numericIdFromPayload = Number(parsed.id ?? 0);
	const numericIdFromHeader = Number(rawId || 0);
	const numericId = Number.isFinite(numericIdFromPayload)
		? numericIdFromPayload
		: Number.isFinite(numericIdFromHeader)
			? numericIdFromHeader
			: 0;

	return {
		id: numericId > 0 ? numericId : 0,
		eventType: String(parsed.eventType ?? eventType ?? "message"),
		runId: String(parsed.runId ?? ""),
		stage: String(parsed.stage ?? ""),
		profileId: String(parsed.profileId ?? ""),
		requestId: String(parsed.requestId ?? ""),
		message: String(parsed.message ?? ""),
		payload,
		createdAt: String(parsed.createdAt ?? ""),
	};
}
