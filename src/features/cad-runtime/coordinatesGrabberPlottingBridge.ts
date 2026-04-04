import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import type {
	GroundGridPlotRequest,
	GroundGridPlotResult,
} from "./coordinatesGrabberTransportTypes";

type GetHeaders = (options?: {
	includeContentType?: boolean;
	context?: string;
}) => Promise<Record<string, string>>;

export class CoordinatesGrabberPlottingBridge {
	private readonly baseUrl: string;
	private readonly getHeaders: GetHeaders;

	constructor(baseUrl: string, getHeaders: GetHeaders) {
		this.baseUrl = baseUrl;
		this.getHeaders = getHeaders;
	}

	public async plotGroundGrid(
		payload: GroundGridPlotRequest,
	): Promise<GroundGridPlotResult> {
		try {
			const headers = await this.getHeaders({ context: "ground-grid-plot" });
			const response = await fetchWithTimeout(`${this.baseUrl}/api/ground-grid/plot`, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
				timeoutMs: 120_000,
				requestName: "Ground-grid plot request",
			});

			const data = (await response
				.json()
				.catch(() => null)) as GroundGridPlotResult | null;
			if (!response.ok) {
				return {
					success: false,
					message:
						data?.message || `Ground-grid plot failed (${response.status})`,
					lines_drawn: data?.lines_drawn ?? 0,
					blocks_inserted: data?.blocks_inserted ?? 0,
					layer_name: data?.layer_name ?? "",
					error_details: data?.error_details,
				};
			}

			return (
				data || {
					success: true,
					message: "Ground grid plotted",
					lines_drawn: 0,
					blocks_inserted: 0,
					layer_name: "",
				}
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			logger.error("Ground-grid plot failed", "CoordinatesGrabber", err);
			return {
				success: false,
				message: `Cannot reach backend at ${this.baseUrl}. Is api_server.py running?`,
				lines_drawn: 0,
				blocks_inserted: 0,
				layer_name: "",
				error_details: message,
			};
		}
	}
}
