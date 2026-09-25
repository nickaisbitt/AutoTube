# Code Film (AutoTube)

Use when the user wants Opus-style **code-drawn films**: every frame from JavaScript/WebGL, no image/video models, no stock footage, synthesized score, render-to-MP4 with self-checks.

Also activate for: "glass tile film", "sand animation in code", "draw every frame in JS", "javascript animation skill", "code film", "particle ink film", or improving `demos/tide-ink` / `demos/salt-copper` / `demos/glass-*`.

## Product bar (do not ship below this)

Compared to viral Opus 5.5 demos (glass-tile flock, sand films, pixel wizard, stop-motion):

1. **Artifact + closed loop** — contact sheet → name top 3 defects → fix → re-render. Never one-shot.
2. **Plan as data first** — `storyboard` with tempo, sections, shots (camera + beat), events shared by picture and sound.
3. **One signature technique** — the craft *is* the film (tiles flock, sand settles, hatch draws). Soft glowing blobs fail.
4. **Thumbnail test** — pause any frame; subject readable at small size.
5. **Beat sync** — cuts within ±40ms of downbeats; SFX under actions.
6. **Zero external assets** — no remote images/fonts/audio files (system fonts OK if noted).
7. **Playable MP4** — H.264 High ≤ level 4.1, yuv420p, AAC, `+faststart`. Ship a ≤10MB 720p preview for GitHub.

## Repo layout

```
demos/code-film/shared/
  storyboard.schema.json   # contract for FILM.storyboard
  harness.mjs              # --preview / --contact / --check / --render / --all
  perf-notes.md            # render speed: workers, JPEG, SwiftShader, seekPure
demos/code-film/fixtures/
  smoke.html               # 2s gradient for harness timing
demos/<film-id>/
  index.html               # self-contained film exposing window.FILM
  out/                     # storyboard.json, review/, *-web.mp4, *-preview.mp4
.cursor/skills/code-film/  # this skill
```

Existing films: `demos/salt-copper` (v0 mood), `demos/tide-ink` (v1 particle ink — credible, below viral bar).

## FILM runtime API

```js
window.FILM = {
  ready: true,
  duration, fps, width, height,
  storyboard,          // matches storyboard.schema.json
  canvas / out,        // drawing surface
  seek(t),             // preferred: pure draw at time t
  seekPure: true,      // optional hint — enables parallel --render workers
  reset?.(),
  warmTo?.(frame, n),  // stateful sims only (forces workers=1)
  nextFrame?.(q),      // stateful render loop (forces workers=1)
  renderAudio?.(),     // base64 WAV, same timeline as picture
};
```

Open with `?render=1` to hide UI chrome.

### Perf (harness)

- Default Chromium launch **does not** use SwiftShader — software GL made 1080p canvas→JPEG ~10× slower. Pass `--swiftshader` only if WebGL fails on host GL.
- Pure `seek(t)` (+ no `nextFrame`) → auto `--workers` 2–4 with ordered MJPEG pipe; `--jpeg-quality` defaults to 80 (final look is still CRF 20).
- Stateful films: single worker; use `--warm` only on `--preview`/`--contact`.
- Smoke timing: `node demos/code-film/shared/harness.mjs demos/code-film/fixtures/smoke.html --render`
- Details: `demos/code-film/shared/perf-notes.md`

## Workflow (always)

### 1. Storyboard before drawing code

Write `storyboard` in the page (and mirror to `out/storyboard.json` via harness):

- `tempo.bpm` + sections with moods/harmony
- 8–20 shots: `t0/t1`, `beat` (= cut time), camera, subject, action, optional caption
- `events[]` for SFX/visual hits both systems read
- `technique` string naming the signature craft
- `acceptance` thresholds

Cuts must equal `beat` within 0.04s.

### 2. Implement the technique

Prefer **frame-pure** `seek(t)` / `draw(t)` and set `seekPure: true` — required for parallel renders and to hit ≤1s/frame at 1080p. Use `getContext('2d', { alpha: false, willReadFrequently: true })` when reading back every frame. If state is required (trails), expose `reset` + `warmTo`/`nextFrame` and document it (accepts slower sequential capture).

Avoid: purple-on-white defaults, cream+terracotta clichés, flat single-color backgrounds, soft unreadable silhouettes, dead air >1.5s.

### 3. Score from the same events

Web Audio offline render. Pads/bass on section harmony; whoosh/impact/bell/thunder from `events`. Mux in harness.

### 4. Self-check before claiming done

```bash
# from repo root (playwright + chromium + ffmpeg required)
node demos/code-film/shared/harness.mjs demos/<film>/index.html --preview 2,8,16,24,32
node demos/code-film/shared/harness.mjs demos/<film>/index.html --contact
node demos/code-film/shared/harness.mjs demos/<film>/index.html --check
# read out/review/contact-sheet.jpg + CHECK_REPORT.json
# fix top 3 defects, repeat
node demos/code-film/shared/harness.mjs demos/<film>/index.html --render
```

`--check` fails on external assets, blank frames, and beat misses.

### 5. Critique like a director

From the contact sheet, list:

1. Weakest silhouette / unreadable subject
2. Worst dead air or slide-show cut
3. Loudest score mistake or missing SFX under action

Patch those three only. Re-render previews for those times. Repeat until nothing would embarrass a post next to the glass-tile / sand demos.

## Roadmap this skill owns

| Track | Goal |
|-------|------|
| **C — pipeline** | Shared schema + harness + this skill (done when `--all` works on a new film) |
| **B — signature film** | New glass-tile flock film using the harness; must pass thumbnail + beat checks |
| **A — Tide Ink v2** | Rebuild as continuous-world film on the same storyboard/event model |
| **C — AutoTube** | Optional product mode: topic → storyboard → agent draw loop → MP4 (separate from stock B-roll) |

## Anti-patterns

- Shipping another soft particle silhouette film and calling it done
- Encoding H.264 level 5.0 (QuickTime/GitHub reject it)
- Putting MP4s only on a feature branch without telling the user the path
- Skipping contact sheets because “it looked fine in one preview”
- Copying viral prompts verbatim instead of recreating the **structure**

## Related

- `.cursor/skills/video-watcher` — YouTube retention audit for AutoTube essay videos (different bar)
- `demos/tide-ink/README.md` — lessons from v1
