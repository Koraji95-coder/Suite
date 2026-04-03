import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { conduitRouteService } from "./conduitRouteService";
import type { ConduitObstacleScanMeta, Obstacle } from "./conduitRouteTypes";
import { buildTerminalLayout } from "./conduitTerminalEngine";
import { conduitTerminalService } from "./conduitTerminalService";
import type {
	TerminalCadRouteRecord,
	TerminalCadRuntimeStatus,
	TerminalCadSyncDiagnostic,
	TerminalLabelSyncRequest,
	TerminalLayoutResult,
	TerminalRouteRecord,
	TerminalScanData,
	TerminalScanMeta,
} from "./conduitTerminalTypes";
import {
	CAD_DIAGNOSTIC_HISTORY_MAX,
	CAD_SYNC_MAX_RETRIES,
	CAD_SYNC_RETRY_BASE_DELAY_MS,
	DEFAULT_TERMINAL_SCAN_PROFILE,
	TERMINAL_CAD_BACKCHECK_CLEARANCE,
	TERMINAL_CAD_BACKCHECK_REQUIRED,
	delayMs,
	makeDiagnosticId,
	resolveCadProviderPath,
} from "./conduitTerminalWorkflowModel";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

interface JumpScanSummary {
	detectedDefinitions: number;
	nextJumperRef: number;
	unresolved: number;
}

interface UseConduitTerminalCadControllerArgs {
	buildCadRoutePayload: (route: TerminalRouteRecord) => TerminalCadRouteRecord;
	buildTerminalLabelSyncRequest: (
		scanData: TerminalScanData,
	) => TerminalLabelSyncRequest;
	cadSessionId: string;
	connected: boolean;
	overlayObstacles: Obstacle[];
	overlaySyncing: boolean;
	routes: TerminalRouteRecord[];
	routesRef: MutableRefObject<TerminalRouteRecord[]>;
	scanData: TerminalScanData | null;
	scanning: boolean;
	setConnected: StateSetter<boolean>;
	setFromTerminalId: StateSetter<string | null>;
	setHoverTerminalId: StateSetter<string | null>;
	setNextJumperRef: StateSetter<number>;
	setNextRef: StateSetter<Record<string, number>>;
	setOverlayMessage: StateSetter<string>;
	setOverlayMeta: StateSetter<ConduitObstacleScanMeta | null>;
	setOverlayObstacles: StateSetter<Obstacle[]>;
	setOverlaySyncing: StateSetter<boolean>;
	setRoutes: StateSetter<TerminalRouteRecord[]>;
	setScanData: StateSetter<TerminalScanData | null>;
	setScanMeta: StateSetter<TerminalScanMeta | null>;
	setScanning: StateSetter<boolean>;
	setSelectedRouteId: StateSetter<string | null>;
	setStatusMessage: StateSetter<string>;
	summarizeJumperScan: (
		scanData: TerminalScanData,
		layout: TerminalLayoutResult,
		obstacles: Obstacle[],
	) => JumpScanSummary;
}

interface RouteBackcheckResult {
	allowed: boolean;
	code: string;
	message: string;
	overrideReason: string;
	requestId: string;
	status: TerminalRouteRecord["cadBackcheckStatus"];
	warnings: string[];
}

