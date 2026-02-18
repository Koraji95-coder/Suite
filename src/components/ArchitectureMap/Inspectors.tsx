import type { ArchNode } from './types';
import {
  MAJOR_DESC, GROUP_LINES, MINORS,
  MINOR_TO_COMPS, COMPONENT_LINES,
} from './constants';

// ── Major Node Inspector ──────────────────────────────────────────

export function MajorInspector({ node }: { node: ArchNode }) {
  if (!node) return null;
  const desc = MAJOR_DESC[node.group] || 'No description available';
  const totalLines = GROUP_LINES[node.group] || 0;
  const minorFeatures = MINORS[node.group] || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <div className="text-4xl">{node.icon}</div>
        <div>
          <h4 className="text-lg font-bold text-white/80">{node.id}</h4>
          <p className="text-xs text-orange-400/60">{node.sub}</p>
        </div>
      </div>

      <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
        <div className="text-2xl font-bold" style={{ color: node.color }}>
          {totalLines.toLocaleString()}
        </div>
        <div className="text-xs text-orange-400/60">total lines of code</div>
      </div>

      <div className="text-sm text-orange-300/80 leading-relaxed">
        {desc.split(' · ').map((part, i) => (
          <p key={i} className="mb-1">· {part}</p>
        ))}
      </div>

      <div>
        <h5 className="text-sm font-semibold text-orange-300 mb-2">Features ({minorFeatures.length})</h5>
        <div className="space-y-1 text-xs text-orange-400/70">
          {minorFeatures.map(f => (
            <div key={f} className="flex items-center space-x-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: node.color }}></div>
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Minor Node Inspector ──────────────────────────────────────────

export function MinorInspector({ node }: { node: ArchNode }) {
  if (!node) return null;
  const components = MINOR_TO_COMPS[node.id] || [];
  const totalLines = components.reduce((sum, c) => sum + (COMPONENT_LINES[c] || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-lg font-bold text-white/80">{node.id}</h4>
        <p className="text-xs text-orange-400/60">{node.group} feature</p>
      </div>

      {totalLines > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
          <div className="text-2xl font-bold" style={{ color: node.color }}>
            {totalLines.toLocaleString()}
          </div>
          <div className="text-xs text-orange-400/60">total lines of code</div>
        </div>
      )}

      {components.length > 0 ? (
        <div>
          <h5 className="text-sm font-semibold text-orange-300 mb-2">Components</h5>
          <div className="space-y-2">
            {components.map(c => (
              <div key={c} className="bg-black/40 border border-orange-500/20 rounded p-2">
                <div className="text-sm text-white/80 font-mono">{c}</div>
                <div className="text-xs text-orange-400/60">{COMPONENT_LINES[c]?.toLocaleString() || 0} lines</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-sm text-orange-400/60 italic">
          Static reference panel (no backing components)
        </div>
      )}
    </div>
  );
}
