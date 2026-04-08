import type {
	ProjectDrawingProgramRecord,
	ProjectDrawingWorkbookMirrorRow,
} from "./types";
import { formatSequenceBand, sortRows } from "./validation";
export { parseStandardWorkbook, parseWorkbookMirror } from "./WorkbookParserExcelAdapter";

export function buildWorkbookMirrorRows(
	program: ProjectDrawingProgramRecord,
): ProjectDrawingWorkbookMirrorRow[] {
	return sortRows(program.rows)
		.filter((row) => row.status !== "inactive")
		.map((row) => ({
			suiteRowId: row.id,
			sortOrder: row.sortOrder,
			drawingNumber: row.drawingNumber,
			title: row.title,
			status: row.status,
			discipline: row.discipline,
			sheetFamily: row.sheetFamily,
			familyKey: row.familyKey,
			typeCode: row.typeCode,
			sequenceBand: formatSequenceBand(
				row.sequenceBandStart,
				row.sequenceBandEnd,
				row.sequenceDigits,
			),
			templateKey: row.templateKey,
			provisionState: row.provisionState,
			dwgRelativePath: row.dwgRelativePath || "",
			acadeSection: row.acadeSection || "",
			acadeGroup: row.acadeGroup || "",
		}));
}
