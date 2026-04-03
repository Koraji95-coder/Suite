import { mapFetchErrorMessage } from "@/lib/fetchWithTimeout";
import { projectSetupBackendService } from "./backendService";
import {
	projectSetupCompanionService,
	type ProjectSetupCompanionArtifacts,
	type ProjectSetupCompanionResponse,
	type ProjectSetupCompanionScanSnapshot,
} from "./companionService";
import {
	normalizeTitleBlockWorkflowMessage,
	normalizeTitleBlockWorkflowWarnings,
} from "./workflowMessages";
import type {
	TitleBlockSyncArtifacts,
	TitleBlockSyncPayload,
	TitleBlockSyncResponse,
	TitleBlockSyncRow,
} from "./types";

type TitleBlockSyncResponseData = NonNullable<TitleBlockSyncResponse["data"]>;

class ProjectSetupActionService {
	private normalizeResponse(
		response: TitleBlockSyncResponse,
	): TitleBlockSyncResponse {
		return {
			...response,
			message: normalizeTitleBlockWorkflowMessage(response.message),
			warnings: normalizeTitleBlockWorkflowWarnings(response.warnings || []),
		};
	}

	private buildCompanionFailureResponse(
		error: unknown,
		fallback: string,
	): TitleBlockSyncResponse {
		return {
			success: false,
			code: "LOCAL_RUNTIME_UNAVAILABLE",
			message: mapFetchErrorMessage(error, fallback),
			warnings: [],
		};
	}

	private async buildProjectSetupPreview(
		payload: TitleBlockSyncPayload,
		options?: {
			includeRows?: boolean;
		},
	): Promise<TitleBlockSyncResponse> {
		let ticket;
		try {
			ticket = await projectSetupBackendService.issueTicket({
				action: "scan-root",
				projectId: payload.projectId,
				requestId: payload.projectId
					? `title-block-scan-${payload.projectId}-${Date.now()}`
					: `title-block-scan-${Date.now()}`,
			});
		} catch (error) {
			return this.buildCompanionFailureResponse(
				error,
				"Unable to prepare the local project scan.",
			);
		}

		let scanResponse: ProjectSetupCompanionResponse<ProjectSetupCompanionScanSnapshot>;
		try {
			scanResponse = await projectSetupCompanionService.scanRoot(ticket, {
				projectRootPath: payload.projectRootPath,
				profile: payload.profile,
			});
		} catch (error) {
			return this.buildCompanionFailureResponse(
				error,
				"Unable to scan the local project root.",
			);
		}

		if (!scanResponse.success || !scanResponse.data) {
			return {
				success: false,
				code: scanResponse.code || "SCAN_ROOT_FAILED",
				message:
					normalizeTitleBlockWorkflowMessage(scanResponse.message) ||
					"Unable to scan the local project root.",
				requestId: scanResponse.requestId,
				warnings: normalizeTitleBlockWorkflowWarnings(
					scanResponse.warnings || [],
				),
				meta: scanResponse.meta,
			};
		}

		try {
			return this.normalizeResponse(
				await projectSetupBackendService.buildPreview({
					...payload,
					rows: options?.includeRows ? payload.rows : [],
					scanSnapshot: scanResponse.data,
				}),
			);
		} catch (error) {
			return this.buildCompanionFailureResponse(
				error,
				"Project setup preview failed.",
			);
		}
	}

