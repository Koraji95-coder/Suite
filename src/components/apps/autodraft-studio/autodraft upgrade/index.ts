// src/components/apps/autodraft/AutoDraftComparePanel/index.ts
//
// Barrel re-export. The existing import in AutoDraftStudioApp.tsx
//   import { AutoDraftComparePanel } from "./AutoDraftComparePanel"
// will resolve to this file when the directory exists.
//
// During the incremental migration, re-export the monolith.
// Once the orchestrator replaces it, switch to the new file.

export { AutoDraftComparePanel } from "../AutoDraftComparePanel";

// After the orchestrator is written, change the above to:
// export { AutoDraftComparePanel } from "./AutoDraftComparePanel";
