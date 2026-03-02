import { useMemo, useState } from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { logger } from "@/lib/errorLogger";
import { sanitizeFilename, validateFiles } from "@/lib/validation";
import {
	buildProjectCode,
	buildWorkbook,
	createId,
	DEFAULT_DISCIPLINES,
	DEFAULT_SHEET_TYPES,
	type DrawingEntry,
	escapeRegExp,
	formatNumber,
	type ProjectConfig,
	parseFileName,
	type SwapRule,
} from "./drawingListManagerModels";

interface DrawingListManagerSummary {
	total: number;
	flagged: number;
	missing: number;
	skipped: string[];
}

const INITIAL_PROJECT_CONFIG: ProjectConfig = {
	projectNumber: "25074",
	revisionDefault: "A",
	enforceProjectCode: true,
	allowedDisciplines: DEFAULT_DISCIPLINES,
	allowedSheetTypes: DEFAULT_SHEET_TYPES,
};

const INITIAL_TEMPLATE_COUNTS: Record<string, number> = {
	"E-GEN": 2,
	"E-PLC": 4,
	"E-DIA": 3,
	"E-SCH": 2,
	"E-DET": 3,
};

const INITIAL_SWAP_RULES: SwapRule[] = [
	{ id: "swap-1", from: "One Line", to: "Single Line" },
];

