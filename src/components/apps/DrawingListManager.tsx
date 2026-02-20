import { useMemo, useState } from "react";
import {
  FileSpreadsheet,
  FolderOpen,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  ListChecks,
  Search,
  Shuffle,
  Download,
} from "lucide-react";
import { useTheme, hexToRgba } from "@/lib/palette";
import ExcelJS from "exceljs";

interface SwapRule {
  id: string;
  from: string;
  to: string;
}

interface DrawingEntry {
  id: string;
  fileName: string;
  title: string;
  discipline: string;
  sheetType: string;
  sequence: number | null;
  revision: string;
  drawingNumber: string;
  source: "folder" | "generated";
}

interface ProjectConfig {
  projectNumber: string;
  revisionDefault: string;
  enforceProjectCode: boolean;
  allowedDisciplines: string[];
  allowedSheetTypes: string[];
}

const DEFAULT_DISCIPLINES = ["E", "C", "M", "A", "S", "P", "HVAC"];
const DEFAULT_SHEET_TYPES = [
  "GEN",
  "DET",
  "SCH",
  "CAL",
  "DIA",
  "PLC",
  "ELV",
  "SEC",
  "DIM",
  "LOG",
];

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildProjectCode = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "R3P-XXX";
  return trimmed.toUpperCase().startsWith("R3P-")
    ? trimmed.toUpperCase()
    : `R3P-${trimmed.toUpperCase()}`;
};

const formatNumber = (projectValue: string, discipline: string, sheetType: string, sequence: number, revision: string) => {
  const projectCode = buildProjectCode(projectValue);
  return `${projectCode}-${discipline}-${sheetType}-${String(sequence).padStart(3, "0")} ${revision}`;
};

const parseFileName = (fileName: string, config: ProjectConfig) => {
  const base = fileName.replace(/\.[^/.]+$/, "");
  const expectedProject = buildProjectCode(config.projectNumber);
  const projectPattern = config.enforceProjectCode && config.projectNumber
    ? escapeRegExp(expectedProject)
    : "R3P-[A-Z0-9]{3,6}";
  const numberRegex = new RegExp(
    `^(${projectPattern})-([A-Z0-9]{1,4})-([A-Z0-9]{3})-(\\d{3})(?:\\s*([A-Z0-9]+))?`,
    "i"
  );

  const match = base.match(numberRegex);
  if (!match) {
    return {
      drawingNumber: "Unparsed",
      discipline: "",
      sheetType: "",
      sequence: null,
      revision: config.revisionDefault,
      title: base.replace(/[_-]+/g, " ").trim(),
      issues: ["Naming convention mismatch"],
    };
  }

  const [, project, disciplineRaw, sheetTypeRaw, seqRaw, revRaw] = match;
  const discipline = disciplineRaw.toUpperCase();
  const sheetType = sheetTypeRaw.toUpperCase();
  const sequence = Number(seqRaw);
  const revision = (revRaw || config.revisionDefault).toUpperCase();
  const remainder = base.slice(match[0].length).replace(/^[-_ ]+/, "");
  const title = remainder ? remainder.replace(/[_-]+/g, " ").trim() : `${sheetType} Sheet`;

  const issues: string[] = [];
  if (config.enforceProjectCode && config.projectNumber && project.toUpperCase() !== expectedProject) {
    issues.push("Project code mismatch");
  }
  if (!config.allowedDisciplines.includes(discipline)) {
    issues.push("Unknown discipline");
  }
  if (!config.allowedSheetTypes.includes(sheetType)) {
    issues.push("Unknown sheet type");
  }
  if (!revRaw) {
    issues.push("Missing revision");
  }

  return {
    drawingNumber: formatNumber(project.toUpperCase(), discipline, sheetType, sequence, revision),
    discipline,
    sheetType,
    sequence,
    revision,
    title,
    issues,
  };
};

const buildWorkbook = async (drawings: DrawingEntry[]) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Drawing Index');
  
  // Add header row with styling
  const header = ["Drawing Number", "Title", "File", "Discipline", "Sheet Type", "Revision", "Source"];
  const headerRow = worksheet.addRow(header);
  headerRow.font = { bold: true, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  
  // Add data rows
  drawings.forEach(drawing => {
    // Sanitize title to prevent formula injection
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
      drawing.source
    ]);
  });
  
  // Auto-size columns
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
  
  // Add borders to all cells
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });
  
  return workbook;
};

