import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Network, RotateCcw, Search, X } from 'lucide-react';

import type { ArchLink, ArchNode } from './types';
import { useGraphData } from './hooks/useGraphData';
import { createRenderState, type RenderState } from './hooks/useCanvasRenderer';
import { useSimulationWorker } from './hooks/useSimulationWorker';
import { MajorInspector, MinorInspector } from './Inspectors';

function idOf(x: unknown): string {
  return x && typeof x === 'object' && 'id' in (x as any) ? String((x as any).id) : String(x);
}

function resolveEndpoints(link: ArchLink, byId: Map<string, ArchNode>): [ArchNode | null, ArchNode | null] {
  const src = byId.get(idOf(link.source)) ?? null;
  const tgt = byId.get(idOf(link.target)) ?? null;
  return [src, tgt];
}

function computeViewBox(nodes: ArchNode[]): string {
  if (nodes.length === 0) return '-400 -300 800 600';

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    minX = Math.min(minX, x - n.r);
    maxX = Math.max(maxX, x + n.r);
    minY = Math.min(minY, y - n.r);
    maxY = Math.max(maxY, y + n.r);
  }

  const pad = 120;
  const w = Math.max(300, maxX - minX + pad * 2);
  const h = Math.max(240, maxY - minY + pad * 2);
  return `${minX - pad} ${minY - pad} ${w} ${h}`;
}

