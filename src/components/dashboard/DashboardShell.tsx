import { useEffect, useMemo, useState } from 'react';
import { Zap, CircuitBoard, Activity, GitBranch, FileText } from 'lucide-react';
import { EMBER_PALETTE, hexToRgba } from '../../lib/three/emberPalette';
import { DashboardHeader } from './DashboardHeader';
import { DashboardSidebar } from './DashboardSidebar';
import { PanelWrapper } from '../PanelWrapper';
import { CategoryGrid } from './CategoryGrid';
import { FileUploadModal } from '../FileUploadModal';
import { menuSections } from '../../constants/menuItems';
import { FloatingWhiteboardButton } from '../FloatingWhiteboardButton';
import { EmberOrb } from '../ai/AIChat/Emberorb';
import { DashboardOverviewPanel } from './DashboardOverviewPanel';
import { ProjectManager } from '../projects/ProjectManager';
import { ProjectsHub } from '../projects/ProjectsHub';
import { StorageManager } from '../StorageManager';
import { CalculatorPanel } from '../CalculatorPanel';
import { VectorCalculator } from '../VectorCalculator';
import { ThreePhaseCalculator } from '../ThreePhaseCalculator';
import { SymmetricalComponents } from '../SymmetricalComponents';
import { SinusoidalCalculator } from '../SinusoidalCalculator';
import { MathReference } from '../MathReference';
import { PlotGenerator } from '../PlotGenerator';
import { CircuitGenerator } from '../CircuitGenerator';
import { FormulaBank } from '../FormulaBank';
import { AIMemoryMap } from '../ai/AIMemoryMap/AIMemoryMap';
import { BlockLibrary } from '../apps/BlockLibrary';
import { QAQCChecker } from '../apps/QAQCChecker';
import { AppsHub } from '../apps/AppsHub';
import { ArchitectureMapPanel } from '../ArchitectureMap/ArchitectureMapPanel';
import { TestPreview } from './GlassTestPanel';
import { EventCalendar } from '../calendar/EventCalendar';

export type ActivePanel =
  | 'dashboard' | 'projects' | 'projectshub' | 'storage' | 'calculator' | 'plots'
  | 'circuits' | 'formulas' | 'vectors' | 'threephase' | 'sinusoidal' | 'symmetrical'
  | 'mathref' | 'nec' | 'ieee' | 'blocklibrary' | 'transmittal' | 'groundgrid' | 'batch'
  | 'ai-memory' | 'qaqc' | 'appshub' | 'transformers' | 'transformer-auto'
  | 'transformer-auto-delta' | 'transformer-zigzag' | 'transformer-zigzag-wye'
  | 'transmissionlines' | 'shuntreactor' | 'shuntcapacitor' | 'syncgen-salient'
  | 'syncgen-cylindrical-2pole' | 'syncgen-cylindrical-4pole' | 'motor-synchronous'
  | 'motor-squirrelcage' | 'motor-woundrotor' | 'windmachines' | 'threephase-faultanalysis'
  | 'threephase-powerflow' | 'threephase-loadflow' | 'threephase-basics' | 'electronics'
  | 'digital-logic' | 'electromagnetics' | 'architecture-map' | 'test-preview' | 'calendar';

type CategoryView = 'apps' | 'knowledge' | 'threephase-submenu' | null;

interface DashboardShellProps {
  initialPanel?: ActivePanel;
  initialAppsHubApp?: string | null;
}

