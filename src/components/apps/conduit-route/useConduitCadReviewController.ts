import { useState } from "react";
import { agentService } from "@/services/agentService";
import { conduitRouteService } from "./conduitRouteService";
import type {
	ConduitObstacleSource,
	ConduitRouteBackcheckResponse,
	ConduitRouteRecord,
	Obstacle,
} from "./conduitRouteTypes";
import {
	type CrewReviewEntry,
	buildCadCrewReviewPrompt,
	extractAgentResponseText,
} from "./conduitRouteViewModel";

interface UseConduitCadReviewControllerArgs {
	setStatusMessage: (message: string) => void;
}

export function useConduitCadReviewController({
	setStatusMessage,
}: UseConduitCadReviewControllerArgs) {
	const [routeBackchecking, setRouteBackchecking] = useState(false);
	const [routeBackcheckReport, setRouteBackcheckReport] =
		useState<ConduitRouteBackcheckResponse | null>(null);
	const [crewReviewEntries, setCrewReviewEntries] = useState<CrewReviewEntry[]>(
		[],
	);
	const [crewReviewError, setCrewReviewError] = useState<string | null>(null);
	const [crewReviewLoading, setCrewReviewLoading] = useState(false);

	const clearCadReviewState = () => {
		setRouteBackcheckReport(null);
		setCrewReviewEntries([]);
		setCrewReviewError(null);
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
		setCrewReviewEntries([]);
		setCrewReviewError(null);
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

	const runCadCrewReview = async (args: {
		obstacleSyncing: boolean;
		routeComputing: boolean;
	}) => {
		const { obstacleSyncing, routeComputing } = args;
		if (!routeBackcheckReport) {
			setCrewReviewError("Run backcheck first before requesting CAD crew review.");
			return;
		}
		if (
			crewReviewLoading ||
			routeBackchecking ||
			routeComputing ||
			obstacleSyncing
		) {
			return;
		}

		setCrewReviewLoading(true);
		setCrewReviewError(null);
		setCrewReviewEntries([]);

		const entries: CrewReviewEntry[] = [];
		try {
			entries.push({ profileId: "draftsmith", status: "running" });
			setCrewReviewEntries([...entries]);
			const draftsmithResult = await agentService.sendMessage(
				buildCadCrewReviewPrompt({
					profileId: "draftsmith",
					report: routeBackcheckReport,
				}),
				{
					profileId: "draftsmith",
					promptMode: "template",
					templateLabel: "AutoWire backcheck review",
				},
			);
			if (!draftsmithResult.success) {
				entries[0] = {
					profileId: "draftsmith",
					status: "failed",
					error: draftsmithResult.error || "Draftsmith review failed.",
				};
				setCrewReviewEntries([...entries]);
				setCrewReviewError(entries[0].error || "Draftsmith review failed.");
				setStatusMessage(entries[0].error || "Draftsmith review failed.");
				return;
			}

			const draftsmithText = extractAgentResponseText(draftsmithResult.data);
			entries[0] = {
				profileId: "draftsmith",
				status: "completed",
				response: draftsmithText,
			};
			entries.push({ profileId: "gridsage", status: "running" });
			setCrewReviewEntries([...entries]);

			const gridsageResult = await agentService.sendMessage(
				buildCadCrewReviewPrompt({
					profileId: "gridsage",
					report: routeBackcheckReport,
					draftsmithReview: draftsmithText,
				}),
				{
					profileId: "gridsage",
					promptMode: "template",
					templateLabel: "AutoWire electrical QA review",
				},
			);
			if (!gridsageResult.success) {
				entries[1] = {
					profileId: "gridsage",
					status: "failed",
					error: gridsageResult.error || "GridSage review failed.",
				};
				setCrewReviewEntries([...entries]);
				setCrewReviewError(entries[1].error || "GridSage review failed.");
				setStatusMessage(entries[1].error || "GridSage review failed.");
				return;
			}

			entries[1] = {
				profileId: "gridsage",
				status: "completed",
				response: extractAgentResponseText(gridsageResult.data),
			};
			setCrewReviewEntries([...entries]);
			setStatusMessage("CAD crew review complete (Draftsmith -> GridSage).");
		} finally {
			setCrewReviewLoading(false);
		}
	};

	const exportBackcheckJson = () => {
		if (!routeBackcheckReport) {
			setStatusMessage("Run backcheck first to export a report.");
			return;
		}
		const payload = JSON.stringify(
			{
				...routeBackcheckReport,
				crew_review: {
					entries: crewReviewEntries,
					error: crewReviewError,
				},
			},
			null,
			2,
		);
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
		crewReviewEntries,
		crewReviewError,
		crewReviewLoading,
		exportBackcheckJson,
		routeBackcheckReport,
		routeBackchecking,
		runCadCrewReview,
		runRouteBackcheck,
	};
}
