import {
	deleteSetting,
	loadSetting,
	saveSetting,
} from "@/settings/userSettings";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	COMMAND_CENTER_HISTORY_KEY,
	createCommandCenterHistoryEntry,
	MAX_COMMAND_HISTORY,
	parseCommandCenterHistory,
	type CommandCenterHistoryEntry,
	type HistoryCategory,
	type HistoryFilter,
} from "./commandCenterModel";

interface UseCommandCenterHistoryArgs {
	enabled: boolean;
	onLoadError?: (message: string) => void;
}

export function useCommandCenterHistory({
	enabled,
	onLoadError,
}: UseCommandCenterHistoryArgs) {
	const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("All");
	const [commandHistory, setCommandHistory] = useState<
		CommandCenterHistoryEntry[]
	>([]);
	const [historyLoaded, setHistoryLoaded] = useState(false);

	useEffect(() => {
		if (!enabled) return;
		let active = true;

		const loadHistory = async () => {
			try {
				const persistedHistory = await loadSetting<unknown>(
					COMMAND_CENTER_HISTORY_KEY,
					null,
					[],
				);
				if (!active) return;
				setCommandHistory(parseCommandCenterHistory(persistedHistory));
			} catch (error) {
				if (!active) return;
				onLoadError?.(
					error instanceof Error
						? error.message
						: "Failed to load Command Center history.",
				);
			} finally {
				if (active) {
					setHistoryLoaded(true);
				}
			}
		};

		void loadHistory();
		return () => {
			active = false;
		};
	}, [enabled, onLoadError]);

	useEffect(() => {
		if (!enabled || !historyLoaded) return;
		void saveSetting(COMMAND_CENTER_HISTORY_KEY, commandHistory, null);
	}, [commandHistory, historyLoaded, enabled]);

	const appendHistory = useCallback(
		(
			payload: {
				category: HistoryCategory;
				action: string;
				title: string;
				detailsText?: string;
			},
		) => {
			const entry = createCommandCenterHistoryEntry(payload);
			setCommandHistory((prev) =>
				[entry, ...prev].slice(0, MAX_COMMAND_HISTORY),
			);
		},
		[],
	);

	const clearHistory = useCallback(async () => {
		setCommandHistory([]);
		await deleteSetting(COMMAND_CENTER_HISTORY_KEY, null);
	}, []);

	const visibleHistoryEntries = useMemo(() => {
		if (historyFilter === "All") return commandHistory;
		return commandHistory.filter((entry) => entry.category === historyFilter);
	}, [commandHistory, historyFilter]);

	return {
		historyFilter,
		setHistoryFilter,
		commandHistory,
		visibleHistoryEntries,
		appendHistory,
		clearHistory,
	};
}
