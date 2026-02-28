import { logger } from "@/lib/logger";

export type TransmittalRenderResult = {
	blob: Blob;
	filename: string;
	contentType: string;
};

const parseFilename = (value: string | null) => {
	if (!value) return "transmittal_output";
	const utfMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
	if (utfMatch?.[1]) {
		return decodeURIComponent(utfMatch[1]);
	}
	const match = value.match(/filename="?([^";]+)"?/i);
	return match?.[1] ?? "transmittal_output";
};

class TransmittalService {
	private baseUrl: string;
	private apiKey: string;

	constructor() {
		this.baseUrl =
			import.meta.env.VITE_TRANSMITTAL_BACKEND_URL ||
			import.meta.env.VITE_COORDINATES_BACKEND_URL ||
			"http://localhost:5000";
		this.apiKey = import.meta.env.VITE_API_KEY || "";
	}

	hasApiKey() {
		return Boolean(this.apiKey);
	}

	private getHeaders(): HeadersInit {
		return {
			"X-API-Key": this.apiKey,
		};
	}

	async renderTransmittal(
		formData: FormData,
	): Promise<TransmittalRenderResult> {
		const response = await fetch(`${this.baseUrl}/api/transmittal/render`, {
			method: "POST",
			headers: this.getHeaders(),
			body: formData,
		});

		if (!response.ok) {
			let message = `Request failed (${response.status})`;
			try {
				const data = await response.json();
				message = data?.message || data?.detail || message;
			} catch {
				// ignore
			}
			logger.error("Transmittal render failed", "TransmittalService", {
				status: response.status,
				message,
			});
			throw new Error(message);
		}

		const contentType = response.headers.get("content-type") || "";
		const filename = parseFilename(response.headers.get("content-disposition"));
		const blob = await response.blob();

		return { blob, filename, contentType };
	}

	async fetchExampleTemplate(): Promise<TransmittalRenderResult> {
		const response = await fetch(`${this.baseUrl}/api/transmittal/template`, {
			method: "GET",
			headers: this.getHeaders(),
		});

		if (!response.ok) {
			let message = `Request failed (${response.status})`;
			try {
				const data = await response.json();
				message = data?.message || message;
			} catch {
				// ignore
			}
			throw new Error(message);
		}

		const contentType = response.headers.get("content-type") || "";
		const filename = parseFilename(response.headers.get("content-disposition"));
		const blob = await response.blob();
		return { blob, filename, contentType };
	}
}

export const transmittalService = new TransmittalService();
