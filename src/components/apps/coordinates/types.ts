export interface CoordinatePoint {
  id: string;
  east: number;
  north: number;
  elevation: number;
  layer: string;
}
export const SPREADSHEET_COLUMNS = ['Point ID', 'East (X)', 'North (Y)', 'Elevation (Z)', 'Layer'] as const;
export const EXCEL_COLS = ['A', 'B', 'C', 'D', 'E'] as const;
