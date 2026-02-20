import React, { useState, useEffect } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { useTheme, hexToRgba } from "../lib/palette";
import { useWorkspace } from "./WorkspaceContext";
import {
  LayoutDashboard, FolderKanban, Calendar, FileStack, Share2, BotMessageSquare,
  Settings, Send, Blocks, ShieldCheck, Map, Calculator, Waypoints,
  Zap, Activity, ShieldEllipsis, FunctionSquare, BookOpen, LineChart, Cpu,
  Workflow, ClipboardCheck,
} from "lucide-react";

const GROUPS = [
  { name: "Main", items: [
    { id: "dashboard", label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { id: "projects", label: "Projects", path: "/projects", icon: FolderKanban },
    { id: "calendar", label: "Calendar", path: "/calendar", icon: Calendar },
    { id: "files", label: "Files", path: "/files", icon: FileStack },
    { id: "graph", label: "Graph", path: "/graph", icon: Share2 },
    { id: "ai", label: "AI Chat", path: "/ai", icon: BotMessageSquare },
    { id: "settings", label: "Settings", path: "/settings", icon: Settings },
  ]},
  { name: "Apps", items: [
    { id: "transmittal", label: "Transmittal Builder", path: "/apps/transmittal", icon: Send },
    { id: "block-library", label: "Block Library", path: "/apps/block-library", icon: Blocks },
    { id: "qaqc", label: "QA/QC Checker", path: "/apps/qaqc", icon: ShieldCheck },
    { id: "ground-grid", label: "Ground Grid Generator", path: "/apps/ground-grid-generator", icon: Map },
    { id: "automation", label: "Automation", path: "/apps/automation", icon: Workflow },
    { id: "standards", label: "Standards Checker", path: "/apps/standards", icon: ClipboardCheck },
  ]},
  { name: "Knowledge", items: [
    { id: "calculator", label: "Calculator", path: "/knowledge/calculator", icon: Calculator },
    { id: "vectors", label: "Vectors", path: "/knowledge/vectors", icon: Waypoints },
    { id: "threephase", label: "Three-Phase", path: "/knowledge/threephase", icon: Zap },
    { id: "sinusoidal", label: "Sinusoidal", path: "/knowledge/sinusoidal", icon: Activity },
    { id: "symmetrical", label: "Symmetrical", path: "/knowledge/symmetrical", icon: ShieldEllipsis },
    { id: "formulas", label: "Formulas", path: "/knowledge/formulas", icon: FunctionSquare },
    { id: "math-ref", label: "Math Reference", path: "/knowledge/math-ref", icon: BookOpen },
    { id: "plot", label: "Plot Generator", path: "/knowledge/plot", icon: LineChart },
    { id: "circuit", label: "Circuit Generator", path: "/knowledge/circuit", icon: Cpu },
  ]},
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { palette } = useTheme();
  const { openTab } = useWorkspace();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const select = (item: (typeof GROUPS)[number]["items"][number]) => {
    openTab(item.id, item.label, item.path);
    navigate(item.path);
    setOpen(false);
  };

  if (!open) return null;

  const rgba = hexToRgba;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 9999, display: "flex",
        alignItems: "flex-start", justifyContent: "center", paddingTop: "20vh",
        background: rgba(palette.background, 0.6),
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      }}
      onClick={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <div
        aria-label="Command palette"
        style={{
          width: "min(560px, 90vw)", overflow: "hidden", borderRadius: "1rem",
          background: `linear-gradient(135deg, ${rgba(palette.surface, 0.85)} 0%, ${rgba(palette.surfaceLight, 0.75)} 100%)`,
          backdropFilter: "blur(24px) saturate(1.4)", WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          border: `1px solid ${rgba(palette.primary, 0.18)}`,
          boxShadow: `0 16px 48px ${rgba(palette.background, 0.6)}, 0 0 0 1px ${rgba(palette.primary, 0.08)}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Command style={{ background: "transparent" }} label="Command Palette">
          <Command.Input
            placeholder="Type a command..."
            style={{
              width: "100%", padding: "14px 18px", fontSize: 15, background: "transparent",
              border: "none", borderBottom: `1px solid ${rgba(palette.primary, 0.12)}`,
              color: palette.text, outline: "none", fontFamily: "inherit",
            }}
          />
          <Command.List style={{ maxHeight: 360, overflowY: "auto", padding: "8px" }}>
            <Command.Empty style={{ padding: "24px 16px", color: palette.textMuted, textAlign: "center", fontSize: 14 }}>
              No results found.
            </Command.Empty>
            {GROUPS.map((group) => (
              <Command.Group key={group.name} heading={group.name} style={{ marginBottom: 4 }}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Command.Item
                      key={item.id}
                      value={item.label}
                      onSelect={() => select(item)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 12px", borderRadius: "0.5rem",
                        cursor: "pointer", color: palette.text, fontSize: 14,
                      }}
                    >
                      <Icon size={18} color={palette.primary} />
                      <span>{item.label}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
        <style>{`
          [cmdk-group-heading] { padding: 6px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: ${palette.textMuted}; }
          [cmdk-item][data-selected="true"] { background: ${rgba(palette.primary, 0.12)}; }
          [cmdk-item]:hover { background: ${rgba(palette.primary, 0.08)}; }
          [cmdk-list]::-webkit-scrollbar { width: 4px; }
          [cmdk-list]::-webkit-scrollbar-thumb { background: ${rgba(palette.textMuted, 0.3)}; border-radius: 4px; }
        `}</style>
      </div>
    </div>
  );
}
