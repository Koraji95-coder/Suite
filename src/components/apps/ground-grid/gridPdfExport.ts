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

export function generateGridReport(data: ReportData): void {
  const {
    designName, rods, conductors, placements,
    segments, tees, crosses,
  } = data;

  const testWells = placements.filter(p => p.type === 'GROUND_ROD_TEST_WELL').length;
  const rodOnly = rods.length - testWells;
  const totalLen = totalConductorLength(conductors).toFixed(2);
  const now = new Date().toLocaleString();

  const rodRows = rods.map(r =>
    `<tr><td>${r.label}</td><td>${r.grid_x}</td><td>${r.grid_y}</td><td>${r.depth}</td><td>${r.diameter}</td></tr>`
  ).join('');

  const conductorRows = conductors.map(c =>
    `<tr><td>${c.label}</td><td>${c.x1}</td><td>${c.y1}</td><td>${c.x2}</td><td>${c.y2}</td><td>${c.diameter}</td></tr>`
  ).join('');

  const placementRows = placements.map(p =>
    `<tr><td>${p.type}</td><td>${p.grid_x}</td><td>${p.grid_y}</td><td>${p.autocad_x.toFixed(4)}</td><td>${p.autocad_y.toFixed(4)}</td><td>${p.rotation_deg}</td></tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${designName} - Ground Grid Report</title>
  <style>
    @media print { body { margin: 0; } .no-print { display: none; } @page { margin: 1cm; } }
    body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 40px; max-width: 1000px; margin: 0 auto; }
    h1 { font-size: 24px; border-bottom: 2px solid #f59e0b; padding-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 32px; color: #333; }
    .meta { font-size: 12px; color: #666; margin-bottom: 24px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 16px 0 24px; }
    .stat { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; }
    .stat-label { font-size: 11px; color: #666; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
    th, td { border: 1px solid #e5e7eb; padding: 4px 8px; text-align: center; }
    th { background: #f9fafb; font-weight: 600; font-size: 10px; text-transform: uppercase; color: #555; }
  </style>
</head>
<body>
  <h1>${designName}</h1>
  <div class="meta">Generated: ${now}</div>
  <div class="stats">
    <div class="stat"><div class="stat-value" style="color:#22c55e">${rodOnly}</div><div class="stat-label">Ground Rods</div></div>
    <div class="stat"><div class="stat-value" style="color:#ef4444">${testWells}</div><div class="stat-label">Test Wells</div></div>
    <div class="stat"><div class="stat-value" style="color:#f59e0b">${segments}</div><div class="stat-label">Segments</div></div>
    <div class="stat"><div class="stat-value" style="color:#3b82f6">${tees}</div><div class="stat-label">Tees</div></div>
    <div class="stat"><div class="stat-value" style="color:#06b6d4">${crosses}</div><div class="stat-label">Crosses</div></div>
    <div class="stat"><div class="stat-value" style="color:#78716c">${totalLen}</div><div class="stat-label">Total Length (ft)</div></div>
  </div>
  <h2>Ground Rods (${rods.length})</h2>
  <table><thead><tr><th>Label</th><th>X</th><th>Y</th><th>Depth</th><th>Diameter</th></tr></thead><tbody>${rodRows}</tbody></table>
  <h2>Conductors (${conductors.length})</h2>
  <table><thead><tr><th>Label</th><th>X1</th><th>Y1</th><th>X2</th><th>Y2</th><th>Diameter</th></tr></thead><tbody>${conductorRows}</tbody></table>
  <h2>Placements (${placements.length})</h2>
  <table><thead><tr><th>Type</th><th>Grid X</th><th>Grid Y</th><th>AutoCAD X</th><th>AutoCAD Y</th><th>Rotation</th></tr></thead><tbody>${placementRows}</tbody></table>
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
