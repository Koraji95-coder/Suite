import { WorkLedgerApiError, requestWorkLedgerApi } from "./api";
import type {
	WorkLedgerDraftSuggestion,
	WorkLedgerDraftSuggestionsResponse,
} from "./types";

const EMPTY_SOURCES = {
	git: 0,
	agent: 0,
	watchdog: 0,
};

function classifySuggestionError(error: unknown): Error {
	if (error instanceof WorkLedgerApiError) {
		if (error.status === 404) {
			return new Error(
				"Draft suggestion routes are unavailable. Restart the backend from this repo checkout.",
			);
		}
		if (error.status === 401 || error.status === 403) {
			return new Error("Sign in again to load draft suggestions.");
		}
		return new Error(error.message || "Draft suggestion request failed.");
	}
	const rawMessage = String((error as { message?: unknown })?.message || "").trim();
	return new Error(rawMessage || "Unable to load draft suggestions.");
}

export async function fetchWorkLedgerDraftSuggestions(): Promise<{
	data: WorkLedgerDraftSuggestion[];
	error: Error | null;
	sources: WorkLedgerDraftSuggestionsResponse["sources"];
}> {
	try {
		const payload = (await requestWorkLedgerApi(
			"/api/work-ledger/draft-suggestions",
			{ method: "GET" },
		)) as WorkLedgerDraftSuggestionsResponse;
		return {
			data: Array.isArray(payload.suggestions) ? payload.suggestions : [],
			error: null,
			sources: payload.sources ?? EMPTY_SOURCES,
		};
	} catch (error) {
		return {
			data: [],
			error: classifySuggestionError(error),
			sources: EMPTY_SOURCES,
		};
	}
}
