# Code Film Mode (experimental)

Optional AutoTube path for **Opus-style code-drawn films**: every frame from JavaScript/canvas (or WebGL), no stock B-roll, no image/video models, synthesized score, render-to-MP4 with self-checks.

This sits **beside** the existing stock-essay pipeline. It does not replace topic → script → harvest → TTS → assembly.

## How it differs from stock essays

| | Stock essay (`generate:video` / UI pipeline) | Code film |
|---|-----------------------------------------------|-----------|
| Picture | Harvested photos/clips + Ken Burns / edits | Drawn every frame in `demos/<id>/index.html` |
| Plan | Script segments + media slots | `storyboard` JSON (tempo, shots, events) |
| Audio | TTS narration + optional bed | Optional Web Audio score from the same `events` |
| QA | Retention / watcher loop | Contact sheet → name defects → fix → re-check |
| Entry | App UI or `npm run generate:video` | CLI: `npm run code-film` → harness |

Stock pipeline steps stay: `topic → script → media → narration → ai_edit → assembly → preview` (`src/store/slices/pipelineSlice.ts`, `src/store/pipeline/orchestrator.ts`). Code film never calls those steps.

## User flow (product shape)

```
topic / logline
    ↓
storyboard JSON   (tempo, sections, shots, events, technique)
    ↓
agent or human implements demos/<id>/index.html  (window.FILM)
    ↓
harness: preview → contact → check → (fix top 3) → render
    ↓
MP4  (H.264 High ≤4.1, yuv420p, AAC, +faststart; ≤10MB 720p preview)
```

Today this loop is **CLI + agent skill**, not an in-app generate button.

1. **Init** — scaffold a film stub with storyboard + `FILM` API.
2. **Author** — fill technique, shots, `seek(t)` (or stateful `warmTo`/`nextFrame`), optional `renderAudio()`.
3. **Review** — contact sheet + `--check` (external assets, blank frames, beat misses).
4. **Ship** — `--render` writes `demos/<id>/out/*-web.mp4` and a smaller preview.

## CLI (shipped)

```bash
npm run code-film -- list
npm run code-film -- init my-film
npm run code-film -- preview my-film -- 2,8,16
npm run code-film -- contact my-film
npm run code-film:check -- my-film
npm run code-film -- render my-film
```

Requires Playwright Chromium + ffmpeg (same as harness). See `.cursor/skills/code-film/SKILL.md` and `demos/code-film/shared/`.

## Shipped example films

| Id | Technique | Notes |
|----|-----------|-------|
| `tide-ink-v2` | particle-ink continuous world | ~64s; camera travels one ocean |
| `glass-keeper` | glass-tile flock | ~52s; watch → tower → gulls → spiral |
| `tide-ink` | particle-ink v1 | Credible prototype; prefer v2 |
| `salt-copper` | mood/texture | Early sketch |

Harness encode path writes JPEGs to `out/frames/`, restarts Chromium every ~200 frames, and ffprobe-gates duration / frame count / H.264 level ≤4.1 before success.

## Acceptance bar

Do not treat a film as done below this bar (same as the code-film skill):

1. **Closed loop** — contact sheet → name top 3 defects → fix → re-render. Not one-shot.
2. **Plan as data** — storyboard drives picture and sound; cuts align to `beat` within ±40ms.
3. **One signature technique** — craft readable at thumbnail size (not soft glowing blobs).
4. **Zero external assets** — no remote images/fonts/audio files.
5. **Playable MP4** — encode constraints above; ship a ≤10MB 720p preview for sharing.

## Deliberately deferred

- Full in-app agent loop (topic → storyboard LLM → draw loop → MP4 inside the React UI).
- Wiring code film into `PIPELINE_STEPS` / `generate:video`.
- Replacing stock harvest for essay mode.

Settings only surfaces an experimental pointer to this doc and the CLI so stock paths stay untouched.
