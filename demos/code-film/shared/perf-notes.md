# Code-film render performance

Target: **≤1s/frame average** on a 32-core machine for 1080p pure-`seek` films (ideally tens of ms/frame).

## What actually dominates

| Cost | Typical (1080p) | Notes |
|------|-----------------|-------|
| `FILM.seek(t)` draw | 10–50ms | Keep draw pure and cheap |
| Canvas → JPEG | **50ms–3s** | Dominated by Chromium/GPU readback path |
| ffmpeg CRF encode | small | Piped MJPEG → libx264; CRF set quality |

On this harness, forcing **SwiftShader** (`--use-angle=swiftshader`) made 1080p `toDataURL('image/jpeg')` ~10× slower (~0.5–2s/frame vs ~40–140ms). Default is **no SwiftShader**. Only pass `--swiftshader` when a WebGL film fails to init on the host GL/ANGLE path.

## Film-side patterns (max speed)

1. **Expose pure `seek(t)`** — redraw frame `t` from scratch with no retained simulation state. Set `FILM.seekPure = true` explicitly when sure.
2. **Do not expose `nextFrame` / `warmTo` unless required** — their presence forces sequential single-worker render.
3. **Canvas 2D tip:** `getContext('2d', { alpha: false, willReadFrequently: true })` when you read back every frame.
4. **Avoid warm resets** on pure films — harness skips `--warm` when `seekPure`.
5. **Resolution:** 1920×1080 is fine; cost scales with pixel count for JPEG readback.

Stateful sims (trails, physics that only step forward): keep `nextFrame` / `warmTo`, accept `workers=1`, and keep per-frame work small.

## Harness knobs

```bash
node demos/code-film/shared/harness.mjs demos/<film>/index.html --render \
  --workers 2 \
  --jpeg-quality 80
```

| Flag | Default | Meaning |
|------|---------|---------|
| `--workers N` | auto (2–4 if `seekPure`, else 1) | Parallel Playwright pages; ordered pipe to ffmpeg |
| `--jpeg-quality` | 80 | Intermediate MJPEG quality (final look is still CRF 20) |
| `--swiftshader` | off | Software WebGL; **slow** canvas readback |
| `--warm N` | 0 | Only for stateful preview/contact |

## Smoke timing (1280×720, 2s @ 30fps = 60 frames)

```bash
node demos/code-film/shared/harness.mjs demos/code-film/fixtures/smoke.html --render
```

Measured on this 32-core host:

| Harness | Wall | Capture note |
|---------|------|--------------|
| Before (SwiftShader, 1 worker, jpeg 0.92) | ~10.3s | ~50ms/frame listed during pipe |
| After (default GL, 4 workers, jpeg 80) | ~4.6s | ~12–13ms/frame effective; ~40ms/frame incl. CRF encode |

1080p Glass Keeper capture microbench (seek + jpeg 0.8, serial): **~403ms/frame with SwiftShader → ~45ms/frame without**. With 2 workers, effective ~28ms/frame — well under the ≤1s/frame target.
