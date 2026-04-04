import { jam } from "@jam.dev/sdk";
import { buildSuiteJamMetadataSnapshot } from "@/lib/jamMetadataState";

let isInstalled = false;

export function installSuiteJamMetadata(options: { enabled?: boolean } = {}) {
	const enabled =
		options.enabled ?? import.meta.env.VITE_JAM_METADATA_ENABLED !== "false";
	if (!enabled || isInstalled || typeof window === "undefined") {
		return;
	}

	jam.metadata(() => buildSuiteJamMetadataSnapshot());
	isInstalled = true;
}
