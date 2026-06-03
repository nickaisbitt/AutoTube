# Agent R7 — Real Pass Verifier

**Script:** `scripts/verify-real-pass.mjs`  
**npm:** `npm run verify:real-pass`  
**Merge gate:** M0 requires exit code 0 before merge (see `manager-brief.md`).

---

## Seven-point checklist

| # | Criterion | Owner | R7 check key | How verified |
|---|-----------|-------|--------------|--------------|
| 1 | Full pipeline → `-final.mp4` ≥ 3 min (or configured target) | A1, A2 | `pipeline` | MP4 path, duration ≥ `MIN_DURATION_SEC`, optional ±10% script duration match |
| 2 | No silent TTS segments | A3 | `tts` | Audio stream + `ffmpeg volumedetect` mean volume ≥ `SILENT_MEAN_DB` |
| 3 | CPU-safe encode (no broken NVENC default) | A4 | `encode` | H.264 output; render log shows libx264 or GPU→CPU fallback |
| 4 | ≥90% images loaded before frame loop | A6 | `preload` | `[MediaPreload] load rate: N%` in render log or manifest ≥ `MIN_MEDIA_LOAD_RATE` |
| 5 | Background music muxed when enabled | A7 | `music` | `public/audio/*.aac` present; stereo AAC in MP4 when `backgroundMusic !== false` |
| 6 | E2E/verify: size + duration assertions | A10, A11 | `assertions` | Size ≥ `MIN_SIZE_BYTES` (1 MB), duration ≥ `MIN_DURATION_SEC` |
| 7 | Export blocked when blind review / gates fail | A9 | `gates` | `vitest run src/store/__tests__/qualityGates.test.ts` (unless `SKIP_GATE_TEST=1`) |

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MIN_DURATION_SEC` | `180` (`30` in fixture mode) | Minimum final MP4 duration (#1, #6) |
| `MIN_SIZE_BYTES` | `1048576` (1 MB) | Minimum output file size (#6) |
| `MIN_MEDIA_LOAD_RATE` | `90` | Minimum image preload % (#4) |
| `DURATION_TOLERANCE` | `0.1` | ± fraction for script duration match (A2 sub-check) |
| `SILENT_MEAN_DB` | `-45` | Fail #2 if mean audio volume below this |
| `FORCE_CPU` / `AUTOTUBE_FORCE_CPU` | unset | When `1`/`true`, #3 expects libx264 path in render log |
| `SKIP_GATE_TEST` | unset | When `1`/`true`, skip vitest quality gate suite (#7) |
| `REAL_PASS_FIXTURE` / `FIXTURE_MODE` | unset | Short/fixture run: 30s min, allows fixture project id |
| `MP4_PATH` / `REAL_PASS_MP4` | auto | Explicit `-final.mp4` path |
| `PROJECT_PATH` / `REAL_PASS_PROJECT` | auto | Project JSON (`/tmp/autotube-project*.json` or `--project`) |
| `RENDER_LOG` / `REAL_PASS_LOG` | auto | Server-render stdout/stderr (`test-recordings/latest-render.log`) |
| `REAL_PASS_MANIFEST` | auto | Optional JSON with `mediaPreloadRatePct`, `encodePath`, etc. |

---

## Typical workflows

### Full merge gate (3+ minute product path)

```bash
# Terminal 1
npm run dev -- --port 5173 --host 0.0.0.0

# Terminal 2
npm run generate:video -- "Why AI changes healthcare"
npm run verify:real-pass
```

### Fixture / CI short run

```bash
npm run render:fixture
REAL_PASS_FIXTURE=1 MIN_DURATION_SEC=30 npm run verify:real-pass
```

### Explicit artifacts

```bash
node scripts/verify-real-pass.mjs \
  --mp4 test-recordings/FINAL-OUTPUT-final.mp4 \
  --project /tmp/autotube-project.json \
  --log test-recordings/latest-render.log
```

---

## Example output (fixture pass)

```
═══════════════════════════════════════════════════════════
 R7 Real Pass — Seven-point verification
═══════════════════════════════════════════════════════════
 MP4:     /workspace/test-recordings/FINAL-OUTPUT-final.mp4
 Project: /tmp/autotube-project.json
 Log:     /workspace/test-recordings/latest-render.log
 Mode:    fixture/short (min 30s, min 1.00 MB)
───────────────────────────────────────────────────────────

✅ [1/7] Full pipeline → -final.mp4 ≥ min duration: PASS
    37.5s ≥ 30s, 3.50 MB; Duration OK: 37.5s vs expected 35.3s (±10%)
✅ [2/7] No silent TTS segments: PASS
    Audio present (aac, mean -20.2 dB, max -1.5 dB)
✅ [3/7] CPU-safe encode (libx264 fallback): PASS
    Valid H.264 output (Lavc60.31.102 libx264)
✅ [4/7] ≥90% images loaded before render: PASS
    Image preload 100% ≥ 90%
✅ [5/7] Background music muxed when enabled: PASS
    Skipped — backgroundMusic disabled in project exportSettings
✅ [6/7] E2E size + duration assertions: PASS
    Size 3.50 MB > 1.00 MB, duration 37.5s ≥ 30s
✅ [7/7] Export blocked when blind review / gates fail: PASS
    qualityGates.test.ts passed (15 tests — failing blind review blocks assembly gate)

───────────────────────────────────────────────────────────
 Result: ✅ REAL PASS
 Checks: 6 passed, 0 failed, 1 skipped (of 7)
═══════════════════════════════════════════════════════════
```

## Example output (merge gate blocked — duration)

```
❌ [1/7] Full pipeline → -final.mp4 ≥ min duration: FAIL
    Duration 37.5s < 180s (set REAL_PASS_FIXTURE=1 for short fixture runs)
...
 Result: ❌ REAL PASS BLOCKED
 Checks: 4 passed, 2 failed, 1 skipped (of 7)
```

---

## Render log contract

`npm run generate:video` and `npm run render:fixture` write **`test-recordings/latest-render.log`** (server-render stdout + stderr). R7 parses:

- `[MediaPreload] load rate: N%` — criterion #4
- `CPU encoding (libx264)` / `falling back to libx264` — criterion #3
- `Mixing background music` — criterion #5

Re-run a render if #4 fails with “No preload rate in render log”.

---

## Squad integration

- **M0 merge gate:** `npm run verify:real-pass` exit 0
- **TASK_BOARD:** R7 row → `scripts/verify-real-pass.mjs`, this doc
- **Evidence template:** paste verifier summary + artifact paths in agent deliverables