export function ArchitectureMap() {
  const { nodes: sourceNodes, links: sourceLinks } = useGraphData();

  const [selectedNode, setSelectedNode] = useState<ArchNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [, setFrame] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const stateRef = useRef<RenderState>(createRenderState());
  const rafRef = useRef<number | null>(null);
  const viewBoxRef = useRef('-400 -300 800 600');

  const onTick = useCallback((s: RenderState) => {
    stateRef.current = s;
    // Throttle render updates — only schedule one rAF at a time
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        // Update viewBox in the ref so it doesn't jitter every frame
        viewBoxRef.current = computeViewBox(s.nodes);
        setFrame((v) => v + 1);
      });
    }
  }, []);

  const onAutoFit = useCallback((s: RenderState) => {
    stateRef.current = s;
    viewBoxRef.current = computeViewBox(s.nodes);
    setFrame((v) => v + 1);
  }, []);

  const { init, restart, destroy } = useSimulationWorker(onAutoFit, onTick);

  useEffect(() => {
    const nodes = sourceNodes.map((n) => ({ ...n }));
    const links = sourceLinks.map((l) => ({ ...l }));

    const s = createRenderState();
    s.nodes = nodes;
    s.links = links;
    stateRef.current = s;

    init(s);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      destroy();
    };
  }, [init, destroy, sourceLinks, sourceNodes]);

  const graph = stateRef.current;

  // byId only needs rebuilding when the set of nodes changes, not on every position tick
  const byId = useMemo(() => {
    const m = new Map<string, ArchNode>();
    for (const n of graph.nodes) m.set(n.id, n);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes.length]);

  const searchNeedle = searchQuery.trim().toLowerCase();

  // filteredNodeIds only depends on node identities + search, not positions
  const filteredNodeIds = useMemo(() => {
    if (!searchNeedle) return new Set(graph.nodes.map((n) => n.id));
    return new Set(
      graph.nodes
        .filter((n) => n.id.toLowerCase().includes(searchNeedle) || n.group.toLowerCase().includes(searchNeedle))
        .map((n) => n.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes.length, searchNeedle]);

  // viewBox is computed in the tick callback and stored in a ref to avoid jitter
  const viewBox = viewBoxRef.current;

  const handleReset = () => {
    restart();
    setSelectedNode(null);
    setSearchQuery('');
  };

  return (
    <div className="flex overflow-hidden bg-black/90 relative" style={{ height: 'calc(100vh - 56px)' }}>
      <div className="flex-1 relative">
        <div className="absolute top-3 left-4 z-20 flex items-center space-x-3 pointer-events-none">
          <Network className="w-7 h-7 text-orange-400/80" />
          <div>
            <h2 className="text-xl font-bold text-white/80/80">Architecture Map</h2>
            <p className="text-orange-400/40 text-xs">2D map - click nodes to inspect - search to filter</p>
          </div>
        </div>

        <div className="absolute top-3 right-4 z-20 flex items-center space-x-2 pointer-events-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400/60" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes"
              className="pl-8 pr-7 py-1.5 w-56 bg-black/70 border border-orange-500/30 rounded-lg text-sm text-white/80 placeholder-white/30 focus:outline-none focus:border-orange-400/60 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-orange-400/60 hover:text-orange-300"
                type="button"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="p-2 bg-black/60 hover:bg-white/10 rounded-lg text-orange-300 border border-orange-500/30 transition-colors"
            title="Re-run layout"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2 bg-black/60 hover:bg-white/10 rounded-lg text-orange-300 border border-orange-500/30 transition-colors"
            title={sidebarOpen ? 'Hide inspector' : 'Show inspector'}
          >
            {sidebarOpen ? 'Hide' : 'Show'}
          </button>
        </div>

        <svg className="w-full h-full" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x="-10000" y="-10000" width="20000" height="20000" fill="#020611" />

          {graph.links.map((l, i) => {
            const [src, tgt] = resolveEndpoints(l, byId);
            if (!src || !tgt) return null;
            const visible = filteredNodeIds.has(src.id) || filteredNodeIds.has(tgt.id);
            if (!visible) return null;

            const stroke = l.type === 'orchestrator' ? '#22d3ee' : l.type === 'overlap' ? '#60a5fa' : '#a78bfa';
            const width = l.type === 'orchestrator' ? 2.4 : l.type === 'overlap' ? 1.8 : 1.2;
            const alpha = l.type === 'orchestrator' ? 0.35 : l.type === 'overlap' ? 0.28 : 0.2;

            return (
              <line
                key={`${idOf(l.source)}-${idOf(l.target)}-${i}`}
                x1={src.x ?? 0}
                y1={src.y ?? 0}
                x2={tgt.x ?? 0}
                y2={tgt.y ?? 0}
                stroke={stroke}
                strokeOpacity={alpha}
                strokeWidth={width}
              />
            );
          })}

          {graph.nodes.map((n) => {
            const x = n.x ?? 0;
            const y = n.y ?? 0;
            const match = filteredNodeIds.has(n.id);
            const isSelected = selectedNode?.id === n.id;
            const r = n.type === 'major' ? Math.max(16, n.r * 0.35) : Math.max(7, n.r * 0.28);

            return (
              <g key={n.id} opacity={match ? 1 : 0.18} onClick={() => setSelectedNode(n)} style={{ cursor: 'pointer' }}>
                <circle cx={x} cy={y} r={r * 1.65} fill={n.color} opacity={n.type === 'major' ? 0.12 : 0.08} filter="url(#softGlow)" />
                <circle cx={x} cy={y} r={r} fill={n.type === 'major' ? '#031322' : n.color} stroke={n.color} strokeWidth={n.type === 'major' ? 2 : 1.2} />
                {isSelected && <circle cx={x} cy={y} r={r + 7} fill="none" stroke="#22d3ee" strokeWidth={1.8} opacity={0.85} />}

                {n.type === 'major' && (
                  <text
                    x={x}
                    y={y + r + 18}
                    textAnchor="middle"
                    fill="#cbefff"
                    fontSize="12"
                    fontWeight={600}
                  >
                    {n.id}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {sidebarOpen && (
        <div className="w-[340px] max-w-[42vw] border-l border-orange-500/20 bg-black/80 backdrop-blur-xl">
          <div className="h-full flex flex-col">
            <div className="p-5 border-b border-orange-500/20">
              <h3 className="text-orange-300 font-semibold text-lg">Panel Inspector</h3>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {selectedNode ? (
                selectedNode.type === 'major' ? (
                  <MajorInspector node={selectedNode} />
                ) : (
                  <MinorInspector node={selectedNode} />
                )
              ) : (
                <div className="text-orange-400/60 text-sm">
                  <p>Select a node on the map to inspect details.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