	private async ensureCompanionArtifacts(
		payload: TitleBlockSyncPayload,
		preview: TitleBlockSyncResponse,
	): Promise<{
		response: TitleBlockSyncResponse;
		artifacts: ProjectSetupCompanionArtifacts | null;
	}> {
		if (!preview.success || !preview.data) {
			return { response: preview, artifacts: null };
		}

		let ticket;
		try {
			ticket = await projectSetupBackendService.issueTicket({
				action: "ensure-artifacts",
				projectId: payload.projectId,
				requestId:
					preview.requestId || `title-block-artifacts-${Date.now()}`,
			});
		} catch (error) {
			return {
				response: this.buildCompanionFailureResponse(
					error,
					"Unable to prepare local ACADE support artifacts.",
				),
				artifacts: null,
			};
		}

		try {
			const ensureResponse = await projectSetupCompanionService.ensureArtifacts(
				ticket,
				{
					projectRootPath: preview.data.projectRootPath,
					artifacts:
						preview.data.artifacts as unknown as ProjectSetupCompanionArtifacts,
				},
			);
			if (!ensureResponse.success || !ensureResponse.data) {
				return {
					response: {
						success: false,
						code: ensureResponse.code || "ENSURE_ARTIFACTS_FAILED",
						message:
							normalizeTitleBlockWorkflowMessage(ensureResponse.message) ||
							"Unable to prepare local ACADE support artifacts.",
						requestId: ensureResponse.requestId || preview.requestId,
						warnings: normalizeTitleBlockWorkflowWarnings(
							ensureResponse.warnings || [],
						),
						meta: ensureResponse.meta,
					},
					artifacts: null,
				};
			}
			await projectSetupBackendService.recordResult({
				projectId: payload.projectId,
				action: "ensure-artifacts",
				status: "success",
				requestId: ensureResponse.requestId || preview.requestId,
			});
			return {
				response: {
					...preview,
					message: "ACADE support artifacts are ready.",
					requestId: ensureResponse.requestId || preview.requestId,
					data: {
						...preview.data,
						artifacts:
							ensureResponse.data as unknown as TitleBlockSyncArtifacts,
					},
					warnings: normalizeTitleBlockWorkflowWarnings([
						...(preview.warnings || []),
						...(ensureResponse.warnings || []),
					]),
				},
				artifacts: ensureResponse.data,
			};
		} catch (error) {
			return {
				response: this.buildCompanionFailureResponse(
					error,
					"Unable to prepare local ACADE support artifacts.",
				),
				artifacts: null,
			};
		}
	}

	private buildSelectedRows(
		payload: TitleBlockSyncPayload,
		rows: TitleBlockSyncRow[],
	) {
		const selectedKeys = new Set(
			(payload.selectedRelativePaths || [])
				.map((value) => String(value || "").replace(/\\/g, "/").toLowerCase())
				.filter(Boolean),
		);
		if (selectedKeys.size === 0) {
			return rows.filter((row) => row.fileType === "dwg");
		}
		return rows.filter((row) =>
			selectedKeys.has(row.relativePath.replace(/\\/g, "/").toLowerCase()),
		);
	}

	scan(payload: TitleBlockSyncPayload) {
		return this.buildProjectSetupPreview(payload, { includeRows: false });
	}

	preview(payload: TitleBlockSyncPayload) {
		return this.buildProjectSetupPreview(payload, { includeRows: true });
	}

	async ensureArtifacts(payload: TitleBlockSyncPayload) {
		const preview = await this.buildProjectSetupPreview(payload, {
			includeRows: false,
		});
		const { response } = await this.ensureCompanionArtifacts(payload, preview);
		return response;
	}

	async createProject(payload: TitleBlockSyncPayload) {
		const preview = await this.buildProjectSetupPreview(payload, {
			includeRows: false,
		});
		const ensured = await this.ensureCompanionArtifacts(payload, preview);
		if (!ensured.response.success || !ensured.artifacts || !preview.data) {
			return ensured.response;
		}

		try {
			const ticket = await projectSetupBackendService.issueTicket({
				action: "create-acade",
				projectId: payload.projectId,
				requestId:
					preview.requestId || `title-block-create-${Date.now()}`,
			});
			const result = await projectSetupCompanionService.createAcade(ticket, {
				projectId: payload.projectId,
				projectRootPath: preview.data.projectRootPath,
				wdpPath: ensured.artifacts.wdpPath,
				profile: payload.profile,
			});
			if (!result.success) {
				return {
					success: false,
					code: result.code || "ACADE_CREATE_FAILED",
					message: result.message,
					requestId: result.requestId || preview.requestId,
					warnings: normalizeTitleBlockWorkflowWarnings(result.warnings || []),
					meta: result.meta,
				};
			}
			await projectSetupBackendService.recordResult({
				projectId: payload.projectId,
				action: "create-acade",
				status: "success",
				requestId: result.requestId || preview.requestId,
				data: result.data || null,
			});
			return this.normalizeResponse({
				success: true,
				code: "",
				message: result.message || "ACADE created and activated the project.",
				requestId: result.requestId || preview.requestId,
				data: {
					...preview.data,
					artifacts:
						ensured.artifacts as unknown as TitleBlockSyncArtifacts,
					createProject:
						result.data as TitleBlockSyncResponseData["createProject"],
				},
				warnings: [
					...(preview.warnings || []),
					...(result.warnings || []),
				],
				meta: result.meta,
			});
		} catch (error) {
			return this.buildCompanionFailureResponse(
				error,
				"Support files are ready, but ACADE did not create/register the project.",
			);
		}
	}

