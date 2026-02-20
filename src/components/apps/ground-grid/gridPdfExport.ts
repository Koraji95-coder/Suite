import type { GridRod, GridConductor, GridPlacement } from './types';
import { totalConductorLength } from './gridEngine';

interface ReportData {
  designName: string;
  rods: GridRod[];
  conductors: GridConductor[];
  placements: GridPlacement[];
  segments: number;
  tees: number;
  crosses: number;
}

function groupPlacements(placements: GridPlacement[]) {
  const grouped: Record<string, GridPlacement[]> = {};
  for (const p of placements) {
    (grouped[p.type] ||= []).push(p);
  }
  const order = ['GROUND_ROD_TEST_WELL', 'ROD', 'TEE', 'CROSS'];
  return order.filter(t => grouped[t]?.length).map(t => ({ type: t, items: grouped[t] }));
}

const TYPE_LABELS: Record<string, string> = {
  GROUND_ROD_TEST_WELL: 'Ground Rod with Test Well',
  ROD: 'Ground Rods',
  TEE: 'Tee Connections',
  CROSS: 'Cross Connections',
};

const TYPE_COLORS: Record<string, { section: string; header: string }> = {
  GROUND_ROD_TEST_WELL: { section: '#c0392b', header: '#922b21' },
  ROD: { section: '#27ae60', header: '#1e8449' },
  TEE: { section: '#2980b9', header: '#1f618d' },
  CROSS: { section: '#16a085', header: '#117a65' },
};

function escapeHtml(s: string | number) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildPlacementTable(type: string, items: GridPlacement[]): string {
  const colors = TYPE_COLORS[type] || { section: '#5b9bd5', header: '#3a3f47' };
  const label = TYPE_LABELS[type] || type;
  const headers = ['Type', 'Grid X', 'Grid Y', 'AutoCAD X', 'AutoCAD Y', 'Rotation'];

  let rows = '';
  items.forEach((p, i) => {
    const bg = i % 2 === 0 ? '#e8e6e2' : '#d4d1cc';
    rows += `<tr style="background:${bg}">
      <td style="font-weight:600">${escapeHtml(p.type)}</td>
      <td>${escapeHtml(p.grid_x)}</td><td>${escapeHtml(p.grid_y)}</td>
      <td>${escapeHtml(p.autocad_x.toFixed(4))}</td><td>${escapeHtml(p.autocad_y.toFixed(4))}</td>
      <td>${escapeHtml(p.rotation_deg)}</td>
    </tr>`;
  });

  return `
    <tr class="section-row" style="background:${colors.section}">
      <td colspan="6" style="text-align:left;color:#fff;font-weight:700;font-size:13px;padding:6px 10px">
        ${escapeHtml(label)} (${items.length})
      </td>
    </tr>
    <tr class="col-header" style="background:${colors.header}">
      ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
    </tr>
    ${rows}`;
}

