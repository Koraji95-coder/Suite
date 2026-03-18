import { useMemo, useState } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./conduitRouteData";
import {
	bendCount,
	pathLength,
	routeTagPosition,
} from "./conduitRouteEngine";
import { conduitRouteService } from "./conduitRouteService";
import type {
	CableSystemType,
	ConduitObstacleSource,
	ConduitRouteComputeData,
	ConduitRouteComputeMeta,
	ConduitRouteRecord,
	Obstacle,
	ObstacleType,
	Point2D,
	RoutingMode,
} from "./conduitRouteTypes";
import {
	buildNextConduitRef,
	buildConduitScheduleRows,
	type ConduitScheduleRow,
} from "./conduitRouteCanvasControllerUtils";
import {
	formatLength,
	makeRouteId,
	toCsvValue,
} from "./conduitRouteViewModel";

interface UseConduitRouteCanvasControllerArgs {
	mode: RoutingMode;
	cableType: CableSystemType;
	wireFunction: string;
	clearance: number;
	activeColor: {
		code: string;
		hex: string;
		stroke: string;
		aci: number;
	};
	activeObstacles: Obstacle[];
	obstacleSource: ConduitObstacleSource;
	obstacleLayerNames: string[];
	obstacleLayerTypeOverrides: Record<string, ObstacleType>;
	obstacleLayerPreset: string;
	obstacleSyncing: boolean;
	routeBackchecking: boolean;
	setStatusMessage: (message: string) => void;
	onResolvedObstacles?: (obstacles: Obstacle[]) => void;
	onRouteMutation?: () => void;
}

