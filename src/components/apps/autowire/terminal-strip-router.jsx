import { useState, useCallback, useMemo, useRef, useEffect } from "react";

// ─── Simulated AutoCAD Scan Data ────────────────────────────────────────────
// This is what the Python acad_connector.py would produce and send to the frontend

const MOCK_SCAN = {
  drawing: { name: "SUB_NORTH_P&C_001.dwg", units: "Inches" },
  panels: {
    RP1: {
      full_name: "Relay Panel 1",
      color: "#f59e0b",
      sides: {
        L: {
          strips: [
            { strip_id: "RP1L1", strip_number: 1, terminal_count: 16, x: 2, y: 1 },
            { strip_id: "RP1L2", strip_number: 2, terminal_count: 12, x: 2, y: 5 },
            { strip_id: "RP1L3", strip_number: 3, terminal_count: 20, x: 2, y: 8.5 },
          ],
        },
        R: {
          strips: [
            { strip_id: "RP1R1", strip_number: 1, terminal_count: 16, x: 6, y: 1 },
            { strip_id: "RP1R2", strip_number: 2, terminal_count: 12, x: 6, y: 5 },
          ],
        },
      },
    },
    RP2: {
      full_name: "Relay Panel 2",
      color: "#3b82f6",
      sides: {
        L: {
          strips: [
            { strip_id: "RP2L1", strip_number: 1, terminal_count: 20, x: 14, y: 1 },
            { strip_id: "RP2L2", strip_number: 2, terminal_count: 16, x: 14, y: 5.5 },
          ],
        },
        R: {
          strips: [
            { strip_id: "RP2R1", strip_number: 1, terminal_count: 14, x: 18, y: 1 },
            { strip_id: "RP2R2", strip_number: 2, terminal_count: 20, x: 18, y: 4.5 },
          ],
        },
      },
    },
    JB1: {
      full_name: "Junction Box 1",
      color: "#22c55e",
      sides: {
        C: {
          strips: [
            { strip_id: "JB1C1", strip_number: 1, terminal_count: 10, x: 10, y: 10 },
          ],
        },
      },
    },
  },
};

const WIRE_COLORS = {
  AC: {
    "Phase A": { code: "BK", hex: "#333", stroke: "#555" },
    "Phase B": { code: "RD", hex: "#dc2626", stroke: "#dc2626" },
    "Phase C": { code: "BL", hex: "#2563eb", stroke: "#2563eb" },
    Neutral: { code: "WH", hex: "#d4d4d4", stroke: "#d4d4d4" },
    Ground: { code: "GN", hex: "#16a34a", stroke: "#16a34a" },
  },
  DC: {
    Positive: { code: "RD", hex: "#dc2626", stroke: "#dc2626" },
    Negative: { code: "BK", hex: "#333", stroke: "#666" },
    Ground: { code: "GN", hex: "#16a34a", stroke: "#16a34a" },
    Return: { code: "WH", hex: "#d4d4d4", stroke: "#d4d4d4" },
  },
};

// ─── Grid constants ─────────────────────────────────────────────────────────
const SCALE = 38;
const TERM_SPACING = 0.2;
const TERM_RADIUS = 4;
const STRIP_WIDTH = 18;
const GRID_W = 22;
const GRID_H = 14;
const PAD = 40;

