import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useTheme } from "@/lib/palette";
import { WorkspaceProvider } from "./WorkspaceContext";
import { ActivityBar } from "./ActivityBar";
import { ContextPanel } from "./ContextPanel";
import { TabBar } from "./TabBar";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";

const DashboardOverviewPanel = React.lazy(() => import("@/components/dashboard/DashboardOverviewPanel").then(m => ({ default: m.DashboardOverviewPanel })));
const ProjectsHub = React.lazy(() => import("@/components/projects/ProjectsHub").then(m => ({ default: m.ProjectsHub })));
const ProjectManager = React.lazy(() => import("@/components/projects/ProjectManager").then(m => ({ default: m.ProjectManager })));
const CalendarPage = React.lazy(() => import("@/components/calendar/hooks/CalendarPage"));
const TransmittalBuilder = React.lazy(() => import("@/components/apps/TransmittalBuilder").then(m => ({ default: m.TransmittalBuilder })));
const BlockLibrary = React.lazy(() => import("@/components/apps/BlockLibrary").then(m => ({ default: m.BlockLibrary })));
const QAQCChecker = React.lazy(() => import("@/components/apps/QAQCChecker").then(m => ({ default: m.QAQCChecker })));
const GroundGridGenerator = React.lazy(() => import("@/components/apps/GroundGridGenerator").then(m => ({ default: m.GroundGridGenerator })));
const CalculatorPanel = React.lazy(() => import("@/components/CalculatorPanel").then(m => ({ default: m.CalculatorPanel })));
const VectorCalculator = React.lazy(() => import("@/components/VectorCalculator").then(m => ({ default: m.VectorCalculator })));
const ThreePhaseCalculator = React.lazy(() => import("@/components/ThreePhaseCalculator").then(m => ({ default: m.ThreePhaseCalculator })));
const SinusoidalCalculator = React.lazy(() => import("@/components/SinusoidalCalculator").then(m => ({ default: m.SinusoidalCalculator })));
const SymmetricalComponents = React.lazy(() => import("@/components/SymmetricalComponents").then(m => ({ default: m.SymmetricalComponents })));
const FormulaBank = React.lazy(() => import("@/components/FormulaBank").then(m => ({ default: m.FormulaBank })));
const MathReference = React.lazy(() => import("@/components/MathReference").then(m => ({ default: m.MathReference })));
const PlotGenerator = React.lazy(() => import("@/components/PlotGenerator").then(m => ({ default: m.PlotGenerator })));
const CircuitGenerator = React.lazy(() => import("@/components/CircuitGenerator").then(m => ({ default: m.CircuitGenerator })));
const StoragePanel = React.lazy(() => import("@/components/storage/StoragePanel").then(m => ({ default: m.StoragePanel })));
const GraphVisualization = React.lazy(() => import("@/components/graph/GraphVisualization").then(m => ({ default: m.GraphVisualization })));
const AIPanel = React.lazy(() => import("@/components/ai-unified/AIPanel").then(m => ({ default: m.AIPanel })));
const LoginPage = React.lazy(() => import("@/pages/LoginPage").then(m => ({ default: m.LoginPage })));
const SignupPage = React.lazy(() => import("@/pages/SignupPage").then(m => ({ default: m.SignupPage })));

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

function ShellContent() {
  const { palette } = useTheme();

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
        <div style={{ flex: 1, overflow: "auto" }}>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardOverviewPanel />} />
              <Route path="/projects" element={<ProjectsHub />} />
              <Route path="/projects/:id" element={<ProjectManager />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/apps/transmittal" element={<TransmittalBuilder />} />
              <Route path="/apps/block-library" element={<BlockLibrary />} />
              <Route path="/apps/qaqc" element={<QAQCChecker />} />
              <Route path="/apps/ground-grid" element={<GroundGridGenerator />} />
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
              <Route path="/settings" element={<Placeholder name="Settings" />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
            </Routes>
          </Suspense>
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
