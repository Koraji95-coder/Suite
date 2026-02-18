import { useMemo } from 'react';
import type { ArchNode, ArchLink } from '../types';
import { MAJORS, MINORS, OVERLAPS, minorRadius } from '../constants';

/**
 * Builds the static graph data (nodes & links) from the architecture constants.
 * Returns a memoized set of nodes and links ready for the D3 force simulation.
 */
export function useGraphData() {
  return useMemo(() => {
    const nodes: ArchNode[] = [];
    const links: ArchLink[] = [];
    const colorMap: Record<string, string> = {};

    MAJORS.forEach(m => { colorMap[m.group] = m.color; });

    // Major nodes
    MAJORS.forEach(m => nodes.push({ ...m, type: 'major' }));

    // Minor nodes + subfeature links
    for (const [grp, features] of Object.entries(MINORS)) {
      const parent = MAJORS.find(m => m.group === grp)!.id;
      features.forEach(f => {
        nodes.push({ id: f, group: grp, r: minorRadius(f), color: colorMap[grp], type: 'minor' });
        links.push({ source: f, target: parent, type: 'subfeature' } as unknown as ArchLink);
      });
    }

    // Hub links (Dashboard Core → other majors)
    MAJORS.filter(m => m.group !== 'dash').forEach(m => {
      links.push({ source: 'Dashboard Core', target: m.id, type: 'orchestrator' } as unknown as ArchLink);
    });

    // Overlap links
    OVERLAPS.forEach(([a, b]) => {
      if (nodes.find(n => n.id === a) && nodes.find(n => n.id === b)) {
        links.push({ source: a, target: b, type: 'overlap' } as unknown as ArchLink);
      }
    });

    return { nodes, links, colorMap };
  }, []);
}

