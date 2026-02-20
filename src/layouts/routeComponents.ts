import React from "react";

type LazyComponent = React.LazyExoticComponent<React.ComponentType>;

function lazy(loader: () => Promise<{ default: React.ComponentType }>): LazyComponent {
  return React.lazy(loader);
}

export const DashboardOverviewPanel = lazy(() => import("@/components/dashboard/DashboardOverviewPanel").then(m => ({ default: m.DashboardOverviewPanel })));
export const ProjectsHub = lazy(() => import("@/components/projects/ProjectsHub").then(m => ({ default: m.ProjectsHub })));
export const ProjectManager = lazy(() => import("@/components/projects/ProjectManager").then(m => ({ default: m.ProjectManager })));
export const CalendarPage = lazy(() => import("@/components/calendar/hooks/CalendarPage"));
export const BlockLibrary = lazy(() => import("@/components/apps/BlockLibrary").then(m => ({ default: m.BlockLibrary })));
export const QAQCChecker = lazy(() => import("@/components/apps/QAQCChecker").then(m => ({ default: m.QAQCChecker })));
export const GroundGridGeneratorApp = lazy(() => import("@/components/apps/ground-grid/GroundGridGeneratorApp").then(m => ({ default: m.GroundGridGeneratorApp })));
export const AutomationWorkflows = lazy(() => import("@/components/apps/AutomationWorkflows").then(m => ({ default: m.AutomationWorkflows })));
export const StandardsChecker = lazy(() => import("@/components/apps/StandardsChecker").then(m => ({ default: m.StandardsChecker })));
export const CalculatorPanel = lazy(() => import("@/components/CalculatorPanel").then(m => ({ default: m.CalculatorPanel })));
export const VectorCalculator = lazy(() => import("@/components/VectorCalculator").then(m => ({ default: m.VectorCalculator })));
export const ThreePhaseCalculator = lazy(() => import("@/components/ThreePhaseCalculator").then(m => ({ default: m.ThreePhaseCalculator })));
export const SinusoidalCalculator = lazy(() => import("@/components/SinusoidalCalculator").then(m => ({ default: m.SinusoidalCalculator })));
export const SymmetricalComponents = lazy(() => import("@/components/SymmetricalComponents").then(m => ({ default: m.SymmetricalComponents })));
export const FormulaBank = lazy(() => import("@/components/FormulaBank").then(m => ({ default: m.FormulaBank })));
export const MathReference = lazy(() => import("@/components/MathReference").then(m => ({ default: m.MathReference })));
export const PlotGenerator = lazy(() => import("@/components/PlotGenerator").then(m => ({ default: m.PlotGenerator })));
export const CircuitGenerator = lazy(() => import("@/components/CircuitGenerator").then(m => ({ default: m.CircuitGenerator })));
export const StoragePanel = lazy(() => import("@/components/storage/StoragePanel").then(m => ({ default: m.StoragePanel })));
export const GraphVisualization = lazy(() => import("@/components/graph/GraphVisualization").then(m => ({ default: m.GraphVisualization })));
export const AIPanel = lazy(() => import("@/components/ai-unified/AIPanel").then(m => ({ default: m.AIPanel })));
export const AgentPanel = lazy(() => import("@/components/AgentPanel").then(m => ({ default: m.AgentPanel })));
export const LoginPage = lazy(() => import("@/pages/LoginPage").then(m => ({ default: m.LoginPage })));
export const SignupPage = lazy(() => import("@/pages/SignupPage").then(m => ({ default: m.SignupPage })));
export const SettingsPage = lazy(() => import("@/components/settings/SettingsPage").then(m => ({ default: m.SettingsPage })));

export const ROUTE_MAP: Record<string, LazyComponent> = {
  "/dashboard": DashboardOverviewPanel,
  "/projects": ProjectsHub,
  "/calendar": CalendarPage,
  "/apps/block-library": BlockLibrary,
  "/apps/qaqc": QAQCChecker,
  "/apps/ground-grid-generator": GroundGridGeneratorApp,
  "/apps/automation": AutomationWorkflows,
  "/apps/standards": StandardsChecker,
  "/knowledge/calculator": CalculatorPanel,
  "/knowledge/vectors": VectorCalculator,
  "/knowledge/threephase": ThreePhaseCalculator,
  "/knowledge/sinusoidal": SinusoidalCalculator,
  "/knowledge/symmetrical": SymmetricalComponents,
  "/knowledge/formulas": FormulaBank,
  "/knowledge/math-ref": MathReference,
  "/knowledge/plot": PlotGenerator,
  "/knowledge/circuit": CircuitGenerator,
  "/files": StoragePanel,
  "/graph": GraphVisualization,
  "/ai": AIPanel,
  "/agent": AgentPanel,
  "/settings": SettingsPage,
};
