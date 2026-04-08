import ExcelJS from "exceljs";
import type { DrawingEntry } from "../ui/drawingListManagerModels";

export const buildWorkbook = async (drawings: DrawingEntry[]) => {
	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet("Drawing Index");

	const header = [
		"Drawing Number",
		"Title",
		"File",
		"Discipline",
		"Sheet Type",
		"Revision",
		"Source",
	];
	const headerRow = worksheet.addRow(header);
	headerRow.font = { bold: true, size: 11 };
	headerRow.fill = {
		type: "pattern",
		pattern: "solid",
		fgColor: { argb: "FFE0E0E0" },
	};
	headerRow.alignment = { vertical: "middle", horizontal: "center" };

	drawings.forEach((drawing) => {
		const sanitizedTitle = drawing.title.trim().match(/^[=+\-@]/)
			? `'${drawing.title}`
			: drawing.title;

		worksheet.addRow([
			drawing.drawingNumber,
			sanitizedTitle,
			drawing.fileName,
			drawing.discipline,
			drawing.sheetType,
			drawing.revision,
			drawing.source,
		]);
	});

	worksheet.columns.forEach((column, index) => {
		let maxLength = header[index].length;
		worksheet.eachRow((row, rowNumber) => {
			if (rowNumber > 1) {
				const cell = row.getCell(index + 1);
				const length = cell.value ? String(cell.value).length : 0;
				if (length > maxLength) maxLength = length;
			}
		});
		column.width = Math.min(Math.max(maxLength + 2, 10), 50);
	});

	worksheet.eachRow((row) => {
		row.eachCell((cell) => {
			cell.border = {
				top: { style: "thin" },
				left: { style: "thin" },
				bottom: { style: "thin" },
				right: { style: "thin" },
			};
		});
	});

	return workbook;
};
