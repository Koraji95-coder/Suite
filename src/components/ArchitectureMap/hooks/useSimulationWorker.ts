import { useCallback, useRef } from 'react';
import type { RenderState } from './useCanvasRenderer';
import type { ArchNode } from '../types';
import type { ToWorkerMessage, FromWorkerMessage, WorkerNode, WorkerLink } from '../workerTypes';
import { DEFAULT_SIM_CONFIG } from '../workerTypes';

/**
 * Manages the simulation web-worker lifecycle.
 *
 * `onAutoFit` is called once after the first batch of ticks so the camera
 * can be positioned.  `onTick` is called on every tick with the current
 * RenderState (positions already updated).
 */
export function useSimulationWorker(
  onAutoFit: (s: RenderState) => void,
  onTick: (s: RenderState) => void,
) {
  const workerRef = useRef<Worker | null>(null);
  const stateRef = useRef<RenderState | null>(null);
  const fittedRef = useRef(false);

  const post = useCallback((msg: ToWorkerMessage) => {
    workerRef.current?.postMessage(msg);
  }, []);

  /** Initialise the simulation with the given RenderState (called once inside the main effect). */
  const init = useCallback((s: RenderState) => {
    stateRef.current = s;
    fittedRef.current = false;

    // Terminate any previous worker
    workerRef.current?.terminate();

    workerRef.current = new Worker(
      new URL('../simulation.worker.ts', import.meta.url),
      { type: 'module' },
    );

    workerRef.current.onmessage = (e: MessageEvent<FromWorkerMessage>) => {
      const state = stateRef.current;
      if (!state) return;

      if (e.data.type === 'tick') {
        const buf = e.data.positions;
        // Apply positions from the flat Float64Array
        for (let i = 0; i < state.nodes.length; i++) {
          const x = buf[i * 2];
          const y = buf[i * 2 + 1];
          state.nodes[i].x = Number.isFinite(x) ? x : 0;
          state.nodes[i].y = Number.isFinite(y) ? y : 0;
        }
        state.time = performance.now() / 1000;

        // Auto-fit once after the simulation has run a few ticks.
        if (!fittedRef.current && state.nodes.length > 0) {
          fittedRef.current = true;
          onAutoFit(state);
        }

        onTick(state);
      }
    };

    // Serialise nodes & links for the worker
    const workerNodes: WorkerNode[] = s.nodes.map(n => ({
      id: n.id,
      type: n.type,
      group: n.group,
      r: n.r,
      x: n.x,
      y: n.y,
    }));

    const workerLinks: WorkerLink[] = s.links.map(l => ({
      source: typeof l.source === 'object' ? (l.source as ArchNode).id : String(l.source),
      target: typeof l.target === 'object' ? (l.target as ArchNode).id : String(l.target),
      type: l.type,
    }));

    const initMsg: ToWorkerMessage = {
      type: 'init',
      nodes: workerNodes,
      links: workerLinks,
      config: DEFAULT_SIM_CONFIG,
    };
    workerRef.current.postMessage(initMsg);
  }, [onAutoFit, onTick]);

  const pinNode = useCallback((idx: number, x: number | null, y: number | null) => {
    post({ type: 'pin', nodeIndex: idx, fx: x, fy: y });
  }, [post]);

  const setAlphaTarget = useCallback((value: number) => {
    post({ type: 'alphaTarget', value });
  }, [post]);

  const restart = useCallback(() => {
    post({ type: 'restart' });
  }, [post]);

  const reheat = useCallback(() => {
    post({ type: 'reheat', alpha: 0.3 });
  }, [post]);

  const updateConfig = useCallback((config: any) => {
    post({ type: 'config', config });
  }, [post]);

  const destroy = useCallback(() => {
    // Guard: only post 'stop' if the worker hasn't already been terminated.
    // Posting to a terminated worker throws "Attempting to use a disconnected
    // port object".
    const w = workerRef.current;
    if (w) {
      try { w.postMessage({ type: 'stop' } satisfies ToWorkerMessage); } catch { /* already dead */ }
      w.terminate();
    }
    workerRef.current = null;
  }, []);

  return { init, pinNode, setAlphaTarget, restart, reheat, updateConfig, destroy };
}

