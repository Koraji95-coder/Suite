import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  FileText,
  LayoutGrid,
  CheckSquare,
  Map,
  Replace,
  Printer,
  Workflow,
  ClipboardCheck,
  Calculator,
  ArrowUpRight,
  Triangle,
  Waves,
  Hexagon,
  FunctionSquare,
  BookOpen,
  LineChart,
  CircuitBoard,
} from "lucide-react";
import { useTheme, hexToRgba } from "@/lib/palette";
import { useWorkspace } from "./WorkspaceContext";

interface SectionItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  path: string;
}

const appItems: SectionItem[] = [
  { id: "transmittal", label: "Transmittal Builder", icon: FileText, path: "/apps/transmittal" },
  { id: "block-library", label: "Block Library", icon: LayoutGrid, path: "/apps/block-library" },
  { id: "qaqc", label: "QA/QC Checker", icon: CheckSquare, path: "/apps/qaqc" },
  { id: "ground-grid-generator", label: "Ground Grid Generator", icon: Map, path: "/apps/ground-grid-generator" },
  { id: "batch-find-replace", label: "Batch Find & Replace", icon: Replace, path: "/apps/batch-find-replace" },
  { id: "batch-print", label: "Batch Print", icon: Printer, path: "/apps/batch-print" },
  { id: "automation", label: "Automation", icon: Workflow, path: "/apps/automation" },
  { id: "standards", label: "Standards Checker", icon: ClipboardCheck, path: "/apps/standards" },
];

const knowledgeItems: SectionItem[] = [
  { id: "calculator", label: "Calculator", icon: Calculator, path: "/knowledge/calculator" },
  { id: "vectors", label: "Vectors", icon: ArrowUpRight, path: "/knowledge/vectors" },
  { id: "threephase", label: "Three-Phase", icon: Triangle, path: "/knowledge/threephase" },
  { id: "sinusoidal", label: "Sinusoidal", icon: Waves, path: "/knowledge/sinusoidal" },
  { id: "symmetrical", label: "Symmetrical", icon: Hexagon, path: "/knowledge/symmetrical" },
  { id: "formulas", label: "Formulas", icon: FunctionSquare, path: "/knowledge/formulas" },
  { id: "math-ref", label: "Math Ref", icon: BookOpen, path: "/knowledge/math-ref" },
  { id: "plot", label: "Plot Gen", icon: LineChart, path: "/knowledge/plot" },
  { id: "circuit", label: "Circuit Gen", icon: CircuitBoard, path: "/knowledge/circuit" },
];

const sections: Record<string, SectionItem[]> = {
  apps: appItems,
  knowledge: knowledgeItems,
};

export function ContextPanel() {
  const { palette } = useTheme();
  const navigate = useNavigate();
  const { contextPanelOpen, contextPanelSection, openTab } = useWorkspace();
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSearch("");
  }, [contextPanelSection]);

  const items = useMemo(() => {
    const list = contextPanelSection ? sections[contextPanelSection] || [] : [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((item) => item.label.toLowerCase().includes(q));
  }, [contextPanelSection, search]);

  const handleItemClick = (item: SectionItem) => {
    openTab(item.id, item.label, item.path, item.id);
    navigate(item.path);
  };

  return (
    <AnimatePresence>
      {contextPanelOpen && (
        <motion.div
          role="complementary"
          aria-label={contextPanelSection ? `${contextPanelSection.charAt(0).toUpperCase() + contextPanelSection.slice(1)} panel` : "Context panel"}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 280, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          style={{
            height: "100%",
            overflow: "hidden",
            background: palette.surface,
            borderRight: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
            flexShrink: 0,
          }}
        >
          <div style={{ width: 280, height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 12px 8px" }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: palette.textMuted,
                  marginBottom: 8,
                }}
              >
                {contextPanelSection}
              </div>
              <input
                type="text"
                placeholder="Search..."
                aria-label="Search panel items"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  fontSize: 13,
                  background: hexToRgba(palette.surfaceLight, 0.5),
                  border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
                  borderRadius: 6,
                  color: palette.text,
                  outline: "none",
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "8px 10px",
                      border: "none",
                      borderRadius: 6,
                      background: "transparent",
                      color: palette.text,
                      fontSize: 13,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = hexToRgba(palette.surfaceLight, 0.5);
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Icon size={16} color={palette.textMuted} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
