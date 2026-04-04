import { useState } from "react";
import { conduitRouteService } from "./conduitRouteService";
import type {
	ConduitObstacleSource,
	ConduitRouteBackcheckResponse,
	ConduitRouteRecord,
	Obstacle,
} from "./conduitRouteTypes";

interface UseConduitCadReviewControllerArgs {
	setStatusMessage: (message: string) => void;
}

export function useConduitCadReviewController({
	setStatusMessage,
}: UseConduitCadReviewControllerArgs) {
	const [routeBackchecking, setRouteBackchecking] = useState(false);
	const [routeBackcheckReport, setRouteBackcheckReport] =
		useState<ConduitRouteBackcheckResponse | null>(null);

	const clearCadReviewState = () => {
		setRouteBackcheckReport(null);
	};

	const runRouteBackcheck = async (args: {
		activeObstacles: Obstacle[];
		clearance: number;
		obstacleSource: ConduitObstacleSource;
		obstacleSyncing: boolean;
		routeComputing: boolean;
		routes: ConduitRouteRecord[];
	}) => {
		const {
			activeObstacles,
			clearance,
			obstacleSource,
			obstacleSyncing,
			routeComputing,
			routes,
		} = args;
		if (routeBackchecking || routeComputing || obstacleSyncing) {
			return;
		}
		if (routes.length === 0) {
			setStatusMessage("Create at least one route before running backcheck.");
			return;
		}

		setRouteBackchecking(true);
		setStatusMessage(`Running backcheck for ${routes.length} route(s)...`);

		const response = await conduitRouteService.backcheckRoutes({
			routes: routes.map((route) => ({
				id: route.id,
				ref: route.ref,
				mode: route.mode,
				path: route.path,
			})),
			obstacles: activeObstacles,
			obstacleSource,
			clearance,
		});

		setRouteBackchecking(false);
		if (!response.success) {
			setStatusMessage(response.message || "Route backcheck failed.");
			return;
		}

		setRouteBackcheckReport(response);
		const summary = response.summary;
		if (summary) {
			setStatusMessage(
				`Backcheck complete: ${summary.pass_count} pass, ${summary.warn_count} warn, ${summary.fail_count} fail.`,
			);
			return;
		}
		setStatusMessage("Backcheck complete.");
	};

	const exportBackcheckJson = () => {
		if (!routeBackcheckReport) {
			setStatusMessage("Run backcheck first to export a report.");
			return;
		}
		const payload = JSON.stringify(routeBackcheckReport, null, 2);
		const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		anchor.href = url;
		anchor.download = `autowire-backcheck-${stamp}.json`;
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
		setStatusMessage("Exported backcheck report JSON.");
	};

	return {
		clearCadReviewState,
		exportBackcheckJson,
		routeBackcheckReport,
		routeBackchecking,
		runRouteBackcheck,
	};
}
