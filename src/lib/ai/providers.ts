import type { AIConfig, AIProvider, Message } from "./types";

export interface AIProviderInterface {
	chat(messages: Message[], onChunk?: (chunk: string) => void): Promise<string>;
	listModels(): Promise<string[]>;
}

export class OllamaProvider implements AIProviderInterface {
	private url: string;
	private model: string;

	constructor(url: string, model: string) {
		this.url = url;
		this.model = model;
	}

	async chat(
		messages: Message[],
		onChunk?: (chunk: string) => void,
	): Promise<string> {
		const payload = {
			model: this.model,
			messages: messages.map((m) => ({ role: m.role, content: m.content })),
			stream: !!onChunk,
		};

		const response = await fetch(`${this.url}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			throw new Error(
				`Ollama error: ${response.status} ${response.statusText}`,
			);
		}

		if (onChunk && response.body) {
			return this.readStream(response.body, onChunk);
		}

		const data = await response.json();
		return data.message?.content ?? "";
	}

	private async readStream(
		body: ReadableStream<Uint8Array>,
		onChunk: (chunk: string) => void,
	): Promise<string> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let full = "";

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const text = decoder.decode(value);
				const lines = text.split("\n").filter((l) => l.trim());

				for (const line of lines) {
					try {
						const json = JSON.parse(line);
						if (json.message?.content) {
							full += json.message.content;
							onChunk(json.message.content);
						}
					} catch {
						// partial JSON line, skip
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		return full;
	}

	async listModels(): Promise<string[]> {
		try {
			const response = await fetch(`${this.url}/api/tags`);
			if (!response.ok) return [];
			const data = await response.json();
			return data.models?.map((m: { name: string }) => m.name) ?? [];
		} catch {
			return [];
		}
	}
}

export class OpenAIProvider implements AIProviderInterface {
	async chat(
		_messages: Message[],
		_onChunk?: (chunk: string) => void,
	): Promise<string> {
		throw new Error("OpenAI provider not yet configured");
	}

	async listModels(): Promise<string[]> {
		throw new Error("OpenAI provider not yet configured");
	}
}

export async function detectProvider(ollamaUrl: string): Promise<AIProvider> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 3000);

		const response = await fetch(`${ollamaUrl}/api/tags`, {
			signal: controller.signal,
		});

		clearTimeout(timeout);
		return response.ok ? "ollama" : "openai";
	} catch {
		return "openai";
	}
}

export function createProvider(config: AIConfig): AIProviderInterface {
	switch (config.provider) {
		case "ollama":
			return new OllamaProvider(config.ollamaUrl, config.ollamaModel);
		case "openai":
			return new OpenAIProvider();
	}
}
