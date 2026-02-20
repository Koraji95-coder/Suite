import ExcelJS from 'exceljs';
import type { GridPlacement, GridRod, GridConductor } from './types';

const TITLE_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B6CB5' } };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14, name: 'Arial' };

const SECTION_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
const SECTION_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12, name: 'Arial' };

const HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3A3F47' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFF0F0F0' }, size: 11, name: 'Arial' };

const EVEN_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E6E2' } };
const ODD_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4D1CC' } };
const DATA_FONT: Partial<ExcelJS.Font> = { size: 10, color: { argb: 'FF2A2A2A' }, name: 'Arial' };
const BOLD_DATA_FONT: Partial<ExcelJS.Font> = { bold: true, size: 10, color: { argb: 'FF2A2A2A' }, name: 'Arial' };

const BORDER_COLOR = { argb: 'FFB0ADA8' };
const ALL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: BORDER_COLOR },
  bottom: { style: 'thin', color: BORDER_COLOR },
  left: { style: 'thin', color: BORDER_COLOR },
  right: { style: 'thin', color: BORDER_COLOR },
};
const HEADER_BORDER: Partial<ExcelJS.Borders> = {
  ...ALL_BORDER,
  bottom: { style: 'medium', color: { argb: 'FF3A3F47' } },
};

function applyRowFill(row: ExcelJS.Row, fill: ExcelJS.FillPattern, colCount: number) {
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = fill;
    cell.border = ALL_BORDER;
  }
}

