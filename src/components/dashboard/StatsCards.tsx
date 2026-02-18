import { BarChart3, Folder, Activity } from 'lucide-react';
import { formatBytes } from './dashboardUtils';
import { EMBER_PALETTE, hexToRgba } from '../../lib/three/emberPalette';
import { GlassPanel } from '../ui/GlassPanel';

interface StatsCardsProps {
  projectsCount: number;
  storageUsed: number;
  activitiesCount: number;
  isLoading: boolean;
}

const cardConfigs = [
  { key: 'projects', label: 'Active Projects', icon: BarChart3, tint: EMBER_PALETTE.primary },
  { key: 'storage', label: 'Storage Used', icon: Folder, tint: EMBER_PALETTE.secondary },
  { key: 'activities', label: 'Recent Activities', icon: Activity, tint: EMBER_PALETTE.tertiary },
] as const;

export function StatsCards({ projectsCount, storageUsed, activitiesCount, isLoading }: StatsCardsProps) {
  const values: Record<string, string> = {
    projects: isLoading ? '...' : String(projectsCount),
    storage: isLoading ? '...' : formatBytes(storageUsed),
    activities: String(activitiesCount),
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {cardConfigs.map(({ key, label, icon: Icon, tint }) => (
        <GlassPanel
          key={key}
          tint={tint}
          className="p-6 group hover:scale-[1.03] hover:-translate-y-1"
          style={{ cursor: 'default' }}
        >
          <div className="relative z-10 flex items-center space-x-4">
            <div
              className="p-3 rounded-xl"
              style={{
                background: `linear-gradient(135deg, ${hexToRgba(tint, 0.25)} 0%, ${hexToRgba(tint, 0.08)} 100%)`,
                boxShadow: `0 0 20px ${hexToRgba(tint, 0.15)}`,
              }}
            >
              <Icon className="w-6 h-6" style={{ color: tint }} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: hexToRgba(EMBER_PALETTE.text, 0.5) }}>{label}</p>
              <p className="text-3xl font-bold tracking-tight" style={{ color: hexToRgba(EMBER_PALETTE.text, 0.95) }}>
                {values[key]}
              </p>
            </div>
          </div>

          {/* Bottom accent bar */}
          <div
            className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full opacity-40 group-hover:opacity-70 transition-opacity"
            style={{
              background: `linear-gradient(90deg, transparent, ${tint}, transparent)`,
            }}
          />
        </GlassPanel>
      ))}
    </div>
  );
}