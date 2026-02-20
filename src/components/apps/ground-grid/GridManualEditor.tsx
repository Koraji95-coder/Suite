import { useState, useCallback, useMemo, useRef } from 'react';
import { Plus, Trash2, MousePointer, Move } from 'lucide-react';
import { useTheme, hexToRgba } from '@/lib/palette';
import type { GridRod, GridConductor } from './types';

type EditorMode = 'select' | 'add-rod' | 'add-conductor' | 'delete';

interface GridManualEditorProps {
  rods: GridRod[];
  conductors: GridConductor[];
  onRodsChange: (rods: GridRod[]) => void;
  onConductorsChange: (conductors: GridConductor[]) => void;
}

export function GridManualEditor({ rods, conductors, onRodsChange, onConductorsChange }: GridManualEditorProps) {
  const { palette } = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<EditorMode>('select');
  const [selectedRod, setSelectedRod] = useState<number | null>(null);
  const [selectedConductor, setSelectedConductor] = useState<number | null>(null);
  const [conductorStart, setConductorStart] = useState<{ x: number; y: number } | null>(null);
  const [coordInput, setCoordInput] = useState({ x: '', y: '' });
  const [lineInput, setLineInput] = useState({ x1: '', y1: '', x2: '', y2: '' });

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
    if (!isFinite(minX)) return { minX: -50, minY: -50, maxX: 50, maxY: 50 };
    const pad = Math.max((maxX - minX), (maxY - minY)) * 0.25 || 10;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }, [rods, conductors]);

  const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`;
  const rodScale = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.012;

  const svgToWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    return {
      x: bounds.minX + ((clientX - rect.left) / rect.width) * spanX,
      y: bounds.minY + ((clientY - rect.top) / rect.height) * spanY,
    };
  }, [bounds]);

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const { x, y } = svgToWorld(e.clientX, e.clientY);

    if (mode === 'add-rod') {
      const newRod: GridRod = {
        label: `R${rods.length + 1}`,
        grid_x: Math.round(x * 100) / 100,
        grid_y: Math.round(y * 100) / 100,
        depth: 20,
        diameter: 1.5,
        sort_order: rods.length,
      };
      onRodsChange([...rods, newRod]);
    } else if (mode === 'add-conductor') {
      if (!conductorStart) {
        setConductorStart({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
      } else {
        const newCond: GridConductor = {
          label: `C${conductors.length + 1}`,
          length: null,
          x1: conductorStart.x,
          y1: conductorStart.y,
          x2: Math.round(x * 100) / 100,
          y2: Math.round(y * 100) / 100,
          diameter: 1.5,
          sort_order: conductors.length,
        };
        onConductorsChange([...conductors, newCond]);
        setConductorStart(null);
      }
    } else if (mode === 'delete') {
      const threshold = rodScale * 2;
      let deletedRod = false;
      for (let i = 0; i < rods.length; i++) {
        const dist = Math.sqrt((x - rods[i].grid_x) ** 2 + (y - rods[i].grid_y) ** 2);
        if (dist < threshold) {
          onRodsChange(rods.filter((_, idx) => idx !== i));
          deletedRod = true;
          break;
        }
      }
      if (!deletedRod) {
        for (let i = 0; i < conductors.length; i++) {
          const c = conductors[i];
          const dx = c.x2 - c.x1;
          const dy = c.y2 - c.y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < 0.01) continue;
          const t = Math.max(0, Math.min(1, ((x - c.x1) * dx + (y - c.y1) * dy) / (len * len)));
          const closestX = c.x1 + t * dx;
          const closestY = c.y1 + t * dy;
          const dist = Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);
          if (dist < threshold) {
            onConductorsChange(conductors.filter((_, idx) => idx !== i));
            break;
          }
        }
      }
    }
  }, [mode, rods, conductors, onRodsChange, onConductorsChange, conductorStart, svgToWorld, rodScale]);

  const addRodByCoord = () => {
    const x = parseFloat(coordInput.x);
    const y = parseFloat(coordInput.y);
    if (isNaN(x) || isNaN(y)) return;
    const newRod: GridRod = {
      label: `R${rods.length + 1}`,
      grid_x: x,
      grid_y: y,
      depth: 20,
      diameter: 1.5,
      sort_order: rods.length,
    };
    onRodsChange([...rods, newRod]);
    setCoordInput({ x: '', y: '' });
  };

  const addConductorByCoord = () => {
    const x1 = parseFloat(lineInput.x1);
    const y1 = parseFloat(lineInput.y1);
    const x2 = parseFloat(lineInput.x2);
    const y2 = parseFloat(lineInput.y2);
    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return;
    const newCond: GridConductor = {
      label: `C${conductors.length + 1}`,
      length: null,
      x1, y1, x2, y2,
      diameter: 1.5,
      sort_order: conductors.length,
    };
    onConductorsChange([...conductors, newCond]);
    setLineInput({ x1: '', y1: '', x2: '', y2: '' });
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 600,
    border: `1px solid ${hexToRgba(palette.primary, active ? 0.4 : 0.15)}`,
    borderRadius: 5,
    background: active ? hexToRgba(palette.primary, 0.15) : 'transparent',
    color: active ? palette.text : palette.textMuted,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  });

  const inputStyle: React.CSSProperties = {
    width: 60,
    padding: '4px 6px',
    fontSize: 11,
    fontFamily: 'monospace',
    background: hexToRgba(palette.surfaceLight, 0.3),
    border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
    borderRadius: 4,
    color: palette.text,
    outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => { setMode('select'); setConductorStart(null); }} style={btnStyle(mode === 'select')}>
          <MousePointer size={12} /> Select
        </button>
        <button onClick={() => { setMode('add-rod'); setConductorStart(null); }} style={btnStyle(mode === 'add-rod')}>
          <Plus size={12} /> Add Rod
        </button>
        <button onClick={() => { setMode('add-conductor'); setConductorStart(null); }} style={btnStyle(mode === 'add-conductor')}>
          <Plus size={12} /> Add Conductor
        </button>
        <button onClick={() => { setMode('delete'); setConductorStart(null); }} style={btnStyle(mode === 'delete')}>
          <Trash2 size={12} /> Delete
        </button>

        {conductorStart && (
          <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>
            Start: ({conductorStart.x}, {conductorStart.y}) -- click end point
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: palette.textMuted }}>
          Rod:
          <input placeholder="X" value={coordInput.x} onChange={(e) => setCoordInput({ ...coordInput, x: e.target.value })} style={inputStyle} />
          <input placeholder="Y" value={coordInput.y} onChange={(e) => setCoordInput({ ...coordInput, y: e.target.value })} style={inputStyle} />
          <button onClick={addRodByCoord} style={btnStyle(false)}>Add</button>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: palette.textMuted }}>
          Line:
          <input placeholder="X1" value={lineInput.x1} onChange={(e) => setLineInput({ ...lineInput, x1: e.target.value })} style={inputStyle} />
          <input placeholder="Y1" value={lineInput.y1} onChange={(e) => setLineInput({ ...lineInput, y1: e.target.value })} style={inputStyle} />
          <input placeholder="X2" value={lineInput.x2} onChange={(e) => setLineInput({ ...lineInput, x2: e.target.value })} style={inputStyle} />
          <input placeholder="Y2" value={lineInput.y2} onChange={(e) => setLineInput({ ...lineInput, y2: e.target.value })} style={inputStyle} />
          <button onClick={addConductorByCoord} style={btnStyle(false)}>Add</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 300, borderRadius: 8, border: `1px solid ${hexToRgba(palette.primary, 0.15)}`, overflow: 'hidden' }}>
        <svg
          ref={svgRef}
          viewBox={viewBox}
          style={{
            width: '100%',
            height: '100%',
            background: hexToRgba(palette.background, 0.5),
            cursor: mode === 'select' ? 'default' : mode === 'delete' ? 'crosshair' : 'cell',
          }}
          onClick={handleSvgClick}
        >
          {conductors.map((c, i) => (
            <line
              key={`c-${i}`}
              x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
              stroke={selectedConductor === i ? '#fff' : hexToRgba('#f59e0b', 0.6)}
              strokeWidth={rodScale * (selectedConductor === i ? 0.6 : 0.4)}
              strokeLinecap="round"
              onClick={(e) => { e.stopPropagation(); if (mode === 'select') setSelectedConductor(i); }}
              style={{ cursor: mode === 'select' ? 'pointer' : undefined }}
            />
          ))}

          {rods.map((r, i) => (
            <g key={`r-${i}`}
              onClick={(e) => { e.stopPropagation(); if (mode === 'select') setSelectedRod(i); }}
              style={{ cursor: mode === 'select' ? 'pointer' : undefined }}
            >
              <circle
                cx={r.grid_x} cy={r.grid_y} r={rodScale}
                fill={selectedRod === i ? hexToRgba('#fff', 0.3) : hexToRgba('#22c55e', 0.3)}
                stroke={selectedRod === i ? '#fff' : '#22c55e'}
                strokeWidth={rodScale * 0.2}
              />
              <line
                x1={r.grid_x - rodScale * 0.7} y1={r.grid_y}
                x2={r.grid_x + rodScale * 0.7} y2={r.grid_y}
                stroke={selectedRod === i ? '#fff' : '#22c55e'} strokeWidth={rodScale * 0.15}
              />
              <line
                x1={r.grid_x} y1={r.grid_y - rodScale * 0.7}
                x2={r.grid_x} y2={r.grid_y + rodScale * 0.7}
                stroke={selectedRod === i ? '#fff' : '#22c55e'} strokeWidth={rodScale * 0.15}
              />
            </g>
          ))}

          {conductorStart && (
            <circle cx={conductorStart.x} cy={conductorStart.y} r={rodScale * 0.5} fill="#f59e0b" opacity={0.8} />
          )}
        </svg>
      </div>
    </div>
  );
}
