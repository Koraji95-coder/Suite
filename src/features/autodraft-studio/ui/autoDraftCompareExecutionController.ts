import type {
	AutoDraftCalibrationMode,
	AutoDraftCompareEngine,
	AutoDraftComparePoint,
	AutoDraftComparePrepareResponse,
	AutoDraftCompareRoi,
	AutoDraftToleranceProfile,
} from "./autodraftService";

export type CompareExecutionPreflightInput = {
	prepareResult: AutoDraftComparePrepareResponse | null;
	pdfPoints: AutoDraftComparePoint[];
	calibrationMode: AutoDraftCalibrationMode;
	manualOverride: boolean;
	parseCadPoints: () => AutoDraftComparePoint[] | null;
	parseReplacementTuning: () => Record<string, unknown> | null;
};

export type CompareExecutionPreflightResult = {
	ok: boolean;
	error: string | null;
	cadPoints: AutoDraftComparePoint[] | null;
	replacementTuning: Record<string, unknown> | null;
};

export function validatePreparePreflight(args: {
	hasPdfFile: boolean;
	pageCount: number;
	pageIndex: number;
}): string | null {
	if (!args.hasPdfFile) {
		return "Choose a PDF file first.";
	}
	if (
		args.pageCount > 0 &&
		(args.pageIndex < 0 || args.pageIndex >= args.pageCount)
	) {
		return `Page number must be between 1 and ${args.pageCount}.`;
	}
	return null;
}

export function validateComparePreflight(
	input: CompareExecutionPreflightInput,
): CompareExecutionPreflightResult {
	const {
		prepareResult,
		pdfPoints,
		calibrationMode,
		manualOverride,
		parseCadPoints,
		parseReplacementTuning,
	} = input;

	if (!prepareResult) {
		return {
			ok: false,
			error: "Run prepare first.",
			cadPoints: null,
			replacementTuning: null,
		};
	}

	const hasCompletePdfPoints = pdfPoints.length === 2;
	const shouldUseManualPoints = calibrationMode === "manual";
	let parsedCadPoints: AutoDraftComparePoint[] | null = null;

	if (shouldUseManualPoints) {
		if (!hasCompletePdfPoints) {
			return {
				ok: false,
				error: "Manual calibration needs exactly two PDF points.",
				cadPoints: null,
				replacementTuning: null,
			};
		}
		parsedCadPoints = parseCadPoints();
		if (!parsedCadPoints) {
			return {
				ok: false,
				error: "Enter valid CAD X/Y values for both calibration points.",
				cadPoints: null,
				replacementTuning: null,
			};
		}
	} else if (manualOverride && hasCompletePdfPoints) {
		parsedCadPoints = parseCadPoints();
		if (!parsedCadPoints) {
			return {
				ok: false,
				error:
					"Manual fallback is enabled, but the CAD X/Y values for both points are invalid.",
				cadPoints: null,
				replacementTuning: null,
			};
		}
	}

	const parsedReplacementTuning = parseReplacementTuning();
	if (!parsedReplacementTuning) {
		return {
			ok: false,
			error:
				"Replacement tuning values are invalid. Check thresholds and multiplier ranges.",
			cadPoints: null,
			replacementTuning: null,
		};
	}

	return {
		ok: true,
		error: null,
		cadPoints: parsedCadPoints,
		replacementTuning: parsedReplacementTuning,
	};
}

export function buildCompareExecutionPayload(args: {
	engine: AutoDraftCompareEngine;
	tolerance: AutoDraftToleranceProfile;
	calibrationMode: AutoDraftCalibrationMode;
	manualOverride: boolean;
	prepareResult: AutoDraftComparePrepareResponse;
	pdfPoints: AutoDraftComparePoint[];
	cadPoints: AutoDraftComparePoint[] | null;
	roiBounds: AutoDraftCompareRoi | null;
	replacementTuning: Record<string, unknown>;
}) {
	const {
		engine,
		tolerance,
		calibrationMode,
		manualOverride,
		prepareResult,
		pdfPoints,
		cadPoints,
		roiBounds,
		replacementTuning,
	} = args;

	return {
		engine,
		toleranceProfile: tolerance,
		calibrationMode,
		manualOverride,
		markups: prepareResult.markups,
		pdfPoints: cadPoints ? pdfPoints : undefined,
		cadPoints: cadPoints ?? undefined,
		roi: roiBounds || undefined,
		calibrationSeed: prepareResult.calibration_seed,
		replacementTuning,
	};
}
