// ── Codebase Metrics ─────────────────────────────────────────────

export const COMPONENT_LINES: Record<string, number> = {
  'DashboardOverviewPanel.tsx': 618, 'DashboardShell.tsx': 838, 'AppBackground.tsx': 19,
  'PanelInfoDialog.tsx': 141, 'ToastProvider.tsx': 78, 'FloatingWhiteboardButton.tsx': 88,
  'VectorCalculator.tsx': 473, 'SinusoidalCalculator.tsx': 397,
  'MathReference.tsx': 395, 'SymmetricalComponents.tsx': 387,
  'CalculatorPanel.tsx': 333, 'ThreePhaseCalculator.tsx': 315,
  'CircuitGenerator.tsx': 256, 'PlotGenerator.tsx': 219,
  'FormulaBank.tsx': 214,
  'QAQCChecker.tsx': 656, 'TransmittalBuilder.tsx': 654, 'BlockLibrary.tsx': 523,
  'AppsHub.tsx': 478, 'GroundGridGenerator.tsx': 365, 'AIChat.tsx': 432,
  'Whiteboard.tsx': 433, 'WhiteboardLibrary.tsx': 238,
  'AdvancedAIFeatures.tsx': 534, 'AIMemoryMap.tsx': 465,
  'ProjectManager.tsx': 1821, 'ProjectsHub.tsx': 323, 'StorageManager.tsx': 1110,
};

export const COMP_TO_GROUP: Record<string, string> = {
  'DashboardOverviewPanel.tsx': 'dash', 'DashboardShell.tsx': 'dash', 'AppBackground.tsx': 'dash',
  'PanelInfoDialog.tsx': 'dash', 'ToastProvider.tsx': 'dash', 'FloatingWhiteboardButton.tsx': 'dash',
  'VectorCalculator.tsx': 'know', 'SinusoidalCalculator.tsx': 'know',
  'MathReference.tsx': 'know', 'SymmetricalComponents.tsx': 'know',
  'CalculatorPanel.tsx': 'know', 'ThreePhaseCalculator.tsx': 'know',
  'CircuitGenerator.tsx': 'know', 'PlotGenerator.tsx': 'know',
  'FormulaBank.tsx': 'know',
  'QAQCChecker.tsx': 'apps', 'TransmittalBuilder.tsx': 'apps', 'BlockLibrary.tsx': 'apps',
  'AppsHub.tsx': 'apps', 'GroundGridGenerator.tsx': 'apps', 'AIChat.tsx': 'apps',
  'Whiteboard.tsx': 'apps', 'WhiteboardLibrary.tsx': 'apps',
  'AdvancedAIFeatures.tsx': 'apps', 'AIMemoryMap.tsx': 'apps',
  'ProjectManager.tsx': 'proj', 'ProjectsHub.tsx': 'proj', 'StorageManager.tsx': 'proj',
};

export const MINOR_TO_COMPS: Record<string, string[]> = {
  'Activity Feed': ['DashboardOverviewPanel.tsx'], 'Calendar Integration': ['DashboardOverviewPanel.tsx'],
  'Storage Monitor': ['StorageManager.tsx'],
  'Project Overview': ['DashboardOverviewPanel.tsx', 'DashboardShell.tsx'],
  'Quick Navigation': ['DashboardOverviewPanel.tsx'],
  'Calculations': ['CalculatorPanel.tsx'], 'Vector Analysis': ['VectorCalculator.tsx'],
  'Three-Phase Systems': ['ThreePhaseCalculator.tsx'],
  'Symmetrical Components': ['SymmetricalComponents.tsx'],
  'Sinusoidal & Per-Unit': ['SinusoidalCalculator.tsx'],
  'Math Reference': ['MathReference.tsx'], 'Plot Diagrams': ['PlotGenerator.tsx'],
  'Circuit Generator': ['CircuitGenerator.tsx'], 'Formula Bank': ['FormulaBank.tsx'],
  'Electronics': ['CalculatorPanel.tsx'], 'Digital Logic': ['CalculatorPanel.tsx'],
  'Electromagnetics': [],
  'QA/QC Checker': ['QAQCChecker.tsx'], 'Block Library': ['BlockLibrary.tsx'],
  'Transmittal Builder': ['TransmittalBuilder.tsx'],
  'Ground Grid Generator': ['GroundGridGenerator.tsx'],
  'AI Assistant': ['AIChat.tsx', 'AdvancedAIFeatures.tsx', 'AIMemoryMap.tsx'],
  'Whiteboard': ['Whiteboard.tsx', 'WhiteboardLibrary.tsx'],
  'Batch Processing': ['AppsHub.tsx'],
  'Transformers': [], 'Transmission Lines': [], 'Shunt Reactor': [],
  'Shunt Capacitor': [], 'Sync Generators': [], 'Motors': [], 'Wind Machines': [],
  'National Electric Code': [], 'IEEE Standards': [], 'IEC Standards': [],
  'ANSI Standards': [], 'NEMA Standards': [],
  'Task Management': ['ProjectManager.tsx'],
  'File Management': ['ProjectManager.tsx', 'StorageManager.tsx'],
  'Projects Hub': ['ProjectsHub.tsx'],
  'Calendar Events': ['ProjectManager.tsx'], 'Activity Logging': ['ProjectManager.tsx'],
};

// ── Computed Group Metrics ────────────────────────────────────────

export const GROUP_LINES: Record<string, number> = {};
for (const [comp, grp] of Object.entries(COMP_TO_GROUP)) {
  GROUP_LINES[grp] = (GROUP_LINES[grp] || 0) + (COMPONENT_LINES[comp] || 0);
}
(['dash', 'know', 'apps', 'equip', 'std', 'proj'] as const).forEach(g => {
  GROUP_LINES[g] = Math.max(GROUP_LINES[g] || 0, 200);
});

