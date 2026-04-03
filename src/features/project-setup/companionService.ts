import {
	FetchRequestError,
	fetchWithTimeout,
	mapFetchErrorMessage,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import type { ProjectSetupTicketResponse } from "./backendService";

export interface ProjectSetupCompanionFileEntry {
	absolutePath: string;
	relativePath: string;
	fileType: string;
}

export interface ProjectSetupCompanionBridgeDrawing {
	path: string;
	titleBlockFound: boolean;
	blockName?: string | null;
	layoutName?: string | null;
	handle?: string | null;
	hasWdTb?: boolean;
	attributes?: Record<string, string>;
	warnings?: string[];
}

export interface ProjectSetupCompanionArtifacts {
	wdpPath: string;
	wdtPath: string;
	wdlPath: string;
	wdpText?: string;
	wdtText?: string;
	wdlText?: string;
	wdpState?: "existing" | "starter";
	wdpExists?: boolean;
	wdtExists?: boolean;
	wdlExists?: boolean;
	wdPickPrjDlgFolder?: string;
	wdPickPrjDlgUpdatedPaths?: string[];
}

export interface ProjectSetupCompanionScanSnapshot {
	projectRootPath: string;
	files: ProjectSetupCompanionFileEntry[];
	bridgeDrawings: ProjectSetupCompanionBridgeDrawing[];
	artifacts: ProjectSetupCompanionArtifacts;
}

export interface ProjectSetupCompanionResponse<TData> {
	success: boolean;
	code?: string;
	message: string;
	requestId?: string;
	data?: TData;
	warnings?: string[];
	meta?: Record<string, unknown>;
}

export interface ProjectSetupPickRootResponse {
	cancelled: boolean;
	path: string | null;
}

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

const RUNTIME_CONTROL_BASE_URL = (
	import.meta.env.VITE_RUNTIME_CONTROL_PICKER_URL || "http://127.0.0.1:57421"
)
	.trim()
	.replace(/\/+$/, "");

export const PROJECT_SETUP_COMPANION_UNAVAILABLE_MESSAGE =
	"Suite Runtime Control is unavailable on this workstation. Start it, then try again. Project metadata can still be saved without local CAD actions.";

class ProjectSetupCompanionService {
	private async requestJson<T>(
		path: string,
		args: {
			ticket: ProjectSetupTicketResponse;
			body?: Record<string, unknown>;
			timeoutMs?: number;
		},
	): Promise<ProjectSetupCompanionResponse<T>> {
		try {
			const response = await fetchWithTimeout(
				`${RUNTIME_CONTROL_BASE_URL}${path}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						ticket: args.ticket.ticket,
						requestId: args.ticket.requestId,
						...(args.body || {}),
					}),
					timeoutMs: args.timeoutMs ?? 120_000,
					requestName: "Runtime Control project setup action",
					diagnosticsMode: "silent",
				},
			);

			const parsed = (await response
				.clone()
				.json()
				.catch(() => null)) as ProjectSetupCompanionResponse<T> | null;

			if (!response.ok) {
				throw new Error(
					await parseResponseErrorMessage(
						response,
						PROJECT_SETUP_COMPANION_UNAVAILABLE_MESSAGE,
					),
				);
			}

			if (!parsed) {
				throw new Error("Runtime Control returned an empty response.");
			}

			return parsed;
		} catch (error) {
			if (
				error instanceof FetchRequestError &&
				(error.kind === "network" ||
					error.kind === "timeout" ||
					error.kind === "aborted")
			) {
				throw new Error(
					mapFetchErrorMessage(
						error,
						PROJECT_SETUP_COMPANION_UNAVAILABLE_MESSAGE,
					),
				);
			}
			throw error;
		}
	}

	async pickRoot(
		ticket: ProjectSetupTicketResponse,
		args?: {
			initialPath?: string | null;
			title?: string | null;
		},
	) {
		return await this.requestJson<ProjectSetupPickRootResponse>(
			"/api/workstation/project-setup/pick-root",
			{
				ticket,
				body: {
					initialPath: args?.initialPath ?? null,
					title: args?.title ?? null,
				},
			},
		);
	}

	async scanRoot(
		ticket: ProjectSetupTicketResponse,
		args: {
			projectRootPath: string;
			profile?: object | null;
		},
	) {
		return await this.requestJson<ProjectSetupCompanionScanSnapshot>(
			"/api/workstation/project-setup/scan-root",
			{
				ticket,
				body: {
					projectRootPath: args.projectRootPath,
					profile: args.profile ?? {},
				},
				timeoutMs: 120_000,
			},
		);
	}

	async ensureArtifacts(
		ticket: ProjectSetupTicketResponse,
		args: {
			projectRootPath: string;
			artifacts: ProjectSetupCompanionArtifacts;
		},
	) {
		return await this.requestJson<ProjectSetupCompanionArtifacts>(
			"/api/workstation/project-setup/ensure-artifacts",
			{
				ticket,
				body: args,
			},
		);
	}

	async openAcade(
		ticket: ProjectSetupTicketResponse,
		body: Record<string, unknown>,
	) {
		return await this.requestJson<Record<string, unknown>>(
			"/api/workstation/project-setup/open-acade",
			{
				ticket,
				body,
			},
		);
	}

	async createAcade(
		ticket: ProjectSetupTicketResponse,
		body: Record<string, unknown>,
	) {
		return await this.requestJson<Record<string, unknown>>(
			"/api/workstation/project-setup/create-acade",
			{
				ticket,
				body,
			},
		);
	}

	async applyTitleBlock(
		ticket: ProjectSetupTicketResponse,
		body: Record<string, unknown>,
	) {
		return await this.requestJson<Record<string, unknown>>(
			"/api/workstation/project-setup/apply-title-block",
			{
				ticket,
				body,
				timeoutMs: 120_000,
			},
		);
	}
}

export function isProjectSetupCompanionUnavailableError(error: unknown) {
	return normalizeText(error).includes(PROJECT_SETUP_COMPANION_UNAVAILABLE_MESSAGE);
}

export const projectSetupCompanionService = new ProjectSetupCompanionService();
