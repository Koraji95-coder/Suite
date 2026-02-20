import React, { useCallback, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Pin, PinOff, SplitSquareHorizontal } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTheme, hexToRgba } from "@/lib/palette";
import { useWorkspace, type WorkspaceTab } from "./WorkspaceContext";

interface SortableTabProps {
  tab: WorkspaceTab;
  active: boolean;
  isSplit: boolean;
  onClose: (e: React.MouseEvent, id: string) => void;
  onClick: (id: string, path: string) => void;
  onPin: (id: string) => void;
  onSplit: (id: string) => void;
  canClose: boolean;
}

function SortableTab({ tab, active, isSplit, onClose, onClick, onPin, onSplit, canClose }: SortableTabProps) {
  const { palette } = useTheme();
  const [showActions, setShowActions] = useState(false);
  const [showCtx, setShowCtx] = useState(false);
  const ctxRef = useRef<HTMLDivElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "0 10px",
    border: "none",
    borderBottom: active
      ? `2px solid ${palette.primary}`
      : isSplit
        ? `2px solid ${hexToRgba(palette.primary, 0.4)}`
        : "2px solid transparent",
    background: isDragging ? hexToRgba(palette.surfaceLight, 0.6) : "transparent",
    color: active ? palette.text : palette.textMuted,
    fontSize: 12,
    fontWeight: active ? 500 : 400,
    cursor: isDragging ? "grabbing" : "pointer",
    whiteSpace: "nowrap",
    position: "relative",
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 50 : "auto",
    flexShrink: 0,
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowCtx(true);
    const closeCtx = (ev: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(ev.target as Node)) {
        setShowCtx(false);
        document.removeEventListener("click", closeCtx);
      }
    };
    setTimeout(() => document.addEventListener("click", closeCtx), 0);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(tab.id, tab.path)}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowCtx(false); }}
    >
      {tab.pinned && (
        <Pin size={10} color={palette.textMuted} style={{ flexShrink: 0, opacity: 0.5 }} />
      )}
      <span>{tab.label}</span>

      {(showActions || active) && !isDragging && (
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            marginLeft: 2,
          }}
        >
          {canClose && !tab.pinned && (
            <span
              onClick={(e) => onClose(e, tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                height: 16,
                borderRadius: 4,
                cursor: "pointer",
                opacity: 0.6,
                transition: "opacity 0.15s ease, background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = hexToRgba(palette.surfaceLight, 0.8);
                e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.opacity = "0.6";
              }}
            >
              <X size={11} />
            </span>
          )}
        </span>
      )}

      {showCtx && (
        <div
          ref={ctxRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 2,
            zIndex: 100,
            minWidth: 160,
            background: palette.surface,
            border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
            borderRadius: 6,
            boxShadow: `0 4px 16px ${hexToRgba("#000", 0.3)}`,
            padding: "4px 0",
            fontSize: 12,
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onPin(tab.id); setShowCtx(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "6px 12px", border: "none", background: "transparent",
              color: palette.text, fontSize: 12, cursor: "pointer", textAlign: "left",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = hexToRgba(palette.surfaceLight, 0.5); }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {tab.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            {tab.pinned ? "Unpin Tab" : "Pin Tab"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSplit(tab.id); setShowCtx(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "6px 12px", border: "none", background: "transparent",
              color: palette.text, fontSize: 12, cursor: "pointer", textAlign: "left",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = hexToRgba(palette.surfaceLight, 0.5); }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <SplitSquareHorizontal size={13} />
            Split Right
          </button>
          {canClose && !tab.pinned && (
            <button
              onClick={(e) => { onClose(e, tab.id); setShowCtx(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "6px 12px", border: "none", background: "transparent",
                color: "#ef4444", fontSize: 12, cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = hexToRgba("#ef4444", 0.08); }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <X size={13} />
              Close Tab
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TabBar() {
  const { palette } = useTheme();
  const navigate = useNavigate();
  const {
    openTabs,
    activeTabId,
    closeTab,
    setActiveTab,
    moveTab,
    togglePinTab,
    closeContextPanel,
    splitTabId,
    setSplitTab,
  } = useWorkspace();

  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  if (openTabs.length === 0) return null;

  const handleTabClick = (id: string, path: string) => {
    setActiveTab(id);
    navigate(path);
    closeContextPanel();
  };

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const tab = openTabs.find((t) => t.id === id);
    if (tab?.pinned) return;

    if (id === activeTabId && openTabs.length > 1) {
      const idx = openTabs.findIndex((t) => t.id === id);
      const remaining = openTabs.filter((t) => t.id !== id);
      const sibling = idx < remaining.length ? remaining[idx] : remaining[remaining.length - 1];
      navigate(sibling.path);
    }
    closeTab(id);
  };

  const handleSplit = (id: string) => {
    if (splitTabId === id) {
      setSplitTab(null);
    } else {
      setSplitTab(id);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = openTabs.findIndex((t) => t.id === active.id);
    const toIndex = openTabs.findIndex((t) => t.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      moveTab(fromIndex, toIndex);
    }
  };

  const tabIds = openTabs.map((t) => t.id);

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
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
          {openTabs.map((tab) => (
            <SortableTab
              key={tab.id}
              tab={tab}
              active={tab.id === activeTabId}
              isSplit={tab.id === splitTabId}
              onClose={handleClose}
              onClick={handleTabClick}
              onPin={togglePinTab}
              onSplit={handleSplit}
              canClose={openTabs.length > 1}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
