import {
	fetchWithTimeout,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";

export type AutoDraftApiRequestOptions = {
	jsonContentType?: boolean;
};

export type AutoDraftApiClient = {
	requestJson<T>(
		path: string,
		init?: RequestInit,
		timeoutMs?: number,
		options?: AutoDraftApiRequestOptions,
	): Promise<T>;
};

type CreateAutoDraftApiClientArgs = {
	baseUrl: string;
	apiKey: string;
	defaultTimeoutMs: number;
};

function buildHeaders(
	apiKey: string,
	extra: HeadersInit = {},
	options?: AutoDraftApiRequestOptions,
): HeadersInit {
	const headers: HeadersInit = {
		"X-API-Key": apiKey,
		...extra,
	};
	if (options?.jsonContentType === false) {
		return headers;
	}
	return {
		"Content-Type": "application/json",
		...headers,
	};
}

export function createAutoDraftApiClient(
	args: CreateAutoDraftApiClientArgs,
): AutoDraftApiClient {
	const { baseUrl, apiKey, defaultTimeoutMs } = args;
	return {
		async requestJson<T>(
			path: string,
			init: RequestInit = {},
			timeoutMs = defaultTimeoutMs,
			options?: AutoDraftApiRequestOptions,
		): Promise<T> {
			const response = await fetchWithTimeout(`${baseUrl}${path}`, {
				...init,
				headers: buildHeaders(apiKey, init.headers || {}, options),
				timeoutMs,
				requestName: `AutoDraft request (${path})`,
			});
			if (!response.ok) {
				throw new Error(
					await parseResponseErrorMessage(
						response,
						`Request failed (${response.status})`,
					),
				);
			}
			return (await response.json()) as T;
		},
	};
}