	async openProject(payload: TitleBlockSyncPayload) {
		const preview = await this.buildProjectSetupPreview(payload, {
			includeRows: false,
		});
		const ensured = await this.ensureCompanionArtifacts(payload, preview);
		if (!ensured.response.success || !ensured.artifacts || !preview.data) {
			return ensured.response;
		}

		try {
			const ticket = await projectSetupBackendService.issueTicket({
				action: "open-acade",
				projectId: payload.projectId,
				requestId:
					preview.requestId || `title-block-open-${Date.now()}`,
			});
			const result = await projectSetupCompanionService.openAcade(ticket, {
				projectId: payload.projectId,
				projectRootPath: preview.data.projectRootPath,
				wdpPath: ensured.artifacts.wdpPath,
				profile: payload.profile,
			});
			if (!result.success) {
				return {
					success: false,
					code: result.code || "ACADE_OPEN_FAILED",
					message: result.message,
					requestId: result.requestId || preview.requestId,
					warnings: normalizeTitleBlockWorkflowWarnings(result.warnings || []),
					meta: result.meta,
				};
			}
			await projectSetupBackendService.recordResult({
				projectId: payload.projectId,
				action: "open-acade",
				status: "success",
				requestId: result.requestId || preview.requestId,
				data: result.data || null,
			});
			return this.normalizeResponse({
				success: true,
				code: "",
				message: result.message || "ACADE opened and project activated.",
				requestId: result.requestId || preview.requestId,
				data: {
					...preview.data,
					artifacts:
						ensured.artifacts as unknown as TitleBlockSyncArtifacts,
					openProject:
						result.data as TitleBlockSyncResponseData["openProject"],
				},
				warnings: [
					...(preview.warnings || []),
					...(result.warnings || []),
				],
				meta: result.meta,
			});
		} catch (error) {
			return this.buildCompanionFailureResponse(
				error,
				"Support files are ready, but ACADE did not register/open the project.",
			);
		}
	}

	async apply(payload: TitleBlockSyncPayload) {
		const preview = await this.buildProjectSetupPreview(payload, {
			includeRows: true,
		});
		if (!preview.success || !preview.data) {
			return preview;
		}
		const selectedRows = this.buildSelectedRows(payload, preview.data.drawings);
		if (selectedRows.some((row) => row.hasWdTbConflict)) {
			return {
				success: false,
				code: "INVALID_REQUEST",
				message: "WD_TB conflicts must be removed before apply.",
				requestId: preview.requestId,
				warnings: [],
			};
		}

		const ensured = await this.ensureCompanionArtifacts(payload, preview);
		if (!ensured.response.success || !ensured.artifacts) {
			return ensured.response;
		}

		try {
			const ticket = await projectSetupBackendService.issueTicket({
				action: "apply-title-block",
				projectId: payload.projectId,
				requestId:
					preview.requestId || `title-block-apply-${Date.now()}`,
			});
			const result = await projectSetupCompanionService.applyTitleBlock(ticket, {
				blockNameHint:
					preview.data.profile.blockName || payload.profile.blockName,
				triggerAcadeUpdate: payload.triggerAcadeUpdate ?? true,
				projectRootPath: preview.data.projectRootPath,
				expectedWdtPath: ensured.artifacts.wdtPath,
				expectedWdlPath: ensured.artifacts.wdlPath,
				files: selectedRows.map((row) => ({
					path: row.absolutePath,
					relativePath: row.relativePath,
					updates: row.suiteUpdates || {},
					expectedAcadeValues: row.acadeExpectedTags || {},
				})),
			});
			if (!result.success) {
				return {
					success: false,
					code: result.code || "TITLE_BLOCK_APPLY_FAILED",
					message: result.message,
					requestId: result.requestId || preview.requestId,
					warnings: normalizeTitleBlockWorkflowWarnings(result.warnings || []),
					meta: result.meta,
				};
			}
			await projectSetupBackendService.recordResult({
				projectId: payload.projectId,
				action: "apply-title-block",
				status: "success",
				requestId: result.requestId || preview.requestId,
				data: result.data || null,
			});
			return this.normalizeResponse({
				success: true,
				code: "",
				message: result.message || "Title block sync apply completed.",
				requestId: result.requestId || preview.requestId,
				data: {
					...preview.data,
					artifacts:
						ensured.artifacts as unknown as TitleBlockSyncArtifacts,
					selectedRelativePaths: selectedRows.map((row) => row.relativePath),
					apply: result.data,
				},
				warnings: [
					...(preview.warnings || []),
					...(result.warnings || []),
				],
				meta: result.meta,
			});
		} catch (error) {
			return this.buildCompanionFailureResponse(
				error,
				"Title block sync request failed.",
			);
		}
	}
}

export const projectSetupActionService = new ProjectSetupActionService();
