import { useState, useRef } from 'react';
import { Pen, X, Save, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';
import { DrawAction } from './whiteboardtypes';
import { WhiteboardCanvas } from './WhiteboardCanvas';
import { WhiteboardToolbar } from './WhiteboardToolbar';
import { WhiteboardSaveDialog } from './WhiteboardSaveDialog';

interface WhiteboardProps {
  isOpen: boolean;
  onClose: () => void;
  panelContext: string;
  onSaved?: () => void;
}

export function Whiteboard({ isOpen, onClose, panelContext, onSaved }: WhiteboardProps) {
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [redoStack, setRedoStack] = useState<DrawAction[]>([]);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'rectangle' | 'circle' | 'text'>('pen');
  const [color, setColor] = useState('#00ffff');
  const [lineWidth, setLineWidth] = useState(2);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const handleActionAdd = (action: DrawAction) => {
    setActions([...actions, action]);
    setRedoStack([]);
  };

  const undo = () => {
    if (actions.length > 0) {
      const last = actions[actions.length - 1];
      setRedoStack([...redoStack, last]);
      setActions(actions.slice(0, -1));
    }
  };

  const redo = () => {
    if (redoStack.length > 0) {
      const last = redoStack[redoStack.length - 1];
      setActions([...actions, last]);
      setRedoStack(redoStack.slice(0, -1));
    }
  };

  const clearCanvas = () => {
    if (confirm('Clear entire whiteboard?')) {
      setActions([]);
      setRedoStack([]);
    }
  };

  const handleTextRequest = (position: { x: number; y: number }) => {
    const text = prompt('Enter text:');
    if (text) {
      handleActionAdd({
        tool: 'text',
        text,
        position,
        color,
      });
    }
  };

  const saveWhiteboard = async (title: string, tags: string) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const thumbnail = canvas.toDataURL('image/png');
    const tagArray = tags.split(',').map(t => t.trim()).filter(t => t);

    const { error } = await (supabase.from('whiteboards') as any).insert({
      title,
      panel_context: panelContext,
      canvas_data: { actions },
      thumbnail_url: thumbnail,
      tags: tagArray,
    });

    if (error) {
      logger.error('Failed to save whiteboard', 'Whiteboard', error);
      alert('Failed to save whiteboard');
    } else {
      alert('Whiteboard saved successfully!');
      setShowSaveDialog(false);
      onSaved?.();
      onClose(); // Optionally close after save
    }
  };

  const exportAsImage = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `whiteboard-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0a0a0a] backdrop-blur-xl border border-white/[0.06] rounded-lg w-full h-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <div className="flex items-center space-x-3">
            <Pen className="w-6 h-6 text-orange-400" />
            <h3 className="text-2xl font-bold text-white/80">Whiteboard - {panelContext}</h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSaveDialog(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-white/90 transition-all"
            >
              <Save className="w-4 h-4" />
              <span>Save</span>
            </button>
            <button
              onClick={exportAsImage}
              className="flex items-center space-x-2 px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-white/90 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
            >
              <X className="w-5 h-5 text-red-400" />
            </button>
          </div>
        </div>

        {/* Main area */}
        <div className="flex flex-1 overflow-hidden">
          <WhiteboardToolbar
            tool={tool}
            onToolChange={setTool}
            color={color}
            onColorChange={setColor}
            lineWidth={lineWidth}
            onLineWidthChange={setLineWidth}
            onUndo={undo}
            onRedo={redo}
            onClear={clearCanvas}
            onSave={() => setShowSaveDialog(true)}
            onExport={exportAsImage}
            canUndo={actions.length > 0}
            canRedo={redoStack.length > 0}
          />

          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            <WhiteboardCanvas
              actions={actions}
              onActionAdd={handleActionAdd}
              tool={tool}
              color={color}
              lineWidth={lineWidth}
              onTextRequest={handleTextRequest}
            />
          </div>
        </div>

        {/* Save dialog */}
        <WhiteboardSaveDialog
          isOpen={showSaveDialog}
          onClose={() => setShowSaveDialog(false)}
          onSave={saveWhiteboard}
          panelContext={panelContext}
        />
      </div>
    </div>
  );
}