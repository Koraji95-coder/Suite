import { useCallback, useEffect, useRef, useState } from "react";
import {
	runSuiteRuntimeDoctor,
	type SuiteRuntimeDoctorMode,
	type SuiteRuntimeDoctorReport,
} from "@/lib/runtimeDoctor";

interface UseSuiteRuntimeDoctorOptions {
	enabled?: boolean;
	initialMode?: SuiteRuntimeDoctorMode;
}

interface UseSuiteRuntimeDoctorResult {
	report: SuiteRuntimeDoctorReport | null;
	loading: boolean;
	refreshing: boolean;
	refreshNow: (mode?: SuiteRuntimeDoctorMode) => Promise<void>;
}

export function useSuiteRuntimeDoctor(
	options: UseSuiteRuntimeDoctorOptions = {},
): UseSuiteRuntimeDoctorResult {
	const { enabled = true, initialMode = "background" } = options;
	const [report, setReport] = useState<SuiteRuntimeDoctorReport | null>(null);
	const [loading, setLoading] = useState(enabled);
	const [refreshing, setRefreshing] = useState(false);
	const mountedRef = useRef(true);
	const reportRef = useRef<SuiteRuntimeDoctorReport | null>(null);

	useEffect(() => {
		reportRef.current = report;
	}, [report]);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const refreshNow = useCallback(
		async (mode: SuiteRuntimeDoctorMode = "manual") => {
			if (!enabled) {
				if (mountedRef.current) {
					setReport(null);
					setLoading(false);
					setRefreshing(false);
				}
				return;
			}

			const coldLoad = reportRef.current === null;
			if (coldLoad) {
				setLoading(true);
			} else {
				setRefreshing(true);
			}

			try {
				const next = await runSuiteRuntimeDoctor({
					mode,
					force: mode === "manual",
				});
				if (mountedRef.current) {
					setReport(next);
				}
			} finally {
				if (mountedRef.current) {
					setLoading(false);
					setRefreshing(false);
				}
			}
		},
		[enabled],
	);

	useEffect(() => {
		if (!enabled) {
			setReport(null);
			setLoading(false);
			setRefreshing(false);
			return;
		}
		void refreshNow(initialMode);
	}, [enabled, initialMode, refreshNow]);

	return {
		report,
		loading,
		refreshing,
		refreshNow,
	};
}
