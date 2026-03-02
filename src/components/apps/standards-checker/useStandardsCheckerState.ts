import { useEffect, useMemo, useRef, useState } from "react";
import {
	type CheckResult,
	categories,
	type StandardsCategory,
	type StandardsCheckerMode,
	sampleStandards,
} from "./standardsCheckerModels";

const CHECK_RUN_DELAY_MS = 1500;

export function useStandardsCheckerState() {
	const [mode, setMode] = useState<StandardsCheckerMode>("standards");
	const [activeCategory, setActiveCategory] = useState<StandardsCategory>(
		categories[0],
	);
	const [selectedStandards, setSelectedStandards] = useState<Set<string>>(
		new Set(),
	);
	const [results, setResults] = useState<CheckResult[]>([]);
	const [running, setRunning] = useState(false);
	const runTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (runTimeoutRef.current) window.clearTimeout(runTimeoutRef.current);
		};
	}, []);

	const filteredStandards = useMemo(
		() =>
			sampleStandards.filter(
				(standard) => standard.category === activeCategory,
			),
		[activeCategory],
	);

	const toggleStandard = (id: string) => {
		setSelectedStandards((previous) => {
			const next = new Set(previous);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const runChecks = () => {
		if (selectedStandards.size === 0) return;
		setRunning(true);
		setResults([]);

		if (runTimeoutRef.current) window.clearTimeout(runTimeoutRef.current);

		runTimeoutRef.current = window.setTimeout(() => {
			const nextResults: CheckResult[] = [];

			selectedStandards.forEach((id) => {
				const random = Math.random();
				let status: CheckResult["status"];
				let message: string;

				if (random < 0.5) {
					status = "pass";
					message = "All criteria met. Design compliant.";
				} else if (random < 0.8) {
					status = "warning";
					message = "Minor deviations detected. Review recommended.";
				} else {
					status = "fail";
					message = "Non-compliance found. Corrective action required.";
				}

				nextResults.push({ standardId: id, status, message });
			});

			setResults(nextResults);
			setRunning(false);
		}, CHECK_RUN_DELAY_MS);
	};

	const getResultForStandard = (id: string) =>
		results.find((result) => result.standardId === id);

	const passCount = useMemo(
		() => results.filter((result) => result.status === "pass").length,
		[results],
	);
	const warningCount = useMemo(
		() => results.filter((result) => result.status === "warning").length,
		[results],
	);
	const failCount = useMemo(
		() => results.filter((result) => result.status === "fail").length,
		[results],
	);

	return {
		activeCategory,
		failCount,
		filteredStandards,
		getResultForStandard,
		mode,
		passCount,
		results,
		running,
		selectedStandards,
		setActiveCategory,
		setMode,
		toggleStandard,
		runChecks,
		warningCount,
	};
}
