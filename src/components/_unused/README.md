# Unused / unwired frontend modules

The following components and hooks are **not imported by the live App tree**
(`App.tsx` → `PipelineStepRouter` / `AppModals`). They remain in the tree for
reference or future wiring; prefer deleting or moving here when touching them.

## Components (examples)

- `CommandPalette`, `OnboardingTour`, `KeyboardShortcutsModal`
- `FeatureFlagsPanel`, `PerfDashboard`, `AnalyticsDashboard`
- `VersionHistoryPanel`, `VideoComparison`, `CommentsPanel`, `ActivityFeed`
- `WorkspaceSelector`, `HoverThumbnailPreview`, `ScrollToTop`, `ShareButton`
- `RecentProjects`, `ProjectSearch`, `PageTransition`, `TrimEditor`, `TagInput`

## Hooks

- `useTheme`, `useOnlineStatus` (hook body unused)
- `useKeyboardShortcuts` (definitions only used by dead modal)

## Services (not used by `store/pipeline/orchestrator.ts`)

- Most of `services/scraper/*`, `services/visualFx/*`, `services/hookFx/*`
- `services/advancedRender/*`, many `pipelineIntegration/*` modules

Do not add new production imports of these without a deliberate product decision.
