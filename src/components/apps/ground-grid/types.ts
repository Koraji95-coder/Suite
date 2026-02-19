export type Point2D = [number, number];
export type Line2D = [Point2D, Point2D];
export type Direction = 'N' | 'S' | 'E' | 'W';

export interface GridRod {
  id?: string;
  label: string;
  grid_x: number;
  grid_y: number;
  depth: number;
  diameter: number;
  sort_order: number;
}

export interface GridConductor {
  id?: string;
  label: string;
  length: number | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  diameter: number;
  sort_order: number;
}

export interface GridConfig {
  origin_x_feet: number;
  origin_x_inches: number;
  origin_y_feet: number;
  origin_y_inches: number;
  block_scale: number;
  place_tees: boolean;
  place_crosses: boolean;
  layer_name: string;
  grid_max_y: number;
}

export interface GridPlacement {
  type: 'ROD' | 'TEE' | 'CROSS';
  grid_x: number;
  grid_y: number;
  autocad_x: number;
  autocad_y: number;
  rotation_deg: number;
}

export interface GridDesign {
  id: string;
  project_id: string | null;
  name: string;
  description: string;
  status: 'draft' | 'finalized' | 'archived';
  config: Partial<GridConfig>;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface GridResults {
  id: string;
  design_id: string;
  placements: GridPlacement[];
  segment_count: number;
  tee_count: number;
  cross_count: number;
  rod_count: number;
  total_conductor_length: number | null;
  generated_at: string;
}

export const DEFAULT_CONFIG: GridConfig = {
  origin_x_feet: 491,
  origin_x_inches: 4 + 15 / 16,
  origin_y_feet: -390,
  origin_y_inches: -(9 + 3 / 8),
  block_scale: 8.33,
  place_tees: true,
  place_crosses: true,
  layer_name: 'Ground Grid',
  grid_max_y: 0,
};