export function generateGridReport(data: ReportData): void {
  const {
    designName, rods, conductors, placements,
    segments, tees, crosses,
  } = data;

  const testWells = placements.filter(p => p.type === 'GROUND_ROD_TEST_WELL').length;
  const rodOnly = rods.length - testWells;
  const totalLen = totalConductorLength(conductors).toFixed(2);
  const now = new Date().toLocaleString();

  const groups = groupPlacements(placements);

  let placementSections = '';
  for (const g of groups) {
    placementSections += buildPlacementTable(g.type, g.items);
  }

  if (conductors.length > 0) {
    const condHeaders = ['Label', 'Length', 'X1', 'Y1', 'X2', 'Y2'];
    let condRows = '';
    conductors.forEach((c, i) => {
      const bg = i % 2 === 0 ? '#e8e6e2' : '#d4d1cc';
      condRows += `<tr style="background:${bg}">
        <td style="font-weight:600">${escapeHtml(c.label)}</td>
        <td>${escapeHtml(c.length ?? '')}</td>
        <td>${escapeHtml(c.x1)}</td><td>${escapeHtml(c.y1)}</td>
        <td>${escapeHtml(c.x2)}</td><td>${escapeHtml(c.y2)}</td>
      </tr>`;
    });
    placementSections += `
      <tr class="spacer-row"><td colspan="6" style="height:8px;border:none;background:#fff"></td></tr>
      <tr class="section-row" style="background:#e67e22">
        <td colspan="6" style="text-align:left;color:#fff;font-weight:700;font-size:13px;padding:6px 10px">
          Conductors (${conductors.length})
        </td>
      </tr>
      <tr class="col-header" style="background:#ca6f1e">
        ${condHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
      </tr>
      ${condRows}`;
  }

  let rodTableHtml = '';
  if (rods.length > 0) {
    const rodHeaders = ['Label', 'Grid X', 'Grid Y', 'Depth', 'Diameter'];
    let rodRows = '';
    rods.forEach((r, i) => {
      const bg = i % 2 === 0 ? '#e8e6e2' : '#d4d1cc';
      rodRows += `<tr style="background:${bg}">
        <td style="font-weight:600">${escapeHtml(r.label)}</td>
        <td>${escapeHtml(r.grid_x)}</td><td>${escapeHtml(r.grid_y)}</td>
        <td>${escapeHtml(r.depth)}</td><td>${escapeHtml(r.diameter)}</td>
      </tr>`;
    });

    rodTableHtml = `
    <div class="table-block">
      <table>
        <thead>
          <tr class="table-title" style="background:#2b6cb5">
            <td colspan="5" style="text-align:center;color:#fff;font-weight:700;font-size:16px;padding:8px 10px">
              ${escapeHtml(designName)} - Ground Rods
            </td>
          </tr>
          <tr class="section-row" style="background:#27ae60">
            <td colspan="5" style="text-align:left;color:#fff;font-weight:700;font-size:13px;padding:6px 10px">
              Ground Rods (${rods.length})
            </td>
          </tr>
          <tr class="col-header" style="background:#1e8449">
            ${rodHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${rodRows}</tbody>
      </table>
    </div>`;
  }

  let conductorTableHtml = '';
  if (conductors.length > 0) {
    const condHeaders = ['Label', 'Length', 'X1', 'Y1', 'X2', 'Y2', 'Diameter'];
    let condRows = '';
    conductors.forEach((c, i) => {
      const bg = i % 2 === 0 ? '#e8e6e2' : '#d4d1cc';
      condRows += `<tr style="background:${bg}">
        <td style="font-weight:600">${escapeHtml(c.label)}</td>
        <td>${escapeHtml(c.length ?? '')}</td>
        <td>${escapeHtml(c.x1)}</td><td>${escapeHtml(c.y1)}</td>
        <td>${escapeHtml(c.x2)}</td><td>${escapeHtml(c.y2)}</td>
        <td>${escapeHtml(c.diameter)}</td>
      </tr>`;
    });

    conductorTableHtml = `
    <div class="table-block">
      <table>
        <thead>
          <tr class="table-title" style="background:#2b6cb5">
            <td colspan="7" style="text-align:center;color:#fff;font-weight:700;font-size:16px;padding:8px 10px">
              ${escapeHtml(designName)} - Conductors
            </td>
          </tr>
          <tr class="section-row" style="background:#e67e22">
            <td colspan="7" style="text-align:left;color:#fff;font-weight:700;font-size:13px;padding:6px 10px">
              Conductors (${conductors.length})
            </td>
          </tr>
          <tr class="col-header" style="background:#ca6f1e">
            ${condHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${condRows}</tbody>
      </table>
    </div>`;
  }

  const stats = [
    { value: rodOnly, label: 'Ground Rods', color: '#22c55e' },
    { value: testWells, label: 'Test Wells', color: '#ef4444' },
    { value: conductors.length, label: 'Conductors', color: '#e67e22' },
    { value: segments, label: 'Segments', color: '#f59e0b' },
    { value: tees, label: 'Tees', color: '#3b82f6' },
    { value: crosses, label: 'Crosses', color: '#06b6d4' },
    { value: totalLen, label: 'Total Length (ft)', color: '#78716c' },
  ];

  const statsHtml = stats.map(s => `
    <td style="text-align:center;padding:8px 4px;border:1px solid #e5e7eb">
      <div style="font-size:22px;font-weight:700;color:${s.color}">${s.value}</div>
      <div style="font-size:9px;color:#666;margin-top:2px">${s.label}</div>
    </td>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(designName)} - Ground Grid Report</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
      @page { margin: 0.8cm; size: landscape; }
      .table-block { page-break-inside: avoid; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #1a1a1a;
      padding: 28px 32px;
      max-width: 1100px;
      margin: 0 auto;
    }
    .report-title {
      font-size: 28px;
      font-weight: 800;
      color: #1a1a1a;
      border-bottom: 3px solid #f59e0b;
      padding-bottom: 6px;
      margin: 0 0 4px 0;
    }
    .meta { font-size: 11px; color: #888; margin-bottom: 16px; }
    .stats-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .stats-table td { background: #fafafa; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .table-block { margin-bottom: 28px; }
    .table-title td {
      font-size: 16px !important;
      font-weight: 700;
    }
    .section-row td {
      font-size: 13px;
      font-weight: 700;
    }
    .col-header th {
      color: #fff;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      text-align: center;
      padding: 5px 8px;
      border: 1px solid rgba(0,0,0,0.15);
    }
    td, th {
      border: 1px solid #b0ada8;
      padding: 3px 8px;
      text-align: center;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="report-title">${escapeHtml(designName)}</div>
  <div class="meta">Ground Grid Report &mdash; Generated: ${escapeHtml(now)}</div>

  <table class="stats-table"><tr>${statsHtml}</tr></table>

  <div class="table-block">
    <table>
      <thead>
        <tr class="table-title" style="background:#2b6cb5">
          <td colspan="6" style="text-align:center;color:#fff;font-weight:700;font-size:16px;padding:8px 10px">
            ${escapeHtml(designName)} - Ground Grid Placements
          </td>
        </tr>
      </thead>
      <tbody>
        ${placementSections}
      </tbody>
    </table>
  </div>

  ${rodTableHtml}
  ${conductorTableHtml}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  iframe.src = url;
  iframe.onload = () => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    }, 1000);
  };
}
