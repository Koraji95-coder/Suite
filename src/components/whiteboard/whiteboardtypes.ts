export interface DrawAction {
  tool: 'pen' | 'eraser' | 'rectangle' | 'circle' | 'text';
  points?: { x: number; y: number }[];
  color?: string;
  width?: number;
  text?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface SavedWhiteboard {
  id: string;
  title: string;
  panel_context: string;
  canvas_data: { actions: DrawAction[] };
  thumbnail_url: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}