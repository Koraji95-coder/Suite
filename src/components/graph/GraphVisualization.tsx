import React, { useState, useMemo, useCallback } from 'react';
import { useTheme, hexToRgba } from '@/lib/palette';
import { GraphToolbar } from './GraphToolbar';
import { Graph2D } from './Graph2D';
import { GraphInspector } from './GraphInspector';
import { adaptArchitecture } from './adapters/architectureAdapter';
import { adaptMemories } from './adapters/memoryAdapter';
import { loadMemories, deleteMemory } from '@/lib/ai/service';
import type { GraphData, GraphNode, ViewMode, SourceFilter } from './types';
import type { Memory } from '@/lib/ai/types';

function mergeGraphData(...sources: GraphData[]): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphData['links'] = [];
  for (const src of sources) {
    nodes.push(...src.nodes);
    links.push(...src.links);
  }
  return { nodes, links };
}

export function GraphVisualization() {
  const { palette } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('both');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loaded, setLoaded] = useState(false);

  React.useEffect(() => {
    loadMemories().then(m => {
      setMemories(m);
      setLoaded(true);
    });
  }, []);

  const archData = useMemo(() => adaptArchitecture(), []);
  const memData = useMemo(() => adaptMemories(memories), [memories]);

  const graphData = useMemo(() => {
    if (sourceFilter === 'architecture') return archData;
    if (sourceFilter === 'memory') return memData;
    return mergeGraphData(archData, memData);
  }, [sourceFilter, archData, memData]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return graphData;
    const q = searchQuery.toLowerCase();
    const matchIds = new Set(
      graphData.nodes
        .filter(n => n.label.toLowerCase().includes(q) || n.group.toLowerCase().includes(q))
        .map(n => n.id)
    );
    return {
      nodes: graphData.nodes.filter(n => matchIds.has(n.id)),
      links: graphData.links.filter(l => matchIds.has(l.source) || matchIds.has(l.target)),
    };
  }, [graphData, searchQuery]);

  const handleDeleteMemory = useCallback(async (id: string) => {
    const ok = await deleteMemory(id);
    if (ok) {
      setMemories(prev => prev.filter(m => m.id !== id));
      if (selectedNode?.id === id) setSelectedNode(null);
    }
  }, [selectedNode]);

  const handleAddMemory = useCallback(() => {
    // placeholder
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: palette.background }}>
      <GraphToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddMemory={handleAddMemory}
      />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          {!loaded ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: palette.textMuted }}>
              Loading graph data...
            </div>
          ) : (
            <Graph2D
              data={filtered}
              selectedNodeId={selectedNode?.id ?? null}
              onSelectNode={setSelectedNode}
            />
          )}
        </div>
        {selectedNode && (
          <GraphInspector
            selectedNode={selectedNode}
            onClose={() => setSelectedNode(null)}
            onDeleteMemory={handleDeleteMemory}
          />
        )}
      </div>
    </div>
  );
}