export function majorRadius(group: string): number {
  const lines = GROUP_LINES[group] || 200;
  return Math.round(Math.max(80, Math.min(160, 40 + Math.sqrt(lines) * 1.9)));
}

export function minorRadius(nodeId: string): number {
  const comps = MINOR_TO_COMPS[nodeId] || [];
  const lines = comps.reduce((s, c) => s + (COMPONENT_LINES[c] || 0), 0);
  if (lines === 0) return 28;
  return Math.round(Math.max(24, Math.min(68, 14 + Math.sqrt(lines) * 1.1)));
}

// ── Graph Data ───────────────────────────────────────────────────

export const MAJORS = [
  { id: 'Dashboard Core', sub: 'Central Command Hub', icon: '⚡', group: 'dash', r: majorRadius('dash'), color: '#00d4ff' },
  { id: 'Knowledge Base', sub: 'Engineering Intelligence', icon: '📖', group: 'know', r: majorRadius('know'), color: '#4a8fff' },
  { id: 'Apps & Automation', sub: 'Tool Powerhouse', icon: '🔧', group: 'apps', r: majorRadius('apps'), color: '#e066ff' },
  { id: 'Equipment Library', sub: 'Hardware Reference', icon: '⚙', group: 'equip', r: majorRadius('equip'), color: '#ff8c42' },
  { id: 'Standards & Codes', sub: 'Compliance Gateway', icon: '📋', group: 'std', r: majorRadius('std'), color: '#4ade80' },
  { id: 'Project Management', sub: 'Workflow Orchestrator', icon: '📁', group: 'proj', r: majorRadius('proj'), color: '#a855f7' },
];

export const MAJOR_DESC: Record<string, string> = {
  dash: 'Central hub monitoring all activity · Real-time project status & calendar · Storage usage & quick navigation · The nerve center of the entire application',
  know: 'Complete EE calculation toolkit · Vector analysis, three-phase, symmetrical components · Formula bank, circuit generator, plot diagrams · Electronics, digital logic, electromagnetics',
  apps: 'QA/QC automated compliance checking · Block library with cloud sync & 3D preview · Transmittal builder for document distribution · Ground grid design per IEEE 80 · AI assistant integration',
  equip: 'Static: Transformers, transmission lines, reactors, capacitors · Rotating: Sync generators, motors, wind machines · Detailed specs, datasheets & configurations · Equipment-to-calculation integration',
  std: 'NEC, IEEE, IEC, ANSI, NEMA standards · Document upload, search & organization · Compliance verification workflows · Version tracking & project linking',
  proj: 'Hierarchical task & subtask management · File upload with Supabase storage · Calendar integration with deadline tracking · Activity logging & progress monitor · Color-coded project organization',
};

export const MINORS: Record<string, string[]> = {
  dash: ['Activity Feed', 'Calendar Integration', 'Storage Monitor', 'Project Overview', 'Quick Navigation'],
  know: ['Calculations', 'Vector Analysis', 'Three-Phase Systems', 'Symmetrical Components',
    'Sinusoidal & Per-Unit', 'Math Reference', 'Plot Diagrams', 'Circuit Generator',
    'Formula Bank', 'Electronics', 'Digital Logic', 'Electromagnetics'],
  apps: ['QA/QC Checker', 'Block Library', 'Transmittal Builder', 'Ground Grid Generator',
    'AI Assistant', 'Whiteboard', 'Batch Processing'],
  equip: ['Transformers', 'Transmission Lines', 'Shunt Reactor', 'Shunt Capacitor',
    'Sync Generators', 'Motors', 'Wind Machines'],
  std: ['National Electric Code', 'IEEE Standards', 'IEC Standards', 'ANSI Standards', 'NEMA Standards'],
  proj: ['Task Management', 'File Management', 'Projects Hub', 'Calendar Events', 'Activity Logging'],
};

export const OVERLAPS: [string, string][] = [
  ['QA/QC Checker', 'National Electric Code'], ['QA/QC Checker', 'IEEE Standards'],
  ['Block Library', 'File Management'], ['Transmittal Builder', 'File Management'],
  ['Transmittal Builder', 'Projects Hub'], ['Formula Bank', 'Calculations'],
  ['Three-Phase Systems', 'Symmetrical Components'], ['Circuit Generator', 'Electronics'],
  ['Calculations', 'Transformers'], ['Three-Phase Systems', 'Sync Generators'],
  ['Three-Phase Systems', 'Motors'], ['Ground Grid Generator', 'IEEE Standards'],
  ['Storage Monitor', 'File Management'], ['Calendar Integration', 'Calendar Events'],
  ['Activity Feed', 'Activity Logging'], ['AI Assistant', 'Calculations'],
  ['Project Overview', 'Task Management'], ['Plot Diagrams', 'Math Reference'],
  ['Vector Analysis', 'Electromagnetics'], ['Sinusoidal & Per-Unit', 'Three-Phase Systems'],
  ['Digital Logic', 'Electronics'], ['Whiteboard', 'Projects Hub'],
];

// ── Dynamic LOD (Phase 1.4) ──────────────────────────────────────

// When zoomed out beyond this scale, minor nodes are clustered.
export const LOD_CLUSTER_SCALE = 0.55;

// Neighbor radius in *screen pixels* for clustering. Converted to world units via / scale.
export const LOD_CLUSTER_NEIGHBOR_PX = 72;

// Clicking a cluster zooms back in to (at least) this scale.
export const LOD_CLUSTER_EXIT_SCALE = 0.75;
