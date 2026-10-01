# QA/Testing Runbook
## Scope
- tests/, __tests__/, playwright configs, vitest configs, test utilities
## Questions to ask
1. Is there adequate coverage for critical paths (render, TTS, media pipeline)?
2. Are integration tests isolated (no shared state between test files)?
3. Are flaky tests tracked and quarantined?
4. Do tests clean up external resources (API mocks, temp files, DB rows)?
5. Is there a test data factory or fixture system for consistent inputs?
6. Are error paths tested (not just happy paths)?
7. Is CI configured to fail on type-check and lint errors, not just test failures?
## Tools
- grep for .skip, .todo, only( in test files
- Check for missing afterEach/afterAll cleanup hooks
