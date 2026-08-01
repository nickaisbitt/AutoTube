# Unused / unwired frontend modules

Modules that are **not imported by the live App tree**
(`App.tsx` → `PipelineStepRouter` / `AppModals`) are deleted rather than kept
around. If you need one back, recover it from git history.

## Deleted in the sprawl cleanup (all had zero non-test importers)

Components: `CommandPalette`, `OnboardingTour`, `KeyboardShortcutsModal`,
`FeatureFlagsPanel`, `PerfDashboard`, `AnalyticsDashboard`,
`VersionHistoryPanel`, `VideoComparison`, `CommentsPanel`, `ActivityFeed`,
`WorkspaceSelector`, `HoverThumbnailPreview`, `ScrollToTop`, `ShareButton`,
`RecentProjects`, `ProjectSearch`, `PageTransition`, `TrimEditor`, `TagInput`

Services: `socialUpload`, `collaboration`, `workspaces`, `abTesting`,
`abTitleTest`, `competitorTracker`, `trendDetector`, `dashboard`,
`youtubeAnalytics`, `notifications`, `launchChecklist`, `undoRedo`,
`exportPresets`, `factVerifier`, `rateLimit`, `a11y`, `batchRender`,
`mediaQualityGate`, `brollGenerator`, `descriptionGenerator`, `scraper/*`

Kept despite appearing dead from the frontend: `monitoring` (imported by the
live `/api/errors` route in `server/routes/errors.ts`) and `brollPlacement`
(dynamically imported by `store/pipeline/orchestrator.ts`).

## Still present but unwired

- Hooks: `useTheme`, `useOnlineStatus`, `useKeyboardShortcuts`
- Most of `services/visualFx/*`, `services/hookFx/*`,
  `services/advancedRender/*`, many `pipelineIntegration/*` modules
  (kept: exercised by `all90TasksIntegration.test.ts`)

Do not add new production imports of these without a deliberate product decision.
