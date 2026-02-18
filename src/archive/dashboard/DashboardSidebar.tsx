import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { sidebarNavItems } from '../../constants/menuItems';
import { EMBER_PALETTE, hexToRgba } from '../../lib/three/emberPalette';
import { GlassPanel } from '../ui/GlassPanel';

interface DashboardSidebarProps {
  activePanel: string;
  activeCategory: string | null;
  onNavigate: (panel: string, category?: string | null) => void;
  onToggleCategory: (category: string) => void;
  collapsed?: boolean;
}

export function DashboardSidebar({
  activePanel,
  activeCategory,
  onNavigate,
  onToggleCategory,
  collapsed = false,
}: DashboardSidebarProps) {
  const [query, setQuery] = useState('');

  const isDivider = (item: any) => item && typeof item === 'object' && 'divider' in item;

  const isActive = (item: any) => {
    if (item.isCategory) return activeCategory === item.id;
    return activePanel === item.id && !activeCategory;
  };

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sidebarNavItems;

    // When searching: hide dividers and filter by label
    return sidebarNavItems.filter((item: any) => {
      if (isDivider(item)) return false;
      const label = String(item.label ?? '').toLowerCase();
      return label.includes(q);
    });
  }, [query]);

  return (
    <GlassPanel
      className="h-full min-h-0 flex flex-col"
      tint={EMBER_PALETTE.primary}
      intensity="medium"
      bevel
      specular
      hoverEffect={false}
      style={{
        borderRadius: 0,
        borderRight: `1px solid ${hexToRgba(EMBER_PALETTE.primary, 0.12)}`,
      }}
    >
      {/* Top section: search + subtle title (only when expanded) */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-2">
          <div
            className="text-[11px] tracking-widest uppercase font-semibold mb-2"
            style={{ color: hexToRgba(EMBER_PALETTE.text, 0.45) }}
          >
            Navigation
          </div>

          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{
              background: `linear-gradient(135deg, ${hexToRgba(EMBER_PALETTE.surface, 0.25)} 0%, ${hexToRgba(EMBER_PALETTE.surface, 0.18)} 100%)`,
              border: `1px solid ${hexToRgba(EMBER_PALETTE.primary, 0.12)}`,
              boxShadow: `inset 1px 1px 0 ${hexToRgba('#ffffff', 0.03)}`,
            }}
          >
            <Search className="w-4 h-4" style={{ color: hexToRgba(EMBER_PALETTE.text, 0.45) }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search panels…"
              className="w-full bg-transparent outline-none text-sm"
              style={{ color: hexToRgba(EMBER_PALETTE.text, 0.75) }}
            />
          </div>
        </div>
      )}

      <div className="p-3 space-y-1 overflow-y-auto flex-1 min-h-0">
        {filteredItems.length === 0 && !collapsed ? (
          <div
            className="px-3 py-4 rounded-xl text-sm"
            style={{
              background: hexToRgba(EMBER_PALETTE.surface, 0.22),
              border: `1px solid ${hexToRgba(EMBER_PALETTE.primary, 0.10)}`,
              color: hexToRgba(EMBER_PALETTE.text, 0.55),
            }}
          >
            No matches for “{query.trim()}”
          </div>
        ) : (
          filteredItems.map((item: any, index: number) => {
            if (isDivider(item)) {
              // keep dividers only when not searching
              if (query.trim()) return null;

              return (
                <div
                  key={`divider-${index}`}
                  className="my-3"
                  style={{
                    height: '1px',
                    background: `linear-gradient(90deg, transparent, ${hexToRgba(EMBER_PALETTE.primary, 0.14)}, transparent)`,
                  }}
                />
              );
            }

            const Icon = item.icon;
            const active = isActive(item);

            return (
              <button
                key={item.id}
                type="button"
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  if (item.isCategory) onToggleCategory(item.id);
                  else onNavigate(item.id, null);
                }}
                className={[
                  'relative w-full rounded-xl transition-all duration-300 group',
                  collapsed ? 'px-2 py-2.5 flex items-center justify-center' : 'px-3 py-2.5 flex items-center gap-3',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
                ].join(' ')}
                style={{
                  background: active
                    ? `linear-gradient(135deg, ${hexToRgba(EMBER_PALETTE.primary, 0.16)} 0%, ${hexToRgba(EMBER_PALETTE.primary, 0.06)} 100%)`
                    : hexToRgba(EMBER_PALETTE.surface, 0.18),
                  border: active
                    ? `1px solid ${hexToRgba(EMBER_PALETTE.primary, 0.26)}`
                    : `1px solid ${hexToRgba(EMBER_PALETTE.primary, 0.06)}`,
                  boxShadow: active
                    ? `0 0 18px ${hexToRgba(EMBER_PALETTE.primary, 0.12)}, inset 1px 1px 0 ${hexToRgba('#ffffff', 0.05)}`
                    : `inset 1px 1px 0 ${hexToRgba('#ffffff', 0.02)}`,
                }}
              >
                {/* Active indicator bar (advanced look) */}
                <span
                  aria-hidden
                  className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full transition-opacity duration-300"
                  style={{
                    opacity: active ? 1 : 0,
                    background: `linear-gradient(180deg, ${hexToRgba(EMBER_PALETTE.primary, 0.0)} 0%, ${hexToRgba(EMBER_PALETTE.primary, 0.95)} 50%, ${hexToRgba(EMBER_PALETTE.primary, 0.0)} 100%)`,
                    boxShadow: `0 0 14px ${hexToRgba(EMBER_PALETTE.primary, 0.35)}`,
                  }}
                />

                {/* Icon “chip” */}
                <span
                  className="grid place-items-center rounded-lg transition-all duration-300"
                  style={{
                    width: 34,
                    height: 34,
                    background: active
                      ? `linear-gradient(135deg, ${hexToRgba(EMBER_PALETTE.primary, 0.22)} 0%, ${hexToRgba(EMBER_PALETTE.primary, 0.10)} 100%)`
                      : `linear-gradient(135deg, ${hexToRgba(EMBER_PALETTE.surface, 0.28)} 0%, ${hexToRgba(EMBER_PALETTE.surface, 0.18)} 100%)`,
                    border: `1px solid ${hexToRgba(EMBER_PALETTE.primary, active ? 0.22 : 0.08)}`,
                  }}
                >
                  <Icon
                    className="w-[18px] h-[18px] transition-colors duration-300"
                    style={{ color: active ? EMBER_PALETTE.primary : hexToRgba(EMBER_PALETTE.text, 0.50) }}
                  />
                </span>

                {!collapsed && (
                  <div className="flex-1 min-w-0 text-left">
                    <div
                      className="text-sm font-semibold truncate"
                      style={{ color: active ? hexToRgba(EMBER_PALETTE.text, 0.92) : hexToRgba(EMBER_PALETTE.text, 0.72) }}
                    >
                      {item.label}
                    </div>

                    {/* Optional micro-label for categories */}
                    {item.isCategory && (
                      <div
                        className="text-[11px] mt-0.5"
                        style={{ color: hexToRgba(EMBER_PALETTE.text, 0.42) }}
                      >
                        Collection
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </GlassPanel>
  );
}
