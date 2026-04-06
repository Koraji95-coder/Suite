import type { ShellFamilyId } from "./appShellMeta";
import {
	loadBlockLibraryRoutePage,
	loadChangelogRoutePage,
	loadCommandCenterPage,
	loadDeveloperDocsRoutePage,
	loadDeveloperPortalRoutePage,
	loadDraftRoutePage,
	loadDrawingListManagerRoutePage,
	loadHomeRoutePage,
	loadProjectsRoutePage,
	loadReviewRoutePage,
	loadSettingsPage,
	loadStandardsCheckerRoutePage,
	loadTransmittalBuilderRoutePage,
	loadWatchdogRoutePage,
} from "./routeModuleLoaders";

type RouteLoader = () => Promise<unknown>;

const ROUTE_WARMUP_DELAY_MS = 1_200;

const shellFamilyWarmers: Partial<
	Record<ShellFamilyId, readonly RouteLoader[]>
> = {
	home: [loadHomeRoutePage],
	projects: [loadProjectsRoutePage, loadTransmittalBuilderRoutePage],
	draft: [
		loadDraftRoutePage,
		loadDrawingListManagerRoutePage,
		loadBlockLibraryRoutePage,
	],
	review: [
		loadReviewRoutePage,
		loadStandardsCheckerRoutePage,
	],
	developer: [
		loadDeveloperPortalRoutePage,
		loadCommandCenterPage,
		loadDeveloperDocsRoutePage,
		loadWatchdogRoutePage,
		loadChangelogRoutePage,
	],
	settings: [loadSettingsPage],
};

function getWarmersForFamily(family: ShellFamilyId): readonly RouteLoader[] {
	return shellFamilyWarmers[family] ?? [];
}

export async function warmShellFamily(family: ShellFamilyId): Promise<void> {
	const warmers = getWarmersForFamily(family);
	if (warmers.length === 0) {
		return;
	}

	await Promise.allSettled(warmers.map((loader) => loader()));
}

export function scheduleShellWarmup(
	families: readonly ShellFamilyId[],
): () => void {
	if (typeof window === "undefined") {
		return () => undefined;
	}

	const uniqueFamilies = [...new Set(families)].filter(
		(family) => getWarmersForFamily(family).length > 0,
	);
	if (uniqueFamilies.length === 0) {
		return () => undefined;
	}

	const runWarmup = () => {
		void Promise.allSettled(
			uniqueFamilies.map((family) => warmShellFamily(family)),
		);
	};

	if (typeof window.requestIdleCallback === "function") {
		const idleHandle = window.requestIdleCallback(runWarmup, {
			timeout: ROUTE_WARMUP_DELAY_MS,
		});

		return () => {
			if (typeof window.cancelIdleCallback === "function") {
				window.cancelIdleCallback(idleHandle);
			}
		};
	}

	const timeoutHandle = window.setTimeout(runWarmup, ROUTE_WARMUP_DELAY_MS);
	return () => {
		window.clearTimeout(timeoutHandle);
	};
}
