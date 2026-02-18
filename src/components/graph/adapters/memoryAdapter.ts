import type { Memory } from '@/lib/ai/types';
import type { GraphData, GraphNode, GraphLink } from '../types';

export function adaptMemories(memories: Memory[]): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const idSet = new Set(memories.map(m => m.id));

  memories.forEach((mem, i) => {
    const angle = (2 * Math.PI * i) / Math.max(memories.length, 1);
    const radius = 200;
    nodes.push({
      id: mem.id,
      label: mem.content.slice(0, 48),
      group: mem.memory_type,
      source: 'memory',
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      z: (mem.strength - 50) * 2,
      data: {
        memory_type: mem.memory_type,
        content: mem.content,
        strength: mem.strength,
        created_at: mem.created_at,
        connections: mem.connections,
      },
    });

    for (const connId of mem.connections) {
      if (idSet.has(connId)) {
        links.push({
          source: mem.id,
          target: connId,
          weight: mem.strength / 100,
        });
      }
    }
  });

  return { nodes, links };
}
