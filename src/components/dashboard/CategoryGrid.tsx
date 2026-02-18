import { LucideIcon } from 'lucide-react';
import { EMBER_PALETTE, hexToRgba } from '../../lib/three/emberPalette';

interface GridItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface CategoryGridProps {
  items: GridItem[];
  onSelect: (id: string) => void;
  colorScheme: 'blue' | 'green' | 'orange' | 'teal' | 'purple';
  columns?: number; // default 4
}

export function CategoryGrid({ items, onSelect, columns = 4 }: CategoryGridProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: '1.5rem',
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className="group backdrop-blur-xl rounded-2xl p-6 transition-all duration-300 hover:scale-105"
            style={{
              background: hexToRgba('#ffffff', 0.03),
              border: `1px solid ${hexToRgba('#ffffff', 0.06)}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = hexToRgba(EMBER_PALETTE.primary, 0.40);
              e.currentTarget.style.boxShadow = `0 25px 50px -12px ${hexToRgba(EMBER_PALETTE.primary, 0.05)}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = hexToRgba('#ffffff', 0.06);
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div className="flex flex-col items-center space-y-4">
              <div
                className="p-4 rounded-xl transition-all duration-300"
                style={{
                  background: `linear-gradient(to bottom right, ${hexToRgba(EMBER_PALETTE.primary, 0.15)}, ${hexToRgba(EMBER_PALETTE.secondary, 0.10)})`,
                }}
              >
                <Icon
                  className="w-10 h-10 transition-colors duration-300"
                  style={{ color: EMBER_PALETTE.secondary }}
                />
              </div>
              <h3
                className="text-base font-bold text-center"
                style={{ color: hexToRgba(EMBER_PALETTE.text, 0.80) }}
              >
                {item.label}
              </h3>
            </div>
          </button>
        );
      })}
    </div>
  );
}