// ─── A* Router ──────────────────────────────────────────────────────────────
function routeAStar(startPx, endPx, obstacles, gridStep = 8) {
  const toGrid = (px) => ({ x: Math.round(px.x / gridStep), y: Math.round(px.y / gridStep) });
  const toPx = (g) => ({ x: g.x * gridStep, y: g.y * gridStep });
  const key = (g) => `${g.x},${g.y}`;

  const start = toGrid(startPx);
  const end = toGrid(endPx);
  const maxX = Math.ceil((GRID_W * SCALE + PAD * 2) / gridStep);
  const maxY = Math.ceil((GRID_H * SCALE + PAD * 2) / gridStep);

  const open = [{ ...start, g: 0, h: 0, f: 0, parent: null }];
  const closed = new Set();
  const gMap = new Map();
  gMap.set(key(start), 0);

  const h = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

  let iterations = 0;
  while (open.length > 0 && iterations < 8000) {
    iterations++;
    open.sort((a, b) => a.f - b.f);
    const curr = open.shift();
    const ck = key(curr);

    if (curr.x === end.x && curr.y === end.y) {
      const path = [];
      let n = curr;
      while (n) { path.unshift(toPx(n)); n = n.parent; }
      return path;
    }
    closed.add(ck);

    for (const { dx, dy } of dirs) {
      const nx = curr.x + dx, ny = curr.y + dy;
      if (nx < 0 || nx >= maxX || ny < 0 || ny >= maxY) continue;
      const nk = key({ x: nx, y: ny });
      if (closed.has(nk)) continue;

      let penalty = 0;
      if (curr.parent) {
        const pdx = curr.x - curr.parent.x, pdy = curr.y - curr.parent.y;
        if (pdx !== dx || pdy !== dy) penalty = 3;
      }

      const tentG = curr.g + 1 + penalty;
      const existing = gMap.get(nk);
      if (existing === undefined || tentG < existing) {
        gMap.set(nk, tentG);
        const hv = h({ x: nx, y: ny }, end);
        const node = { x: nx, y: ny, g: tentG, h: hv, f: tentG + hv, parent: curr };
        const idx = open.findIndex(n => key(n) === nk);
        if (idx >= 0) open[idx] = node; else open.push(node);
      }
    }
  }

  // Fallback: L-shaped route
  const mx = (startPx.x + endPx.x) / 2;
  return [startPx, { x: mx, y: startPx.y }, { x: mx, y: endPx.y }, endPx];
}

function pathToSvg(path) {
  if (!path || path.length < 2) return "";
  let d = `M ${path[0].x} ${path[0].y}`;
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1], curr = path[i], next = path[i + 1];
    const dx1 = Math.sign(curr.x - prev.x), dy1 = Math.sign(curr.y - prev.y);
    const dx2 = Math.sign(next.x - curr.x), dy2 = Math.sign(next.y - curr.y);
    if (dx1 === dx2 && dy1 === dy2) {
      d += ` L ${curr.x} ${curr.y}`;
    } else {
      const r = 6;
      const ax = curr.x - dx1 * r, ay = curr.y - dy1 * r;
      const bx = curr.x + dx2 * r, by = curr.y + dy2 * r;
      const sweep = (dx1 * dy2 - dy1 * dx2) > 0 ? 1 : 0;
      d += ` L ${ax} ${ay} A ${r} ${r} 0 0 ${sweep} ${bx} ${by}`;
    }
  }
  d += ` L ${path[path.length - 1].x} ${path[path.length - 1].y}`;
  return d;
}

