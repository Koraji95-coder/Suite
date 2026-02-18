import { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, Database,
} from 'lucide-react';
import { useTheme, hexToRgba } from '@/lib/palette';
import { supabase } from '@/lib/supabase';
import type { TableInfo } from './storageTypes';

const TABLE_NAMES = [
  'projects', 'tasks', 'files', 'activity_log', 'calendar_events',
  'formulas', 'saved_calculations', 'saved_circuits', 'ai_conversations',
  'ai_memory', 'profiles',
] as const;

export function DatabaseBrowser() {
  const { palette } = useTheme();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  const loadTables = useCallback(async () => {
    setLoadingTables(true);
    const counts: TableInfo[] = [];
    for (const name of TABLE_NAMES) {
      const { count } = await supabase.from(name).select('*', { count: 'exact', head: true });
      counts.push({ name, row_count: count ?? 0 });
    }
    setTables(counts);
    setLoadingTables(false);
  }, []);

  const loadData = useCallback(async () => {
    if (!selectedTable) return;
    setLoadingData(true);
    let query = supabase.from(selectedTable).select('*', { count: 'exact' });
    if (sortCol) query = query.order(sortCol, { ascending: sortDir === 'asc' });
    query = query.range(page * pageSize, (page + 1) * pageSize - 1);
    const { data, count } = await query;
    setRows((data ?? []) as Record<string, unknown>[]);
    setTotalCount(count ?? 0);
    setLoadingData(false);
  }, [selectedTable, sortCol, sortDir, page, pageSize]);

  useEffect(() => { loadTables(); }, [loadTables]);
  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    setPage(0); setSortCol(null); setSortDir('asc'); setSearch('');
  }, [selectedTable]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const filtered = search
    ? rows.filter(r => Object.values(r).some(v => v != null && String(v).toLowerCase().includes(search.toLowerCase())))
    : rows;

  const visibleKeys = rows.length
    ? Object.keys(rows[0]).filter(k => rows.some(r => r[k] !== null))
    : [];

  const cellStyle: React.CSSProperties = { padding: '8px 12px', fontSize: 13, color: palette.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 };
  const thStyle: React.CSSProperties = { ...cellStyle, fontWeight: 600, color: palette.textMuted, cursor: 'pointer', userSelect: 'none' };

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 400 }}>
      <div style={{
        width: 220, flexShrink: 0, padding: 12, borderRadius: 10,
        background: hexToRgba(palette.surface, 0.5), border: `1px solid ${hexToRgba(palette.primary, 0.1)}`,
        overflowY: 'auto', maxHeight: 600,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: palette.text }}>Tables</span>
          <button onClick={loadTables} disabled={loadingTables} style={{ background: 'none', border: 'none', cursor: 'pointer', color: palette.primary }}>
            <RefreshCw className={`w-3.5 h-3.5 ${loadingTables ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {loadingTables ? (
          <div style={{ textAlign: 'center', padding: 24, color: palette.textMuted }}><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : tables.map(t => (
          <button key={t.name} onClick={() => setSelectedTable(t.name)} style={{
            display: 'flex', justifyContent: 'space-between', width: '100%', padding: '8px 10px',
            borderRadius: 6, marginBottom: 4, fontSize: 13, cursor: 'pointer',
            background: selectedTable === t.name ? hexToRgba(palette.primary, 0.15) : 'transparent',
            border: selectedTable === t.name ? `1px solid ${palette.primary}` : `1px solid transparent`,
            color: palette.text, transition: 'all 0.15s',
          }}>
            <span>{t.name}</span>
            <span style={{ color: palette.textMuted, fontSize: 12 }}>{t.row_count}</span>
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!selectedTable ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: palette.textMuted }}>
            <Database className="w-12 h-12" style={{ opacity: 0.3, marginBottom: 12 }} />
            <span style={{ fontSize: 14 }}>Select a table to view data</span>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 15, color: palette.text }}>{selectedTable}</span>
              <span style={{ fontSize: 12, color: palette.textMuted }}>{loadingData ? 'Loading...' : `${totalCount} rows`}</span>
              <div style={{ flex: 1 }} />
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
                style={{
                  padding: '4px 8px', borderRadius: 6, fontSize: 12,
                  background: hexToRgba(palette.background, 0.6), border: `1px solid ${hexToRgba(palette.primary, 0.2)}`, color: palette.text,
                }}
              >
                {[25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </div>

            {rows.length > 0 && (
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Search className="w-4 h-4" style={{ position: 'absolute', left: 10, top: 9, color: palette.primary }} />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Filter rows..."
                  style={{
                    width: '100%', padding: '8px 12px 8px 34px', borderRadius: 8, fontSize: 13,
                    background: hexToRgba(palette.background, 0.6), border: `1px solid ${hexToRgba(palette.primary, 0.2)}`, color: palette.text, outline: 'none',
                  }}
                />
                {search && <span style={{ position: 'absolute', right: 10, top: 10, fontSize: 11, color: palette.textMuted }}>{filtered.length} of {rows.length}</span>}
              </div>
            )}

            {loadingData ? (
              <div style={{ textAlign: 'center', padding: 40, color: palette.textMuted }}><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading...</div>
            ) : rows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: palette.textMuted }}>No data in this table</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: palette.textMuted }}>No rows match "{search}"</div>
            ) : (
              <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${hexToRgba(palette.primary, 0.1)}` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: hexToRgba(palette.primary, 0.08) }}>
                      {visibleKeys.map(k => (
                        <th key={k} onClick={() => handleSort(k)} style={thStyle}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {k}
                            {sortCol === k
                              ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
                              : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${hexToRgba(palette.primary, 0.04)}` }}>
                        {visibleKeys.map(k => {
                          const v = row[k];
                          return (
                            <td key={k} style={cellStyle}>
                              {v === null ? <span style={{ color: palette.textMuted, fontStyle: 'italic' }}>null</span>
                                : typeof v === 'boolean' ? <span style={{ color: v ? '#22c55e' : palette.accent }}>{String(v)}</span>
                                : typeof v === 'object' ? <span style={{ color: palette.textMuted }}>{JSON.stringify(v)}</span>
                                : String(v)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalCount > pageSize && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span style={{ fontSize: 12, color: palette.textMuted }}>
                  {page * pageSize + 1}--{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    background: hexToRgba(palette.primary, 0.12), border: `1px solid ${hexToRgba(palette.primary, 0.2)}`, color: palette.text, opacity: page === 0 ? 0.4 : 1,
                  }}>
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  <span style={{ fontSize: 12, color: palette.textMuted }}>Page {page + 1} / {totalPages}</span>
                  <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    background: hexToRgba(palette.primary, 0.12), border: `1px solid ${hexToRgba(palette.primary, 0.2)}`, color: palette.text, opacity: page >= totalPages - 1 ? 0.4 : 1,
                  }}>
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
