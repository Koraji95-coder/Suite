import { useState } from "react";
import { Link } from "react-router-dom";
import { useTheme, hexToRgba } from "@/lib/palette";
import {
  ClipboardCheck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  ArrowRight,
} from "lucide-react";

interface Standard {
  id: string;
  name: string;
  code: string;
  category: "NEC" | "IEEE" | "IEC";
  description: string;
}

interface CheckResult {
  standardId: string;
  status: "pass" | "fail" | "warning";
  message: string;
}

const sampleStandards: Standard[] = [
  {
    id: "nec-210",
    name: "NEC 210 - Branch Circuits",
    code: "NEC 210",
    category: "NEC",
    description: "Branch circuit ratings, outlet provisions, and GFCI requirements.",
  },
  {
    id: "nec-220",
    name: "NEC 220 - Branch-Circuit, Feeder, and Service Load Calculations",
    code: "NEC 220",
    category: "NEC",
    description: "Load calculation methods for branch circuits, feeders, and services.",
  },
  {
    id: "nec-250",
    name: "NEC 250 - Grounding and Bonding",
    code: "NEC 250",
    category: "NEC",
    description: "Grounding electrode systems, bonding, and equipment grounding conductors.",
  },
  {
    id: "ieee-80",
    name: "IEEE 80 - Guide for Safety in AC Substation Grounding",
    code: "IEEE 80",
    category: "IEEE",
    description: "Step and touch voltage limits, ground grid design parameters.",
  },
  {
    id: "ieee-141",
    name: "IEEE 141 - Recommended Practice for Electric Power Distribution",
    code: "IEEE 141",
    category: "IEEE",
    description: "Industrial plant power distribution design and analysis (Red Book).",
  },
  {
    id: "ieee-1584",
    name: "IEEE 1584 - Guide for Arc-Flash Hazard Calculations",
    code: "IEEE 1584",
    category: "IEEE",
    description: "Arc-flash incident energy calculations and PPE category selection.",
  },
  {
    id: "iec-60909",
    name: "IEC 60909 - Short-Circuit Currents in Three-Phase AC Systems",
    code: "IEC 60909",
    category: "IEC",
    description: "Calculation of short-circuit currents using symmetrical components.",
  },
  {
    id: "iec-61439",
    name: "IEC 61439 - Low-Voltage Switchgear Assemblies",
    code: "IEC 61439",
    category: "IEC",
    description: "Design verification and routine verification of LV switchgear assemblies.",
  },
  {
    id: "iec-60364",
    name: "IEC 60364 - Low-Voltage Electrical Installations",
    code: "IEC 60364",
    category: "IEC",
    description: "Fundamental principles, protection for safety, and selection of equipment.",
  },
];

const categories = ["NEC", "IEEE", "IEC"] as const;

