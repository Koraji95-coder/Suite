import type { ArchNode, ArchLink, Star, Nebula, FlowParticle, TrailSegment, Cluster, BuildStatus, TicketInfo } from '../types';

export interface RenderState {
  // Viewport
  W: number;
  H: number;

  // Camera (flat — mutated directly by the render loop)
  tx: number;
  ty: number;
  scale: number;
  txTarget: number;
  tyTarget: number;
  scaleTarget: number;

  // Graph data
  nodes: ArchNode[];
  links: ArchLink[];

  // Visual effects
  stars: Star[];
  nebulae: Nebula[];

  // Selection & interaction
  selected: ArchNode | null;
  dragging: ArchNode | null;
  dragOffX: number;
  dragOffY: number;
  isPanning: boolean;
  panStartX: number;
  panStartY: number;

  // Search & highlighting
  searchMatches: Set<string>;
  hiddenGroups: Set<string>;
  highlightConnected: Set<string>;

  // LOD clustering
  clusterMode: boolean;
  clusters: Cluster[];

  // Phase 4: Metrics & data
  buildStatuses: Map<string, BuildStatus>;
  issueData: Map<string, TicketInfo>;

  // Phase 4: Time-travel
  isTimeTraveling: boolean;
  snapshotIndex: number;

  // Particle effects
  flows: FlowParticle[];
  trailSegs: TrailSegment[];

  // Performance / FPS
  fpsFrameCount: number;
  fpsLastTime: number;
  fpsDisplay: number;
  time: number;
}

/** Create a default (empty) RenderState. Called once on mount. */
export function createRenderState(): RenderState {
  return {
    W: 0,
    H: 0,

    tx: 0,
    ty: 0,
    scale: 0.65,
    txTarget: 0,
    tyTarget: 0,
    scaleTarget: 0.65,

    nodes: [],
    links: [],

    stars: [],
    nebulae: [],

    selected: null,
    dragging: null,
    dragOffX: 0,
    dragOffY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,

    searchMatches: new Set(),
    hiddenGroups: new Set(),
    highlightConnected: new Set(),

    clusterMode: false,
    clusters: [],

    buildStatuses: new Map(),
    issueData: new Map(),

    isTimeTraveling: false,
    snapshotIndex: -1,

    flows: [],
    trailSegs: [],

    fpsFrameCount: 0,
    fpsLastTime: 0,
    fpsDisplay: 0,
    time: 0,
  };
}

