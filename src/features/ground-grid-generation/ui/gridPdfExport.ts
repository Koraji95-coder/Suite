import { totalConductorLength } from "./gridEngine";
import type { GridConductor, GridPlacement, GridRod } from "./types";

interface ReportData {
	designName: string;
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
	segments: number;
	tees: number;
	crosses: number;
}

type QaSeverity = "ERROR" | "WARNING" | "INFO";
type QaItem = { severity: QaSeverity; message: string };

const TYPE_LABELS: Record<string, string> = {
	GROUND_ROD_WITH_TEST_WELL: "Ground Rod with Test Well",
	TEE: "Tee Connections",
	CROSS: "Cross Connections",
};

const TYPE_COLORS: Record<string, { section: string; header: string }> = {
	GROUND_ROD_WITH_TEST_WELL: { section: "#c0392b", header: "#922b21" },
	TEE: { section: "#2980b9", header: "#1f618d" },
	CROSS: { section: "#16a085", header: "#117a65" },
};

function escapeHtml(s: string | number) {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function buildQaItems(params: {
	placements: GridPlacement[];
	conductors: GridConductor[];
	rods: GridRod[];
	testWells: number;
}): QaItem[] {
	const { placements, conductors, rods, testWells } = params;
	const items: QaItem[] = [];
	const validTypes = new Set(["ROD", "TEE", "CROSS", "GROUND_ROD_WITH_TEST_WELL"]);

	const unknownTypes = Array.from(
		new Set(
			placements
				.map((placement) => placement.type)
				.filter((type) => !validTypes.has(type)),
		),
	);
	if (unknownTypes.length > 0) {
		items.push({
			severity: "ERROR",
			message: `Unknown placement type(s): ${unknownTypes.join(", ")}`,
		});
	}

	const buckets = new Map<string, Set<string>>();
	for (const placement of placements) {
		const key = `${placement.grid_x.toFixed(6)},${placement.grid_y.toFixed(6)}`;
		const set = buckets.get(key) || new Set<string>();
		set.add(placement.type);
		buckets.set(key, set);
	}
	const mixedCollisions = Array.from(buckets.values()).filter(
		(types) =>
			types.size > 1 &&
			!(types.size === 2 && types.has("ROD") && types.has("GROUND_ROD_WITH_TEST_WELL")),
	).length;
	if (mixedCollisions > 0) {
		items.push({
			severity: "ERROR",
			message: `Detected ${mixedCollisions} mixed-type placement collisions at shared coordinates.`,
		});
	}

	if (conductors.length > 0 && placements.length === 0) {
		items.push({
			severity: "WARNING",
			message: "Conductors exist but no placements were generated.",
		});
	}
	if (testWells !== 4) {
		items.push({
			severity: "WARNING",
			message: `Expected 4 corner test wells; found ${testWells}.`,
		});
	}
	if (rods.length < testWells) {
		items.push({
			severity: "ERROR",
			message: "Test well count exceeds rod count.",
		});
	}
	if (items.length === 0) {
		items.push({ severity: "INFO", message: "No QA issues detected." });
	}
	return items;
}

function buildPlacementTypeTable(params: {
	designName: string;
	type: "GROUND_ROD_WITH_TEST_WELL" | "TEE" | "CROSS";
	items: GridPlacement[];
	note?: string;
}): string {
	const { designName, type, items, note } = params;
	if (items.length === 0) return "";

	const colors = TYPE_COLORS[type] || { section: "#5b9bd5", header: "#3a3f47" };
	const label = TYPE_LABELS[type] || type;
	const headers = [
		"Type",
		"Grid X",
		"Grid Y",
		"AutoCAD X",
		"AutoCAD Y",
		"Rotation",
	];

	let rows = "";
	items.forEach((p, i) => {
		const bg = i % 2 === 0 ? "#e8e6e2" : "#d4d1cc";
		rows += `<tr style="background:${bg}">
      <td style="font-weight:600">${escapeHtml(p.type)}</td>
      <td>${escapeHtml(p.grid_x)}</td><td>${escapeHtml(p.grid_y)}</td>
      <td>${escapeHtml(p.autocad_x.toFixed(4))}</td><td>${escapeHtml(
			p.autocad_y.toFixed(4),
		)}</td>
      <td>${escapeHtml(p.rotation_deg)}</td>
    </tr>`;
	});

	return `
  <div class="table-block">
    <table>
      <thead>
        <tr class="table-title" style="background:#2b6cb5">
          <td colspan="6" style="text-align:center;color:#fff;font-weight:700;font-size:16px;padding:8px 10px">
            ${escapeHtml(designName)} - ${escapeHtml(label)}
          </td>
        </tr>
        <tr class="section-row" style="background:${colors.section}">
          <td colspan="6" style="text-align:left;color:#fff;font-weight:700;font-size:13px;padding:6px 10px">
            ${escapeHtml(label)} (${items.length})
          </td>
        </tr>
        <tr class="col-header" style="background:${colors.header}">
          ${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    ${note ? `<div class="table-note">${escapeHtml(note)}</div>` : ""}
  </div>`;
}

export function generateGridReport(data: ReportData): void {
	const { designName, rods, conductors, placements } = data;

	const testWellPlacements = placements.filter(
		(p) => p.type === "GROUND_ROD_WITH_TEST_WELL",
	);
	const teePlacements = placements.filter((p) => p.type === "TEE");
	const crossPlacements = placements.filter((p) => p.type === "CROSS");

	const testWells = testWellPlacements.length;
	const rodOnly = Math.max(0, rods.length - testWells);
	const totalLen = totalConductorLength(conductors).toFixed(2);
	const now = new Date().toLocaleString();
	const qaItems = buildQaItems({ placements, conductors, rods, testWells });

	let rodTableHtml = "";
	if (rods.length > 0) {
		const rodHeaders = ["Label", "Grid X", "Grid Y", "Depth", "Diameter"];
		let rodRows = "";
		rods.forEach((r, i) => {
			const bg = i % 2 === 0 ? "#e8e6e2" : "#d4d1cc";
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
          <tr style="background:#f0ede8">
            <td colspan="5" style="text-align:left;color:#555;font-size:10px;padding:4px 10px">
              ${escapeHtml(`${rodOnly} standard rods + ${testWells} test wells included in rod total.`)}
            </td>
          </tr>
          <tr class="col-header" style="background:#1e8449">
            ${rodHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>${rodRows}</tbody>
      </table>
    </div>`;
	}

	let conductorTableHtml = "";
	if (conductors.length > 0) {
		const condHeaders = ["Label", "Length", "X1", "Y1", "X2", "Y2", "Diameter"];
		let condRows = "";
		conductors.forEach((c, i) => {
			const bg = i % 2 === 0 ? "#e8e6e2" : "#d4d1cc";
			condRows += `<tr style="background:${bg}">
        <td style="font-weight:600">${escapeHtml(c.label)}</td>
        <td>${escapeHtml(c.length ?? "")}</td>
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
            ${condHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>${condRows}</tbody>
      </table>
    </div>`;
	}

	const testWellTableHtml = buildPlacementTypeTable({
		designName,
		type: "GROUND_ROD_WITH_TEST_WELL",
		items: testWellPlacements,
		note: "Note: Test wells are included in total ground rod counts.",
	});
	const teeTableHtml = buildPlacementTypeTable({
		designName,
		type: "TEE",
		items: teePlacements,
	});
	const crossTableHtml = buildPlacementTypeTable({
		designName,
		type: "CROSS",
		items: crossPlacements,
	});

	const stats = [
		{ value: rods.length, label: "Ground Rods (incl. TW)", color: "#22c55e" },
		{ value: testWells, label: "Test Wells", color: "#ef4444" },
		{ value: conductors.length, label: "Conductors", color: "#e67e22" },
		{ value: teePlacements.length, label: "Tees", color: "#3b82f6" },
		{ value: crossPlacements.length, label: "Crosses", color: "#06b6d4" },
		{ value: totalLen, label: "Total Length (ft)", color: "#78716c" },
	];

	const statsHtml = stats
		.map(
			(s) => `
    <td style="text-align:center;padding:8px 4px;border:1px solid #e5e7eb">
      <div style="font-size:22px;font-weight:700;color:${s.color}">${s.value}</div>
      <div style="font-size:9px;color:#666;margin-top:2px">${s.label}</div>
    </td>`,
		)
		.join("");

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
    .table-note {
      margin-top: 8px;
      font-size: 10px;
      color: #4b5563;
      border-left: 3px solid #9ca3af;
      padding-left: 8px;
    }
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
        <tr class="table-title" style="background:#374151">
          <td colspan="2" style="text-align:center;color:#fff;font-weight:700;font-size:16px;padding:8px 10px">
            ${escapeHtml(designName)} - QA Summary
          </td>
        </tr>
        <tr class="col-header" style="background:#4b5563">
          <th>Severity</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        ${qaItems
					.map((item, index) => {
						const bg = index % 2 === 0 ? "#e8e6e2" : "#d4d1cc";
						return `<tr style="background:${bg}">
          <td style="font-weight:700">${
						item.severity === "ERROR"
							? "<span style='color:#b91c1c'>ERROR</span>"
							: item.severity === "WARNING"
								? "<span style='color:#b45309'>WARNING</span>"
								: "<span style='color:#047857'>INFO</span>"
					}</td>
          <td style="text-align:left">${escapeHtml(item.message)}</td>
        </tr>`;
					})
					.join("")}
      </tbody>
    </table>
  </div>

  ${testWellTableHtml}
  ${teeTableHtml}
  ${crossTableHtml}
  ${rodTableHtml}
  ${conductorTableHtml}
</body>
</html>`;

	const blob = new Blob([html], { type: "text/html" });
	const url = URL.createObjectURL(blob);
	const iframe = document.createElement("iframe");
	iframe.style.display = "none";
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
