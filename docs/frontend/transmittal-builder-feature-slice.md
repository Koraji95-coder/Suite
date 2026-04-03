# Transmittal Builder Feature Slice

`src/features/transmittal-builder` is the browser-owned source of truth for transmittal-builder workflow state and core package models.

## Scope

- transmittal draft and file-state models
- sender/profile configuration defaults
- transmittal API client/service integration
- `useTransmittalBuilderState` orchestration
- latest hosted native standards review awareness for package issue readiness
- persisted transmittal receipt snapshots of the active native standards review state

## Active Code Roots

- `src/features/transmittal-builder/index.ts`
- `src/features/transmittal-builder/models.ts`
- `src/features/transmittal-builder/config.ts`
- `src/features/transmittal-builder/service.ts`
- `src/features/transmittal-builder/useTransmittalBuilderState.ts`

## Current Callers

- `src/components/apps/transmittal-builder/TransmittalBuilderApp.tsx`
- `src/components/apps/transmittal-builder/TransmittalBuilderMainForm.tsx`
- `src/components/apps/transmittal-builder/TransmittalBuilderRightRail.tsx`
- `src/components/apps/transmittal-builder/TransmittalBuilderProjectAndSenderSection.tsx`
- `src/components/apps/transmittal-builder/TransmittalBuilderTypeAndFilesSection.tsx`
- `src/components/apps/transmittal-builder/TransmittalBuilderContactsSection.tsx`
- `src/components/apps/transmittal-builder/TransmittalBuilderOptionsSection.tsx`
- `src/services/projectTransmittalReceiptService.ts`
- `src/features/project-delivery/evidenceService.ts`

The app components are consumers of the feature slice. They should not retake ownership of the workflow core.

## Current Boundary

This slice is browser-owned workflow composition. It still depends on lower-level features and services for:

- project document metadata loading
- project delivery register/materialization helpers
- issue-set records
- project standards latest-review reads
- transmittal receipt persistence
- Supabase-backed transmittal rendering endpoints

Those dependencies remain outside the slice. The feature owns the transmittal-builder-specific state machine and core package models on top of them.

## Transitional Notes

- The old component-local `useTransmittalBuilderState.ts`, `transmittalBuilderModels.ts`, `transmittalConfig.ts`, and `transmittalService.ts` paths have been removed from active code.
- The `src/components/apps/transmittal-builder/*` tree is now UI-first and should continue shrinking toward shell/presentation ownership only.
- The package band and right rail now surface the hosted latest native standards review instead of treating standards as implied issue-set state.
