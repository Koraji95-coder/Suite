// A small wrapper component that renders the 2D architecture map.
//
// This used to be named `ArchitectureMap.tsx` specifically to avoid a
// file-vs-folder resolution collision with `components/ArchitectureMap/`.
// Now that the wrapper has an explicit name, imports should target
// `./ArchitectureMapPanel` directly.

import { ArchitectureMap as ArchitectureMap2D } from './index';

export function ArchitectureMapPanel() {
  return <ArchitectureMap2D />;
}