export function useConduitTerminalCadController({
	buildCadRoutePayload,
	buildTerminalLabelSyncRequest,
	cadSessionId,
	connected,
	overlayObstacles,
	overlaySyncing,
	routes,
	routesRef,
	scanData,
	scanning,
	setConnected,
	setFromTerminalId,
	setHoverTerminalId,
	setNextJumperRef,
	setNextRef,
	setOverlayMessage,
	setOverlayMeta,
	setOverlayObstacles,
	setOverlaySyncing,
	setRoutes,
	setScanData,
	setScanMeta,
	setScanning,
	setSelectedRouteId,
	setStatusMessage,
	summarizeJumperScan,
}: UseConduitTerminalCadControllerArgs) {
	const [syncingTerminalLabels, setSyncingTerminalLabels] = useState(false);
	const [resyncingFailed, setResyncingFailed] = useState(false);
	const [preflightChecking, setPreflightChecking] = useState(false);
	const [cadBackcheckOverrideReason, setCadBackcheckOverrideReason] =
		useState("");
	const [cadStatus, setCadStatus] = useState<TerminalCadRuntimeStatus | null>(
		null,
	);
	const [cadDiagnostics, setCadDiagnostics] = useState<
		TerminalCadSyncDiagnostic[]
	>([]);

	const appendCadDiagnostic = (
		entry: Omit<TerminalCadSyncDiagnostic, "id" | "at">,
	) => {
		setCadDiagnostics((current) => {
			const nextEntry: TerminalCadSyncDiagnostic = {
				id: makeDiagnosticId(),
				at: Date.now(),
				...entry,
			};
			return [nextEntry, ...current].slice(0, CAD_DIAGNOSTIC_HISTORY_MAX);
		});
	};

	const applyRouteSyncPatch = (
		routeId: string,
		patch: Partial<TerminalRouteRecord>,
	): boolean => {
		let found = false;
		setRoutes((current) =>
			current.map((route) => {
				if (route.id !== routeId) {
					return route;
				}
				found = true;
				return { ...route, ...patch };
			}),
		);
		return found;
	};

	const refreshCadPreflight =
		async (): Promise<TerminalCadRuntimeStatus | null> => {
			setPreflightChecking(true);
			try {
				const response = await conduitTerminalService.getAutoCadStatus();
				if (response.status) {
					setCadStatus(response.status);
					appendCadDiagnostic({
						operation: "preflight",
						success: response.success,
						code: response.success ? "" : "CAD_PREFLIGHT_FAILED",
						message:
							response.message ||
							(response.success
								? "AutoCAD preflight passed."
								: "AutoCAD preflight check reported unavailable state."),
						providerConfigured:
							response.status.conduit_route_provider?.configured || "unknown",
						providerPath:
							response.status.conduit_route_provider?.configured || "unknown",
					});
				} else {
					appendCadDiagnostic({
						operation: "preflight",
						success: false,
						code: "CAD_PREFLIGHT_FAILED",
						message:
							response.message ||
							`AutoCAD preflight returned ${response.httpStatus || "unknown"} with no status payload.`,
					});
				}
				return response.status ?? null;
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "AutoCAD preflight request failed.";
				appendCadDiagnostic({
					operation: "preflight",
					success: false,
					code: "CAD_PREFLIGHT_NETWORK_FAILED",
					message,
				});
				return null;
			} finally {
				setPreflightChecking(false);
			}
		};

	const syncObstacleOverlay = async (
		targetLayout: TerminalLayoutResult,
	): Promise<{
		count: number;
		message: string;
		obstacles: Obstacle[];
		success: boolean;
	}> => {
		setOverlaySyncing(true);
		try {
			const response = await conduitRouteService.scanObstacles({
				selectionOnly: false,
				includeModelspace: true,
				maxEntities: 50000,
				canvasWidth: targetLayout.canvasWidth,
				canvasHeight: targetLayout.canvasHeight,
			});

			if (response.success && response.data) {
				const obstacles = response.data.obstacles ?? [];
				setOverlayObstacles(obstacles);
				setOverlayMeta(response.meta ?? null);
				setOverlayMessage("");
				return {
					success: true,
					count: obstacles.length,
					message:
						response.message ||
						`Obstacle overlay synced (${obstacles.length} obstacle(s)).`,
					obstacles,
				};
			}

			setOverlayObstacles([]);
			setOverlayMeta(response.meta ?? null);
			setOverlayMessage(response.message || "Obstacle overlay unavailable.");
			return {
				success: false,
				count: 0,
				message: response.message || "Obstacle overlay unavailable.",
				obstacles: [],
			};
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Obstacle overlay sync request failed.";
			setOverlayObstacles([]);
			setOverlayMeta(null);
			setOverlayMessage(message);
			return { success: false, count: 0, message, obstacles: [] };
		} finally {
			setOverlaySyncing(false);
		}
	};

	const syncTerminalLabelsInCad = async (
		targetScanData: TerminalScanData,
	): Promise<{
		message: string;
		providerPath: string;
		success: boolean;
		targetStrips: number;
		updatedStrips: number;
	}> => {
		if (syncingTerminalLabels) {
			return {
				success: false,
				message: "Terminal label sync already in progress.",
				updatedStrips: 0,
				targetStrips: 0,
				providerPath: "client",
			};
		}

		setSyncingTerminalLabels(true);
		try {
			const providerStatus = cadStatus?.conduit_route_provider;
			const response = await conduitTerminalService.syncTerminalLabels(
				buildTerminalLabelSyncRequest(targetScanData),
				{
					mode: "auto",
					providerConfigured:
						typeof providerStatus?.configured === "string"
							? providerStatus.configured
							: "",
					dotnetSenderReady:
						typeof providerStatus?.dotnet_sender_ready === "boolean"
							? providerStatus.dotnet_sender_ready
							: undefined,
				},
			);
			return {
				success: Boolean(response.success),
				message:
					response.message ||
					(response.success
						? "Terminal labels synced to CAD."
						: "Terminal label sync failed."),
				updatedStrips: response.data?.updatedStrips ?? 0,
				targetStrips: response.data?.targetStrips ?? 0,
				providerPath: resolveCadProviderPath(response.meta),
			};
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Terminal label sync failed unexpectedly.";
			return {
				success: false,
				message,
				updatedStrips: 0,
				targetStrips: 0,
				providerPath: "client",
			};
		} finally {
			setSyncingTerminalLabels(false);
		}
	};

	const runScan = async (messagePrefix: string) => {
		if (scanning) return;
		setScanning(true);
		setStatusMessage(messagePrefix);
		const preflightStatus = await refreshCadPreflight();
		const response = await conduitTerminalService.scanTerminalStrips({
			selectionOnly: false,
			includeModelspace: true,
			maxEntities: 50000,
			terminalProfile: DEFAULT_TERMINAL_SCAN_PROFILE,
		});
		setScanning(false);

		if (response.success && response.data) {
			setConnected(true);
			setScanData(response.data);
			setScanMeta(response.meta ?? null);
			setFromTerminalId(null);
			setHoverTerminalId(null);
			setSelectedRouteId(null);
			const panelCount = Object.keys(response.data.panels).length;
			const terminalCount = response.meta?.totalTerminals ?? 0;
			const nextLayout = buildTerminalLayout(response.data);
			const obstacleResult = await syncObstacleOverlay(nextLayout);
			const jumperSummary = summarizeJumperScan(
				response.data,
				nextLayout,
				obstacleResult.obstacles,
			);
			setRoutes([]);
			setNextJumperRef(jumperSummary.nextJumperRef);
			setNextRef({});
			const labelSyncResult = await syncTerminalLabelsInCad(response.data);
			const baseMessage =
				response.message ||
				`Scan loaded ${panelCount} panel(s) and ${terminalCount} terminal(s).`;
			const jumperSuffix =
				jumperSummary.detectedDefinitions > 0
					? ` Detected ${jumperSummary.detectedDefinitions} jumper definition(s); manual jumper mode is active.`
					: "";
			const unresolvedSuffix =
				jumperSummary.unresolved > 0
					? ` ${jumperSummary.unresolved} detected jumper definition(s) did not map cleanly to scanned terminals.`
					: "";
			const preflightSuffix =
				preflightStatus && preflightStatus.drawing_open
					? " CAD preflight: drawing open."
					: preflightStatus
						? " CAD preflight: drawing not open."
						: "";
			const overlaySuffix = obstacleResult.success
				? ` Obstacle overlay: ${obstacleResult.count}.`
				: " Obstacle overlay unavailable.";
			const labelSyncSuffix = labelSyncResult.success
				? ` Label sync: ${labelSyncResult.updatedStrips}/${Math.max(1, labelSyncResult.targetStrips)} strip(s) updated via ${labelSyncResult.providerPath}.`
				: ` Label sync failed: ${labelSyncResult.message}`;
			setStatusMessage(
				`${baseMessage}${jumperSuffix}${unresolvedSuffix}${preflightSuffix}${overlaySuffix}${labelSyncSuffix}`,
			);
			return;
		}

		if (response.data) {
			setConnected(true);
			setScanData(response.data);
			setScanMeta(response.meta ?? null);
			setRoutes([]);
			setNextRef({});
			setNextJumperRef(1);
			setSelectedRouteId(null);
			setOverlayObstacles([]);
			setOverlayMeta(null);
			setOverlayMessage("");
			setStatusMessage(
				`${response.message || "No terminal strips detected. Check block naming and attributes."}${
					preflightStatus && !preflightStatus.drawing_open
						? " CAD preflight indicates no active drawing."
						: ""
				}`,
			);
			return;
		}

		setConnected(false);
		setScanData(null);
		setScanMeta(null);
		setOverlayObstacles([]);
		setOverlayMeta(null);
		setOverlayMessage("");
		setFromTerminalId(null);
		setHoverTerminalId(null);
		setNextRef({});
		setNextJumperRef(1);
		setStatusMessage(
			`${response.message || "Terminal scan failed."}${
				preflightStatus && !preflightStatus.drawing_open
					? " CAD preflight indicates no active drawing."
					: ""
			}`,
		);
	};

	const connectAndScan = () => {
		void runScan("Connecting bridge and scanning terminal strips...");
	};

	const rescan = () => {
		void runScan("Rescanning terminal strips...");
	};

	const rescanOverlay = () => {
		if (!connected || !scanData || overlaySyncing) {
			return;
		}
		const nextLayout = buildTerminalLayout(scanData);
		void (async () => {
			const result = await syncObstacleOverlay(nextLayout);
			setStatusMessage(
				result.success
					? `Obstacle overlay synced (${result.count} obstacle(s)).`
					: result.message || "Obstacle overlay sync failed.",
			);
		})();
	};

	const syncTerminalLabelsNow = () => {
		if (!connected || !scanData) {
			setStatusMessage("Connect and scan before syncing terminal labels.");
			return;
		}
		void (async () => {
			const result = await syncTerminalLabelsInCad(scanData);
			if (result.success) {
				setStatusMessage(
					`Terminal labels synced to CAD (${result.updatedStrips}/${Math.max(1, result.targetStrips)} strip(s) updated via ${result.providerPath}).`,
				);
				return;
			}
			setStatusMessage(`Terminal label sync failed: ${result.message}`);
		})();
	};

	const runRouteCadBackcheck = async (
		route: TerminalRouteRecord,
	): Promise<RouteBackcheckResult> => {
		if (!TERMINAL_CAD_BACKCHECK_REQUIRED) {
			return {
				allowed: true,
				status: "not_run",
				code: "",
				message: "CAD backcheck gate disabled by configuration.",
				requestId: "",
				warnings: [],
				overrideReason: "",
			};
		}

		const response = await conduitRouteService.backcheckRoutes({
			routes: [
				{
					id: route.id,
					ref: route.ref,
					mode: "plan_view",
					path:
						route.cadPath && route.cadPath.length >= 2 ? route.cadPath : route.path,
				},
			],
			obstacles: overlayObstacles,
			obstacleSource: overlayObstacles.length > 0 ? "autocad" : "client",
			clearance: TERMINAL_CAD_BACKCHECK_CLEARANCE,
		});
		if (!response.success) {
			return {
				allowed: false,
				status: "error",
				code: response.code || "BACKCHECK_REQUEST_FAILED",
				message: response.message || "Route backcheck request failed.",
				requestId: response.requestId || "",
				warnings: response.warnings || [],
				overrideReason: "",
			};
		}

		const finding = response.findings?.[0];
		const status = finding?.status || "pass";
		const message =
			finding?.issues?.[0]?.message ||
			response.message ||
			"Route backcheck completed.";
		const warnings = [
			...(response.warnings || []),
			...(finding?.issues
				?.filter((issue) => issue.severity === "warn")
				.map((issue) => issue.message) || []),
		];
		const requestId = response.requestId || "";
		const overrideReason = cadBackcheckOverrideReason.trim();

		if (status === "fail") {
			if (!overrideReason) {
				return {
					allowed: false,
					status: "fail",
					code: "BACKCHECK_FAIL_REQUIRES_OVERRIDE",
					message:
						"Backcheck returned fail findings. Provide an override reason before CAD sync.",
					requestId,
					warnings,
					overrideReason: "",
				};
			}
			return {
				allowed: true,
				status: "overridden",
				code: "BACKCHECK_FAIL_OVERRIDDEN",
				message: "Backcheck fail findings overridden for this CAD sync attempt.",
				requestId,
				warnings,
				overrideReason,
			};
		}

		if (status === "warn") {
			return {
				allowed: true,
				status: "warn",
				code: "BACKCHECK_WARN",
				message,
				requestId,
				warnings,
				overrideReason: "",
			};
		}

		return {
			allowed: true,
			status: "pass",
			code: "BACKCHECK_PASS",
			message,
			requestId,
			warnings,
			overrideReason: "",
		};
	};

	const syncRouteToCad = async (
		route: TerminalRouteRecord,
		attempt = 0,
	): Promise<boolean> => {
		if (!connected || !scanData) {
			return false;
		}
		if (cadStatus && !cadStatus.drawing_open) {
			const preflightError =
				cadStatus.error ||
				"No drawing open in AutoCAD according to preflight status.";
			applyRouteSyncPatch(route.id, {
				cadSyncStatus: "failed",
				cadLastError: preflightError,
				cadLastCode: "CAD_PREFLIGHT_DRAWING_NOT_OPEN",
				cadLastMessage: preflightError,
				cadWarnings: [],
				cadRequestId: "",
				cadBridgeRequestId: "",
				cadProviderPath:
					cadStatus.conduit_route_provider?.configured || "unknown",
				cadLastOperation: "upsert",
			});
			appendCadDiagnostic({
				operation: "upsert",
				success: false,
				routeId: route.id,
				routeRef: route.ref,
				code: "CAD_PREFLIGHT_DRAWING_NOT_OPEN",
				message: preflightError,
				providerPath: cadStatus.conduit_route_provider?.configured || "unknown",
				providerConfigured:
					cadStatus.conduit_route_provider?.configured || "unknown",
			});
			setStatusMessage(
				`${route.ref} routed in app, but CAD sync blocked by preflight (no drawing open).`,
			);
			return false;
		}
		const stillPresent = routesRef.current.some(
			(entry) => entry.id === route.id,
		);
		if (!stillPresent) {
			appendCadDiagnostic({
				operation: "upsert",
				success: false,
				routeId: route.id,
				routeRef: route.ref,
				code: "CAD_ROUTE_NOT_ACTIVE",
				message:
					"Skipped CAD sync because route is no longer active in app state.",
				providerPath: "client",
			});
			return false;
		}

		if (attempt === 0) {
			let backcheckGateResult: RouteBackcheckResult | null = null;
			try {
				backcheckGateResult = await runRouteCadBackcheck(route);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Route backcheck request failed unexpectedly.";
				backcheckGateResult = {
					allowed: false,
					status: "error",
					code: "BACKCHECK_REQUEST_FAILED",
					message,
					requestId: "",
					warnings: [],
					overrideReason: "",
				};
			}

			if (backcheckGateResult.status !== "not_run") {
				applyRouteSyncPatch(route.id, {
					cadBackcheckStatus: backcheckGateResult.status,
					cadBackcheckRequestId: backcheckGateResult.requestId,
					cadBackcheckMessage: backcheckGateResult.message,
					cadBackcheckWarnings: backcheckGateResult.warnings,
					cadBackcheckOverrideReason: backcheckGateResult.overrideReason,
				});
				appendCadDiagnostic({
					operation: "backcheck",
					success: backcheckGateResult.allowed,
					routeId: route.id,
					routeRef: route.ref,
					code: backcheckGateResult.code,
					message: backcheckGateResult.message,
					warnings: backcheckGateResult.warnings,
					requestId: backcheckGateResult.requestId,
					providerPath: "backend",
					providerConfigured: "route-backcheck",
				});
			}

			if (!backcheckGateResult.allowed) {
				applyRouteSyncPatch(route.id, {
					cadSyncStatus: "failed",
					cadLastError: backcheckGateResult.message,
					cadLastCode: backcheckGateResult.code,
					cadLastMessage: backcheckGateResult.message,
					cadWarnings: backcheckGateResult.warnings,
					cadRequestId: backcheckGateResult.requestId,
					cadBridgeRequestId: "",
					cadProviderPath: "backend",
					cadLastOperation: "upsert",
				});
				setStatusMessage(
					`${route.ref} blocked before CAD sync: ${backcheckGateResult.message}`,
				);
				return false;
			}
		}

		applyRouteSyncPatch(route.id, {
			cadSyncStatus: "pending",
			cadSyncAttempts: attempt + 1,
			cadLastError: "",
		});

		try {
			const response = await conduitTerminalService.drawTerminalRoutes({
				operation: "upsert",
				sessionId: cadSessionId,
				clientRouteId: route.id,
				route: buildCadRoutePayload(route),
				defaultLayerName: "SUITE_WIRE_AUTO",
				annotateRefs: true,
				textHeight: 0.125,
			});
			const providerPath = resolveCadProviderPath(response.meta);
			const drawnLines = response.data?.drawnLines ?? 0;
			const drawnArcs = response.data?.drawnArcs ?? 0;
			const filletAppliedCorners = response.data?.filletAppliedCorners ?? 0;
			const filletSkippedCorners = response.data?.filletSkippedCorners ?? 0;
			const geometryVersion = response.data?.geometryVersion ?? "";
			const geometrySuffix =
				geometryVersion ||
				drawnLines ||
				drawnArcs ||
				filletAppliedCorners ||
				filletSkippedCorners
					? ` [${geometryVersion || "geom"} ${drawnLines}L/${drawnArcs}A fillet ${filletAppliedCorners}/${filletSkippedCorners}]`
					: "";
			const responseMessage =
				(response.message ||
					`Route ${route.ref} ${response.success ? "synced" : "failed"} in AutoCAD sync.`) +
				geometrySuffix;
			const warnings = response.warnings ?? [];
			const code = response.code || "";
			const requestId = response.meta?.requestId || "";
			const bridgeRequestId = response.meta?.bridgeRequestId || "";
			if (response.success) {
				const handles =
					response.data?.bindings?.[route.id]?.entityHandles ??
					route.cadEntityHandles ??
					[];
				applyRouteSyncPatch(route.id, {
					cadSyncStatus: "synced",
					cadLastError: "",
					cadLastCode: code,
					cadLastMessage: responseMessage,
					cadWarnings: warnings,
					cadRequestId: requestId,
					cadBridgeRequestId: bridgeRequestId,
					cadProviderPath: providerPath,
					cadLastOperation: "upsert",
					cadEntityHandles: handles,
					cadSyncedAt: Date.now(),
				});
				appendCadDiagnostic({
					operation: "upsert",
					success: true,
					routeId: route.id,
					routeRef: route.ref,
					code,
					message: responseMessage,
					warnings,
					requestId,
					bridgeRequestId,
					providerPath,
					providerConfigured: response.meta?.providerConfigured,
					drawnLines: response.data?.drawnLines,
					drawnArcs: response.data?.drawnArcs,
					filletAppliedCorners: response.data?.filletAppliedCorners,
					filletSkippedCorners: response.data?.filletSkippedCorners,
					geometryVersion: response.data?.geometryVersion,
				});
				return true;
			}
			const errorMessage =
				response.message || "AutoCAD route sync failed for committed route.";
			if (attempt < CAD_SYNC_MAX_RETRIES) {
				await delayMs(CAD_SYNC_RETRY_BASE_DELAY_MS * (attempt + 1));
				return syncRouteToCad(route, attempt + 1);
			}
			applyRouteSyncPatch(route.id, {
				cadSyncStatus: "failed",
				cadLastError: errorMessage,
				cadLastCode: code,
				cadLastMessage: responseMessage,
				cadWarnings: warnings,
				cadRequestId: requestId,
				cadBridgeRequestId: bridgeRequestId,
				cadProviderPath: providerPath,
				cadLastOperation: "upsert",
			});
			appendCadDiagnostic({
				operation: "upsert",
				success: false,
				routeId: route.id,
				routeRef: route.ref,
				code,
				message: responseMessage,
				warnings,
				requestId,
				bridgeRequestId,
				providerPath,
				providerConfigured: response.meta?.providerConfigured,
				drawnLines: response.data?.drawnLines,
				drawnArcs: response.data?.drawnArcs,
				filletAppliedCorners: response.data?.filletAppliedCorners,
				filletSkippedCorners: response.data?.filletSkippedCorners,
				geometryVersion: response.data?.geometryVersion,
			});
			setStatusMessage(
				`${route.ref} routed in app, but CAD sync failed (${code || "unknown"}). Use Resync Failed.`,
			);
			return false;
		} catch (error) {
			if (attempt < CAD_SYNC_MAX_RETRIES) {
				await delayMs(CAD_SYNC_RETRY_BASE_DELAY_MS * (attempt + 1));
				return syncRouteToCad(route, attempt + 1);
			}
			const errorMessage =
				error instanceof Error
					? error.message
					: "CAD route sync request failed unexpectedly.";
			applyRouteSyncPatch(route.id, {
				cadSyncStatus: "failed",
				cadLastError: errorMessage,
				cadLastCode: "NETWORK_ERROR",
				cadLastMessage: errorMessage,
				cadWarnings: [],
				cadRequestId: "",
				cadBridgeRequestId: "",
				cadProviderPath: "client",
				cadLastOperation: "upsert",
			});
			appendCadDiagnostic({
				operation: "upsert",
				success: false,
				routeId: route.id,
				routeRef: route.ref,
				code: "NETWORK_ERROR",
				message: errorMessage,
				warnings: [],
				providerPath: "client",
			});
			setStatusMessage(
				`${route.ref} routed in app, but CAD sync failed (NETWORK_ERROR). Use Resync Failed.`,
			);
			return false;
		}
	};

	const deleteRouteFromCad = async (
		routeId: string,
		routeRefLabel: string,
	): Promise<void> => {
		if (!connected || !scanData) {
			return;
		}
		try {
			const response = await conduitTerminalService.drawTerminalRoutes({
				operation: "delete",
				sessionId: cadSessionId,
				clientRouteId: routeId,
			});
			appendCadDiagnostic({
				operation: "delete",
				success: Boolean(response.success),
				routeId,
				routeRef: routeRefLabel,
				code: response.code || "",
				message:
					response.message ||
					`Delete route ${routeRefLabel} ${response.success ? "completed" : "failed"}.`,
				warnings: response.warnings ?? [],
				requestId: response.meta?.requestId,
				bridgeRequestId: response.meta?.bridgeRequestId,
				providerPath: resolveCadProviderPath(response.meta),
				providerConfigured: response.meta?.providerConfigured,
			});
			if (!response.success) {
				setStatusMessage(
					`${response.message || `${routeRefLabel} removed in app but CAD delete failed.`} (${response.code || "unknown"})`,
				);
			}
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: `${routeRefLabel} removed in app but CAD delete failed.`;
			appendCadDiagnostic({
				operation: "delete",
				success: false,
				routeId,
				routeRef: routeRefLabel,
				code: "NETWORK_ERROR",
				message,
				providerPath: "client",
			});
			setStatusMessage(
				`${routeRefLabel} removed in app but CAD delete failed.`,
			);
		}
	};

	const resetCadSessionRoutes = async (): Promise<void> => {
		if (!connected || !scanData) {
			return;
		}
		try {
			const response = await conduitTerminalService.drawTerminalRoutes({
				operation: "reset",
				sessionId: cadSessionId,
			});
			appendCadDiagnostic({
				operation: "reset",
				success: Boolean(response.success),
				code: response.code || "",
				message:
					response.message ||
					`Reset CAD sync session ${response.success ? "completed" : "failed"}.`,
				warnings: response.warnings ?? [],
				requestId: response.meta?.requestId,
				bridgeRequestId: response.meta?.bridgeRequestId,
				providerPath: resolveCadProviderPath(response.meta),
				providerConfigured: response.meta?.providerConfigured,
			});
			if (!response.success) {
				setStatusMessage(
					`${response.message || "Routes cleared in app, but CAD session reset failed."} (${response.code || "unknown"})`,
				);
			}
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Routes cleared in app, but CAD session reset failed.";
			appendCadDiagnostic({
				operation: "reset",
				success: false,
				code: "NETWORK_ERROR",
				message,
				providerPath: "client",
			});
			setStatusMessage("Routes cleared in app, but CAD session reset failed.");
		}
	};

	const resyncFailedRoutes = async () => {
		if (resyncingFailed) {
			return;
		}
		const failedRoutes = routesRef.current.filter(
			(route) => route.cadSyncStatus === "failed",
		);
		if (failedRoutes.length === 0) {
			setStatusMessage("No failed CAD routes to resync.");
			return;
		}

		setResyncingFailed(true);
		let recovered = 0;
		for (const route of failedRoutes) {
			const ok = await syncRouteToCad(route);
			if (ok) {
				recovered += 1;
			}
		}
		setResyncingFailed(false);
		setStatusMessage(
			`Resync complete: ${recovered}/${failedRoutes.length} failed route(s) recovered.`,
		);
	};

	const disconnect = () => {
		if (routesRef.current.length > 0) {
			void resetCadSessionRoutes();
		}
		setConnected(false);
		setCadStatus(null);
		setScanning(false);
		setScanData(null);
		setScanMeta(null);
		setOverlayObstacles([]);
		setOverlayMeta(null);
		setOverlayMessage("");
		setFromTerminalId(null);
		setHoverTerminalId(null);
		setStatusMessage("Bridge disconnected.");
	};

	const clearRoutes = () => {
		const clearedCount = routesRef.current.length;
		routesRef.current = [];
		setRoutes([]);
		setSelectedRouteId(null);
		setFromTerminalId(null);
		if (clearedCount > 0) {
			void resetCadSessionRoutes();
		}
		setStatusMessage(
			clearedCount > 0
				? "Terminal route history cleared and CAD reset requested."
				: "Terminal route history cleared.",
		);
	};

	const undoRoute = () => {
		if (routes.length === 0) {
			setStatusMessage("Nothing to undo.");
			return;
		}
		const latest = routes[0];
		routesRef.current = routes.slice(1);
		setRoutes((current) => current.slice(1));
		setSelectedRouteId(null);
		if (latest) {
			void deleteRouteFromCad(latest.id, latest.ref);
		}
		setStatusMessage("Latest terminal route removed.");
	};

	return {
		cadBackcheckOverrideReason,
		cadDiagnostics,
		cadStatus,
		clearRoutes,
		connectAndScan,
		disconnect,
		preflightChecking,
		rescan,
		rescanOverlay,
		resyncFailedRoutes,
		resyncingFailed,
		runScan,
		setCadBackcheckOverrideReason,
		syncRouteToCad,
		syncTerminalLabelsNow,
		syncingTerminalLabels,
		undoRoute,
	};
}
