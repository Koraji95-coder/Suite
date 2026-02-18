import React, { Suspense } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import { useTheme, hexToRgba } from "@/lib/palette";
import { WorkspaceProvider } from "./WorkspaceContext";
import { ActivityBar } from "./ActivityBar";
import { ContextPanel } from "./ContextPanel";
import { TabBar } from "./TabBar";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const DashboardOverviewPanel = React.lazy(() => import("@/components/dashboard/DashboardOverviewPanel").then(m => ({ default: m.DashboardOverviewPanel })));
const ProjectsHub = React.lazy(() => import("@/components/projects/ProjectsHub").then(m => ({ default: m.ProjectsHub })));
const ProjectManager = React.lazy(() => import("@/components/projects/ProjectManager").then(m => ({ default: m.ProjectManager })));
const CalendarPage = React.lazy(() => import("@/components/calendar/hooks/CalendarPage"));
const BlockLibrary = React.lazy(() => import("@/components/apps/BlockLibrary").then(m => ({ default: m.BlockLibrary })));
const QAQCChecker = React.lazy(() => import("@/components/apps/QAQCChecker").then(m => ({ default: m.QAQCChecker })));
const GroundGridGenerator = React.lazy(() => import("@/components/apps/GroundGridGenerator").then(m => ({ default: m.GroundGridGenerator })));
const CoordinatesGrabber = React.lazy(() => import("@/components/apps/CoordinatesGrabber").then(m => ({ default: m.CoordinatesGrabber })));
const AutomationWorkflows = React.lazy(() => import("@/components/apps/AutomationWorkflows").then(m => ({ default: m.AutomationWorkflows })));
const StandardsChecker = React.lazy(() => import("@/components/apps/StandardsChecker").then(m => ({ default: m.StandardsChecker })));
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
const AgentPanel = React.lazy(() => import("@/components/AgentPanel").then(m => ({ default: m.AgentPanel })));
const LoginPage = React.lazy(() => import("@/pages/LoginPage").then(m => ({ default: m.LoginPage })));
const SignupPage = React.lazy(() => import("@/pages/SignupPage").then(m => ({ default: m.SignupPage })));
const SettingsPage = React.lazy(() => import("@/components/settings/SettingsPage").then(m => ({ default: m.SettingsPage })));

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
              <Route path="/apps/ground-grid" element={<GroundGridGenerator />} />
              <Route path="/apps/coordinates-grabber" element={<CoordinatesGrabber />} />
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
