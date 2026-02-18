import { useState } from 'react';
import { Cog, Network, Box, CheckCircle, FileText, GitBranch, Database, Activity, Settings as SettingsIcon, ChevronRight, Play, Pause, Plus, ArrowLeft, CircuitBoard } from 'lucide-react';
import { FrameSection } from '../ui/PageFrame';
import { TransmittalBuilder } from './TransmittalBuilder';
import { GroundGridGenerator } from './GroundGridGenerator';
import { BlockLibrary } from './BlockLibrary';
import { QAQCChecker } from './QAQCChecker';
import { PanelInfoDialog } from '../PanelInfoDialog';
import { appsInfo } from '../../data/panelInfo';
import { logger } from '../../lib/errorLogger';

interface AppCard {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'active' | 'inactive' | 'configured';
  category: 'integration' | 'automation' | 'tool';
  hasImplementation?: boolean;
}

interface AppsHubProps {
  initialActiveApp?: string | null;
}

export function AppsHub({ initialActiveApp = null }: AppsHubProps) {
  const [selectedApp, setSelectedApp] = useState<AppCard | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [activeApp, setActiveApp] = useState<string | null>(initialActiveApp);

  const apps: AppCard[] = [
    {
      id: 'qaqc',
      name: 'QA/QC Standards Checker',
      description: 'Automated drawing compliance verification with configurable rules',
      icon: <CheckCircle className="w-6 h-6" />,
      status: 'active',
      category: 'automation',
      hasImplementation: true,
    },
    {
      id: 'block-library',
      name: 'Block Library',
      description: 'Manage and organize your CAD block collection with cloud sync and 3D preview',
      icon: <Box className="w-6 h-6" />,
      status: 'active',
      category: 'tool',
      hasImplementation: true,
    },
    {
      id: 'transmittal',
      name: 'Transmittal Builder',
      description: 'Create professional transmittal documents for sharing drawings with teams',
      icon: <FileText className="w-6 h-6" />,
      status: 'active',
      category: 'tool',
      hasImplementation: true,
    },
    {
      id: 'ground-grid',
      name: 'Ground Grid Generator',
      description: 'Design and calculate electrical ground grid systems for facilities',
      icon: <CircuitBoard className="w-6 h-6" />,
      status: 'active',
      category: 'tool',
      hasImplementation: true,
    },
    {
      id: 'autocad-sync',
      name: 'AutoCAD Integration',
      description: 'Real-time synchronization with AutoCAD for seamless workflow',
      icon: <Network className="w-6 h-6" />,
      status: 'inactive',
      category: 'integration',
    },

    {
      id: 'pdf-export',
      name: 'Batch PDF Export',
      description: 'Automated batch conversion of drawings to PDF with custom settings',
      icon: <FileText className="w-6 h-6" />,
      status: 'configured',
      category: 'automation',
    },
    {
      id: 'workflow-engine',
      name: 'Workflow Engine',
      description: 'Create custom automation workflows for repetitive tasks',
      icon: <GitBranch className="w-6 h-6" />,
      status: 'inactive',
      category: 'automation',
    },
    {
      id: 'cloud-backup',
      name: 'Cloud Backup',
      description: 'Automatic backup of drawings and projects to cloud storage',
      icon: <Database className="w-6 h-6" />,
      status: 'configured',
      category: 'integration',
    },

    {
      id: 'monitoring',
      name: 'Project Monitoring',
      description: 'Real-time monitoring and analytics for project progress and health',
      icon: <Activity className="w-6 h-6" />,
      status: 'configured',
      category: 'tool',
    },
    {
      id: 'api-webhooks',
      name: 'API & Webhooks',
      description: 'Connect external services and trigger actions via webhooks',
      icon: <Network className="w-6 h-6" />,
      status: 'inactive',
      category: 'integration',
    },
  ];

  const handleStatusToggle = (app: AppCard) => {
    const newStatus = app.status === 'active' ? 'inactive' : 'active';
    logger.info('AppsHub', `Toggling app status: ${app.name}`, { from: app.status, to: newStatus });
    // In a real app, this would update the database
    setSelectedApp(null);
  };

  const handleConfigure = (app: AppCard) => {
    logger.info('AppsHub', `Opening configuration for: ${app.name}`);
    // In a real app, this would open a configuration modal
    alert(`Configuration for ${app.name} would open here. This will be implemented with specific settings for each app.`);
  };

  const handleAddIntegration = () => {
    logger.info('AppsHub', 'Add Integration button clicked');
    alert('Add Integration feature coming soon! This will allow you to connect external services and create custom automation workflows.');
  };

  const handleQuickAction = (action: string) => {
    logger.info('AppsHub', `Quick action triggered: ${action}`);

    switch (action) {
      case 'workflow':
        alert('Run Workflow: Select and execute saved automation workflows');
        break;
      case 'check-drawing':
        setActiveApp('qaqc');
        break;
      case 'backup':
        alert('Backup Now: Creating backup of all project data...');
        break;
      case 'sync':
        alert('Sync All: Synchronizing data across all integrated services...');
        break;
    }
  };

  const filteredApps = apps.filter(app =>
    filterCategory === 'all' || app.category === filterCategory
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'from-green-500/20 to-emerald-500/20 border-green-500/40';
      case 'configured': return 'from-blue-500/20 to-cyan-500/20 border-blue-500/40';
      default: return 'from-gray-500/20 to-slate-500/20 border-gray-500/40';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded-full border border-green-500/30">Active</span>;
      case 'configured':
        return <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">Configured</span>;
      default:
        return <span className="text-xs px-2 py-1 bg-gray-500/20 text-gray-300 rounded-full border border-gray-500/30">Inactive</span>;
    }
  };

  if (activeApp === 'block-library') {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setActiveApp(null)}
          className="flex items-center space-x-2 text-white/60 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Apps Hub</span>
        </button>
        <BlockLibrary />
      </div>
    );
  }

  if (activeApp === 'qaqc') {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setActiveApp(null)}
          className="flex items-center space-x-2 text-white/60 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Apps Hub</span>
        </button>
        <QAQCChecker />
      </div>
    );
  }

  if (activeApp === 'transmittal') {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setActiveApp(null)}
          className="flex items-center space-x-2 text-white/60 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Apps Hub</span>
        </button>
        <TransmittalBuilder />
      </div>
    );
  }

  if (activeApp === 'ground-grid') {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setActiveApp(null)}
          className="flex items-center space-x-2 text-white/60 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Apps Hub</span>
        </button>
        <GroundGridGenerator />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-orange-500/20 to-amber-500/10 rounded-lg">
            <Cog className="w-8 h-8 text-orange-400 animate-spin" style={{ animationDuration: '3s' }} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white/80">Apps & Automation Hub</h2>
            <p className="text-orange-400/70">Unified integration and automation dashboard</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
	          <PanelInfoDialog
            title={appsInfo.title}
            sections={appsInfo.sections}
            colorScheme={appsInfo.colorScheme}
          />
          <button
            onClick={handleAddIntegration}
            className="flex items-center space-x-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-3 rounded-lg shadow-lg shadow-orange-500/30 transition-all"
          >
            <Plus className="w-5 h-5" />
            <span>Add Integration</span>
          </button>
        </div>
      </div>

      <FrameSection>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-4 py-2 rounded-lg transition-all ${
                filterCategory === 'all'
                  ? 'bg-orange-500/30 border border-orange-500/50 text-white/90'
                  : 'bg-black/30 border border-white/10 text-white/60 hover:bg-orange-500/10'
              }`}
            >
              All Apps
            </button>
            <button
              onClick={() => setFilterCategory('tool')}
              className={`px-4 py-2 rounded-lg transition-all ${
                filterCategory === 'tool'
                  ? 'bg-orange-500/30 border border-orange-500/50 text-white/90'
                  : 'bg-black/30 border border-white/10 text-white/60 hover:bg-orange-500/10'
              }`}
            >
              Tools
            </button>
            <button
              onClick={() => setFilterCategory('automation')}
              className={`px-4 py-2 rounded-lg transition-all ${
                filterCategory === 'automation'
                  ? 'bg-orange-500/30 border border-orange-500/50 text-white/90'
                  : 'bg-black/30 border border-white/10 text-white/60 hover:bg-orange-500/10'
              }`}
            >
              Automation
            </button>
            <button
              onClick={() => setFilterCategory('integration')}
              className={`px-4 py-2 rounded-lg transition-all ${
                filterCategory === 'integration'
                  ? 'bg-orange-500/30 border border-orange-500/50 text-white/90'
                  : 'bg-black/30 border border-white/10 text-white/60 hover:bg-orange-500/10'
              }`}
            >
              Integrations
            </button>
          </div>

          <div className="flex items-center space-x-4 text-sm text-white/60">
            <span>Total: {apps.length}</span>
            <span>Active: {apps.filter(a => a.status === 'active').length}</span>
            <span>Configured: {apps.filter(a => a.status === 'configured').length}</span>
          </div>
        </div>
      </FrameSection>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredApps.map(app => (
          <div
            key={app.id}
            className={`bg-gradient-to-br ${getStatusColor(app.status)} backdrop-blur-md border rounded-lg overflow-hidden hover:shadow-xl hover:shadow-orange-500/20 transition-all cursor-pointer group`}
            onClick={() => {
              if (app.hasImplementation) {
                setActiveApp(app.id);
              } else {
                setSelectedApp(app);
              }
            }}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-gradient-to-br from-orange-500/30 to-amber-500/30 rounded-lg group-hover:shadow-lg group-hover:shadow-orange-500/50 transition-all">
                  {app.icon}
                </div>
                {getStatusBadge(app.status)}
              </div>

              <h3 className="text-xl font-bold text-white/90 mb-2">{app.name}</h3>
              <p className="text-white/50 text-sm mb-4">{app.description}</p>

              <div className="flex items-center justify-between">
                <span className="text-xs px-2 py-1 bg-orange-500/10 text-white/60 rounded-full border border-orange-500/30 capitalize">
                  {app.category}
                </span>
                <button className="text-orange-400 hover:text-white/60 transition-all group-hover:translate-x-1">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <FrameSection title="Quick Actions">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => handleQuickAction('workflow')}
            className="flex items-center space-x-2 bg-black/30 hover:bg-orange-500/20 border border-orange-500/30 text-white/60 px-4 py-2 rounded-lg transition-all"
          >
            <Play className="w-4 h-4" />
            <span className="text-sm">Run Workflow</span>
          </button>
          <button
            onClick={() => handleQuickAction('check-drawing')}
            className="flex items-center space-x-2 bg-black/30 hover:bg-orange-500/20 border border-orange-500/30 text-white/60 px-4 py-2 rounded-lg transition-all"
          >
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">Check Drawing</span>
          </button>
          <button
            onClick={() => handleQuickAction('backup')}
            className="flex items-center space-x-2 bg-black/30 hover:bg-orange-500/20 border border-orange-500/30 text-white/60 px-4 py-2 rounded-lg transition-all"
          >
            <Database className="w-4 h-4" />
            <span className="text-sm">Backup Now</span>
          </button>
          <button
            onClick={() => handleQuickAction('sync')}
            className="flex items-center space-x-2 bg-black/30 hover:bg-orange-500/20 border border-orange-500/30 text-white/60 px-4 py-2 rounded-lg transition-all"
          >
            <Network className="w-4 h-4" />
            <span className="text-sm">Sync All</span>
          </button>
        </div>
      </FrameSection>

      {selectedApp && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] backdrop-blur-xl border border-orange-500/30 rounded-lg max-w-2xl w-full">
            <div className="flex items-center justify-between p-6 border-b border-orange-500/30">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-orange-500/20 rounded-lg">
                  {selectedApp.icon}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white/80">{selectedApp.name}</h3>
                  {getStatusBadge(selectedApp.status)}
                </div>
              </div>
              <button
                onClick={() => setSelectedApp(null)}
                className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
              >
                <span className="text-red-400 text-2xl">×</span>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h4 className="text-lg font-bold text-white/80 mb-2">Description</h4>
                <p className="text-white/50">{selectedApp.description}</p>
              </div>

              <div>
                <h4 className="text-lg font-bold text-white/80 mb-2">Category</h4>
                <span className="text-xs px-3 py-1 bg-orange-500/10 text-white/60 rounded-full border border-orange-500/30 capitalize">
                  {selectedApp.category}
                </span>
              </div>

              <div className="flex gap-3">
                {selectedApp.status === 'active' ? (
                  <button
                    onClick={() => handleStatusToggle(selectedApp)}
                    className="flex-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-100 px-6 py-3 rounded-lg transition-all flex items-center justify-center space-x-2"
                  >
                    <Pause className="w-5 h-5" />
                    <span>Deactivate</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleStatusToggle(selectedApp)}
                    className="flex-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-100 px-6 py-3 rounded-lg transition-all flex items-center justify-center space-x-2"
                  >
                    <Play className="w-5 h-5" />
                    <span>Activate</span>
                  </button>
                )}
                <button
                  onClick={() => handleConfigure(selectedApp)}
                  className="bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-white/90 px-6 py-3 rounded-lg transition-all flex items-center space-x-2"
                >
                  <SettingsIcon className="w-5 h-5" />
                  <span>Configure</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
