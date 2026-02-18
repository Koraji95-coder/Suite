import { Activity } from 'lucide-react';
import { getCategoryColor } from './dashboardUtils';
import { EMBER_PALETTE, hexToRgba, glassCardInnerStyle } from '../../lib/three/emberPalette';
import { GlassPanel } from '../ui/GlassPanel';

interface ActivityItem {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  project_id: string | null;
}

interface RecentActivityListProps {
  activities: ActivityItem[];
  allProjectsMap: Map<string, any>;
}

export function RecentActivityList({ activities, allProjectsMap }: RecentActivityListProps) {
  return (
    <GlassPanel
      tint={EMBER_PALETTE.accent}
      hoverEffect={false}
      className="p-6 group"
    >
      <div className="relative z-10">
        <div className="flex items-center space-x-2 mb-4">
          <div
            className="p-2 rounded-lg"
            style={{
              background: `linear-gradient(135deg, ${hexToRgba(EMBER_PALETTE.accent, 0.25)} 0%, ${hexToRgba(EMBER_PALETTE.accent, 0.08)} 100%)`,
              boxShadow: `0 0 16px ${hexToRgba(EMBER_PALETTE.accent, 0.12)}`,
            }}
          >
            <Activity className="w-5 h-5" style={{ color: EMBER_PALETTE.accent }} />
          </div>
          <h3 className="text-xl font-bold" style={{ color: hexToRgba(EMBER_PALETTE.text, 0.9) }}>Recent Activity</h3>
        </div>

        <div className="space-y-2">
          {activities.length === 0 ? (
            <p className="text-sm" style={{ color: hexToRgba(EMBER_PALETTE.text, 0.3) }}>No recent activity</p>
          ) : (
            activities.map((activity) => {
              const dotColor = activity.project_id && allProjectsMap.has(activity.project_id)
                ? getCategoryColor(allProjectsMap.get(activity.project_id)!.category)
                : EMBER_PALETTE.primary;
              return (
                <div
                  key={activity.id}
                  className="flex items-start space-x-3 p-3 transition-all duration-300 hover:scale-[1.01] hover:-translate-y-px"
                  style={glassCardInnerStyle(EMBER_PALETTE, EMBER_PALETTE.accent)}
                >
                  <div className="mt-1.5">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: dotColor, boxShadow: `0 0 8px ${hexToRgba(dotColor, 0.5)}` }}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: hexToRgba(EMBER_PALETTE.text, 0.85) }}>
                      {activity.description}
                    </p>
                    <p className="text-xs mt-1" style={{ color: hexToRgba(EMBER_PALETTE.text, 0.35) }}>
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </GlassPanel>
  );
}