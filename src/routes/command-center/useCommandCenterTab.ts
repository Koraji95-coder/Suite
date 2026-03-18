import { useCallback, useEffect, useState } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import { parseCommandCenterTab } from "@/lib/watchdogNavigation";
import {
	coerceActiveCommandCenterTab,
	type ActiveCommandCenterTab,
} from "./commandCenterModel";

interface UseCommandCenterTabArgs {
	searchParams: URLSearchParams;
	setSearchParams: SetURLSearchParams;
}

export function useCommandCenterTab({
	searchParams,
	setSearchParams,
}: UseCommandCenterTabArgs) {
	const requestedTab = parseCommandCenterTab(searchParams.get("tab"));
	const [activeTab, setActiveTab] = useState<ActiveCommandCenterTab>(() =>
		coerceActiveCommandCenterTab(requestedTab),
	);

	useEffect(() => {
		setActiveTab(coerceActiveCommandCenterTab(requestedTab));
	}, [requestedTab]);

	const handleTabSelect = useCallback(
		(tab: ActiveCommandCenterTab) => {
			setActiveTab(tab);
			const nextParams = new URLSearchParams(searchParams);
			if (tab === "commands") {
				nextParams.delete("tab");
			} else {
				nextParams.set("tab", tab);
			}
			setSearchParams(nextParams, { replace: true });
		},
		[searchParams, setSearchParams],
	);

	return {
		activeTab,
		handleTabSelect,
	};
}
