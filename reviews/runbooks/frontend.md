# Frontend/UX Runbook
## Scope
- src/components/, src/store/, src/hooks/
## Questions to ask
1. Any unused components/props/exports?
2. Accessibility: aria, focus traps, keyboard nav?
3. State bugs: stale closures, race conditions?
4. Type safety: any usage, unsafe casts?
5. UX: error states, loading states, confirmation for destructive actions?
6. Performance: unnecessary re-renders, missing memoization?
## Tools
- grep for @ts-ignore, as any, useState without usage
- Check for missing ConfirmDialog usage on destructive actions
