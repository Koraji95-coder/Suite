import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useTheme, hexToRgba } from '@/lib/palette';
import type { GridRod, GridConductor, GridPlacement } from './types';

interface GridPreviewProps {
  rods: GridRod[];
  conductors: GridConductor[];
  placements: GridPlacement[];
  segmentCount: number;
}

export function GridPreview({ rods, conductors, placements, segmentCount }: GridPreviewProps) {
  const { palette } = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rods) {
      minX = Math.min(minX, r.grid_x);
      minY = Math.min(minY, r.grid_y);
      maxX = Math.max(maxX, r.grid_x);
      maxY = Math.max(maxY, r.grid_y);
    }
    for (const c of conductors) {
      minX = Math.min(minX, c.x1, c.x2);
      minY = Math.min(minY, c.y1, c.y2);
      maxX = Math.max(maxX, c.x1, c.x2);
      maxY = Math.max(maxY, c.y1, c.y2);
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const pad = Math.max((maxX - minX), (maxY - minY)) * 0.08;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }, [rods, conductors]);

  const effectiveVB = viewBox || {
    x: bounds.minX,
    y: bounds.minY,
    w: bounds.maxX - bounds.minX,
    h: bounds.maxY - bounds.minY,
  };

  const defaultW = bounds.maxX - bounds.minX;
  const defaultH = bounds.maxY - bounds.minY;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 5;

  const boundsRef = useRef(bounds);
  const defaultWRef = useRef(defaultW);
  const defaultHRef = useRef(defaultH);
  boundsRef.current = bounds;
  defaultWRef.current = defaultW;
  defaultHRef.current = defaultH;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY > 0 ? 1.05 : 0.9524;
      const b = boundsRef.current;
      const dw = defaultWRef.current;
      const dh = defaultHRef.current;
      setViewBox(prev => {
        const vb = prev || { x: b.minX, y: b.minY, w: dw, h: dh };
        const cx = vb.x + vb.w / 2;
        const cy = vb.y + vb.h / 2;
        let nw = vb.w * factor;
        let nh = vb.h * factor;
        nw = Math.max(dw * MIN_ZOOM, Math.min(dw * MAX_ZOOM, nw));
        nh = Math.max(dh * MIN_ZOOM, Math.min(dh * MAX_ZOOM, nh));
        return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
      });
    };
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    const vb = viewBox || { x: bounds.minX, y: bounds.minY, w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY };
    panStart.current = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y };
  }, [viewBox, bounds]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !panStart.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vb = viewBox || { x: bounds.minX, y: bounds.minY, w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY };
    const dx = (e.clientX - panStart.current.x) / rect.width * vb.w;
    const dy = (e.clientY - panStart.current.y) / rect.height * vb.h;
    setViewBox({ ...vb, x: panStart.current.vx - dx, y: panStart.current.vy - dy });
  }, [isPanning, viewBox, bounds]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  const tees = placements.filter(p => p.type === 'TEE');
  const crosses = placements.filter(p => p.type === 'CROSS');
  const testWells = placements.filter(p => p.type === 'GROUND_ROD_TEST_WELL');
  const rodScale = Math.max(effectiveVB.w, effectiveVB.h) * 0.012;

  const hasData = rods.length > 0 || conductors.length > 0;

  if (!hasData) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 300,
          color: palette.textMuted,
          fontSize: 13,
        }}
      >
        Import rod and conductor data to see the grid preview
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 400 }}>
      <svg
        ref={svgRef}
        viewBox={`${effectiveVB.x} ${effectiveVB.y} ${effectiveVB.w} ${effectiveVB.h}`}
        style={{
          width: '100%',
          height: '100%',
          cursor: isPanning ? 'grabbing' : 'grab',
          background: hexToRgba(palette.background, 0.5),
          borderRadius: 8,
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDragStart={e => e.preventDefault()}
      >
        {conductors.map((c, i) => (
          <line
            key={`c-${i}`}
            x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
            stroke={hexToRgba('#f59e0b', 0.5)}
            strokeWidth={rodScale * 0.4}
            strokeLinecap="round"
          >
            <title>{c.label}: ({c.x1},{c.y1}) to ({c.x2},{c.y2})</title>
          </line>
        ))}

        {rods.map((r, i) => (
          <g key={`r-${i}`}>
            <circle
              cx={r.grid_x} cy={r.grid_y} r={rodScale}
              fill={hexToRgba('#22c55e', 0.3)}
              stroke="#22c55e"
              strokeWidth={rodScale * 0.2}
            />
            <line
              x1={r.grid_x - rodScale * 0.7} y1={r.grid_y}
              x2={r.grid_x + rodScale * 0.7} y2={r.grid_y}
              stroke="#22c55e" strokeWidth={rodScale * 0.15}
            />
            <line
              x1={r.grid_x} y1={r.grid_y - rodScale * 0.7}
              x2={r.grid_x} y2={r.grid_y + rodScale * 0.7}
              stroke="#22c55e" strokeWidth={rodScale * 0.15}
            />
            <title>{r.label}: ({r.grid_x}, {r.grid_y})</title>
          </g>
        ))}

        {tees.map((t, i) => {
          const s = rodScale * 1.2;
          return (
            <g key={`t-${i}`} transform={`translate(${t.grid_x},${t.grid_y}) rotate(${t.rotation_deg})`}>
              <line x1={-s} y1={0} x2={s} y2={0} stroke="#3b82f6" strokeWidth={rodScale * 0.25} strokeLinecap="round" />
              <line x1={0} y1={0} x2={0} y2={s * 0.8} stroke="#3b82f6" strokeWidth={rodScale * 0.25} strokeLinecap="round" />
              <title>TEE: ({t.grid_x}, {t.grid_y}) rot={t.rotation_deg}</title>
            </g>
          );
        })}

        {crosses.map((c, i) => {
          const s = rodScale * 1.2;
          return (
            <g key={`x-${i}`} transform={`translate(${c.grid_x},${c.grid_y})`}>
              <line x1={-s} y1={0} x2={s} y2={0} stroke="#06b6d4" strokeWidth={rodScale * 0.25} strokeLinecap="round" />
              <line x1={0} y1={-s} x2={0} y2={s} stroke="#06b6d4" strokeWidth={rodScale * 0.25} strokeLinecap="round" />
              <title>CROSS: ({c.grid_x}, {c.grid_y})</title>
            </g>
          );
        })}

        {testWells.map((tw, i) => {
          const s = rodScale * 1.4;
          return (
            <g key={`tw-${i}`}>
              <rect
                x={tw.grid_x - s} y={tw.grid_y - s}
                width={s * 2} height={s * 2}
                fill={hexToRgba('#ef4444', 0.25)}
                stroke="#ef4444"
                strokeWidth={rodScale * 0.2}
                rx={rodScale * 0.15}
              />
              <circle
                cx={tw.grid_x} cy={tw.grid_y} r={rodScale * 0.6}
                fill={hexToRgba('#ef4444', 0.4)}
                stroke="#ef4444"
                strokeWidth={rodScale * 0.15}
              />
              <line
                x1={tw.grid_x - rodScale * 0.4} y1={tw.grid_y}
                x2={tw.grid_x + rodScale * 0.4} y2={tw.grid_y}
                stroke="#ef4444" strokeWidth={rodScale * 0.12}
              />
              <line
                x1={tw.grid_x} y1={tw.grid_y - rodScale * 0.4}
                x2={tw.grid_x} y2={tw.grid_y + rodScale * 0.4}
                stroke="#ef4444" strokeWidth={rodScale * 0.12}
              />
              <title>GROUND ROD WITH TEST WELL: ({tw.grid_x}, {tw.grid_y})</title>
            </g>
          );
        })}
      </svg>

      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          display: 'flex',
          gap: 12,
          padding: '6px 12px',
          borderRadius: 6,
          background: hexToRgba(palette.background, 0.85),
          border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
          fontSize: 10,
          color: palette.textMuted,
        }}
      >
        <span><b style={{ color: '#22c55e' }}>Rods:</b> {rods.length - testWells.length}</span>
        <span><b style={{ color: '#ef4444' }}>Test Wells:</b> {testWells.length}</span>
        <span><b style={{ color: '#f59e0b' }}>Segments:</b> {segmentCount}</span>
        <span><b style={{ color: '#3b82f6' }}>Tees:</b> {tees.length}</span>
        <span><b style={{ color: '#06b6d4' }}>Crosses:</b> {crosses.length}</span>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          fontSize: 9,
          color: hexToRgba(palette.textMuted, 0.6),
          background: hexToRgba(palette.background, 0.7),
          padding: '3px 8px',
          borderRadius: 4,
        }}
      >
        Scroll to zoom / Drag to pan
      </div>
    </div>
  );
}
