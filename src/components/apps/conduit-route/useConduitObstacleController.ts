import { useEffect, useMemo, useState } from "react";
import { AUTOWIRE_OBSTACLE_LAYER_PRESET_OPTIONS } from "./autowirePresets";
import { CANVAS_HEIGHT, CANVAS_WIDTH, OBSTACLES } from "./conduitRouteData";
import { conduitRouteService } from "./conduitRouteService";
import type {
	ConduitObstacleScanMeta,
	ConduitObstacleSource,
	Obstacle,
	ObstacleLayerRule,
	ObstacleType,
} from "./conduitRouteTypes";
import { inferObstacleTypeFromLayer } from "./conduitRouteViewModel";

interface UseConduitObstacleControllerArgs {
	workspace: "yard" | "terminal";
	setStatusMessage: (message: string) => void;
}

export function useConduitObstacleController({
	workspace,
	setStatusMessage,
}: UseConduitObstacleControllerArgs) {
	const [activeObstacles, setActiveObstacles] = useState<Obstacle[]>(OBSTACLES);
	const [obstacleSource, setObstacleSource] =
		useState<ConduitObstacleSource>("client");
	const [obstacleSyncing, setObstacleSyncing] = useState(false);
	const [obstacleScanMeta, setObstacleScanMeta] =
		useState<ConduitObstacleScanMeta | null>(null);
	const [availableCadLayers, setAvailableCadLayers] = useState<string[]>([]);
	const [layerPickerValue, setLayerPickerValue] = useState("");
	const [layerRulesRefreshing, setLayerRulesRefreshing] = useState(false);
	const [obstacleLayerRules, setObstacleLayerRules] = useState<
		ObstacleLayerRule[]
	>([]);
	const [obstacleLayerPreset, setObstacleLayerPreset] = useState<string>("");

	const obstacleLayerNames = useMemo(
		() => obstacleLayerRules.map((rule) => rule.layerName),
		[obstacleLayerRules],
	);
	const obstacleLayerTypeOverrides = useMemo(
		() =>
			obstacleLayerRules.reduce<Record<string, ObstacleType>>((acc, rule) => {
				acc[rule.layerName] = rule.obstacleType;
				return acc;
			}, {}),
		[obstacleLayerRules],
	);

	const refreshObstacleLayerList = async (
		options: { silent?: boolean } = {},
	) => {
		const silent = options.silent ?? false;
		setLayerRulesRefreshing(true);
		const layers = await conduitRouteService.listLayers();
		setLayerRulesRefreshing(false);
		setAvailableCadLayers(layers);
		if (!layerPickerValue && layers.length > 0) {
			setLayerPickerValue(layers[0]);
		}
		if (!silent) {
			setStatusMessage(
				layers.length > 0
					? `Loaded ${layers.length} drawing layer(s).`
					: "No layers returned from the active drawing.",
			);
		}
		return layers;
	};

	const addObstacleLayerRule = () => {
		const candidate = layerPickerValue.trim();
		if (!candidate) {
			setStatusMessage("Select or type a layer name before adding.");
			return;
		}
		const normalizedCandidate = candidate.toLowerCase();
		const alreadySelected = obstacleLayerRules.some(
			(rule) => rule.layerName.toLowerCase() === normalizedCandidate,
		);
		if (alreadySelected) {
			setStatusMessage(
				`Layer '${candidate}' is already in the obstacle editor.`,
			);
			return;
		}
		setObstacleLayerRules((prev) => [
			...prev,
			{
				layerName: candidate,
				obstacleType: inferObstacleTypeFromLayer(candidate) ?? "foundation",
			},
		]);
		setStatusMessage(`Added obstacle layer rule for '${candidate}'.`);
	};

	const removeObstacleLayerRule = (layerName: string) => {
		setObstacleLayerRules((prev) =>
			prev.filter((rule) => rule.layerName !== layerName),
		);
	};

	const clearObstacleLayerRules = () => {
		setObstacleLayerRules([]);
		setStatusMessage("Cleared obstacle layer rules.");
	};

	const autoIdentifyObstacleLayers = () => {
		if (availableCadLayers.length === 0) {
			setStatusMessage("Refresh layers first, then run auto-identify.");
			return;
		}
		const existingLayerSet = new Set(
			obstacleLayerRules.map((rule) => rule.layerName.toLowerCase()),
		);
		const additions: ObstacleLayerRule[] = [];
		for (const layerName of availableCadLayers) {
			const inferredType = inferObstacleTypeFromLayer(layerName);
			if (!inferredType) {
				continue;
			}
			if (existingLayerSet.has(layerName.toLowerCase())) {
				continue;
			}
			existingLayerSet.add(layerName.toLowerCase());
			additions.push({ layerName, obstacleType: inferredType });
		}
		if (additions.length === 0) {
			setStatusMessage("No new obstacle layers matched auto-identify rules.");
			return;
		}
		setObstacleLayerRules((prev) => [...prev, ...additions]);
		setStatusMessage(`Auto-identified ${additions.length} obstacle layer(s).`);
	};

	const syncAutocadObstacles = async (options: { silent?: boolean } = {}) => {
		if (obstacleSyncing) {
			return;
		}
		const silent = options.silent ?? false;
		setObstacleSyncing(true);
		if (!silent) {
			setStatusMessage("Syncing obstacles from AutoCAD drawing...");
		}

		const response = await conduitRouteService.scanObstacles({
			selectionOnly: false,
			includeModelspace: true,
			maxEntities: 50000,
			canvasWidth: CANVAS_WIDTH,
			canvasHeight: CANVAS_HEIGHT,
			layerNames: obstacleLayerNames,
			layerTypeOverrides: obstacleLayerTypeOverrides,
			layerPreset: obstacleLayerPreset,
		});
		setObstacleSyncing(false);

		if (response.success && response.data) {
			const obstacleCount = response.data.obstacles.length;
			setActiveObstacles(response.data.obstacles);
			setObstacleSource("autocad");
			setObstacleScanMeta(response.meta ?? null);
			setStatusMessage(
				response.message ||
					`AutoCAD obstacle sync complete. ${obstacleCount} obstacle(s) loaded.`,
			);
			return;
		}

		if (!silent) {
			setStatusMessage(
				response.message ||
					"AutoCAD obstacle sync failed. Continuing with current obstacle map.",
			);
		}
	};

	const useDemoObstacleLayout = () => {
		setActiveObstacles(OBSTACLES);
		setObstacleSource("client");
		setObstacleScanMeta(null);
		setStatusMessage("Switched to demo obstacle layout.");
	};

	const handleLayerPresetChange = (presetId: string) => {
		setObstacleLayerPreset(presetId);
		const selected = AUTOWIRE_OBSTACLE_LAYER_PRESET_OPTIONS.find(
			(entry) => entry.id === presetId,
		);
		setStatusMessage(
			presetId
				? `Obstacle layer preset set to '${selected?.label ?? presetId}'.`
				: "Obstacle layer preset set to manual rules.",
		);
	};

	useEffect(() => {
		if (workspace !== "yard") {
			return;
		}
		if (availableCadLayers.length > 0) {
			return;
		}

		let cancelled = false;
		setLayerRulesRefreshing(true);
		void conduitRouteService
			.listLayers()
			.then((layers) => {
				if (cancelled) {
					return;
				}
				setAvailableCadLayers(layers);
				if (!layerPickerValue && layers.length > 0) {
					setLayerPickerValue(layers[0]);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLayerRulesRefreshing(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [workspace, availableCadLayers.length, layerPickerValue]);

	useEffect(() => {
		if (workspace !== "yard") {
			return;
		}
		if (obstacleSource === "autocad") {
			return;
		}

		let cancelled = false;
		setObstacleSyncing(true);
		void conduitRouteService
			.scanObstacles({
				selectionOnly: false,
				includeModelspace: true,
				maxEntities: 50000,
				canvasWidth: CANVAS_WIDTH,
				canvasHeight: CANVAS_HEIGHT,
				layerNames: obstacleLayerNames,
				layerTypeOverrides: obstacleLayerTypeOverrides,
				layerPreset: obstacleLayerPreset,
			})
			.then((response) => {
				if (cancelled || !response.success || !response.data) {
					return;
				}
				setActiveObstacles(response.data.obstacles);
				setObstacleSource("autocad");
				setObstacleScanMeta(response.meta ?? null);
				setStatusMessage(
					response.message ||
						`AutoCAD obstacle sync complete. ${response.data.obstacles.length} obstacle(s) loaded.`,
				);
			})
			.finally(() => {
				if (!cancelled) {
					setObstacleSyncing(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [
		workspace,
		obstacleSource,
		obstacleLayerNames,
		obstacleLayerTypeOverrides,
		obstacleLayerPreset,
		setStatusMessage,
	]);

	return {
		activeObstacles,
		autoIdentifyObstacleLayers,
		availableCadLayers,
		clearObstacleLayerRules,
		handleLayerPresetChange,
		layerPickerValue,
		layerRulesRefreshing,
		obstacleLayerNames,
		obstacleLayerPreset,
		obstacleLayerRules,
		obstacleLayerTypeOverrides,
		obstacleScanMeta,
		obstacleSource,
		obstacleSyncing,
		refreshObstacleLayerList,
		removeObstacleLayerRule,
		setLayerPickerValue,
		setObstacleLayerRules,
		syncAutocadObstacles,
		useDemoObstacleLayout,
		addObstacleLayerRule,
	};
}
