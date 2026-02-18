import React from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useTheme, hexToRgba } from "@/lib/palette";
import { useWorkspace } from "./WorkspaceContext";

export function TabBar() {
  const { palette } = useTheme();
  const navigate = useNavigate();
  const { openTabs, activeTabId, closeTab, setActiveTab } = useWorkspace();

  if (openTabs.length === 0) return null;

  const handleTabClick = (id: string, path: string) => {
    setActiveTab(id);
    navigate(path);
  };

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    closeTab(id);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        height: 36,
        minHeight: 36,
        background: palette.surface,
        borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
        overflowX: "auto",
        overflowY: "hidden",
        scrollbarWidth: "none",
      }}
    >
      {openTabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id, tab.path)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 12px",
              border: "none",
              borderBottom: active ? `2px solid ${palette.primary}` : "2px solid transparent",
              background: "transparent",
              color: active ? palette.text : palette.textMuted,
              fontSize: 12,
              fontWeight: active ? 500 : 400,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "background 0.15s ease, color 0.15s ease, font-weight 0.15s ease",
              position: "relative",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = hexToRgba(palette.surfaceLight, 0.3);
              const closeBtn = e.currentTarget.querySelector("[data-close]") as HTMLElement;
              if (closeBtn) closeBtn.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = "transparent";
              const closeBtn = e.currentTarget.querySelector("[data-close]") as HTMLElement;
              if (closeBtn && !active) closeBtn.style.opacity = "0";
            }}
          >
            <span>{tab.label}</span>
            <span
              data-close
              onClick={(e) => handleClose(e, tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                height: 16,
                borderRadius: 4,
                opacity: active ? 0.7 : 0,
                transition: "opacity 0.15s ease, background 0.15s ease",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = hexToRgba(palette.surfaceLight, 0.8);
                e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <X size={12} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
