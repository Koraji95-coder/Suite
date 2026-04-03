# Style Architecture

This workspace uses component-owned CSS Modules with a shared global token layer.

## Foundation

- `tokens.css`: global design tokens (spacing, radius, container widths, semantic surfaces).
- `globals.css`: baseline reset and app-wide defaults.
- `theme.css`: global theme variables and semantic color roles used by app components.

## Rules

1. New or redesigned components should use `*.module.css` and avoid utility-class strings.
2. Keep tokens in CSS variables. Do not hardcode one-off colors/sizes in component files.
3. Inline `style={...}` is for truly dynamic values only (computed dimensions/positions), not static styling.
4. Prefer layout primitives (`Container` and future `Stack/Grid`) before adding ad-hoc wrappers.

## Migration pattern

1. Pick one feature slice.
2. Convert TSX markup to semantic class names from a colocated module file.
3. Remove utility classes in that slice completely.
4. Run `npx biome check --write` + `npm run typecheck`.

## Current migrated slices

- `src/components/apps/standards-checker/*`
- `src/features/project-manager/ProjectManagerHeader.tsx`
- `src/components/primitives/Container.tsx`
