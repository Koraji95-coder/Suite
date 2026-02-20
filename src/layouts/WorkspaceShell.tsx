import React, { Suspense } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import { X } from "lucide-react";
import { useTheme, hexToRgba } from "@/lib/palette";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";
import { ActivityBar } from "./ActivityBar";
import { ContextPanel } from "./ContextPanel";
import { TabBar } from "./TabBar";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  DashboardOverviewPanel,
  ProjectsHub,
  ProjectManager,
  CalendarPage,
  BlockLibrary,
  QAQCChecker,
  GroundGridGeneratorApp,
  AutomationWorkflows,
  StandardsChecker,
  CalculatorPanel,
  VectorCalculator,
  ThreePhaseCalculator,
  SinusoidalCalculator,
  SymmetricalComponents,
  FormulaBank,
  MathReference,
  PlotGenerator,
  CircuitGenerator,
  StoragePanel,
  GraphVisualization,
  AIPanel,
  AgentPanel,
  LoginPage,
  SignupPage,
  SettingsPage,
  ROUTE_MAP,
} from "./routeComponents";

function Placeholder({ name }: { name: string }) {
  const { palette } = useTheme();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: palette.textMuted,
        fontSize: 18,
        fontWeight: 500,
      }}
    >
      {name} -- Coming Soon
    </div>
  );
}

function NotFound() {
  const { palette } = useTheme();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 12,
        color: palette.textMuted,
      }}
    >
      <span style={{ fontSize: 48, fontWeight: 700, color: palette.primary }}>404</span>
      <span style={{ fontSize: 16, fontWeight: 500 }}>Page not found</span>
      <Link
        to="/dashboard"
        style={{
          marginTop: 8,
          padding: "8px 20px",
          borderRadius: 8,
          background: hexToRgba(palette.primary, 0.15),
          color: palette.primary,
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
          border: `1px solid ${hexToRgba(palette.primary, 0.25)}`,
        }}
      >
        Back to Dashboard
      </Link>
    </div>
  );
}

function LoadingFallback() {
  const { palette } = useTheme();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: palette.textMuted,
        fontSize: 14,
      }}
    >
      Loading...
    </div>
  );
}

function SplitPane() {
  const { palette } = useTheme();
  const { splitTabId, setSplitTab, openTabs, setActiveSplitPane } = useWorkspace();

  if (!splitTabId) return null;

  const splitTab = openTabs.find((t) => t.id === splitTabId);
  if (!splitTab) return null;

  const Component = ROUTE_MAP[splitTab.path];
  if (!Component) return null;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        borderLeft: `2px solid ${hexToRgba(palette.primary, 0.15)}`,
      }}
      onClick={() => setActiveSplitPane("secondary")}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 28,
          minHeight: 28,
          padding: "0 8px 0 12px",
          background: hexToRgba(palette.surfaceLight, 0.3),
          borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
          fontSize: 11,
          color: palette.textMuted,
        }}
      >
        <span style={{ fontWeight: 500 }}>{splitTab.label}</span>
        <button
          onClick={(e) => { e.stopPropagation(); setSplitTab(null); }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            borderRadius: 4,
            border: "none",
            background: "transparent",
            color: palette.textMuted,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = hexToRgba(palette.surfaceLight, 0.8); }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <X size={12} />
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <Component />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

function ShellContent() {
  const { palette } = useTheme();
  const { splitTabId, setActiveSplitPane } = useWorkspace();

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden" }}>
      <ActivityBar />
      <ContextPanel />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          background: palette.background,
        }}
      >
        <TabBar />
        <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
          <div
            style={{ flex: 1, overflow: "auto", minWidth: 0 }}
            onClick={() => splitTabId && setActiveSplitPane("primary")}
          >
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardOverviewPanel />} />
                  <Route path="/projects" element={<ProjectsHub />} />
                  <Route path="/projects/:id" element={<ProjectManager />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/apps/transmittal" element={<Placeholder name="Transmittal Builder" />} />
                  <Route path="/apps/block-library" element={<BlockLibrary />} />
                  <Route path="/apps/qaqc" element={<QAQCChecker />} />
                  <Route path="/apps/ground-grid-generator" element={<GroundGridGeneratorApp />} />
                  <Route path="/apps/automation" element={<AutomationWorkflows />} />
                  <Route path="/apps/standards" element={<StandardsChecker />} />
                  <Route path="/apps/batch-find-replace" element={<Placeholder name="Batch Find & Replace" />} />
                  <Route path="/apps/batch-print" element={<Placeholder name="Batch Print" />} />
                  <Route path="/knowledge/calculator" element={<CalculatorPanel />} />
                  <Route path="/knowledge/vectors" element={<VectorCalculator />} />
                  <Route path="/knowledge/threephase" element={<ThreePhaseCalculator />} />
                  <Route path="/knowledge/sinusoidal" element={<SinusoidalCalculator />} />
                  <Route path="/knowledge/symmetrical" element={<SymmetricalComponents />} />
                  <Route path="/knowledge/formulas" element={<FormulaBank />} />
                  <Route path="/knowledge/math-ref" element={<MathReference />} />
                  <Route path="/knowledge/plot" element={<PlotGenerator />} />
                  <Route path="/knowledge/circuit" element={<CircuitGenerator />} />
                  <Route path="/files" element={<StoragePanel />} />
                  <Route path="/graph" element={<GraphVisualization />} />
                  <Route path="/ai" element={<AIPanel />} />
                  <Route path="/agent" element={<AgentPanel />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </div>
          {splitTabId && <SplitPane />}
        </div>
        <StatusBar />
      </div>
      <CommandPalette />
    </div>
  );
}

export function WorkspaceShell() {
  return (
    <WorkspaceProvider>
      <ShellContent />
    </WorkspaceProvider>
  );
}
