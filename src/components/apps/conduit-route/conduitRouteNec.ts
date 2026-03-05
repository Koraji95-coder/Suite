import type { NecConductorInput, NecResult } from "./conduitRouteTypes";

export const CONDUIT_AREAS: Record<string, number> = {
	"1/2 EMT": 0.304,
	"3/4 EMT": 0.533,
	"1 EMT": 0.864,
	"1-1/4 EMT": 1.496,
	"1-1/2 EMT": 2.036,
	"2 EMT": 3.356,
	"2-1/2 EMT": 5.858,
	"3 EMT": 8.846,
	"4 EMT": 15.901,
	"1/2 RGS": 0.314,
	"3/4 RGS": 0.533,
	"1 RGS": 0.887,
	"2 RGS": 3.408,
	"3 RGS": 9.521,
	"4 RGS": 16.351,
	"1 PVC40": 0.887,
	"2 PVC40": 3.291,
	"3 PVC40": 8.09,
	"4 PVC40": 14.753,
};

export const CONDUCTOR_AREAS: Record<string, number> = {
	"14 AWG": 0.0097,
	"12 AWG": 0.0133,
	"10 AWG": 0.0211,
	"8 AWG": 0.0366,
	"6 AWG": 0.0507,
	"4 AWG": 0.0824,
	"2 AWG": 0.1158,
	"1/0": 0.1855,
	"2/0": 0.2223,
	"4/0": 0.3237,
	"250 kcmil": 0.397,
	"500 kcmil": 0.7073,
};

const DERATING_RANGES: Array<{ min: number; max: number; factor: number }> = [
	{ min: 1, max: 3, factor: 1 },
	{ min: 4, max: 6, factor: 0.8 },
	{ min: 7, max: 9, factor: 0.7 },
	{ min: 10, max: 20, factor: 0.5 },
	{ min: 21, max: 30, factor: 0.45 },
	{ min: 31, max: 40, factor: 0.4 },
	{ min: 41, max: Number.POSITIVE_INFINITY, factor: 0.35 },
];

export function deratingFactor(conductorCount: number): number {
	const match = DERATING_RANGES.find(
		(range) => conductorCount >= range.min && conductorCount <= range.max,
	);
	return match?.factor ?? 0.35;
}

export function ambientTempCorrection(ambientC: number): number {
	if (ambientC <= 30) return 1;
	if (ambientC <= 35) return 0.94;
	if (ambientC <= 40) return 0.88;
	if (ambientC <= 45) return 0.82;
	if (ambientC <= 50) return 0.75;
	if (ambientC <= 55) return 0.67;
	return 0.58;
}

export function fillLimitPercent(conductorCount: number): number {
	if (conductorCount <= 1) return 53;
	if (conductorCount <= 2) return 31;
	return 40;
}

export function calculateNec(
	conductors: NecConductorInput[],
	conduit: string,
	ambientC: number,
): NecResult {
	const conduitArea = CONDUIT_AREAS[conduit] ?? CONDUIT_AREAS["2 EMT"];
	let totalConductors = 0;
	let totalConductorArea = 0;
	for (const item of conductors) {
		const area = CONDUCTOR_AREAS[item.gauge] ?? 0;
		const count = Math.max(0, item.count);
		totalConductors += count;
		totalConductorArea += area * count;
	}
	const fillPercent =
		conduitArea > 0 ? (totalConductorArea / conduitArea) * 100 : 0;
	const fillLimit = fillLimitPercent(totalConductors);
	const derating = deratingFactor(totalConductors);
	const tempCorrection = ambientTempCorrection(ambientC);

	return {
		totalConductors,
		totalConductorArea,
		conduitArea,
		fillPercent,
		fillLimitPercent: fillLimit,
		fillPass: fillPercent <= fillLimit,
		deratingFactor: derating,
		tempCorrectionFactor: tempCorrection,
		combinedFactor: derating * tempCorrection,
	};
}

export const DEFAULT_CONDUCTORS: NecConductorInput[] = [
	{ gauge: "12 AWG", count: 6 },
	{ gauge: "10 AWG", count: 3 },
];
