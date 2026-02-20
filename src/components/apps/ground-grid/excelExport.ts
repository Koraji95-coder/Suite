import ExcelJS from 'exceljs';
import type { GridPlacement, GridRod, GridConductor } from './types';

const TITLE_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B6CB5' } };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14, name: 'Arial' };

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

const SECTION_COLORS: Record<string, string> = {
  GROUND_ROD_TEST_WELL: 'FFC0392B',
  ROD: 'FF27AE60',
  TEE: 'FF2980B9',
  CROSS: 'FF16A085',
};

const HEADER_FILLS: Record<string, ExcelJS.FillPattern> = {
  GROUND_ROD_TEST_WELL: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF922B21' } },
  ROD: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E8449' } },
  TEE: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F618D' } },
  CROSS: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF117A65' } },
};

const RODS_SECTION_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF27AE60' } };
const RODS_HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E8449' } };
const CONDS_SECTION_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE67E22' } };
const CONDS_HEADER_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCA6F1E' } };

const SECTION_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12, name: 'Arial' };

function applyRowFill(row: ExcelJS.Row, fill: ExcelJS.FillPattern, colCount: number) {
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = fill;
    cell.border = ALL_BORDER;
  }
}

function autofitColumns(ws: ExcelJS.Worksheet, colCount: number, lastDataRow: number) {
  for (let c = 1; c <= colCount; c++) {
    let maxLen = 0;
    for (let r = 1; r <= lastDataRow; r++) {
      const cell = ws.getRow(r).getCell(c);
      const val = cell.value;
      const len = val != null ? String(val).length : 0;
      if (len > maxLen) maxLen = len;
    }
    ws.getColumn(c).width = Math.max(10, Math.min(40, maxLen + 4));
  }
}

