import { useRef, useEffect } from 'react';
import { Memory } from '../aitypes';
import { getMemoryTypeColor } from '../aiutils';

interface MemoryCanvasProps {
  memories: Memory[];
  selectedMemory: Memory | null;
  onNodeClick: (memory: Memory) => void;
  width?: number;
  height?: number;
}

export function MemoryCanvas({
  memories,
  selectedMemory,
  onNodeClick,
  width = 800,
  height = 600,
}: MemoryCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    draw();
  }, [memories, selectedMemory]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Center node (AI)
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    drawCenterNode(ctx, centerX, centerY);

    if (memories.length === 0) return;

    // Generate node positions (circle layout)
    const radius = Math.min(canvas.width, canvas.height) / 3;
    const nodes = memories.map((memory, index) => {
      const angle = (index / memories.length) * 2 * Math.PI;
      const distance = radius + (memory.strength / 100) * 50;
      return {
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance,
        memory,
      };
    });

    // Draw connections to center
    nodes.forEach(node => {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(node.x, node.y);
      ctx.strokeStyle = getMemoryTypeColor(node.memory.memory_type) + '40';
      ctx.lineWidth = 1 + (node.memory.strength / 100) * 2;
      ctx.stroke();
    });

    // Draw inter-memory connections (dashed)
    nodes.forEach(node => {
      node.memory.connections.forEach(connId => {
        const connNode = nodes.find(n => n.memory.id === connId);
        if (connNode) {
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(connNode.x, connNode.y);
          ctx.strokeStyle = '#06b6d4' + '60';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    });

    // Draw nodes
    nodes.forEach(node => {
      drawNode(ctx, node.x, node.y, node.memory, selectedMemory?.id === node.memory.id);
    });
  };

  const drawCenterNode = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, 2 * Math.PI);
    ctx.fillStyle = '#8b5cf6';
    ctx.fill();
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AI', x, y);
  };

  const drawNode = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    memory: Memory,
    isSelected: boolean
  ) => {
    const radius = 20 + (memory.strength / 100) * 15;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = getMemoryTypeColor(memory.memory_type);
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#ffffff' : getMemoryTypeColor(memory.memory_type) + 'cc';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = memory.memory_type.substring(0, 4);
    ctx.fillText(label, x, y);

    ctx.font = 'bold 8px Arial';
    ctx.fillText(memory.strength.toString(), x, y + 10);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Check if clicked on a node
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) / 3;

    for (let i = 0; i < memories.length; i++) {
      const angle = (i / memories.length) * 2 * Math.PI;
      const distance = radius + (memories[i].strength / 100) * 50;
      const nodeX = centerX + Math.cos(angle) * distance;
      const nodeY = centerY + Math.sin(angle) * distance;
      const nodeRadius = 20 + (memories[i].strength / 100) * 15;

      const dist = Math.hypot(clickX - nodeX, clickY - nodeY);
      if (dist <= nodeRadius) {
        onNodeClick(memories[i]);
        return;
      }
    }
    onNodeClick(null as any); // Deselect
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleCanvasClick}
      className="w-full bg-black/50 rounded-lg border border-orange-500/20 cursor-pointer"
    />
  );
}