export function DrawingListManager() {
  const { palette } = useTheme();
  const [projectConfig, setProjectConfig] = useState<ProjectConfig>({
    projectNumber: "25074",
    revisionDefault: "A",
    enforceProjectCode: true,
    allowedDisciplines: DEFAULT_DISCIPLINES,
    allowedSheetTypes: DEFAULT_SHEET_TYPES,
  });
  // New simplified template: maps "E-GEN", "E-DET", etc. to counts
  const [templateCounts, setTemplateCounts] = useState<Record<string, number>>({
    "E-GEN": 2,
    "E-PLC": 4,
    "E-DIA": 3,
    "E-SCH": 2,
    "E-DET": 3,
  });
  const [swapRules, setSwapRules] = useState<SwapRule[]>([
    { id: "swap-1", from: "One Line", to: "Single Line" },
  ]);
  const [drawings, setDrawings] = useState<DrawingEntry[]>([]);
  const [scanQuery, setScanQuery] = useState("");

  const validatedDrawings = useMemo(() => {
    const duplicates = new Set<string>();
    const seen = new Set<string>();

    drawings.forEach((drawing) => {
      if (drawing.drawingNumber && seen.has(drawing.drawingNumber)) {
        duplicates.add(drawing.drawingNumber);
      }
      seen.add(drawing.drawingNumber);
    });

    return drawings.map((drawing) => {
      const issues: string[] = [];
      if (!drawing.drawingNumber || drawing.drawingNumber === "Unparsed") {
        issues.push("Missing drawing number");
      }
      if (!drawing.title.trim()) {
        issues.push("Missing title");
      }
      if (drawing.sequence === null) {
        issues.push("Missing sequence");
      }
      if (drawing.discipline && !projectConfig.allowedDisciplines.includes(drawing.discipline)) {
        issues.push("Unknown discipline");
      }
      if (drawing.sheetType && !projectConfig.allowedSheetTypes.includes(drawing.sheetType)) {
        issues.push("Unknown sheet type");
      }
      if (!drawing.revision) {
        issues.push("Missing revision");
      }
      if (duplicates.has(drawing.drawingNumber)) {
        issues.push("Duplicate drawing number");
      }
      return { ...drawing, issues };
    });
  }, [drawings, projectConfig]);

  const filteredDrawings = useMemo(() => {
    if (!scanQuery.trim()) return validatedDrawings;
    const query = scanQuery.toLowerCase();
    return validatedDrawings.filter((drawing) =>
      [drawing.drawingNumber, drawing.title, drawing.fileName, drawing.discipline, drawing.sheetType]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [validatedDrawings, scanQuery]);

  const summary = useMemo(() => {
    const totals = {
      total: validatedDrawings.length,
      flagged: validatedDrawings.filter((d) => d.issues.length > 0).length,
      missing: 0,
      skipped: [] as string[],
    };

    const byGroup: Record<string, number[]> = {};
    validatedDrawings.forEach((drawing) => {
      if (drawing.sequence === null || !drawing.discipline || !drawing.sheetType) return;
      const key = `${drawing.discipline}-${drawing.sheetType}`;
      byGroup[key] ??= [];
      byGroup[key].push(drawing.sequence);
    });

    Object.entries(byGroup).forEach(([key, sequences]) => {
      const sorted = sequences.sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      for (let i = min; i <= max; i += 1) {
        if (!sorted.includes(i)) {
          totals.missing += 1;
          totals.skipped.push(`${key}-${String(i).padStart(3, "0")}`);
        }
      }
    });

    return totals;
  }, [validatedDrawings]);

  const architectureMap = useMemo(() => {
    const map: Record<string, number> = {};
    validatedDrawings.forEach((drawing) => {
      const key = drawing.sheetType || "Uncategorized";
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [validatedDrawings]);

  const handleFolderScan = (files: FileList | null) => {
    if (!files) return;
    const list: DrawingEntry[] = [];

    Array.from(files).forEach((file) => {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".dwg") && !lower.endsWith(".pdf")) return;
      const parsed = parseFileName(file.name, projectConfig);
      list.push({
        id: createId(),
        fileName: file.name,
        title: parsed.title,
        discipline: parsed.discipline,
        sheetType: parsed.sheetType,
        sequence: parsed.sequence,
        revision: parsed.revision,
        drawingNumber: parsed.drawingNumber,
        source: "folder",
      });
    });

    setDrawings(list);
  };

  const handleGenerateList = () => {
    const generated: DrawingEntry[] = [];
    const sequenceTracker: Record<string, number> = {};

    // Iterate over templateCounts entries (e.g., "E-GEN": 2)
    Object.entries(templateCounts).forEach(([typeKey, count]) => {
      if (count <= 0) return;
      // typeKey is "E-GEN", "E-DET", etc. Split to get discipline and sheetType
      const parts = typeKey.split("-");
      const discipline = parts[0]; // "E"
      const sheetType = parts.slice(1).join("-"); // "GEN", "DET", etc.
      const key = `${discipline}-${sheetType}`;
      const start = sequenceTracker[key] || 1;

      for (let i = 0; i < count; i += 1) {
        const sequence = start + i;
        const number = formatNumber(projectConfig.projectNumber, discipline, sheetType, sequence, projectConfig.revisionDefault);
        generated.push({
          id: createId(),
          fileName: "",
          title: `Drawing ${sequence}`,
          discipline,
          sheetType,
          sequence,
          revision: projectConfig.revisionDefault,
          drawingNumber: number,
          source: "generated",
        });
      }

      sequenceTracker[key] = start + count;
    });

    setDrawings(generated);
  };

  const handleRenumber = () => {
    const grouped: Record<string, DrawingEntry[]> = {};
    drawings.forEach((drawing) => {
      const key = `${drawing.discipline}-${drawing.sheetType}`;
      grouped[key] ??= [];
      grouped[key].push(drawing);
    });

    const renumbered = Object.values(grouped).flatMap((group) => {
      const sorted = [...group].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
      return sorted.map((drawing, index) => {
        const sequence = index + 1;
        return {
          ...drawing,
          sequence,
          drawingNumber: formatNumber(
            projectConfig.projectNumber,
            drawing.discipline || "E",
            drawing.sheetType || "GEN",
            sequence,
            drawing.revision || projectConfig.revisionDefault
          ),
        };
      });
    });

    setDrawings(renumbered);
  };

  const handleApplySwap = () => {
    const next = drawings.map((drawing) => {
      let title = drawing.title;
      swapRules.forEach((rule) => {
        if (!rule.from) return;
        const regex = new RegExp(escapeRegExp(rule.from), "gi");
        title = title.replace(regex, rule.to);
      });
      return { ...drawing, title };
    });
    setDrawings(next);
  };

  const handleExport = async () => {
    try {
      const workbook = await buildWorkbook(validatedDrawings);
      const projectCode = buildProjectCode(projectConfig.projectNumber);
      const buffer = await workbook.xlsx.writeBuffer();
      
      // Create download link
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectCode}-Drawing-Index.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Excel export failed:', error);
      alert('Failed to export Excel file. Please try again.');
    }
  };

  const updateDrawingTitle = (id: string, title: string) => {
    setDrawings((prev) => prev.map((drawing) => (drawing.id === id ? { ...drawing, title } : drawing)));
  };

  return (
    <div
      style={{
        minHeight: "100%",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 24,
        color: palette.text,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: `linear-gradient(145deg, ${hexToRgba(palette.primary, 0.2)} 0%, ${hexToRgba(palette.primary, 0.05)} 100%)`,
              border: `1px solid ${hexToRgba(palette.primary, 0.25)}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FileSpreadsheet size={26} color={palette.primary} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Drawing List Manager</h1>
            <p style={{ margin: 0, color: palette.textMuted, fontSize: 13 }}>
              Validate naming, generate lists, and audit drawing folders in seconds.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleGenerateList}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              borderRadius: 10,
              border: `1px solid ${hexToRgba(palette.primary, 0.3)}`,
              background: hexToRgba(palette.primary, 0.16),
              color: palette.primary,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Wand2 size={16} />
            Generate List
          </button>
          <button
            type="button"
            onClick={() => handleExport().catch(err => console.error('Export error:', err))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              borderRadius: 10,
              border: `1px solid ${hexToRgba(palette.surfaceLight, 0.8)}`,
              background: hexToRgba(palette.surfaceLight, 0.35),
              color: palette.text,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Download size={16} />
            Export Excel
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {[
          { label: "Total Drawings", value: summary.total, icon: ListChecks },
          { label: "Flagged", value: summary.flagged, icon: AlertTriangle },
          { label: "Missing", value: summary.missing, icon: AlertTriangle },
          { label: "Ready", value: Math.max(summary.total - summary.flagged, 0), icon: CheckCircle2 },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              style={{
                padding: 16,
                borderRadius: 14,
                background: `linear-gradient(145deg, ${hexToRgba(palette.surface, 0.8)} 0%, ${hexToRgba(palette.surfaceLight, 0.35)} 100%)`,
                border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: palette.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{card.value}</div>
              </div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: hexToRgba(palette.primary, 0.12),
                }}
              >
                <Icon size={20} color={palette.primary} />
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div
          style={{
            padding: 18,
            borderRadius: 16,
            background: `linear-gradient(135deg, ${hexToRgba(palette.surfaceLight, 0.4)} 0%, ${hexToRgba(palette.surface, 0.8)} 100%)`,
            border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Project Standard</h3>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: palette.textMuted }}>
              Project number (XXX)
              <input
                value={projectConfig.projectNumber}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase().replace(/^R3P-/, "");
                  setProjectConfig((prev) => ({ ...prev, projectNumber: next }));
                }}
                placeholder="25074"
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                  background: hexToRgba(palette.surfaceLight, 0.35),
                  color: palette.text,
                }}
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: palette.textMuted }}>
              Default revision
              <input
                value={projectConfig.revisionDefault}
                onChange={(e) =>
                  setProjectConfig((prev) => ({ ...prev, revisionDefault: e.target.value.toUpperCase() }))
                }
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                  background: hexToRgba(palette.surfaceLight, 0.35),
                  color: palette.text,
                  width: "100%",
                }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: palette.textMuted }}>
              <input
                type="checkbox"
                checked={projectConfig.enforceProjectCode}
                onChange={(e) =>
                  setProjectConfig((prev) => ({ ...prev, enforceProjectCode: e.target.checked }))
                }
              />
              Enforce project code in naming convention
            </label>
            <div style={{ fontSize: 12, color: palette.textMuted, display: "grid", gap: 6 }}>
              Naming pattern
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: hexToRgba(palette.primary, 0.08),
                  border: `1px dashed ${hexToRgba(palette.primary, 0.3)}`,
                  color: palette.text,
                  fontSize: 12,
                }}
              >
                {buildProjectCode(projectConfig.projectNumber)}-DISC-TYPE-### REV
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: 18,
            borderRadius: 16,
            background: `linear-gradient(135deg, ${hexToRgba(palette.surfaceLight, 0.25)} 0%, ${hexToRgba(palette.surface, 0.85)} 100%)`,
            border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Drawing Types & Counts</h3>
          <p style={{ margin: "6px 0 0 0", fontSize: 12, color: palette.textMuted }}>
            Set how many drawings of each type to generate.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
              gap: 12,
              marginTop: 12,
            }}
          >
            {projectConfig.allowedDisciplines.flatMap((disc) =>
              projectConfig.allowedSheetTypes.map((type) => {
                const typeKey = `${disc}-${type}`;
                const count = templateCounts[typeKey] || 0;
                return (
                  <div
                    key={typeKey}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                      background: hexToRgba(palette.surfaceLight, 0.4),
                    }}
                  >
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 6 }}>
                      {typeKey}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={count}
                      onChange={(e) =>
                        setTemplateCounts((prev) => ({
                          ...prev,
                          [typeKey]: Math.max(0, Number(e.target.value)),
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                        background: hexToRgba(palette.surfaceLight, 0.35),
                        color: palette.text,
                        fontSize: 12,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div
          style={{
            padding: 18,
            borderRadius: 16,
            background: `linear-gradient(135deg, ${hexToRgba(palette.surfaceLight, 0.2)} 0%, ${hexToRgba(palette.surface, 0.75)} 100%)`,
            border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Hot Swap Names</h3>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: palette.textMuted }}>
            Replace naming fragments across titles and regenerate naming consistency.
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 12, maxHeight: 240, overflowY: "auto", paddingRight: 8 }}>
            {swapRules.map((rule) => (
              <div key={rule.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input
                  value={rule.from}
                  onChange={(e) =>
                    setSwapRules((prev) => prev.map((item) => (item.id === rule.id ? { ...item, from: e.target.value } : item)))
                  }
                  placeholder="From"
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                    background: hexToRgba(palette.surfaceLight, 0.35),
                    color: palette.text,
                    fontSize: 12,
                  }}
                />
                <input
                  value={rule.to}
                  onChange={(e) =>
                    setSwapRules((prev) => prev.map((item) => (item.id === rule.id ? { ...item, to: e.target.value } : item)))
                  }
                  placeholder="To"
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                    background: hexToRgba(palette.surfaceLight, 0.35),
                    color: palette.text,
                    fontSize: 12,
                  }}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleApplySwap}
            style={{
              marginTop: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
              background: hexToRgba(palette.primary, 0.12),
              color: palette.primary,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Shuffle size={14} />
            Apply Swap Rules
          </button>
        </div>
      </div>

      <div
        style={{
          padding: 18,
          borderRadius: 16,
          border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
          background: `linear-gradient(135deg, ${hexToRgba(palette.surface, 0.8)} 0%, ${hexToRgba(palette.surfaceLight, 0.3)} 100%)`,
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FolderOpen size={18} color={palette.primary} />
            <div>
              <div style={{ fontWeight: 600 }}>Scan a drawing folder</div>
              <div style={{ fontSize: 12, color: palette.textMuted }}>
                Drag in a folder of DWG/PDF files or select a directory to validate.
              </div>
            </div>
          </div>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 8,
              background: hexToRgba(palette.primary, 0.1),
              color: palette.primary,
              border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <FolderOpen size={14} />
            Select Folder
            <input
              type="file"
              multiple
              // @ts-expect-error - webkitdirectory is needed for folder pickers.
              webkitdirectory="true"
              onChange={(e) => handleFolderScan(e.target.files)}
              style={{ display: "none" }}
            />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Search size={16} color={palette.textMuted} />
          <input
            value={scanQuery}
            onChange={(e) => setScanQuery(e.target.value)}
            placeholder="Search drawings, titles, or numbers"
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
              background: hexToRgba(palette.surfaceLight, 0.35),
              color: palette.text,
              fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={handleRenumber}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
              background: hexToRgba(palette.primary, 0.12),
              color: palette.primary,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Shuffle size={14} />
            Auto Renumber
          </button>
        </div>
        {summary.skipped.length > 0 && (
          <div style={{ fontSize: 12, color: palette.textMuted }}>
            Skipped sequences: {summary.skipped.slice(0, 8).join(", ")}
            {summary.skipped.length > 8 ? ` +${summary.skipped.length - 8} more` : ""}
          </div>
        )}
      </div>

      <div
        style={{
          padding: 18,
          borderRadius: 16,
          border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
          background: hexToRgba(palette.surface, 0.7),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Drawing List</h3>
          <div style={{ fontSize: 12, color: palette.textMuted }}>{filteredDrawings.length} entries</div>
        </div>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: palette.textMuted }}>
                <th style={{ padding: "8px 6px" }}>Drawing Number</th>
                <th style={{ padding: "8px 6px" }}>Title</th>
                <th style={{ padding: "8px 6px" }}>File</th>
                <th style={{ padding: "8px 6px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrawings.map((drawing) => (
                <tr key={drawing.id} style={{ borderTop: `1px solid ${hexToRgba(palette.surfaceLight, 0.3)}` }}>
                  <td style={{ padding: "8px 6px", fontWeight: 600 }}>{drawing.drawingNumber}</td>
                  <td style={{ padding: "8px 6px" }}>
                    <input
                      value={drawing.title}
                      onChange={(e) => updateDrawingTitle(drawing.id, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        borderRadius: 6,
                        border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
                        background: "transparent",
                        color: palette.text,
                      }}
                    />
                  </td>
                  <td style={{ padding: "8px 6px", color: palette.textMuted }}>{drawing.fileName || "-"}</td>
                  <td style={{ padding: "8px 6px" }}>
                    {drawing.issues.length === 0 ? (
                      <span style={{ color: "#22c55e", fontWeight: 600 }}>Ready</span>
                    ) : (
                      <span style={{ color: "#f59e0b", fontWeight: 600 }}>{drawing.issues.join(", ")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          padding: 18,
          borderRadius: 16,
          border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
          background: `linear-gradient(120deg, ${hexToRgba(palette.surfaceLight, 0.2)} 0%, ${hexToRgba(palette.surface, 0.7)} 100%)`,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Architecture Map</h3>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: palette.textMuted }}>
          Summarized by sheet type for quick reporting.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            marginTop: 12,
          }}
        >
          {architectureMap.map(([type, count]) => (
            <div
              key={type}
              style={{
                padding: 12,
                borderRadius: 12,
                border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
                background: hexToRgba(palette.surfaceLight, 0.35),
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontSize: 12, color: palette.textMuted }}>{type}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
