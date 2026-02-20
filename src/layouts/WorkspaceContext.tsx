import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";

export interface WorkspaceTab {
  id: string;
  label: string;
  path: string;
  icon?: string;
}

interface WorkspaceContextValue {
  openTabs: WorkspaceTab[];
  activeTabId: string | null;
  openTab: (id: string, label: string, path: string, icon?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  contextPanelOpen: boolean;
  contextPanelSection: string | null;
  toggleContextPanel: (section: string) => void;
  aiDrawerOpen: boolean;
  setAiDrawerOpen: (open: boolean) => void;
}

const TABS_STORAGE_KEY = "workspace-open-tabs";
const ACTIVE_TAB_STORAGE_KEY = "workspace-active-tab";

function loadTabs(): WorkspaceTab[] {
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadActiveTab(): string | null {
  try {
    return localStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  openTabs: [],
  activeTabId: null,
  openTab: () => {},
  closeTab: () => {},
  setActiveTab: () => {},
  contextPanelOpen: false,
  contextPanelSection: null,
  toggleContextPanel: () => {},
  aiDrawerOpen: false,
  setAiDrawerOpen: () => {},
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [openTabs, setOpenTabs] = useState<WorkspaceTab[]>(loadTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(loadActiveTab);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [contextPanelSection, setContextPanelSection] = useState<string | null>(null);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(openTabs));
    } catch { /* noop */ }
  }, [openTabs]);

  useEffect(() => {
    try {
      if (activeTabId) {
        localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId);
      } else {
        localStorage.removeItem(ACTIVE_TAB_STORAGE_KEY);
      }
    } catch { /* noop */ }
  }, [activeTabId]);

  const openTab = useCallback((id: string, label: string, path: string, icon?: string) => {
    setOpenTabs((prev) => {
      const exists = prev.find((t) => t.id === id);
      if (exists) return prev;
      return [...prev, { id, label, path, icon }];
    });
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setOpenTabs((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const next = prev.filter((t) => t.id !== id);
      setActiveTabId((currentActive) => {
        if (currentActive !== id) return currentActive;
        if (next.length === 0) return null;
        const sibling = idx < next.length ? next[idx] : next[next.length - 1];
        return sibling.id;
      });
      return next;
    });
  }, []);

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const toggleContextPanel = useCallback((section: string) => {
    setContextPanelOpen((open) => {
      if (open && contextPanelSection === section) {
        setContextPanelSection(null);
        return false;
      }
      setContextPanelSection(section);
      return true;
    });
  }, [contextPanelSection]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      openTabs,
      activeTabId,
      openTab,
      closeTab,
      setActiveTab,
      contextPanelOpen,
      contextPanelSection,
      toggleContextPanel,
      aiDrawerOpen,
      setAiDrawerOpen,
    }),
    [openTabs, activeTabId, openTab, closeTab, setActiveTab, contextPanelOpen, contextPanelSection, toggleContextPanel, aiDrawerOpen]
  );

  return React.createElement(WorkspaceContext.Provider, { value }, children);
}
