# Code-film pipeline

Shared tools for Opus-style films: every frame from code, storyboard-as-data, contact sheets, auto-checks, playable MP4s.

## Quick start

```bash
npx playwright install chromium   # once
node demos/code-film/shared/harness.mjs demos/<film>/index.html --all
```

Smoke (2s gradient, for harness timing):

```bash
node demos/code-film/shared/harness.mjs demos/code-film/fixtures/smoke.html --render
```

## Render performance

Prefer **pure `seek(t)`** films so the harness can use multiple Playwright pages and skip warm frames. Do **not** pass `--swiftshader` unless WebGL fails without it — software GL makes 1080p JPEG capture ~10× slower.

See [`shared/perf-notes.md`](./shared/perf-notes.md) for worker/JPEG knobs and film-side patterns.

```bash
# typical fast path
node demos/code-film/shared/harness.mjs demos/<film>/index.html --render --workers 2 --jpeg-quality 80
```

## Tracks

| | Track | Status |
|---|--------|--------|
| C | Shared schema + harness + agent skill | **this folder + `.cursor/skills/code-film`** |
| B | Signature glass-tile film | `demos/glass-keeper/` |
| A | Tide Ink continuous-world rebuild | `demos/tide-ink-v2/` (after B clears the bar) |
| C | AutoTube product mode | after A/B produce shareable films |

See `.cursor/skills/code-film/SKILL.md` for the acceptance bar and workflow.
