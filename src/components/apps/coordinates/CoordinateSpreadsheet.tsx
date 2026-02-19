import { useTheme, hexToRgba } from '@/lib/palette';
import { CoordinatePoint, SPREADSHEET_COLORS, SPREADSHEET_COLUMNS, EXCEL_COLS } from './types';

interface CoordinateSpreadsheetProps {
  data: CoordinatePoint[];
}

export function CoordinateSpreadsheet({ data }: CoordinateSpreadsheetProps) {
  const { palette } = useTheme();
  const c = SPREADSHEET_COLORS;

  const getCellValue = (point: CoordinatePoint, colIndex: number): string => {
    switch (colIndex) {
      case 0: return point.id;
      case 1: return point.east.toString();
      case 2: return point.north.toString();
      case 3: return point.elevation.toString();
      case 4: return point.layer;
      default: return '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div
        style={{
          borderRadius: '6px',
          overflow: 'hidden',
          border: `1px solid ${c.border}`,
          boxShadow: `0 2px 8px ${hexToRgba('#000', 0.12)}`,
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: "'Inter', -apple-system, sans-serif",
            fontSize: '12px',
            tableLayout: 'fixed',
          }}
        >
          <colgroup>
            <col style={{ width: '32px' }} />
            {EXCEL_COLS.map(col => (
              <col key={col} style={{ width: `calc((100% - 32px) / ${EXCEL_COLS.length})` }} />
            ))}
          </colgroup>

          <thead>
            <tr>
              <th
                style={{
                  background: hexToRgba(c.titleBg, 0.15),
                  borderBottom: `1px solid ${c.border}`,
                  borderRight: `1px solid ${c.border}`,
                  padding: '6px 4px',
                  fontSize: '9px',
                  color: c.cellRef,
                  fontWeight: '400',
                  textAlign: 'center',
                }}
              />
              {EXCEL_COLS.map(col => (
                <th
                  key={col}
                  style={{
                    background: hexToRgba(c.titleBg, 0.08),
                    borderBottom: `1px solid ${c.border}`,
                    borderRight: `1px solid ${c.border}`,
                    padding: '4px',
                    fontSize: '10px',
                    color: c.cellRef,
                    fontWeight: '500',
                    textAlign: 'center',
                    letterSpacing: '0.5px',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>

            <tr>
              <td
                style={{
                  background: hexToRgba(c.titleBg, 0.08),
                  borderBottom: `1px solid ${c.border}`,
                  borderRight: `1px solid ${c.border}`,
                  padding: '4px',
                  fontSize: '9px',
                  color: c.cellRef,
                  textAlign: 'center',
                }}
              >
                1
              </td>
              <td
                colSpan={5}
                style={{
                  background: c.titleBg,
                  borderBottom: `1px solid ${c.border}`,
                  padding: '10px 16px',
                  fontSize: '15px',
                  fontWeight: '700',
                  color: c.titleText,
                  textAlign: 'center',
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                }}
              >
                Ground Grid Coordinates
              </td>
            </tr>

            <tr>
              <td
                style={{
                  background: hexToRgba(c.titleBg, 0.08),
                  borderBottom: `1px solid ${c.border}`,
                  borderRight: `1px solid ${c.border}`,
                  padding: '4px',
                  fontSize: '9px',
                  color: c.cellRef,
                  textAlign: 'center',
                }}
              >
                2
              </td>
              {SPREADSHEET_COLUMNS.map((col, i) => (
                <th
                  key={col}
                  style={{
                    background: c.headerBg,
                    borderBottom: `1px solid ${c.border}`,
                    borderRight: i < SPREADSHEET_COLUMNS.length - 1 ? `1px solid ${hexToRgba('#FFF', 0.1)}` : 'none',
                    padding: '8px 10px',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: c.headerText,
                    textAlign: 'center',
                    letterSpacing: '0.3px',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  style={{
                    background: hexToRgba(c.titleBg, 0.08),
                    borderBottom: `1px solid ${c.border}`,
                    borderRight: `1px solid ${c.border}`,
                    padding: '4px',
                    fontSize: '9px',
                    color: c.cellRef,
                    textAlign: 'center',
                  }}
                >
                  3
                </td>
                <td
                  colSpan={5}
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    color: c.cellRef,
                    fontSize: '12px',
                    background: c.rowEven,
                    fontStyle: 'italic',
                  }}
                >
                  No coordinate data yet. Run a search to populate this table.
                </td>
              </tr>
            ) : (
              data.map((point, rowIdx) => {
                const rowNum = rowIdx + 3;
                const isEven = rowIdx % 2 === 0;
                return (
                  <tr key={point.id + rowIdx}>
                    <td
                      style={{
                        background: hexToRgba(c.titleBg, 0.08),
                        borderBottom: `1px solid ${c.border}`,
                        borderRight: `1px solid ${c.border}`,
                        padding: '4px',
                        fontSize: '9px',
                        color: c.cellRef,
                        textAlign: 'center',
                      }}
                    >
                      {rowNum}
                    </td>
                    {EXCEL_COLS.map((_, colIdx) => (
                      <td
                        key={colIdx}
                        style={{
                          background: isEven ? c.rowEven : c.rowOdd,
                          borderBottom: `1px solid ${c.border}`,
                          borderRight: colIdx < EXCEL_COLS.length - 1 ? `1px solid ${c.border}` : 'none',
                          padding: '7px 10px',
                          fontSize: '12px',
                          color: c.rowText,
                          textAlign: colIdx === 0 || colIdx === 4 ? 'left' : 'right',
                          fontFamily: colIdx >= 1 && colIdx <= 3 ? 'monospace' : 'inherit',
                          fontWeight: colIdx === 0 ? '600' : '400',
                        }}
                      >
                        {getCellValue(point, colIdx)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: palette.textMuted }}>
          {data.length > 0
            ? `${data.length} point${data.length !== 1 ? 's' : ''} -- Cells A1:E${data.length + 2}`
            : 'Template: A1:E8'}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <span
            style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              borderRadius: '2px',
              background: c.rowEven,
              border: `1px solid ${c.border}`,
            }}
          />
          <span
            style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              borderRadius: '2px',
              background: c.rowOdd,
              border: `1px solid ${c.border}`,
            }}
          />
          <span style={{ fontSize: '10px', color: palette.textMuted, marginLeft: '4px' }}>Alternating rows</span>
        </div>
      </div>
    </div>
  );
}
