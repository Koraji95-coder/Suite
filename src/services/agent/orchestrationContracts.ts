export interface AgentBrokerContext {
	useBroker: boolean;
	brokerUrl: string;
	getSupabaseAccessToken: () => Promise<string | null>;
}

export function brokerRequiredError(message: string) {
	return message;
}
