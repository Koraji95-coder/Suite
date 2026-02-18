import React, { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { useTheme, hexToRgba } from '@/lib/palette';
import type { GraphData, GraphNode } from './types';
import { GROUP_COLORS } from './types';

interface Graph2DProps {
  data: GraphData;
  selectedNodeId: string | null;
  onSelectNode: (node: GraphNode) => void;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  group: string;
  source: GraphNode['source'];
  gNode: GraphNode;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  weight: number;
}

export function Graph2D({ data, selectedNodeId, onSelectNode }: Graph2DProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { palette } = useTheme();
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const nodeElsRef = useRef<d3.Selection<SVGCircleElement, SimNode, SVGGElement, unknown> | null>(null);

  const render = useCallback(() => {
    const svg = d3.select(svgRef.current);
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll('*').remove();

    const g = svg.append('g');

    const simNodes: SimNode[] = data.nodes.map(n => ({
      id: n.id,
      label: n.label,
      group: n.group,
      source: n.source,
      x: n.x + width / 2,
      y: n.y + height / 2,
      gNode: n,
    }));

    const nodeMap = new Map(simNodes.map(n => [n.id, n]));

    const simLinks: SimLink[] = data.links
      .filter(l => nodeMap.has(l.source) && nodeMap.has(l.target))
      .map(l => ({
        source: nodeMap.get(l.source)!,
        target: nodeMap.get(l.target)!,
        weight: l.weight,
      }));

    const sim = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(100).strength(l => l.weight * 0.3))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(30));

    simRef.current = sim;

    const linkGroup = g.append('g');
    const nodeGroup = g.append('g');
    const labelGroup = g.append('g');

    const linkEls = linkGroup.selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', hexToRgba(palette.textMuted, 0.2))
      .attr('stroke-width', d => Math.max(0.5, d.weight * 2));

    const nodeEls = nodeGroup.selectAll<SVGCircleElement, SimNode>('circle')
      .data(simNodes)
      .join('circle')
      .attr('r', d => d.gNode.data?.type === 'major' ? 18 : 10)
      .attr('fill', d => {
        const color = GROUP_COLORS[d.group] ?? palette.primary;
        return d.source === 'memory' ? hexToRgba(color, 0.35) : color;
      })
      .attr('stroke', d => {
        return d.source === 'memory' ? (GROUP_COLORS[d.group] ?? palette.primary) : 'none';
      })
      .attr('stroke-width', d => d.source === 'memory' ? 1.5 : 0)
      .attr('cursor', 'pointer')
      .on('click', (_, d) => onSelectNode(d.gNode));

    nodeElsRef.current = nodeEls;

    const labels = labelGroup.selectAll('text')
      .data(simNodes.filter(n => n.gNode.data?.type === 'major' || n.source === 'memory'))
      .join('text')
      .text(d => d.label.length > 20 ? d.label.slice(0, 18) + '...' : d.label)
      .attr('font-size', 10)
      .attr('fill', palette.textMuted)
      .attr('text-anchor', 'middle')
      .attr('dy', d => (d.gNode.data?.type === 'major' ? 28 : 18))
      .attr('pointer-events', 'none');

    sim.on('tick', () => {
      linkEls
        .attr('x1', d => (d.source as SimNode).x!)
        .attr('y1', d => (d.source as SimNode).y!)
        .attr('x2', d => (d.target as SimNode).x!)
        .attr('y2', d => (d.target as SimNode).y!);

      nodeEls
        .attr('cx', d => d.x!)
        .attr('cy', d => d.y!);

      labels
        .attr('x', d => d.x!)
        .attr('y', d => d.y!);
    });

    const drag = d3.drag<SVGCircleElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeEls.call(drag as any);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom as any);
  }, [data, onSelectNode, palette]);

  // Full rebuild when data, callbacks, or palette change
  useEffect(() => {
    render();
    return () => { simRef.current?.stop(); };
  }, [render]);

  // Lightweight selection highlight update -- no rebuild, no simulation restart
  useEffect(() => {
    const nodeEls = nodeElsRef.current;
    if (!nodeEls) return;

    nodeEls
      .attr('stroke', d => {
        if (d.id === selectedNodeId) return palette.text;
        return d.source === 'memory' ? (GROUP_COLORS[d.group] ?? palette.primary) : 'none';
      })
      .attr('stroke-width', d => {
        if (d.id === selectedNodeId) return 2.5;
        return d.source === 'memory' ? 1.5 : 0;
      });
  }, [selectedNodeId, palette]);

  return (
    <svg
      ref={svgRef}
      style={{
        width: '100%',
        height: '100%',
        background: palette.background,
        display: 'block',
      }}
    />
  );
}
