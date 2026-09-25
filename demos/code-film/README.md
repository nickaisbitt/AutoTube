# Code-film pipeline

Shared tools for Opus-style films: every frame from code, storyboard-as-data, contact sheets, auto-checks, playable MP4s.

## Quick start

```bash
npx playwright install chromium   # once
npm run code-film -- init my-film
npm run code-film -- preview my-film -- 2,8,16
npm run code-film:check -- my-film
# or call the harness directly:
node demos/code-film/shared/harness.mjs demos/<film>/index.html --all
```

Product mode (Track C AutoTube): `docs/CODE_FILM_MODE.md`.

## Tracks

| | Track | Status |
|---|--------|--------|
| C | Shared schema + harness + agent skill | **this folder + `.cursor/skills/code-film`** |
| B | Signature glass-tile film | `demos/glass-keeper/` |
| A | Tide Ink continuous-world rebuild | `demos/tide-ink-v2/` (after B clears the bar) |
| C | AutoTube product mode | after A/B produce shareable films |

See `.cursor/skills/code-film/SKILL.md` for the acceptance bar and workflow.