// ─── Build terminal positions from scan data ────────────────────────────────
function buildTerminals(scanData) {
  const terminals = [];
  const strips = [];

  for (const [panelId, panel] of Object.entries(scanData.panels)) {
    for (const [sideKey, sideData] of Object.entries(panel.sides)) {
      for (const strip of sideData.strips) {
        const baseX = PAD + strip.x * SCALE;
        const baseY = PAD + strip.y * SCALE;

        strips.push({
          ...strip,
          panelId,
          panelColor: panel.color,
          panelFullName: panel.full_name,
          side: sideKey,
          px: baseX,
          py: baseY,
          height: strip.terminal_count * TERM_SPACING * SCALE,
        });

        for (let i = 0; i < strip.terminal_count; i++) {
          const termId = `T${String(i + 1).padStart(2, "0")}`;
          terminals.push({
            id: `${strip.strip_id}:${termId}`,
            stripId: strip.strip_id,
            termId,
            index: i,
            panelId,
            panelColor: panel.color,
            x: baseX,
            y: baseY + i * TERM_SPACING * SCALE,
          });
        }
      }
    }
  }

  return { terminals, strips };
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TerminalStripRouter() {
  const [connected, setConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanData, setScanData] = useState(null);
  const [selection, setSelection] = useState({ from: null, to: null });
  const [cableType, setCableType] = useState("DC");
  const [wireFn, setWireFn] = useState("Positive");
  const [routes, setRoutes] = useState([]);
  const [nextRef, setNextRef] = useState(1);
  const [hoveredTerm, setHoveredTerm] = useState(null);
  const [expandedPanels, setExpandedPanels] = useState(new Set());
  const [viewMode, setViewMode] = useState("schematic"); // "schematic" | "schedule"
  const svgRef = useRef(null);

  const { terminals, strips } = useMemo(
    () => scanData ? buildTerminals(scanData) : { terminals: [], strips: [] },
    [scanData]
  );

  const colorMap = WIRE_COLORS[cableType];
  const activeColor = colorMap[wireFn] || Object.values(colorMap)[0];

  // Simulate AutoCAD connection
  const handleConnect = useCallback(() => {
    setConnected(false);
    setScanning(true);
    // Simulate connection + scan delay
    setTimeout(() => {
      setConnected(true);
      setTimeout(() => {
        setScanData(MOCK_SCAN);
        setScanning(false);
        setExpandedPanels(new Set(Object.keys(MOCK_SCAN.panels)));
      }, 800);
    }, 1200);
  }, []);

  const handleTerminalClick = useCallback((term) => {
    if (!selection.from) {
      setSelection({ from: term, to: null });
    } else if (selection.from.id === term.id) {
      setSelection({ from: null, to: null });
    } else {
      // Route!
      const path = routeAStar(
        { x: selection.from.x + STRIP_WIDTH + 4, y: selection.from.y },
        { x: term.x - 4, y: term.y },
        []
      );
      const ref = `${cableType}-${String(nextRef).padStart(3, "0")}`;
      setRoutes(prev => [...prev, {
        id: Date.now(),
        from: selection.from,
        to: term,
        path,
        cableType,
        wireFn,
        color: activeColor,
        ref,
      }]);
      setNextRef(prev => prev + 1);
      setSelection({ from: null, to: null });
    }
  }, [selection, cableType, wireFn, activeColor, nextRef]);

  const togglePanel = (panelId) => {
    setExpandedPanels(prev => {
      const next = new Set(prev);
      if (next.has(panelId)) next.delete(panelId); else next.add(panelId);
      return next;
    });
  };

  const svgWidth = GRID_W * SCALE + PAD * 2;
  const svgHeight = GRID_H * SCALE + PAD * 2;

  return (
    <div style={{
      fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
      background: "#060a10",
      color: "#b0c4de",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* ── Header ── */}
      <header style={{
        background: "linear-gradient(90deg, #0a1020 0%, #0f1a2e 50%, #0a1020 100%)",
        borderBottom: "1px solid #1a2744",
        padding: "10px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="6" height="16" rx="1" stroke="#f59e0b" strokeWidth="1.5"/>
            <rect x="16" y="4" width="6" height="16" rx="1" stroke="#3b82f6" strokeWidth="1.5"/>
            <path d="M8 8 L16 8" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="2,2"/>
            <path d="M8 12 L16 12" stroke="#dc2626" strokeWidth="1.5"/>
            <path d="M8 16 L16 16" stroke="#d4d4d4" strokeWidth="1.5" strokeDasharray="4,2"/>
          </svg>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b", letterSpacing: 1.5 }}>
            CONDUIT<span style={{ color: "#22c55e" }}>ROUTE</span>
          </span>
        </div>
        <span style={{ fontSize: 9, color: "#3a5a7a", letterSpacing: 0.5 }}>
          Terminal Strip Auto-Router
        </span>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {/* Connection status */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px",
            background: connected ? "#0a1a0a" : "#1a0a0a",
            border: `1px solid ${connected ? "#16a34a40" : "#4a1a1a"}`,
            borderRadius: 4, fontSize: 9,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: connected ? "#22c55e" : "#ef4444",
              boxShadow: connected ? "0 0 6px #22c55e80" : "0 0 6px #ef444480",
            }} />
            {connected ? `Connected — ${scanData?.drawing?.name || "..."}` : "Disconnected"}
          </div>

          {!connected && (
            <button onClick={handleConnect} disabled={scanning} style={{
              padding: "6px 14px",
              background: scanning ? "#1a2744" : "linear-gradient(135deg, #1a3a2a, #0a2a1a)",
              border: "1px solid #22c55e40",
              color: "#22c55e",
              borderRadius: 4, cursor: scanning ? "wait" : "pointer",
              fontSize: 10, fontWeight: 600, fontFamily: "inherit",
              letterSpacing: 0.5,
            }}>
              {scanning ? "Scanning..." : "⚡ Connect to AutoCAD"}
            </button>
          )}
        </div>
      </header>

      {/* ── Main Area ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Left: Panel Tree ── */}
        <div style={{
          width: 240,
          background: "#080d16",
          borderRight: "1px solid #1a2744",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Wire config */}
          <div style={{ padding: 12, borderBottom: "1px solid #1a2744" }}>
            <div style={{ fontSize: 9, color: "#3a5a7a", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
              WIRE CONFIG
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {["AC", "DC"].map(t => (
                <button key={t} onClick={() => { setCableType(t); setWireFn(Object.keys(WIRE_COLORS[t])[0]); }}
                  style={{
                    flex: 1, padding: "5px",
                    background: cableType === t ? "#1a2d4d" : "transparent",
                    border: `1px solid ${cableType === t ? "#f59e0b60" : "#1a2744"}`,
                    color: cableType === t ? "#f59e0b" : "#4a6a8a",
                    borderRadius: 3, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                  }}>{t}</button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {Object.entries(colorMap).map(([fn, info]) => (
                <button key={fn} onClick={() => setWireFn(fn)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "4px 6px",
                  background: wireFn === fn ? "#1a2d4d" : "transparent",
                  border: `1px solid ${wireFn === fn ? "#ffffff15" : "transparent"}`,
                  borderRadius: 3, cursor: "pointer", fontFamily: "inherit", fontSize: 9,
                  color: wireFn === fn ? "#e5e5e5" : "#5a7a9a",
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: info.hex,
                    border: info.hex === "#d4d4d4" ? "1px solid #666" : "1px solid #00000040",
                  }} />
                  <span style={{ flex: 1, textAlign: "left" }}>{fn}</span>
                  <span style={{ color: "#3a5a7a", fontSize: 8 }}>{info.code}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Panel tree */}
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            <div style={{ fontSize: 9, color: "#3a5a7a", fontWeight: 700, letterSpacing: 1, marginBottom: 8, padding: "0 4px" }}>
              PANEL TREE
            </div>
            {!scanData ? (
              <div style={{ padding: 16, textAlign: "center", color: "#2a4a6a", fontSize: 10 }}>
                Connect to AutoCAD to scan terminal strips
              </div>
            ) : (
              Object.entries(scanData.panels).map(([panelId, panel]) => (
                <div key={panelId} style={{ marginBottom: 4 }}>
                  <button onClick={() => togglePanel(panelId)} style={{
                    display: "flex", alignItems: "center", gap: 6, width: "100%",
                    padding: "6px 8px",
                    background: expandedPanels.has(panelId) ? "#111827" : "transparent",
                    border: "none", borderRadius: 3,
                    cursor: "pointer", fontFamily: "inherit", fontSize: 10, color: panel.color,
                    fontWeight: 700,
                  }}>
                    <span style={{ fontSize: 8, transition: "transform 0.15s", transform: expandedPanels.has(panelId) ? "rotate(90deg)" : "none" }}>▶</span>
                    <span>{panelId}</span>
                    <span style={{ color: "#4a6a8a", fontWeight: 400, fontSize: 9, marginLeft: 4 }}>{panel.full_name}</span>
                  </button>
                  {expandedPanels.has(panelId) && (
                    <div style={{ paddingLeft: 18 }}>
                      {Object.entries(panel.sides).map(([side, sideData]) => (
                        <div key={side}>
                          <div style={{ fontSize: 8, color: "#3a5a7a", padding: "4px 0 2px", fontWeight: 600 }}>
                            {side === "L" ? "LEFT SIDE" : side === "R" ? "RIGHT SIDE" : "CENTER"}
                          </div>
                          {sideData.strips.map(strip => {
                            const isFrom = selection.from?.stripId === strip.strip_id;
                            const isTo = selection.to?.stripId === strip.strip_id;
                            const hasRoute = routes.some(r => r.from.stripId === strip.strip_id || r.to.stripId === strip.strip_id);
                            return (
                              <div key={strip.strip_id} style={{
                                padding: "3px 6px",
                                fontSize: 9,
                                color: isFrom ? "#22c55e" : isTo ? "#ef4444" : hasRoute ? "#f59e0b" : "#6a8aaa",
                                background: isFrom || isTo ? "#ffffff08" : "transparent",
                                borderRadius: 2,
                                display: "flex", justifyContent: "space-between",
                              }}>
                                <span style={{ fontWeight: 600 }}>{strip.strip_id}</span>
                                <span style={{ color: "#3a5a7a" }}>{strip.terminal_count}T</span>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Status bar */}
          <div style={{
            padding: 10,
            borderTop: "1px solid #1a2744",
            fontSize: 9,
            color: "#3a5a7a",
            lineHeight: 1.7,
          }}>
            {selection.from ? (
              <>
                <div style={{ color: "#22c55e" }}>FROM: {selection.from.id}</div>
                <div>Click a terminal for TO endpoint</div>
              </>
            ) : (
              <div>Click a terminal to start routing</div>
            )}
            <div style={{ marginTop: 4 }}>Routes: {routes.length}</div>
          </div>
        </div>

        {/* ── Center: Drawing Canvas ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Toolbar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
            background: "#0a0f18",
            borderBottom: "1px solid #1a2744",
            fontSize: 9,
          }}>
            <div style={{ display: "flex", gap: 2 }}>
              {["schematic", "schedule"].map(m => (
                <button key={m} onClick={() => setViewMode(m)} style={{
                  padding: "4px 12px",
                  background: viewMode === m ? "#1a2d4d" : "transparent",
                  border: `1px solid ${viewMode === m ? "#f59e0b40" : "transparent"}`,
                  color: viewMode === m ? "#f59e0b" : "#4a6a8a",
                  borderRadius: 3, cursor: "pointer", fontSize: 9,
                  fontFamily: "inherit", fontWeight: 600, letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}>{m}</button>
              ))}
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {hoveredTerm && (
                <span style={{ color: "#f59e0b" }}>
                  {hoveredTerm.id} — ({hoveredTerm.x.toFixed(0)}, {hoveredTerm.y.toFixed(0)})
                </span>
              )}
              <button onClick={() => { setRoutes([]); setSelection({ from: null, to: null }); setNextRef(1); }}
                style={{
                  padding: "3px 10px", background: "#1a0808", border: "1px solid #4a1a1a",
                  color: "#ef4444", borderRadius: 3, cursor: "pointer", fontSize: 9, fontFamily: "inherit",
                }}>Clear Routes</button>
            </div>
          </div>

          {/* Canvas */}
          <div style={{ flex: 1, overflow: "auto", background: "#050810" }}>
            {viewMode === "schematic" ? (
              <svg
                ref={svgRef}
                width={svgWidth}
                height={svgHeight}
                style={{ display: "block", margin: "10px auto" }}
              >
                {/* Background grid */}
                <defs>
                  <pattern id="grid-sm" width={SCALE / 4} height={SCALE / 4} patternUnits="userSpaceOnUse">
                    <path d={`M ${SCALE / 4} 0 L 0 0 0 ${SCALE / 4}`} fill="none" stroke="#0d1520" strokeWidth="0.5" />
                  </pattern>
                  <pattern id="grid-lg" width={SCALE} height={SCALE} patternUnits="userSpaceOnUse">
                    <rect width={SCALE} height={SCALE} fill="url(#grid-sm)" />
                    <path d={`M ${SCALE} 0 L 0 0 0 ${SCALE}`} fill="none" stroke="#111d2e" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width={svgWidth} height={svgHeight} fill="url(#grid-lg)" rx="6" />
                <rect width={svgWidth} height={svgHeight} fill="none" stroke="#1a2744" rx="6" />

                {/* Panel enclosures */}
                {scanData && Object.entries(scanData.panels).map(([panelId, panel]) => {
                  const panelStrips = strips.filter(s => s.panelId === panelId);
                  if (panelStrips.length === 0) return null;
                  const minX = Math.min(...panelStrips.map(s => s.px)) - 16;
                  const minY = Math.min(...panelStrips.map(s => s.py)) - 24;
                  const maxX = Math.max(...panelStrips.map(s => s.px + STRIP_WIDTH)) + 16;
                  const maxY = Math.max(...panelStrips.map(s => s.py + s.height)) + 16;
                  return (
                    <g key={`panel-${panelId}`}>
                      <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY}
                        fill={`${panel.color}06`} stroke={`${panel.color}25`}
                        strokeWidth={1} strokeDasharray="6,3" rx={6}
                      />
                      <text x={minX + 8} y={minY + 12}
                        fill={panel.color} fontSize={10} fontFamily="monospace" fontWeight={700}
                        opacity={0.7}
                      >{panelId}</text>
                      <text x={minX + 8} y={minY + 22}
                        fill={`${panel.color}80`} fontSize={7} fontFamily="monospace"
                      >{panel.full_name}</text>
                    </g>
                  );
                })}

                {/* Terminal strips */}
                {strips.map(strip => (
                  <g key={strip.strip_id}>
                    {/* Strip body */}
                    <rect
                      x={strip.px - 2} y={strip.py - 6}
                      width={STRIP_WIDTH + 4} height={strip.height + 12}
                      fill="#0c1220" stroke={`${strip.panelColor}40`} strokeWidth={1} rx={3}
                    />
                    {/* Strip label */}
                    <text x={strip.px + STRIP_WIDTH / 2} y={strip.py - 10}
                      fill={strip.panelColor} fontSize={8} fontFamily="monospace"
                      textAnchor="middle" fontWeight={700}
                    >{strip.strip_id}</text>
                  </g>
                ))}

                {/* Routes (drawn before terminals so terminals are on top) */}
                {routes.map(route => (
                  <g key={route.id}>
                    {/* Wire shadow */}
                    <path d={pathToSvg(route.path)} fill="none"
                      stroke="#000" strokeWidth={4} strokeLinecap="round" opacity={0.3}
                    />
                    {/* Wire */}
                    <path d={pathToSvg(route.path)} fill="none"
                      stroke={route.color.stroke} strokeWidth={2}
                      strokeLinecap="round" strokeLinejoin="round" opacity={0.85}
                    />
                    {/* Cable ref label */}
                    {route.path.length > 2 && (() => {
                      const mid = route.path[Math.floor(route.path.length / 2)];
                      return (
                        <g>
                          <rect x={mid.x - 18} y={mid.y - 12} width={36} height={12}
                            rx={2} fill="#080d16" stroke={route.color.stroke} strokeWidth={0.5} opacity={0.95}
                          />
                          <text x={mid.x} y={mid.y - 4}
                            fill={route.color.stroke === "#666" ? "#aaa" : route.color.stroke}
                            fontSize={7} fontFamily="monospace" fontWeight={700} textAnchor="middle"
                          >{route.ref}</text>
                        </g>
                      );
                    })()}
                  </g>
                ))}

                {/* Terminals */}
                {terminals.map(term => {
                  const isFrom = selection.from?.id === term.id;
                  const isHovered = hoveredTerm?.id === term.id;
                  const isConnected = routes.some(r => r.from.id === term.id || r.to.id === term.id);
                  const connRoute = routes.find(r => r.from.id === term.id || r.to.id === term.id);

                  return (
                    <g key={term.id}
                      onClick={() => handleTerminalClick(term)}
                      onMouseEnter={() => setHoveredTerm(term)}
                      onMouseLeave={() => setHoveredTerm(null)}
                      style={{ cursor: "pointer" }}
                    >
                      {/* Terminal pin */}
                      <rect x={term.x} y={term.y - 2.5} width={STRIP_WIDTH} height={5}
                        fill={isFrom ? "#22c55e20" : isHovered ? "#ffffff10" : "transparent"}
                        rx={1}
                      />
                      <circle cx={term.x + 3} cy={term.y}
                        r={isFrom ? 4 : isHovered ? 3.5 : TERM_RADIUS - 1}
                        fill={isFrom ? "#22c55e" : isConnected ? connRoute.color.hex : "#1a2744"}
                        stroke={isFrom ? "#22c55e" : isHovered ? "#f59e0b" : isConnected ? connRoute.color.stroke : "#2a3a5a"}
                        strokeWidth={isFrom || isHovered ? 1.5 : 0.8}
                      />
                      {/* Right-side connection point */}
                      <circle cx={term.x + STRIP_WIDTH - 3} cy={term.y}
                        r={TERM_RADIUS - 1}
                        fill={isConnected ? connRoute.color.hex : "#1a2744"}
                        stroke={isHovered ? "#f59e0b" : isConnected ? connRoute.color.stroke : "#2a3a5a"}
                        strokeWidth={0.8}
                      />
                      {/* Terminal number */}
                      <text x={term.x + STRIP_WIDTH / 2} y={term.y + 1}
                        fill={isFrom ? "#22c55e" : isHovered ? "#f59e0b" : "#3a5a7a"}
                        fontSize={5} fontFamily="monospace" textAnchor="middle"
                        dominantBaseline="middle" fontWeight={isFrom ? 700 : 400}
                      >{term.index + 1}</text>
                      {/* Animated selection ring */}
                      {isFrom && (
                        <circle cx={term.x + 3} cy={term.y} r={7}
                          fill="none" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="3,2">
                          <animate attributeName="r" values="5;9;5" dur="1.2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
                        </circle>
                      )}
                    </g>
                  );
                })}
              </svg>
            ) : (
              /* Schedule view */
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>
                  CABLE / WIRE SCHEDULE
                </div>
                {routes.length === 0 ? (
                  <div style={{ color: "#2a4a6a", padding: 30, textAlign: "center", fontSize: 11 }}>
                    Route some wires first to generate the schedule.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1a2744" }}>
                        {["Ref", "Type", "Function", "Color", "From Strip", "From Term", "To Strip", "To Term"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#4a6a8a", fontWeight: 600, letterSpacing: 0.5 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map(r => (
                        <tr key={r.id} style={{ borderBottom: "1px solid #0d1520" }}>
                          <td style={{ padding: "7px 10px", color: "#f59e0b", fontWeight: 700 }}>{r.ref}</td>
                          <td style={{ padding: "7px 10px" }}>{r.cableType}</td>
                          <td style={{ padding: "7px 10px" }}>{r.wireFn}</td>
                          <td style={{ padding: "7px 10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, background: r.color.hex, border: r.color.hex === "#d4d4d4" ? "1px solid #666" : "none" }} />
                              {r.color.code}
                            </div>
                          </td>
                          <td style={{ padding: "7px 10px", color: "#22c55e" }}>{r.from.stripId}</td>
                          <td style={{ padding: "7px 10px" }}>{r.from.termId}</td>
                          <td style={{ padding: "7px 10px", color: "#3b82f6" }}>{r.to.stripId}</td>
                          <td style={{ padding: "7px 10px" }}>{r.to.termId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div style={{
            padding: "6px 14px",
            background: "#080d16",
            borderTop: "1px solid #1a2744",
            display: "flex", gap: 16, fontSize: 8, color: "#2a4a6a",
          }}>
            <span>Click terminal → Click destination → Auto-route</span>
            <span>Panels shown as dashed enclosures</span>
            <span>Wire color follows {cableType} / {wireFn} selection</span>
            <span style={{ marginLeft: "auto" }}>
              {scanData ? `${Object.keys(scanData.panels).length} panels • ${terminals.length} terminals` : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