export function useDrawingListManagerState() {
	const { showToast } = useToast();
	const [projectConfig, setProjectConfig] = useState<ProjectConfig>(
		INITIAL_PROJECT_CONFIG,
	);
	const [templateCounts, setTemplateCounts] = useState<Record<string, number>>(
		INITIAL_TEMPLATE_COUNTS,
	);
	const [swapRules, setSwapRules] = useState<SwapRule[]>(INITIAL_SWAP_RULES);
	const [drawings, setDrawings] = useState<DrawingEntry[]>([]);
	const [scanQuery, setScanQuery] = useState("");

	const validatedDrawings = useMemo(() => {
		const duplicates = new Set<string>();
		const seen = new Set<string>();

		drawings.forEach((drawing) => {
			if (drawing.drawingNumber && seen.has(drawing.drawingNumber)) {
				duplicates.add(drawing.drawingNumber);
			}
			seen.add(drawing.drawingNumber);
		});

		return drawings.map((drawing) => {
			const issues: string[] = [];
			if (!drawing.drawingNumber || drawing.drawingNumber === "Unparsed") {
				issues.push("Missing drawing number");
			}
			if (!drawing.title.trim()) {
				issues.push("Missing title");
			}
			if (drawing.sequence === null) {
				issues.push("Missing sequence");
			}
			if (
				drawing.discipline &&
				!projectConfig.allowedDisciplines.includes(drawing.discipline)
			) {
				issues.push("Unknown discipline");
			}
			if (
				drawing.sheetType &&
				!projectConfig.allowedSheetTypes.includes(drawing.sheetType)
			) {
				issues.push("Unknown sheet type");
			}
			if (!drawing.revision) {
				issues.push("Missing revision");
			}
			if (duplicates.has(drawing.drawingNumber)) {
				issues.push("Duplicate drawing number");
			}
			return { ...drawing, issues };
		});
	}, [drawings, projectConfig]);

	const filteredDrawings = useMemo(() => {
		if (!scanQuery.trim()) return validatedDrawings;
		const query = scanQuery.toLowerCase();
		return validatedDrawings.filter((drawing) =>
			[
				drawing.drawingNumber,
				drawing.title,
				drawing.fileName,
				drawing.discipline,
				drawing.sheetType,
			]
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}, [validatedDrawings, scanQuery]);

	const summary = useMemo<DrawingListManagerSummary>(() => {
		const totals = {
			total: validatedDrawings.length,
			flagged: validatedDrawings.filter((d) => d.issues.length > 0).length,
			missing: 0,
			skipped: [] as string[],
		};

		const byGroup: Record<string, number[]> = {};
		validatedDrawings.forEach((drawing) => {
			if (
				drawing.sequence === null ||
				!drawing.discipline ||
				!drawing.sheetType
			)
				return;
			const key = `${drawing.discipline}-${drawing.sheetType}`;
			byGroup[key] ??= [];
			byGroup[key].push(drawing.sequence);
		});

		Object.entries(byGroup).forEach(([key, sequences]) => {
			const sorted = sequences.sort((a, b) => a - b);
			const min = sorted[0];
			const max = sorted[sorted.length - 1];
			for (let i = min; i <= max; i += 1) {
				if (!sorted.includes(i)) {
					totals.missing += 1;
					totals.skipped.push(`${key}-${String(i).padStart(3, "0")}`);
				}
			}
		});

		return totals;
	}, [validatedDrawings]);

	const architectureMap = useMemo(() => {
		const map: Record<string, number> = {};
		validatedDrawings.forEach((drawing) => {
			const key = drawing.sheetType || "Uncategorized";
			map[key] = (map[key] || 0) + 1;
		});
		return Object.entries(map).sort((a, b) => b[1] - a[1]);
	}, [validatedDrawings]);

	const handleFolderScan = (files: FileList | null) => {
		if (!files) return;

		const validation = validateFiles(files, "drawing");
		const list: DrawingEntry[] = [];
		const errors: string[] = [];

		Array.from(files).forEach((file) => {
			const fileValidation = validation.results.get(file.name);
			if (fileValidation && !fileValidation.valid) {
				errors.push(`${file.name}: ${fileValidation.errors.join(", ")}`);
				return;
			}

			const lower = file.name.toLowerCase();
			if (!lower.endsWith(".dwg") && !lower.endsWith(".pdf")) return;

			const sanitizedName = sanitizeFilename(file.name);
			const parsed = parseFileName(sanitizedName, projectConfig);
			list.push({
				id: createId(),
				fileName: sanitizedName,
				title: parsed.title,
				discipline: parsed.discipline,
				sheetType: parsed.sheetType,
				sequence: parsed.sequence,
				revision: parsed.revision,
				drawingNumber: parsed.drawingNumber,
				source: "folder",
			});
		});

		if (errors.length > 0) {
			const errorMessage =
				errors.slice(0, 3).join("\n") +
				(errors.length > 3 ? `\n... and ${errors.length - 3} more` : "");
			showToast("warning", `Some files failed validation: ${errorMessage}`);
		}

		setDrawings(list);
	};

	const handleGenerateList = () => {
		const generated: DrawingEntry[] = [];
		const sequenceTracker: Record<string, number> = {};

		Object.entries(templateCounts).forEach(([typeKey, count]) => {
			if (count <= 0) return;
			const parts = typeKey.split("-");
			const discipline = parts[0];
			const sheetType = parts.slice(1).join("-");
			const key = `${discipline}-${sheetType}`;
			const start = sequenceTracker[key] || 1;

			for (let i = 0; i < count; i += 1) {
				const sequence = start + i;
				const number = formatNumber(
					projectConfig.projectNumber,
					discipline,
					sheetType,
					sequence,
					projectConfig.revisionDefault,
				);
				generated.push({
					id: createId(),
					fileName: "",
					title: `Drawing ${sequence}`,
					discipline,
					sheetType,
					sequence,
					revision: projectConfig.revisionDefault,
					drawingNumber: number,
					source: "generated",
				});
			}

			sequenceTracker[key] = start + count;
		});

		setDrawings(generated);
	};

	const handleRenumber = () => {
		const grouped: Record<string, DrawingEntry[]> = {};
		drawings.forEach((drawing) => {
			const key = `${drawing.discipline}-${drawing.sheetType}`;
			grouped[key] ??= [];
			grouped[key].push(drawing);
		});

		const renumbered = Object.values(grouped).flatMap((group) => {
			const sorted = [...group].sort(
				(a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
			);
			return sorted.map((drawing, index) => {
				const sequence = index + 1;
				return {
					...drawing,
					sequence,
					drawingNumber: formatNumber(
						projectConfig.projectNumber,
						drawing.discipline || "E",
						drawing.sheetType || "GEN",
						sequence,
						drawing.revision || projectConfig.revisionDefault,
					),
				};
			});
		});

		setDrawings(renumbered);
	};

	const handleApplySwap = () => {
		const next = drawings.map((drawing) => {
			let title = drawing.title;
			swapRules.forEach((rule) => {
				if (!rule.from) return;
				const regex = new RegExp(escapeRegExp(rule.from), "gi");
				title = title.replace(regex, rule.to);
			});
			return { ...drawing, title };
		});
		setDrawings(next);
	};

	const handleExport = async () => {
		try {
			const workbook = await buildWorkbook(validatedDrawings);
			const projectCode = buildProjectCode(projectConfig.projectNumber);
			const buffer = await workbook.xlsx.writeBuffer();

			const blob = new Blob([buffer], {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${projectCode}-Drawing-Index.xlsx`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (error) {
			logger.error("DrawingListManager", "Excel export failed", { error });
			showToast("error", "Failed to export Excel file. Please try again.");
		}
	};

	const updateDrawingTitle = (id: string, title: string) => {
		setDrawings((prev) =>
			prev.map((drawing) =>
				drawing.id === id ? { ...drawing, title } : drawing,
			),
		);
	};

	return {
		architectureMap,
		filteredDrawings,
		handleApplySwap,
		handleExport,
		handleFolderScan,
		handleGenerateList,
		handleRenumber,
		projectConfig,
		scanQuery,
		setProjectConfig,
		setScanQuery,
		setSwapRules,
		setTemplateCounts,
		summary,
		swapRules,
		templateCounts,
		updateDrawingTitle,
		validatedDrawings,
	};
}

export type DrawingListManagerArchitectureMap = ReturnType<
	typeof useDrawingListManagerState
>["architectureMap"];

export type DrawingListManagerFilteredDrawing = ReturnType<
	typeof useDrawingListManagerState
>["filteredDrawings"][number];

export type DrawingListManagerSummaryState = ReturnType<
	typeof useDrawingListManagerState
>["summary"];
