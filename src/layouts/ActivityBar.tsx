import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  CalendarDays,
  Blocks,
  BookOpen,
  HardDrive,
  Network,
  MessageSquare,
  Settings,
} from "lucide-react";
import { useTheme, hexToRgba } from "@/lib/palette";
import { useWorkspace } from "./WorkspaceContext";

interface NavItem {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  path?: string;
  panel?: string;
  aiToggle?: boolean;
}

const topItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: FolderKanban, label: "Projects", path: "/projects" },
  { icon: CalendarDays, label: "Calendar", path: "/calendar" },
  { icon: Blocks, label: "Apps", panel: "apps" },
  { icon: BookOpen, label: "Knowledge", panel: "knowledge" },
  { icon: HardDrive, label: "Files", path: "/files" },
  { icon: Network, label: "Graph", path: "/graph" },
  { icon: MessageSquare, label: "AI Chat", path: "/ai" },
];

const bottomItems: NavItem[] = [
  { icon: Settings, label: "Settings", path: "/settings" },
];

export function ActivityBar() {
  const { palette } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { toggleContextPanel, contextPanelOpen, contextPanelSection, aiDrawerOpen, setAiDrawerOpen, openTab } = useWorkspace();

  const isActive = (item: NavItem) => {
    if (item.path) return location.pathname.startsWith(item.path);
    if (item.panel) return contextPanelOpen && contextPanelSection === item.panel;
    if (item.aiToggle) return aiDrawerOpen;
    return false;
  };

  const handleClick = (item: NavItem) => {
    if (item.path) {
      // Open tab for path-based navigation and navigate
      openTab(item.label.toLocaleLowerCase().replace(/\s+/g, '-'), item.label, item.path, item.label);
      navigate(item.path);
    } else if (item.panel) {
      toggleContextPanel(item.panel);
    } else if (item.aiToggle) {
      setAiDrawerOpen(!aiDrawerOpen);
    }
  };

  const renderButton = (item: NavItem, idx: number) => {
    const active = isActive(item);
    const Icon = item.icon;
    return (
      <button
        key={idx}
        onClick={() => handleClick(item)}
        aria-label={item.label}
        title={item.label}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
          background: active ? hexToRgba(palette.surfaceLight, 0.5) : "transparent",
          borderLeft: active ? `2px solid ${palette.primary}` : "2px solid transparent",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = hexToRgba(palette.surfaceLight, 0.5);
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = "transparent";
        }}
      >
        <Icon size={20} color={active ? palette.primary : palette.textMuted} />
      </button>
    );
  };

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      style={{
        width: 52,
        minWidth: 52,
        height: "100%",
        background: palette.background,
        borderRight: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 12,
        paddingBottom: 12,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
        {topItems.map(renderButton)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
        {bottomItems.map(renderButton)}
      </div>
    </nav>
  );
}