export function DashboardShell({ initialPanel = 'dashboard', initialAppsHubApp = null }: DashboardShellProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(initialPanel);
  const [activeCategory, setActiveCategory] = useState<CategoryView>(null);
  const [showFileUploadModal, setShowFileUploadModal] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('');

  const [sharedCalendarDate, setSharedCalendarDate] = useState<string | null>(null);
  const [sharedCalendarMonth, setSharedCalendarMonth] = useState<Date>(new Date());

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Entrance animation (mirrors your EmberSplash exit)
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    setActivePanel(initialPanel);
    setActiveCategory(null);
  }, [initialPanel]);

  const handleNavigate = (panel: string, category?: string | null) => {
    setActivePanel(panel as ActivePanel);
    setActiveCategory((category as CategoryView) ?? null);
  };

  const handleToggleCategory = (category: string) => {
    setActiveCategory(activeCategory === category ? null : (category as CategoryView));
  };

  const handleBack = () => {
    if (activeCategory?.includes('-submenu')) {
      if (activeCategory === 'threephase-submenu') setActiveCategory('knowledge');
      return;
    }
    if (activeCategory) {
      setActiveCategory(null);
      return;
    }
    setActivePanel('dashboard');
  };

  const panelContext = activeCategory ?? activePanel;

  const categoryConfig: Record<string, { items: any[]; color: 'blue' | 'green' | 'orange' | 'teal' | 'purple' }> = {
    apps: { items: menuSections[1]?.items ?? [], color: 'teal' },
    knowledge: { items: menuSections[2]?.items ?? [], color: 'blue' },
  };

  const threePhaseItems = useMemo(() => ([
    { id: 'threephase-basics', label: 'Basics', icon: Zap },
    { id: 'threephase-faultanalysis', label: 'Fault Analysis', icon: Activity },
    { id: 'threephase-powerflow', label: 'Power Flow', icon: GitBranch },
    { id: 'threephase-loadflow', label: 'Load Flow', icon: CircuitBoard },
  ]), []);

  const renderMainContent = () => {
    if (activeCategory === 'apps' && categoryConfig.apps) {
      return (
        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-white/90">Applications</h2>
          <CategoryGrid items={categoryConfig.apps.items} onSelect={(id) => handleNavigate(id)} colorScheme="teal" />
        </div>
      );
    }

    if (activeCategory === 'knowledge' && categoryConfig.knowledge) {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold text-blue-100">Knowledge & Standards</h2>
            <button
              onClick={() => {
                setUploadCategory('standards');
                setShowFileUploadModal(true);
              }}
              className="bg-blue-600/30 hover:bg-blue-600/40 border border-blue-500/50 text-blue-100 px-4 py-2 rounded-lg flex items-center space-x-2"
            >
              <FileText className="w-4 h-4" />
              <span>Upload Document</span>
            </button>
          </div>
          <CategoryGrid
            items={categoryConfig.knowledge.items}
            onSelect={(id) => {
              if (id === 'threephase') setActiveCategory('threephase-submenu');
              else handleNavigate(id);
            }}
            colorScheme="blue"
          />
        </div>
      );
    }

    if (activeCategory === 'threephase-submenu') {
      return (
        <PanelWrapper
          title="Three-Phase Systems"
          icon={<Zap className="w-8 h-8 text-blue-300" />}
          onBack={handleBack}
          colorScheme="blue"
        >
          <CategoryGrid items={threePhaseItems} onSelect={handleNavigate} colorScheme="blue" />
        </PanelWrapper>
      );
    }

    if (!activeCategory) {
      switch (activePanel) {
        case 'dashboard':
          return (
            <DashboardOverviewPanel
              onNavigateToProject={() => setActivePanel('projects')}
              onNavigateToProjectsHub={() => setActivePanel('projectshub')}
              selectedCalendarDate={sharedCalendarDate}
              onCalendarDateChange={setSharedCalendarDate}
              calendarMonth={sharedCalendarMonth}
              onCalendarMonthChange={setSharedCalendarMonth}
            />
          );
        case 'projectshub':
          return <ProjectsHub onSelectProject={() => setActivePanel('projects')} />;
        case 'projects':
          return (
            <ProjectManager
              selectedCalendarDate={sharedCalendarDate}
              onCalendarDateChange={setSharedCalendarDate}
              calendarMonth={sharedCalendarMonth}
              onCalendarMonthChange={setSharedCalendarMonth}
            />
          );
        case 'storage':
          return <StorageManager />;
        case 'calculator':
          return <CalculatorPanel />;
        case 'vectors':
          return <VectorCalculator />;
        case 'threephase':
          return <ThreePhaseCalculator />;
        case 'symmetrical':
          return <SymmetricalComponents />;
        case 'sinusoidal':
          return <SinusoidalCalculator />;
        case 'mathref':
          return <MathReference />;
        case 'plots':
          return <PlotGenerator />;
        case 'circuits':
          return <CircuitGenerator />;
        case 'formulas':
          return <FormulaBank />;
        case 'ai-memory':
          return <AIMemoryMap />;
        case 'blocklibrary':
          return <BlockLibrary />;
        case 'qaqc':
          return <QAQCChecker />;
        case 'appshub':
          return <AppsHub initialActiveApp={initialAppsHubApp} />;
        case 'test-preview':
          return <TestPreview />;
        case 'calendar':
          return <EventCalendar />;
        case 'architecture-map':
          return null; // rendered full-bleed below
        default:
          return (
            <PanelWrapper
              title={activePanel.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              icon={<FileText className="w-8 h-8" style={{ color: EMBER_PALETTE.primary }} />}
              onBack={handleBack}
            >
              <div
                className="backdrop-blur-lg rounded-lg p-8"
                style={{
                  background: `linear-gradient(to bottom right, ${hexToRgba(EMBER_PALETTE.surface, 0.5)}, ${hexToRgba(EMBER_PALETTE.surface, 0.7)})`,
                  border: `1px solid ${hexToRgba(EMBER_PALETTE.primary, 0.4)}`,
                }}
              >
                <p style={{ color: hexToRgba(EMBER_PALETTE.text, 0.8) }} className="text-lg">
                  Content coming soon...
                </p>
              </div>
            </PanelWrapper>
          );
      }
    }

    return null;
  };

  const enterEasing = 'cubic-bezier(0.4, 0, 0.2, 1)';
  const sidebarWidth = sidebarCollapsed ? 84 : 280;

  return (
    <div
      id="dashboard-shell"
      className="relative z-10 min-h-screen grid grid-rows-[auto,1fr]"
      style={{
        opacity: entered ? 1 : 0,
        transform: entered ? 'scale(1)' : 'scale(0.97)',
        filter: entered ? 'blur(0px)' : 'blur(6px)',
        transition: `opacity 800ms ${enterEasing}, transform 800ms ${enterEasing}, filter 800ms ${enterEasing}`,
      }}
    >
      <FloatingWhiteboardButton panelContext={panelContext} />
      <EmberOrb context={{ panelContext }} onNavigateToMemory={() => handleNavigate('ai-memory')} />

      {/* Sticky header */}
      <div
        className="sticky top-0 z-[80]"
        style={{
          opacity: entered ? 1 : 0,
          transform: entered ? 'translateY(0)' : 'translateY(-12px)',
          transition: `opacity 600ms ${enterEasing} 100ms, transform 600ms ${enterEasing} 100ms`,
        }}
      >
        <DashboardHeader onToggleSidebar={() => setSidebarCollapsed((p) => !p)} />
      </div>

      {/* App body */}
      <div className="min-h-0 grid grid-cols-[auto,1fr] overflow-hidden">
        {/* Sidebar column */}
        <aside
          className="h-full min-h-0"
          style={{
            width: sidebarWidth,
            transition: `width 260ms ${enterEasing}`,
            opacity: entered ? 1 : 0,
            transform: entered ? 'translateX(0)' : 'translateX(-18px)',
            transitionProperty: 'width, opacity, transform',
            transitionDuration: '260ms, 600ms, 600ms',
            transitionTimingFunction: `${enterEasing}, ${enterEasing}, ${enterEasing}`,
            transitionDelay: '0ms, 200ms, 200ms',
          }}
        >
          <DashboardSidebar
            activePanel={activePanel}
            activeCategory={activeCategory}
            onNavigate={handleNavigate}
            onToggleCategory={handleToggleCategory}
            collapsed={sidebarCollapsed}
          />
        </aside>

        {/* Main content column */}
        <main
          className="relative min-h-0 overflow-auto"
          style={{
            opacity: entered ? 1 : 0,
            transform: entered ? 'translateY(0)' : 'translateY(16px)',
            transition: `opacity 700ms ${enterEasing} 350ms, transform 700ms ${enterEasing} 350ms`,
          }}
        >
          {/* subtle “depth” overlay (advanced look) */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(900px 600px at 20% 10%, ${hexToRgba(EMBER_PALETTE.primary, 0.08)} 0%, transparent 60%),
                           radial-gradient(700px 500px at 90% 20%, ${hexToRgba(EMBER_PALETTE.tertiary, 0.06)} 0%, transparent 55%)`,
            }}
          />

          {activePanel === 'architecture-map' && !activeCategory ? (
            <div className="h-full relative">
              <ArchitectureMapPanel />
            </div>
          ) : (
            <div className="relative px-5 py-5">
              <div className="mx-auto max-w-[1480px]">
                {renderMainContent()}
              </div>
            </div>
          )}
        </main>
      </div>

      <FileUploadModal
        isOpen={showFileUploadModal}
        onClose={() => setShowFileUploadModal(false)}
        uploadCategory={uploadCategory}
        onUpload={(data) => {
          console.log('Upload data:', data);
        }}
      />
    </div>
  );
}