function hideUnusedCells(ws: ExcelJS.Worksheet, colCount: number, lastDataRow: number) {
  const blankFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  const blankFont: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, size: 1, name: 'Arial' };

  const extraCols = 50;
  const extraRows = 200;

  for (let c = colCount + 1; c <= colCount + extraCols; c++) {
    const col = ws.getColumn(c);
    col.width = 2;
    col.hidden = true;
  }

  for (let r = lastDataRow + 1; r <= lastDataRow + extraRows; r++) {
    const row = ws.getRow(r);
    row.hidden = true;
  }

  for (let r = 1; r <= lastDataRow; r++) {
    for (let c = colCount + 1; c <= colCount + extraCols; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.fill = blankFill;
      cell.font = blankFont;
      cell.border = {};
    }
  }

  for (let r = lastDataRow + 1; r <= lastDataRow + extraRows; r++) {
    for (let c = 1; c <= colCount + extraCols; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.fill = blankFill;
      cell.font = blankFont;
      cell.border = {};
    }
  }

  ws.views = [{ state: 'normal', rightToLeft: false, showGridLines: false }];
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

    const sectionFill: ExcelJS.FillPattern = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: SECTION_COLORS[typeName] || 'FF5B9BD5' },
    };

    const sectionRow = wsPlace.getRow(currentRow);
    wsPlace.mergeCells(currentRow, 1, currentRow, placeHeaders.length);
    const sectionCell = sectionRow.getCell(1);
    sectionCell.value = `${labelMap[typeName] || typeName} (${items.length})`;
    sectionCell.font = SECTION_FONT;
    sectionCell.fill = sectionFill;
    sectionCell.alignment = { horizontal: 'left', vertical: 'middle' };
    applyRowFill(sectionRow, sectionFill, placeHeaders.length);
    sectionRow.height = 24;
    currentRow++;

    const hdrFill = HEADER_FILLS[typeName] || { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF3A3F47' } };
    const headerRow = wsPlace.getRow(currentRow);
    placeHeaders.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = HEADER_FONT;
      cell.fill = hdrFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { ...ALL_BORDER, bottom: { style: 'medium', color: { argb: 'FF3A3F47' } } };
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
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (typeof v === 'number') cell.numFmt = ci >= 3 ? '0.0000' : '0';
      });
      currentRow++;
    });

  }

  if (conductors.length > 0) {
    currentRow++;
    const condSectionRow = wsPlace.getRow(currentRow);
    wsPlace.mergeCells(currentRow, 1, currentRow, placeHeaders.length);
    condSectionRow.getCell(1).value = `Conductors (${conductors.length})`;
    condSectionRow.getCell(1).font = SECTION_FONT;
    condSectionRow.getCell(1).fill = CONDS_SECTION_FILL;
    condSectionRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    applyRowFill(condSectionRow, CONDS_SECTION_FILL, placeHeaders.length);
    condSectionRow.height = 24;
    currentRow++;

    const condHeaders = ['Label', 'Length', 'X1', 'Y1', 'X2', 'Y2'];
    const condHeaderRow = wsPlace.getRow(currentRow);
    condHeaders.forEach((h, i) => {
      const cell = condHeaderRow.getCell(i + 1);
      cell.value = h;
      cell.font = HEADER_FONT;
      cell.fill = CONDS_HEADER_FILL;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { ...ALL_BORDER, bottom: { style: 'medium', color: { argb: 'FF3A3F47' } } };
    });
    condHeaderRow.height = 22;
    currentRow++;

    conductors.forEach((c, idx) => {
      const row = wsPlace.getRow(currentRow);
      const values = [c.label, c.length ?? '', c.x1, c.y1, c.x2, c.y2];
      const fill = idx % 2 === 0 ? EVEN_FILL : ODD_FILL;
      values.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.fill = fill;
        cell.border = ALL_BORDER;
        cell.font = ci === 0 ? BOLD_DATA_FONT : DATA_FONT;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      currentRow++;
    });
  }

  const placeLastRow = currentRow - 1;
  autofitColumns(wsPlace, placeHeaders.length, placeLastRow);
  hideUnusedCells(wsPlace, placeHeaders.length, placeLastRow);

  if (rods.length > 0) {
    const wsRods = wb.addWorksheet('Ground Rods');
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

    const rSectionRow = wsRods.getRow(2);
    wsRods.mergeCells(2, 1, 2, rodHeaders.length);
    rSectionRow.getCell(1).value = `Ground Rods (${rods.length})`;
    rSectionRow.getCell(1).font = SECTION_FONT;
    rSectionRow.getCell(1).fill = RODS_SECTION_FILL;
    rSectionRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    applyRowFill(rSectionRow, RODS_SECTION_FILL, rodHeaders.length);
    rSectionRow.height = 24;

    const rHeaderRow = wsRods.getRow(3);
    rodHeaders.forEach((h, i) => {
      const cell = rHeaderRow.getCell(i + 1);
      cell.value = h;
      cell.font = HEADER_FONT;
      cell.fill = RODS_HEADER_FILL;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { ...ALL_BORDER, bottom: { style: 'medium', color: { argb: 'FF3A3F47' } } };
    });
    rHeaderRow.height = 22;

    rods.forEach((r, idx) => {
      const row = wsRods.getRow(idx + 4);
      const values = [r.label, r.grid_x, r.grid_y, r.depth, r.diameter];
      const fill = idx % 2 === 0 ? EVEN_FILL : ODD_FILL;
      values.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.fill = fill;
        cell.border = ALL_BORDER;
        cell.font = ci === 0 ? BOLD_DATA_FONT : DATA_FONT;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    const rodsLastRow = rods.length + 3;
    autofitColumns(wsRods, rodHeaders.length, rodsLastRow);
    hideUnusedCells(wsRods, rodHeaders.length, rodsLastRow);
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

    const cSectionRow = wsCond.getRow(2);
    wsCond.mergeCells(2, 1, 2, condHeaders.length);
    cSectionRow.getCell(1).value = `Conductors (${conductors.length})`;
    cSectionRow.getCell(1).font = SECTION_FONT;
    cSectionRow.getCell(1).fill = CONDS_SECTION_FILL;
    cSectionRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    applyRowFill(cSectionRow, CONDS_SECTION_FILL, condHeaders.length);
    cSectionRow.height = 24;

    const cHeaderRow = wsCond.getRow(3);
    condHeaders.forEach((h, i) => {
      const cell = cHeaderRow.getCell(i + 1);
      cell.value = h;
      cell.font = HEADER_FONT;
      cell.fill = CONDS_HEADER_FILL;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { ...ALL_BORDER, bottom: { style: 'medium', color: { argb: 'FF3A3F47' } } };
    });
    cHeaderRow.height = 22;

    conductors.forEach((c, idx) => {
      const row = wsCond.getRow(idx + 4);
      const values = [c.label, c.length ?? '', c.x1, c.y1, c.x2, c.y2, c.diameter];
      const fill = idx % 2 === 0 ? EVEN_FILL : ODD_FILL;
      values.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.fill = fill;
        cell.border = ALL_BORDER;
        cell.font = ci === 0 ? BOLD_DATA_FONT : DATA_FONT;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    const condsLastRow = conductors.length + 3;
    autofitColumns(wsCond, condHeaders.length, condsLastRow);
    hideUnusedCells(wsCond, condHeaders.length, condsLastRow);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${designName.replace(/\s+/g, '_')}_ground_grid.xlsx`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 250);
}
