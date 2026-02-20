import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Upload, Save, Trash2, Plus, FolderKanban, ChevronDown,
  FileSpreadsheet, Play, Loader, Database, Monitor,
  Undo2, Redo2, Box, Zap, PenTool, FileText,
} from 'lucide-react';
import { useTheme, hexToRgba } from '@/lib/palette';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ToastProvider';
import type { GridRod, GridConductor, GridDesign, GridPlacement, GridConfig } from './types';
import { DEFAULT_CONFIG } from './types';
import {
  parseRodsText, parseConductorsText, generatePlacements,
  computeGridMaxY, totalConductorLength,
} from './gridEngine';
import { GridPreview } from './GridPreview';
import { SAMPLE_RODS_TEXT, SAMPLE_CONDUCTORS_TEXT } from './sampleData';
import { useGroundGrid } from './GroundGridContext';
import { exportGridToExcel } from './excelExport';
import { useGridHistory } from './useGridHistory';
import { GridPreview3D } from './GridPreview3D';
import { PotentialContour } from './PotentialContour';
import { GridManualEditor } from './GridManualEditor';
import { generateGridReport } from './gridPdfExport';

interface ProjectOption {
  id: string;
  name: string;
  color: string;
}

export function GridGeneratorPanel() {
  const { palette } = useTheme();
  const { showToast } = useToast();
  const { addLog, backendConnected } = useGroundGrid();
  const [searchParams] = useSearchParams();
  const designIdParam = searchParams.get('design');

  const [designs, setDesigns] = useState<GridDesign[]>([]);
  const [currentDesign, setCurrentDesign] = useState<GridDesign | null>(null);
  const [designName, setDesignName] = useState('New Ground Grid Design');
  const [rods, setRods] = useState<GridRod[]>([]);
  const [conductors, setConductors] = useState<GridConductor[]>([]);
  const [placements, setPlacements] = useState<GridPlacement[]>([]);
  const [segmentCount, setSegmentCount] = useState(0);
  const [teeCount, setTeeCount] = useState(0);
  const [crossCount, setCrossCount] = useState(0);
  const [config, setConfig] = useState<GridConfig>(DEFAULT_CONFIG);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showDesignDropdown, setShowDesignDropdown] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pasteMode, setPasteMode] = useState<'rods' | 'conductors'>('rods');
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [previewMode, setPreviewMode] = useState<'2d' | '3d' | 'contour' | 'editor'>('2d');
  const [soilResistivity, setSoilResistivity] = useState(100);
  const [faultCurrent, setFaultCurrent] = useState(5000);
  const { pushSnapshot, undo, redo, canUndo, canRedo } = useGridHistory();

  useEffect(() => {
    loadDesigns();
    loadProjects();
  }, []);

  useEffect(() => {
    if (designIdParam && designs.length > 0) {
      const found = designs.find(d => d.id === designIdParam);
      if (found) loadDesign(found);
    }
  }, [designIdParam, designs]);

  async function loadDesigns() {
    const { data } = await supabase.from('ground_grid_designs').select('*').order('updated_at', { ascending: false });
    if (data) setDesigns(data as GridDesign[]);
  }

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('id, name, color').order('name');
    if (data) setProjects(data as ProjectOption[]);
  }

  async function loadDesign(design: GridDesign) {
    setCurrentDesign(design);
    setDesignName(design.name);
    setLinkedProjectId(design.project_id);
    if (design.config && Object.keys(design.config).length > 0) {
      setConfig({ ...DEFAULT_CONFIG, ...design.config });
    }

    const [rodsRes, condsRes] = await Promise.all([
      supabase.from('ground_grid_rods').select('*').eq('design_id', design.id).order('sort_order'),
      supabase.from('ground_grid_conductors').select('*').eq('design_id', design.id).order('sort_order'),
    ]);

    const loadedRods = (rodsRes.data || []) as GridRod[];
    const loadedConds = (condsRes.data || []) as GridConductor[];
    setRods(loadedRods);
    setConductors(loadedConds);
    setPlacements([]);
    setSegmentCount(0);
    setTeeCount(0);
    setCrossCount(0);
  }

  async function saveDesign() {
    setSaving(true);
    addLog('generator', '[PROCESSING] Saving design...');
    try {
      if (currentDesign) {
        const { error: updateErr } = await supabase.from('ground_grid_designs').update({
          name: designName,
          project_id: linkedProjectId,
          config,
          updated_at: new Date().toISOString(),
        }).eq('id', currentDesign.id);
        if (updateErr) throw updateErr;

        await supabase.from('ground_grid_rods').delete().eq('design_id', currentDesign.id);
        await supabase.from('ground_grid_conductors').delete().eq('design_id', currentDesign.id);

        if (rods.length > 0) {
          const { error: rodsErr } = await supabase.from('ground_grid_rods').insert(
            rods.map(r => ({ design_id: currentDesign.id, label: r.label, grid_x: r.grid_x, grid_y: r.grid_y, depth: r.depth, diameter: r.diameter, sort_order: r.sort_order }))
          );
          if (rodsErr) throw rodsErr;
        }
        if (conductors.length > 0) {
          const { error: condsErr } = await supabase.from('ground_grid_conductors').insert(
            conductors.map(c => ({ design_id: currentDesign.id, label: c.label, length: c.length, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, diameter: c.diameter, sort_order: c.sort_order }))
          );
          if (condsErr) throw condsErr;
        }

        addLog('generator', '[SUCCESS] Design saved');
        showToast('success', 'Design saved');
      } else {
        const { data, error: insertErr } = await supabase.from('ground_grid_designs').insert({
          name: designName,
          project_id: linkedProjectId,
          config,
        }).select().maybeSingle();
        if (insertErr) throw insertErr;

        if (data) {
          const design = data as GridDesign;
          setCurrentDesign(design);

          if (rods.length > 0) {
            const { error: rodsErr } = await supabase.from('ground_grid_rods').insert(
              rods.map(r => ({ design_id: design.id, label: r.label, grid_x: r.grid_x, grid_y: r.grid_y, depth: r.depth, diameter: r.diameter, sort_order: r.sort_order }))
            );
            if (rodsErr) throw rodsErr;
          }
          if (conductors.length > 0) {
            const { error: condsErr } = await supabase.from('ground_grid_conductors').insert(
              conductors.map(c => ({ design_id: design.id, label: c.label, length: c.length, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, diameter: c.diameter, sort_order: c.sort_order }))
            );
            if (condsErr) throw condsErr;
          }

          addLog('generator', '[SUCCESS] Design created');
          showToast('success', 'Design created');
          loadDesigns();
        }
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : String(err);
      addLog('generator', `[ERROR] Save failed: ${msg}`);
      showToast('error', `Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteDesign() {
    if (!currentDesign) return;
    await supabase.from('ground_grid_designs').delete().eq('id', currentDesign.id);
    setCurrentDesign(null);
    setDesignName('New Ground Grid Design');
    setRods([]);
    setConductors([]);
    setPlacements([]);
    setLinkedProjectId(null);
    loadDesigns();
    showToast('success', 'Design deleted');
  }

  function newDesign() {
    setCurrentDesign(null);
    setDesignName('New Ground Grid Design');
    setRods([]);
    setConductors([]);
    setPlacements([]);
    setSegmentCount(0);
    setTeeCount(0);
    setCrossCount(0);
    setLinkedProjectId(null);
    setConfig(DEFAULT_CONFIG);
  }

  function runGeneration() {
    if (conductors.length === 0) {
      showToast('error', 'No conductor data to process');
      return;
    }
    setGenerating(true);
    addLog('generator', '[PROCESSING] Generating grid placements...');
    requestAnimationFrame(() => {
      const maxY = computeGridMaxY(rods, conductors);
      const cfg = { ...config, grid_max_y: maxY };
      setConfig(cfg);
      const result = generatePlacements(rods, conductors, cfg);
      setPlacements(result.placements);
      setSegmentCount(result.segmentCount);
      setTeeCount(result.teeCount);
      setCrossCount(result.crossCount);

      if (currentDesign) {
        supabase.from('ground_grid_results').insert({
          design_id: currentDesign.id,
          placements: result.placements,
          segment_count: result.segmentCount,
          tee_count: result.teeCount,
          cross_count: result.crossCount,
          rod_count: rods.length,
          total_conductor_length: totalConductorLength(conductors),
        });
      }

      setGenerating(false);
      addLog('generator', `[SUCCESS] Generated ${result.placements.length} placements (${result.teeCount} tees, ${result.crossCount} crosses, ${result.segmentCount} segments)`);
      showToast('success', `Generated: ${result.placements.length} placements`);
    });
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function processFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const lines = text.trim().split('\n');
      const firstLine = lines[0]?.trim().replace(/,/g, '\t').split(/\s+/).filter(Boolean) || [];

      if (firstLine.length >= 8 || firstLine[0]?.match(/^\d+$/)) {
        const parsed = parseConductorsText(text);
        if (parsed.length > 0) {
          pushSnapshot(rods, conductors);
          setConductors(parsed);
          showToast('success', `Imported ${parsed.length} conductors`);
          return;
        }
      }

      const parsedRods = parseRodsText(text);
      if (parsedRods.length > 0) {
        pushSnapshot(rods, conductors);
        setRods(parsedRods);
        showToast('success', `Imported ${parsedRods.length} rods`);
        return;
      }

      const parsedConds = parseConductorsText(text);
      if (parsedConds.length > 0) {
        pushSnapshot(rods, conductors);
        setConductors(parsedConds);
        showToast('success', `Imported ${parsedConds.length} conductors`);
        return;
      }

      showToast('error', 'Could not parse file data');
    };
    reader.readAsText(file);
  }

  function applyPaste() {
    if (!pasteText.trim()) return;
    if (pasteMode === 'rods') {
      const parsed = parseRodsText(pasteText);
      if (parsed.length > 0) {
        pushSnapshot(rods, conductors);
        setRods(parsed);
        setPasteText('');
        showToast('success', `Parsed ${parsed.length} rods`);
      } else {
        showToast('error', 'Could not parse rod data');
      }
    } else {
      const parsed = parseConductorsText(pasteText);
      if (parsed.length > 0) {
        pushSnapshot(rods, conductors);
        setConductors(parsed);
        setPasteText('');
        showToast('success', `Parsed ${parsed.length} conductors`);
      } else {
        showToast('error', 'Could not parse conductor data');
      }
    }
  }

  function clearAll() {
    pushSnapshot(rods, conductors);
    setRods([]);
    setConductors([]);
    setPlacements([]);
    setSegmentCount(0);
    setTeeCount(0);
    setCrossCount(0);
    showToast('success', 'All data cleared');
  }

  function loadSampleData() {
    pushSnapshot(rods, conductors);
    const parsedRods = parseRodsText(SAMPLE_RODS_TEXT);
    const parsedConds = parseConductorsText(SAMPLE_CONDUCTORS_TEXT);
    setRods(parsedRods);
    setConductors(parsedConds);
    showToast('success', `Loaded ${parsedRods.length} rods, ${parsedConds.length} conductors`);
  }

  const handleUndo = useCallback(() => {
    const snapshot = undo(rods, conductors);
    if (snapshot) {
      setRods(snapshot.rods);
      setConductors(snapshot.conductors);
    }
  }, [undo, rods, conductors]);

  const handleRedo = useCallback(() => {
    const snapshot = redo(rods, conductors);
    if (snapshot) {
      setRods(snapshot.rods);
      setConductors(snapshot.conductors);
    }
  }, [redo, rods, conductors]);

  const handleManualRodsChange = useCallback((newRods: GridRod[]) => {
    pushSnapshot(rods, conductors);
    setRods(newRods);
  }, [rods, conductors, pushSnapshot]);

  const handleManualConductorsChange = useCallback((newConds: GridConductor[]) => {
    pushSnapshot(rods, conductors);
    setConductors(newConds);
  }, [rods, conductors, pushSnapshot]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const linkedProject = projects.find(p => p.id === linkedProjectId);

  const btnStyle = (active = false): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${hexToRgba(palette.primary, active ? 0.4 : 0.2)}`,
    borderRadius: 6,
    background: active ? hexToRgba(palette.primary, 0.15) : hexToRgba(palette.surfaceLight, 0.4),
    color: active ? palette.text : palette.textMuted,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.15s',
  });

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top bar: design management + project link */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button onClick={newDesign} style={btnStyle()}>
          <Plus size={14} /> New
        </button>

        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button onClick={() => setShowDesignDropdown(!showDesignDropdown)} style={btnStyle()}>
            <Database size={14} /> Load <ChevronDown size={12} />
          </button>
          {showDesignDropdown && (
            <div
              style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
                minWidth: 240, maxHeight: 260, overflowY: 'auto',
                background: palette.surface, border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                borderRadius: 8, boxShadow: `0 8px 24px ${hexToRgba('#000', 0.3)}`,
              }}
            >
              {designs.length === 0 && (
                <div style={{ padding: 12, fontSize: 12, color: palette.textMuted }}>No saved designs</div>
              )}
              {designs.map(d => (
                <button
                  key={d.id}
                  onClick={() => { loadDesign(d); setShowDesignDropdown(false); }}
                  style={{
                    display: 'block', width: '100%', padding: '8px 12px', border: 'none',
                    background: d.id === currentDesign?.id ? hexToRgba(palette.primary, 0.1) : 'transparent',
                    color: palette.text, fontSize: 12, textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                  <div style={{ fontSize: 10, color: palette.textMuted }}>
                    {d.status} -- {new Date(d.updated_at).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          value={designName}
          onChange={e => setDesignName(e.target.value)}
          style={{
            flex: 1, minWidth: 180, padding: '6px 10px', fontSize: 13, fontWeight: 600,
            background: hexToRgba(palette.surfaceLight, 0.3),
            border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
            borderRadius: 6, color: palette.text, outline: 'none',
          }}
        />

        <button onClick={saveDesign} disabled={saving} style={btnStyle()}>
          {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>

        {currentDesign && (
          <button onClick={deleteDesign} style={{ ...btnStyle(), borderColor: hexToRgba('#ef4444', 0.3), color: '#ef4444' }}>
            <Trash2 size={14} /> Delete
          </button>
        )}

        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowProjectDropdown(!showProjectDropdown)} style={btnStyle(!!linkedProjectId)}>
            <FolderKanban size={14} />
            {linkedProject ? linkedProject.name : 'Link Project'}
            <ChevronDown size={12} />
          </button>
          {showProjectDropdown && (
            <div
              style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
                minWidth: 200, maxHeight: 240, overflowY: 'auto',
                background: palette.surface, border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
                borderRadius: 8, boxShadow: `0 8px 24px ${hexToRgba('#000', 0.3)}`,
              }}
            >
              <button
                onClick={() => { setLinkedProjectId(null); setShowProjectDropdown(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px',
                  border: 'none', background: !linkedProjectId ? hexToRgba(palette.primary, 0.1) : 'transparent',
                  color: palette.textMuted, fontSize: 12, cursor: 'pointer', textAlign: 'left',
                }}
              >
                No Project
              </button>
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setLinkedProjectId(p.id); setShowProjectDropdown(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px',
                    border: 'none', background: p.id === linkedProjectId ? hexToRgba(palette.primary, 0.1) : 'transparent',
                    color: palette.text, fontSize: 12, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left: Data import */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Drag & Drop Zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: 24,
              borderRadius: 10,
              border: `2px dashed ${isDragging ? '#f59e0b' : hexToRgba(palette.primary, 0.25)}`,
              background: isDragging ? hexToRgba('#f59e0b', 0.08) : hexToRgba(palette.surfaceLight, 0.2),
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.2s',
            }}
          >
            <Upload size={28} color={isDragging ? '#f59e0b' : palette.textMuted} style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: palette.text }}>
              Drop CSV file here or click to browse
            </div>
            <div style={{ fontSize: 11, color: palette.textMuted, marginTop: 4 }}>
              Supports rod tables and conductor tables (.csv, .txt)
            </div>
            <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileSelect} style={{ display: 'none' }} />
          </div>

          {/* Paste area */}
          <div
            style={{
              borderRadius: 8,
              border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
              background: hexToRgba(palette.surfaceLight, 0.2),
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '10px 12px 6px', borderBottom: `1px solid ${hexToRgba(palette.primary, 0.08)}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: palette.text, marginBottom: 2 }}>
                Paste Coordinate Data
              </div>
              <div style={{ fontSize: 11, color: palette.textMuted, lineHeight: 1.4 }}>
                Paste your tab-separated coordinates below to generate the ground grid design.
              </div>
            </div>
            <div style={{ display: 'flex', borderBottom: `1px solid ${hexToRgba(palette.primary, 0.1)}` }}>
              {(['rods', 'conductors'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setPasteMode(m)}
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: pasteMode === m ? hexToRgba(palette.primary, 0.12) : 'transparent',
                    color: pasteMode === m ? palette.text : palette.textMuted,
                    borderBottom: pasteMode === m ? `2px solid #f59e0b` : '2px solid transparent',
                  }}
                >
                  Paste {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ padding: '6px 10px 0', fontSize: 10, fontFamily: 'monospace', color: palette.textMuted, display: 'flex', gap: 0, borderBottom: `1px solid ${hexToRgba(palette.primary, 0.06)}` }}>
              {pasteMode === 'rods' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', width: '100%', textAlign: 'center', paddingBottom: 4 }}>
                  <span>Label</span><span>Depth</span><span>X</span><span>Y</span><span>Dia</span><span>GridX</span><span>GridY</span>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', width: '100%', textAlign: 'center', paddingBottom: 4 }}>
                  <span>#</span><span>Label</span><span>Len</span><span>X1</span><span>Y1</span><span>Dia</span><span>X2</span><span>Y2</span>
                </div>
              )}
            </div>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={pasteMode === 'rods'
                ? 'R1\t20\t0\t0\t1.5\t0\t0\nR2\t20\t286\t0\t1.5\t286\t0'
                : '1\tC1\t286\t0\t0\t1.5\t286\t0\n2\tC2\t286\t0\t8\t1.5\t286\t8'
              }
              style={{
                width: '100%', minHeight: 80, padding: 10, fontSize: 11, fontFamily: 'monospace',
                background: 'transparent', border: 'none', color: palette.text, outline: 'none',
                resize: 'none', boxSizing: 'border-box', textAlign: 'center',
                tabSize: 8,
              }}
            />
            <div style={{ display: 'flex', gap: 6, padding: '6px 10px' }}>
              <button onClick={applyPaste} style={btnStyle()}>
                <FileSpreadsheet size={12} /> Parse
              </button>
              <button onClick={loadSampleData} style={btnStyle()}>
                Load Sample Data
              </button>
              {(rods.length > 0 || conductors.length > 0 || placements.length > 0) && (
                <button onClick={clearAll} style={{ ...btnStyle(), borderColor: hexToRgba('#ef4444', 0.3), color: '#ef4444' }}>
                  <Trash2 size={12} /> Clear All
                </button>
              )}
            </div>
          </div>

          {/* Data summary tables */}
          {rods.length > 0 && (
            <div style={{ borderRadius: 8, border: `1px solid ${hexToRgba(palette.primary, 0.15)}`, overflow: 'hidden' }}>
              <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#22c55e', background: hexToRgba('#22c55e', 0.08) }}>
                Rods ({rods.length})
              </div>
              <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: palette.textMuted }}>
                      <th style={{ padding: '3px 6px', textAlign: 'center' }}>Label</th>
                      <th style={{ padding: '3px 6px', textAlign: 'center' }}>X</th>
                      <th style={{ padding: '3px 6px', textAlign: 'center' }}>Y</th>
                      <th style={{ padding: '3px 6px', textAlign: 'center' }}>Depth</th>
                      <th style={{ padding: '3px 6px', textAlign: 'center' }}>Dia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rods.map((r, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${hexToRgba(palette.primary, 0.06)}`, color: palette.text }}>
                        <td style={{ padding: '2px 6px', fontWeight: 600, textAlign: 'center' }}>{r.label}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'center', fontFamily: 'monospace' }}>{r.grid_x}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'center', fontFamily: 'monospace' }}>{r.grid_y}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'center', fontFamily: 'monospace' }}>{r.depth}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'center', fontFamily: 'monospace' }}>{r.diameter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {conductors.length > 0 && (
            <div style={{ borderRadius: 8, border: `1px solid ${hexToRgba(palette.primary, 0.15)}`, overflow: 'hidden' }}>
              <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#f59e0b', background: hexToRgba('#f59e0b', 0.08) }}>
                Conductors ({conductors.length})
              </div>
              <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: palette.textMuted }}>
                      <th style={{ padding: '3px 6px', textAlign: 'center' }}>Label</th>
                      <th style={{ padding: '3px 6px', textAlign: 'center' }}>X1</th>
                      <th style={{ padding: '3px 6px', textAlign: 'center' }}>Y1</th>
                      <th style={{ padding: '3px 6px', textAlign: 'center' }}>X2</th>
                      <th style={{ padding: '3px 6px', textAlign: 'center' }}>Y2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conductors.map((c, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${hexToRgba(palette.primary, 0.06)}`, color: palette.text }}>
                        <td style={{ padding: '2px 6px', fontWeight: 600, textAlign: 'center' }}>{c.label}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'center', fontFamily: 'monospace' }}>{c.x1}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'center', fontFamily: 'monospace' }}>{c.y1}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'center', fontFamily: 'monospace' }}>{c.x2}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'center', fontFamily: 'monospace' }}>{c.y2}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right: Preview + Generate */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={runGeneration} disabled={generating || conductors.length === 0} style={{
              ...btnStyle(true),
              background: `linear-gradient(135deg, ${hexToRgba('#f59e0b', 0.25)}, ${hexToRgba('#ea580c', 0.2)})`,
              borderColor: hexToRgba('#f59e0b', 0.4),
              color: palette.text,
              opacity: conductors.length === 0 ? 0.5 : 1,
            }}>
              {generating ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
              Generate Grid
            </button>

            <button onClick={handleUndo} disabled={!canUndo} style={{ ...btnStyle(), opacity: canUndo ? 1 : 0.4 }}>
              <Undo2 size={14} />
            </button>
            <button onClick={handleRedo} disabled={!canRedo} style={{ ...btnStyle(), opacity: canRedo ? 1 : 0.4 }}>
              <Redo2 size={14} />
            </button>

            {placements.length > 0 && (
              <>
                <button
                  onClick={async () => {
                    addLog('generator', '[PROCESSING] Exporting to Excel...');
                    try {
                      await exportGridToExcel(designName, placements, rods, conductors);
                      addLog('generator', '[SUCCESS] Excel file exported');
                      showToast('success', 'Excel file exported');
                    } catch (err: unknown) {
                      const msg = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : String(err);
                      addLog('generator', `[ERROR] Excel export failed: ${msg}`);
                      showToast('error', `Excel export failed: ${msg}`);
                    }
                  }}
                  style={btnStyle()}
                >
                  <FileSpreadsheet size={14} /> Excel
                </button>
                <button
                  onClick={() => generateGridReport({
                    designName, rods, conductors, placements,
                    segments: segmentCount, tees: teeCount, crosses: crossCount,
                  })}
                  style={btnStyle()}
                >
                  <FileText size={14} /> PDF
                </button>
                <button
                  onClick={() => {
                    if (!backendConnected) {
                      showToast('error', 'AutoCAD backend is offline. Check the log for more details.');
                      addLog('generator', '[ERROR] Cannot plot to AutoCAD - backend is not connected');
                      return;
                    }
                    addLog('generator', '[PROCESSING] Plotting to active AutoCAD drawing...');
                    showToast('info', 'Plot to AutoCAD is not yet implemented');
                  }}
                  style={{
                    ...btnStyle(),
                    opacity: backendConnected ? 1 : 0.5,
                  }}
                >
                  <Monitor size={14} /> AutoCAD
                </button>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { id: '2d' as const, label: '2D', icon: <Monitor size={12} /> },
              { id: '3d' as const, label: '3D', icon: <Box size={12} /> },
              { id: 'contour' as const, label: 'Potential', icon: <Zap size={12} /> },
              { id: 'editor' as const, label: 'Editor', icon: <PenTool size={12} /> },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setPreviewMode(t.id)}
                style={{
                  ...btnStyle(previewMode === t.id),
                  padding: '4px 10px',
                  fontSize: 11,
                  borderRadius: '6px 6px 0 0',
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {previewMode === 'contour' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: palette.textMuted }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Soil Resistivity:
                <input
                  type="number"
                  value={soilResistivity}
                  onChange={e => setSoilResistivity(Number(e.target.value) || 0)}
                  style={{
                    width: 70, padding: '3px 6px', fontSize: 11, fontFamily: 'monospace',
                    background: hexToRgba(palette.surfaceLight, 0.3),
                    border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
                    borderRadius: 4, color: palette.text, outline: 'none',
                  }}
                />
                ohm-m
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Fault Current:
                <input
                  type="number"
                  value={faultCurrent}
                  onChange={e => setFaultCurrent(Number(e.target.value) || 0)}
                  style={{
                    width: 70, padding: '3px 6px', fontSize: 11, fontFamily: 'monospace',
                    background: hexToRgba(palette.surfaceLight, 0.3),
                    border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
                    borderRadius: 4, color: palette.text, outline: 'none',
                  }}
                />
                A
              </label>
            </div>
          )}

          <div
            style={{
              borderRadius: 10,
              border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
              background: hexToRgba(palette.surfaceLight, 0.15),
              flex: 1,
              minHeight: 400,
              overflow: 'hidden',
            }}
          >
            {previewMode === '2d' && (
              <GridPreview
                rods={rods}
                conductors={conductors}
                placements={placements}
                segmentCount={segmentCount}
              />
            )}
            {previewMode === '3d' && (
              <GridPreview3D
                rods={rods}
                conductors={conductors}
                placements={placements}
              />
            )}
            {previewMode === 'contour' && (
              <PotentialContour
                rods={rods}
                conductors={conductors}
                soilResistivity={soilResistivity}
                faultCurrent={faultCurrent}
              />
            )}
            {previewMode === 'editor' && (
              <GridManualEditor
                rods={rods}
                conductors={conductors}
                onRodsChange={handleManualRodsChange}
                onConductorsChange={handleManualConductorsChange}
              />
            )}
          </div>

          {placements.length > 0 && (() => {
            const testWellCount = placements.filter(p => p.type === 'GROUND_ROD_TEST_WELL').length;
            const rodOnlyCount = rods.length - testWellCount;
            return (
              <div
                style={{
                  display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
                }}
              >
                {[
                  { label: 'Rods', value: rodOnlyCount, color: '#22c55e' },
                  { label: 'Test Wells', value: testWellCount, color: '#ef4444' },
                  { label: 'Segments', value: segmentCount, color: '#f59e0b' },
                  { label: 'Tees', value: teeCount, color: '#3b82f6' },
                  { label: 'Crosses', value: crossCount, color: '#06b6d4' },
                ].map(s => (
                  <div
                    key={s.label}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${hexToRgba(s.color, 0.2)}`,
                      background: hexToRgba(s.color, 0.06),
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: palette.textMuted, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