export function StandardsChecker() {
  const { palette } = useTheme();
  const [activeCategory, setActiveCategory] = useState<string>("NEC");
  const [selectedStandards, setSelectedStandards] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);

  const filteredStandards = sampleStandards.filter(
    (s) => s.category === activeCategory
  );

  const toggleStandard = (id: string) => {
    setSelectedStandards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const runChecks = () => {
    if (selectedStandards.size === 0) return;
    setRunning(true);
    setResults([]);

    setTimeout(() => {
      const newResults: CheckResult[] = [];
      selectedStandards.forEach((id) => {
        const rand = Math.random();
        let status: "pass" | "fail" | "warning";
        let message: string;
        if (rand < 0.5) {
          status = "pass";
          message = "All criteria met. Design compliant.";
        } else if (rand < 0.8) {
          status = "warning";
          message = "Minor deviations detected. Review recommended.";
        } else {
          status = "fail";
          message = "Non-compliance found. Corrective action required.";
        }
        newResults.push({ standardId: id, status, message });
      });
      setResults(newResults);
      setRunning(false);
    }, 1500);
  };

  const getResultForStandard = (id: string) =>
    results.find((r) => r.standardId === id);

  const statusIcon = (status: "pass" | "fail" | "warning") => {
    if (status === "pass")
      return <CheckCircle size={16} color="#22c55e" />;
    if (status === "fail")
      return <XCircle size={16} color="#ef4444" />;
    return <AlertTriangle size={16} color="#eab308" />;
  };

  const statusColor = (status: "pass" | "fail" | "warning") => {
    if (status === "pass") return "#22c55e";
    if (status === "fail") return "#ef4444";
    return "#eab308";
  };

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `linear-gradient(135deg, ${hexToRgba(palette.primary, 0.2)} 0%, ${hexToRgba(palette.primary, 0.08)} 100%)`,
              border: `1px solid ${hexToRgba(palette.primary, 0.25)}`,
            }}
          >
            <ClipboardCheck size={24} color={palette.primary} />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: palette.text, margin: 0 }}>
              Standards Checker
            </h1>
            <p style={{ fontSize: 13, color: palette.textMuted, margin: 0 }}>
              Verify designs against NEC, IEEE, and IEC standards
            </p>
          </div>
        </div>
        <Link
          to="/apps/qaqc"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 8,
            background: hexToRgba(palette.primary, 0.12),
            border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
            color: palette.primary,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            transition: "background 0.15s ease",
          }}
        >
          Open QA/QC Checker
          <ArrowRight size={14} />
        </Link>
      </div>

      {/* Category tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: 4,
          borderRadius: 10,
          background: hexToRgba(palette.surfaceLight, 0.4),
          border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
          alignSelf: "flex-start",
        }}
      >
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              background:
                activeCategory === cat
                  ? hexToRgba(palette.primary, 0.2)
                  : "transparent",
              color:
                activeCategory === cat ? palette.primary : palette.textMuted,
              transition: "all 0.15s ease",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Standards list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 16,
          borderRadius: 12,
          background: hexToRgba(palette.surface, 0.6),
          border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: palette.textMuted,
            marginBottom: 4,
          }}
        >
          {activeCategory} Standards
        </div>
        {filteredStandards.map((std) => {
          const result = getResultForStandard(std.id);
          const isSelected = selectedStandards.has(std.id);
          return (
            <div
              key={std.id}
              onClick={() => toggleStandard(std.id)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 8,
                cursor: "pointer",
                background: isSelected
                  ? hexToRgba(palette.primary, 0.08)
                  : "transparent",
                border: `1px solid ${
                  isSelected
                    ? hexToRgba(palette.primary, 0.2)
                    : hexToRgba(palette.surfaceLight, 0.5)
                }`,
                transition: "all 0.15s ease",
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  border: `2px solid ${
                    isSelected ? palette.primary : palette.textMuted
                  }`,
                  background: isSelected
                    ? hexToRgba(palette.primary, 0.2)
                    : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                {isSelected && (
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: palette.primary,
                    }}
                  />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: palette.text,
                    }}
                  >
                    {std.name}
                  </span>
                  {result && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "2px 10px",
                        borderRadius: 12,
                        background: hexToRgba(statusColor(result.status), 0.12),
                        border: `1px solid ${hexToRgba(statusColor(result.status), 0.25)}`,
                        flexShrink: 0,
                      }}
                    >
                      {statusIcon(result.status)}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: statusColor(result.status),
                          textTransform: "uppercase",
                        }}
                      >
                        {result.status}
                      </span>
                    </div>
                  )}
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: palette.textMuted,
                    margin: "4px 0 0",
                    lineHeight: 1.4,
                  }}
                >
                  {std.description}
                </p>
                {result && (
                  <p
                    style={{
                      fontSize: 12,
                      color: statusColor(result.status),
                      margin: "6px 0 0",
                      fontStyle: "italic",
                    }}
                  >
                    {result.message}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Run checks button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={runChecks}
          disabled={selectedStandards.size === 0 || running}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 24px",
            borderRadius: 8,
            border: "none",
            cursor:
              selectedStandards.size === 0 || running
                ? "not-allowed"
                : "pointer",
            fontSize: 14,
            fontWeight: 600,
            background:
              selectedStandards.size === 0 || running
                ? hexToRgba(palette.textMuted, 0.15)
                : `linear-gradient(135deg, ${palette.primary}, ${hexToRgba(palette.primary, 0.8)})`,
            color:
              selectedStandards.size === 0 || running
                ? palette.textMuted
                : palette.background,
            transition: "all 0.15s ease",
          }}
        >
          <Play size={16} />
          {running ? "Running Checks..." : "Run Selected Checks"}
        </button>
        <span style={{ fontSize: 13, color: palette.textMuted }}>
          {selectedStandards.size} standard{selectedStandards.size !== 1 ? "s" : ""} selected
        </span>
      </div>

      {/* Results summary */}
      {results.length > 0 && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: hexToRgba(palette.surface, 0.6),
            border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: palette.text,
              marginBottom: 12,
            }}
          >
            Results Summary
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle size={14} color="#22c55e" />
              <span style={{ fontSize: 13, color: palette.textMuted }}>
                Pass: {results.filter((r) => r.status === "pass").length}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={14} color="#eab308" />
              <span style={{ fontSize: 13, color: palette.textMuted }}>
                Warning: {results.filter((r) => r.status === "warning").length}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <XCircle size={14} color="#ef4444" />
              <span style={{ fontSize: 13, color: palette.textMuted }}>
                Fail: {results.filter((r) => r.status === "fail").length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
