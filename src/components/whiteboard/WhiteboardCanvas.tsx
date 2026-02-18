import { useRef, useEffect, useState, useCallback } from 'react';
import { DrawAction } from './whiteboardtypes';

interface WhiteboardCanvasProps {
  actions: DrawAction[];
  onActionAdd: (action: DrawAction) => void;
  tool: 'pen' | 'eraser' | 'rectangle' | 'circle' | 'text';
  color: string;
  lineWidth: number;
  onTextRequest?: (position: { x: number; y: number }) => void;
}

export function WhiteboardCanvas({
  actions,
  onActionAdd,
  tool,
  color,
  lineWidth,
  onTextRequest,
}: WhiteboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentAction, setCurrentAction] = useState<DrawAction | null>(null);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    actions.forEach(action => {
      ctx.strokeStyle = action.color || '#00ffff';
      ctx.lineWidth = action.width || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (action.tool === 'pen' && action.points && action.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(action.points[0].x, action.points[0].y);
        for (let i = 1; i < action.points.length; i++) {
          ctx.lineTo(action.points[i].x, action.points[i].y);
        }
        ctx.stroke();
      } else if (action.tool === 'eraser' && action.points && action.points.length > 1) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.moveTo(action.points[0].x, action.points[0].y);
        for (let i = 1; i < action.points.length; i++) {
          ctx.lineTo(action.points[i].x, action.points[i].y);
        }
        ctx.stroke();
      } else if (action.tool === 'rectangle' && action.position && action.size) {
        ctx.strokeRect(action.position.x, action.position.y, action.size.width, action.size.height);
      } else if (action.tool === 'circle' && action.position && action.size) {
        ctx.beginPath();
        const radius = Math.sqrt(action.size.width ** 2 + action.size.height ** 2) / 2;
        ctx.arc(
          action.position.x + action.size.width / 2,
          action.position.y + action.size.height / 2,
          radius,
          0,
          2 * Math.PI
        );
        ctx.stroke();
      } else if (action.tool === 'text' && action.text && action.position) {
        ctx.fillStyle = action.color || '#00ffff';
        ctx.font = '20px Arial';
        ctx.fillText(action.text, action.position.x, action.position.y);
      }
    });

    // Draw current action if any (for real-time preview)
    if (currentAction) {
      ctx.strokeStyle = currentAction.color || '#00ffff';
      ctx.lineWidth = currentAction.width || 2;
      if (currentAction.tool === 'pen' && currentAction.points && currentAction.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(currentAction.points[0].x, currentAction.points[0].y);
        for (let i = 1; i < currentAction.points.length; i++) {
          ctx.lineTo(currentAction.points[i].x, currentAction.points[i].y);
        }
        ctx.stroke();
      } else if (currentAction.tool === 'eraser' && currentAction.points && currentAction.points.length > 1) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.moveTo(currentAction.points[0].x, currentAction.points[0].y);
        for (let i = 1; i < currentAction.points.length; i++) {
          ctx.lineTo(currentAction.points[i].x, currentAction.points[i].y);
        }
        ctx.stroke();
      } else if (currentAction.tool === 'rectangle' && currentAction.position && currentAction.size) {
        ctx.strokeRect(
          currentAction.position.x,
          currentAction.position.y,
          currentAction.size.width,
          currentAction.size.height
        );
      } else if (currentAction.tool === 'circle' && currentAction.position && currentAction.size) {
        ctx.beginPath();
        const radius = Math.sqrt(currentAction.size.width ** 2 + currentAction.size.height ** 2) / 2;
        ctx.arc(
          currentAction.position.x + currentAction.size.width / 2,
          currentAction.position.y + currentAction.size.height / 2,
          radius,
          0,
          2 * Math.PI
        );
        ctx.stroke();
      }
    }
  }, [actions, currentAction]);

  useEffect(() => {
    redrawCanvas();
  }, [actions, currentAction, redrawCanvas]);

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    setIsDrawing(true);

    if (tool === 'pen' || tool === 'eraser') {
      setCurrentAction({
        tool,
        points: [pos],
        color,
        width: lineWidth,
      });
    } else if (tool === 'rectangle' || tool === 'circle') {
      setCurrentAction({
        tool,
        position: pos,
        size: { width: 0, height: 0 },
        color,
        width: lineWidth,
      });
    } else if (tool === 'text') {
      onTextRequest?.(pos);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentAction) return;

    const pos = getMousePos(e);

    if (tool === 'pen' || tool === 'eraser') {
      setCurrentAction({
        ...currentAction,
        points: [...(currentAction.points || []), pos],
      });
    } else if (tool === 'rectangle' || tool === 'circle') {
      const startPos = currentAction.position!;
      setCurrentAction({
        ...currentAction,
        size: {
          width: pos.x - startPos.x,
          height: pos.y - startPos.y,
        },
      });
    }
  };

  const stopDrawing = () => {
    if (currentAction && isDrawing) {
      if (tool === 'pen' || tool === 'eraser') {
        if (currentAction.points && currentAction.points.length > 1) {
          onActionAdd(currentAction);
        }
      } else if (tool === 'rectangle' || tool === 'circle') {
        if (currentAction.size && (currentAction.size.width !== 0 || currentAction.size.height !== 0)) {
          onActionAdd(currentAction);
        }
      }
    }
    setIsDrawing(false);
    setCurrentAction(null);
  };

  return (
    <canvas
      ref={canvasRef}
      width={1600}
      height={900}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={stopDrawing}
      onMouseLeave={stopDrawing}
      className="border border-orange-500/30 rounded-lg cursor-crosshair shadow-2xl"
    />
  );
}