export async function exportGridToExcel(
  designName: string,
  placements: GridPlacement[],
  rods: GridRod[],
  conductors: GridConductor[],
): Promise<void> {
  const wb = new ExcelJS.Workbook();

  const wsPlace = wb.addWorksheet('Placements');
  const placeHeaders = ['Type', 'Grid X', 'Grid Y', 'AutoCAD X', 'AutoCAD Y', 'Rotation'];

  const titleRow = wsPlace.getRow(1);
  wsPlace.mergeCells(1, 1, 1, placeHeaders.length);
  const titleCell = titleRow.getCell(1);
  titleCell.value = `${designName} - Ground Grid Placements`;
  titleCell.font = TITLE_FONT;
  titleCell.fill = TITLE_FILL;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = ALL_BORDER;
  applyRowFill(titleRow, TITLE_FILL, placeHeaders.length);
  titleRow.height = 28;

  const grouped: Record<string, GridPlacement[]> = {};
  for (const p of placements) {
    (grouped[p.type] ||= []).push(p);
  }
  const typeOrder = ['GROUND_ROD_TEST_WELL', 'ROD', 'TEE', 'CROSS'];
  const sortedTypes = typeOrder.filter(t => grouped[t]?.length);

  let currentRow = 2;

  for (let ti = 0; ti < sortedTypes.length; ti++) {
    const typeName = sortedTypes[ti];
    const items = grouped[typeName];
    const labelMap: Record<string, string> = {
      GROUND_ROD_TEST_WELL: 'Ground Rod with Test Well',
      ROD: 'Ground Rods',
      TEE: 'Tee Connections',
      CROSS: 'Cross Connections',
    };

    const sectionRow = wsPlace.getRow(currentRow);
    wsPlace.mergeCells(currentRow, 1, currentRow, placeHeaders.length);
    const sectionCell = sectionRow.getCell(1);
    sectionCell.value = `${labelMap[typeName] || typeName} (${items.length})`;
    sectionCell.font = SECTION_FONT;
    sectionCell.fill = SECTION_FILL;
    sectionCell.alignment = { horizontal: 'left', vertical: 'middle' };
    applyRowFill(sectionRow, SECTION_FILL, placeHeaders.length);
    sectionRow.height = 24;
    currentRow++;

    const headerRow = wsPlace.getRow(currentRow);
    placeHeaders.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = HEADER_BORDER;
    });
    headerRow.height = 22;
    currentRow++;

    items.forEach((p, idx) => {
      const row = wsPlace.getRow(currentRow);
      const values = [p.type, p.grid_x, p.grid_y, +p.autocad_x.toFixed(4), +p.autocad_y.toFixed(4), p.rotation_deg];
      const fill = idx % 2 === 0 ? EVEN_FILL : ODD_FILL;
      values.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.fill = fill;
        cell.border = ALL_BORDER;
        cell.font = ci === 0 ? BOLD_DATA_FONT : DATA_FONT;
        cell.alignment = { horizontal: ci === 0 ? 'left' : 'right', vertical: 'middle' };
        if (typeof v === 'number') cell.numFmt = ci >= 3 ? '0.0000' : '0';
      });
      currentRow++;
    });

    if (ti < sortedTypes.length - 1) currentRow += 2;
  }

  placeHeaders.forEach((_, i) => {
    wsPlace.getColumn(i + 1).width = i === 0 ? 28 : 16;
  });

  if (rods.length > 0) {
    const wsRods = wb.addWorksheet('Rods');
    const rodHeaders = ['Label', 'Grid X', 'Grid Y', 'Depth', 'Diameter'];

    const rTitleRow = wsRods.getRow(1);
    wsRods.mergeCells(1, 1, 1, rodHeaders.length);
    const rTitleCell = rTitleRow.getCell(1);
    rTitleCell.value = `${designName} - Ground Rods`;
    rTitleCell.font = TITLE_FONT;
    rTitleCell.fill = TITLE_FILL;
    rTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyRowFill(rTitleRow, TITLE_FILL, rodHeaders.length);
    rTitleRow.height = 28;

    const rHeaderRow = wsRods.getRow(2);
    rodHeaders.forEach((h, i) => {
      const cell = rHeaderRow.getCell(i + 1);
      cell.value = h;
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = HEADER_BORDER;
    });
    rHeaderRow.height = 22;

    rods.forEach((r, idx) => {
      const row = wsRods.getRow(idx + 3);
      const values = [r.label, r.grid_x, r.grid_y, r.depth, r.diameter];
      const fill = idx % 2 === 0 ? EVEN_FILL : ODD_FILL;
      values.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.fill = fill;
        cell.border = ALL_BORDER;
        cell.font = ci === 0 ? BOLD_DATA_FONT : DATA_FONT;
        cell.alignment = { horizontal: ci === 0 ? 'left' : 'right', vertical: 'middle' };
      });
    });

    rodHeaders.forEach((_, i) => {
      wsRods.getColumn(i + 1).width = i === 0 ? 16 : 14;
    });
  }

  if (conductors.length > 0) {
    const wsCond = wb.addWorksheet('Conductors');
    const condHeaders = ['Label', 'Length', 'X1', 'Y1', 'X2', 'Y2', 'Diameter'];

    const cTitleRow = wsCond.getRow(1);
    wsCond.mergeCells(1, 1, 1, condHeaders.length);
    const cTitleCell = cTitleRow.getCell(1);
    cTitleCell.value = `${designName} - Conductors`;
    cTitleCell.font = TITLE_FONT;
    cTitleCell.fill = TITLE_FILL;
    cTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyRowFill(cTitleRow, TITLE_FILL, condHeaders.length);
    cTitleRow.height = 28;

    const cHeaderRow = wsCond.getRow(2);
    condHeaders.forEach((h, i) => {
      const cell = cHeaderRow.getCell(i + 1);
      cell.value = h;
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = HEADER_BORDER;
    });
    cHeaderRow.height = 22;

    conductors.forEach((c, idx) => {
      const row = wsCond.getRow(idx + 3);
      const values = [c.label, c.length ?? '', c.x1, c.y1, c.x2, c.y2, c.diameter];
      const fill = idx % 2 === 0 ? EVEN_FILL : ODD_FILL;
      values.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.fill = fill;
        cell.border = ALL_BORDER;
        cell.font = ci === 0 ? BOLD_DATA_FONT : DATA_FONT;
        cell.alignment = { horizontal: ci === 0 ? 'left' : 'right', vertical: 'middle' };
      });
    });

    condHeaders.forEach((_, i) => {
      wsCond.getColumn(i + 1).width = i === 0 ? 16 : 14;
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${designName.replace(/\s+/g, '_')}_ground_grid.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