export function useConduitRouteCanvasController({
	mode,
	cableType,
	wireFunction,
	clearance,
	activeColor,
	activeObstacles,
	obstacleSource,
	obstacleLayerNames,
	obstacleLayerTypeOverrides,
	obstacleLayerPreset,
	obstacleSyncing,
	routeBackchecking,
	setStatusMessage,
	onResolvedObstacles,
	onRouteMutation,
}: UseConduitRouteCanvasControllerArgs) {
	const [startPoint, setStartPoint] = useState<Point2D | null>(null);
	const [hoverPoint, setHoverPoint] = useState<Point2D | null>(null);
	const [routes, setRoutes] = useState<ConduitRouteRecord[]>([]);
	const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
	const [nextRef, setNextRef] = useState<Record<CableSystemType, number>>({
		AC: 1,
		DC: 1,
	});
	const [routeComputing, setRouteComputing] = useState(false);
	const [lastComputeMeta, setLastComputeMeta] =
		useState<ConduitRouteComputeMeta | null>(null);

	const scheduleRows = useMemo<ConduitScheduleRow[]>(
		() => buildConduitScheduleRows(routes),
		[routes],
	);

	const handleCanvasPoint = (
		event: React.MouseEvent<SVGSVGElement>,
	): Point2D => {
		const rect = event.currentTarget.getBoundingClientRect();
		const x = Math.max(0, Math.min(CANVAS_WIDTH, event.clientX - rect.left));
		const y = Math.max(0, Math.min(CANVAS_HEIGHT, event.clientY - rect.top));
		return { x, y };
	};

	const handleCanvasHover = (event: React.MouseEvent<SVGSVGElement>) => {
		if (routeComputing || obstacleSyncing || routeBackchecking) {
			return;
		}
		setHoverPoint(handleCanvasPoint(event));
	};

	const handleCanvasClick = (event: React.MouseEvent<SVGSVGElement>) => {
		const clickPoint = handleCanvasPoint(event);
		if (routeComputing || obstacleSyncing || routeBackchecking) {
			return;
		}
		if (!startPoint) {
			setStartPoint(clickPoint);
			setStatusMessage("Start point locked. Click destination point to route.");
			return;
		}

		const lockedStart = startPoint;
		const ref = buildNextConduitRef(cableType, nextRef);
		const routeId = makeRouteId();
		const tagText = mode === "cable_tag" ? `${ref} Z01` : "";

		setRouteComputing(true);
		setHoverPoint(null);
		setStatusMessage("Computing route via backend...");

		void (async () => {
			let computeMeta: ConduitRouteComputeMeta | null = null;
			let responseData: ConduitRouteComputeData | null = null;

			try {
				const response = await conduitRouteService.computeRoute({
					start: lockedStart,
					end: clickPoint,
					mode,
					clearance,
					obstacles: activeObstacles,
					obstacleSource,
					obstacleScan:
						obstacleSource === "autocad"
							? {
									selectionOnly: false,
									includeModelspace: true,
									maxEntities: 50000,
									layerNames: obstacleLayerNames,
									layerTypeOverrides: obstacleLayerTypeOverrides,
									layerPreset: obstacleLayerPreset,
								}
							: undefined,
					canvasWidth: CANVAS_WIDTH,
					canvasHeight: CANVAS_HEIGHT,
					gridStep: 8,
					tagText: tagText || undefined,
				});

				computeMeta = {
					...(response.meta ?? {}),
					routeValid:
						response.success && response.data
							? response.meta?.routeValid ?? true
							: false,
				};
				setLastComputeMeta(computeMeta);

				if (!response.success || !response.data) {
					setHoverPoint(null);
					setStartPoint(lockedStart);
					setRouteComputing(false);
					setStatusMessage(
						response.message ||
							`${ref} could not be routed. The dashed line is only a sketch; adjust the destination or obstacle scope.`,
					);
					return;
				}

				responseData = response.data;
				if (
					obstacleSource === "autocad" &&
					Array.isArray(response.data.resolvedObstacles) &&
					response.data.resolvedObstacles.length > 0
				) {
					onResolvedObstacles?.(response.data.resolvedObstacles);
				}
			} catch {
				setLastComputeMeta({
					routeValid: false,
					fallbackUsed: false,
					source: "frontend",
				});
				setHoverPoint(null);
				setStartPoint(lockedStart);
				setStatusMessage(
					`${ref} could not be routed because the compute request failed. Adjust the route or retry the backend request.`,
				);
				setRouteComputing(false);
				return;
			}

			const path = responseData?.path ?? [];
			const bends = responseData?.bendCount ?? bendCount(path);
			const length = responseData?.length ?? pathLength(path);
			const tag =
				responseData?.tag ??
				(mode === "cable_tag" ? routeTagPosition(path, `${ref} Z01`) : null);

			const route: ConduitRouteRecord = {
				id: routeId,
				ref,
				mode,
				cableType,
				wireFunction,
				color: activeColor,
				start: lockedStart,
				end: clickPoint,
				path,
				length,
				bendCount: bends,
				bendDegrees: bends * 90,
				tag,
				createdAt: Date.now(),
			};

			onRouteMutation?.();
			setRoutes((current) => [route, ...current]);
			setSelectedRouteId(route.id);
			setNextRef((current) => ({
				...current,
				[cableType]: current[cableType] + 1,
			}));
			setLastComputeMeta(computeMeta);
			setStartPoint(null);
			setHoverPoint(null);
			setRouteComputing(false);

			if (route.bendDegrees > 360) {
				setStatusMessage(
					`${route.ref} routed with ${route.bendDegrees} deg bends. Add a pull point before construction release.`,
				);
				return;
			}

			const computeMs = computeMeta?.computeMs ?? computeMeta?.requestMs;
			const timing = computeMs ? ` in ${computeMs} ms` : "";
			setStatusMessage(
				`${route.ref} routed${timing}: ${formatLength(length)} with ${bends} bends (${route.bendDegrees} deg).`,
			);
		})();
	};

	const clearAllRoutes = () => {
		setRoutes([]);
		setSelectedRouteId(null);
		setStartPoint(null);
		setHoverPoint(null);
		setLastComputeMeta(null);
		setRouteComputing(false);
		onRouteMutation?.();
		setStatusMessage("Route history cleared.");
	};

	const undoLastRoute = () => {
		if (routes.length === 0) {
			setStatusMessage("Nothing to undo.");
			return;
		}
		onRouteMutation?.();
		setRoutes((current) => current.slice(1));
		setSelectedRouteId(null);
		if (routes.length <= 1) {
			setLastComputeMeta(null);
		}
		setStatusMessage("Removed latest route.");
	};

	const removeRoute = (routeId: string) => {
		onRouteMutation?.();
		setRoutes((current) => current.filter((route) => route.id !== routeId));
		if (selectedRouteId === routeId) {
			setSelectedRouteId(null);
		}
		if (routes.length <= 1) {
			setLastComputeMeta(null);
		}
		setStatusMessage("Route removed.");
	};

	const exportScheduleCsv = () => {
		if (scheduleRows.length === 0) {
			setStatusMessage("No schedule rows available to export.");
			return;
		}
		const header = ["Ref", "Type", "Fn", "Color", "From", "To", "LengthPx"];
		const lines = [header.join(",")];
		for (const row of scheduleRows) {
			lines.push(
				[
					toCsvValue(row.ref),
					toCsvValue(row.type),
					toCsvValue(row.fn),
					toCsvValue(row.color),
					toCsvValue(row.from),
					toCsvValue(row.to),
					toCsvValue(row.length),
				].join(","),
			);
		}
		const csvText = lines.join("\r\n");
		const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		anchor.href = url;
		anchor.download = `conduit-route-schedule-${stamp}.csv`;
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
		setStatusMessage(`Exported ${scheduleRows.length} schedule row(s) to CSV.`);
	};

	return {
		clearAllRoutes,
		exportScheduleCsv,
		handleCanvasClick,
		handleCanvasHover,
		hoverPoint,
		lastComputeMeta,
		nextRef,
		removeRoute,
		routeComputing,
		routes,
		scheduleRows,
		selectedRouteId,
		setHoverPoint,
		setSelectedRouteId,
		startPoint,
		undoLastRoute,
	};
}
