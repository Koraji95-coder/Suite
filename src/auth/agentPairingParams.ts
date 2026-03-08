export type AgentPairingAction = "pair" | "unpair";

export interface AgentPairingParams {
	challengeId: string;
	action: AgentPairingAction;
}

const AGENT_CHALLENGE_KEY = "agent_challenge";
const AGENT_ACTION_KEY = "agent_action";
const MAX_EXTRACTION_DEPTH = 3;

function normalizeAgentPairingAction(value: string): AgentPairingAction | null {
	const normalized = value.trim().toLowerCase();
	if (normalized === "pair" || normalized === "unpair") {
		return normalized;
	}
	return null;
}

function extractFromParams(params: URLSearchParams): AgentPairingParams | null {
	const challengeId = (params.get(AGENT_CHALLENGE_KEY) || "").trim();
	const action = normalizeAgentPairingAction(params.get(AGENT_ACTION_KEY) || "");
	if (!challengeId || !action) {
		return null;
	}
	return { challengeId, action };
}

function parseAsUrl(value: string): URL | null {
	const trimmed = String(value || "").trim();
	if (!trimmed) {
		return null;
	}

	try {
		return new URL(trimmed);
	} catch {
		// Fall through to relative-path handling.
	}

	if (trimmed.startsWith("/")) {
		try {
			return new URL(trimmed, "https://suite.local");
		} catch {
			return null;
		}
	}
	return null;
}

function tryDecodeUriComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function addCandidate(candidates: string[], value: string): void {
	const trimmed = String(value || "").trim();
	if (!trimmed) {
		return;
	}
	if (!candidates.includes(trimmed)) {
		candidates.push(trimmed);
	}
}

function buildQueryCandidates(value: string): string[] {
	const candidates: string[] = [];
	const trimmed = String(value || "").trim();
	if (!trimmed) {
		return candidates;
	}

	const normalized = trimmed.replace(/^#/, "");
	addCandidate(candidates, normalized);

	const questionIndex = normalized.indexOf("?");
	if (questionIndex >= 0 && questionIndex + 1 < normalized.length) {
		addCandidate(candidates, normalized.slice(questionIndex + 1));
	}

	const hashIndex = normalized.indexOf("#");
	if (hashIndex >= 0 && hashIndex + 1 < normalized.length) {
		addCandidate(candidates, normalized.slice(hashIndex + 1));
	}

	return candidates;
}

function extractFromLooseText(value: string): AgentPairingParams | null {
	const challengeMatch = String(value || "").match(
		/(?:^|[?&#])agent_challenge=([^&#]+)/i,
	);
	const actionMatch = String(value || "").match(
		/(?:^|[?&#])agent_action=([^&#]+)/i,
	);
	if (!challengeMatch?.[1] || !actionMatch?.[1]) {
		return null;
	}
	const challengeId = tryDecodeUriComponent(challengeMatch[1]).trim();
	const action = normalizeAgentPairingAction(
		tryDecodeUriComponent(actionMatch[1]),
	);
	if (!challengeId || !action) {
		return null;
	}
	return { challengeId, action };
}

function extractAgentPairingParamsFromValue(
	value: string,
	depth = 0,
	visited: Set<string> = new Set(),
): AgentPairingParams | null {
	if (depth > MAX_EXTRACTION_DEPTH) {
		return null;
	}

	const trimmed = String(value || "").trim();
	if (!trimmed) {
		return null;
	}
	if (visited.has(trimmed)) {
		return null;
	}
	visited.add(trimmed);

	const directTextMatch = extractFromLooseText(trimmed);
	if (directTextMatch) {
		return directTextMatch;
	}

	const queryCandidates = buildQueryCandidates(trimmed);
	for (const candidate of queryCandidates) {
		const params = new URLSearchParams(
			candidate.startsWith("?") ? candidate.slice(1) : candidate,
		);
		const direct = extractFromParams(params);
		if (direct) {
			return direct;
		}

		for (const nestedValue of params.values()) {
			const nested = extractAgentPairingParamsFromValue(
				nestedValue,
				depth + 1,
				visited,
			);
			if (nested) {
				return nested;
			}
		}
	}

	const parsedUrl = parseAsUrl(trimmed);
	if (parsedUrl) {
		const fromSearch = extractAgentPairingParamsFromValue(
			parsedUrl.search,
			depth + 1,
			visited,
		);
		if (fromSearch) {
			return fromSearch;
		}
		const fromHash = extractAgentPairingParamsFromValue(
			parsedUrl.hash,
			depth + 1,
			visited,
		);
		if (fromHash) {
			return fromHash;
		}
	}

	const decoded = tryDecodeUriComponent(trimmed);
	if (decoded !== trimmed) {
		return extractAgentPairingParamsFromValue(decoded, depth + 1, visited);
	}

	return null;
}

export function extractAgentPairingParamsFromLocation(
	search: string,
	hash: string,
): AgentPairingParams | null {
	const visited = new Set<string>();
	const fromQuery = extractAgentPairingParamsFromValue(search, 0, visited);
	if (fromQuery) {
		return fromQuery;
	}
	return extractAgentPairingParamsFromValue(hash, 0, visited);
}

export function buildAgentPairingSearchFromLocation(
	search: string,
	hash: string,
): string {
	const parsed = extractAgentPairingParamsFromLocation(search, hash);
	if (!parsed) {
		return "";
	}
	const next = new URLSearchParams();
	next.set(AGENT_CHALLENGE_KEY, parsed.challengeId);
	next.set(AGENT_ACTION_KEY, parsed.action);
	return `?${next.toString()}`;
}
