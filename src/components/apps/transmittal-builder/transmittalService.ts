import { logger } from "@/lib/logger";

export type TransmittalRenderResult = {
	blob: Blob;
	filename: string;
	contentType: string;
};

export type TransmittalProfile = {
	id: string;
	name: string;
	title: string;
	email: string;
	phone: string;
};

export type TransmittalProfileOptionsResult = {
	profiles: TransmittalProfile[];
	firmNumbers: string[];
	defaults: {
		profileId: string;
		firm: string;
	};
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

	async fetchProfileOptions(): Promise<TransmittalProfileOptionsResult> {
		const response = await fetch(`${this.baseUrl}/api/transmittal/profiles`, {
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

		const payload = (await response.json()) as {
			profiles?: unknown;
			firm_numbers?: unknown;
			defaults?: unknown;
		};

		const profiles = Array.isArray(payload.profiles)
			? payload.profiles
					.map((row) => {
						if (!row || typeof row !== "object") return null;
						const entry = row as Record<string, unknown>;
						const id = String(entry.id ?? "").trim();
						const name = String(entry.name ?? "").trim();
						if (!id || !name) return null;
						return {
							id,
							name,
							title: String(entry.title ?? "").trim(),
							email: String(entry.email ?? "").trim(),
							phone: String(entry.phone ?? "").trim(),
						} satisfies TransmittalProfile;
					})
					.filter((row): row is TransmittalProfile => Boolean(row))
			: [];

		const firmNumbers = Array.isArray(payload.firm_numbers)
			? payload.firm_numbers
					.map((value) => String(value ?? "").trim())
					.filter((value) => value.length > 0)
			: [];

		const defaultsRecord =
			payload.defaults && typeof payload.defaults === "object"
				? (payload.defaults as Record<string, unknown>)
				: {};

		return {
			profiles,
			firmNumbers,
			defaults: {
				profileId: String(defaultsRecord.profile_id ?? "").trim(),
				firm: String(defaultsRecord.firm ?? "").trim(),
			},
		};
	}
}

export const transmittalService = new TransmittalService();
