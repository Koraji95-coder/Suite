export interface CoordinatePoint {
  id: string;
  east: number;
  north: number;
  elevation: number;
  layer: string;
}

export const SPREADSHEET_COLORS = {
  titleBg: '#2B6CB5',
  titleText: '#FFFFFF',
  headerBg: '#3A3F47',
  headerText: '#F0F0F0',
  rowEven: '#E8E6E2',
  rowOdd: '#D4D1CC',
  rowText: '#2A2A2A',
  border: '#B0ADA8',
  cellRef: '#7A7772',
} as const;

export const SPREADSHEET_COLUMNS = ['Point ID', 'East (X)', 'North (Y)', 'Elevation (Z)', 'Layer'] as const;
export const EXCEL_COLS = ['A', 'B', 'C', 'D', 'E'] as const;
