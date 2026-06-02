# AutoTube Real-Pass Task Board

**Branch:** `cursor/video-quality-pipeline-dbd4` (PR #17)  
**Merge gate:** `npm run verify:real-pass` (R7) must exit 0  
**Last updated:** 2026-06-02 — Manager M0

---

## Task rows (17)

| ID | Owner | Status | Priority | Files (primary) | Acceptance criteria | Dependencies |
|----|-------|--------|----------|-----------------|---------------------|--------------|
| **M0** | Manager | in_progress | P0 | `scripts/squad/TASK_BOARD.md`, `scripts/squad/ROSTER.md`, `scripts/squad/manager-brief.md` | Task board published with 17 rows; parallel/sequential plan documented; critical path identified; daily standup tracks `status` / `files_changed` / `evidence` / `blocks` per agent; merge blocked until R7 green | — |
| **A5** | ffmpeg scope + cleanup | pending | P0 | `server-render.mjs`, `deploy/server-render.mjs`, `deploy/server-render/audio.mjs`, `deploy/server-render/pipelineReliability.mjs`, `scripts/ensure-server-render.mjs` | ffmpeg invocations scoped (no orphan temp dirs); root `server-render/` symlinked to `deploy/server-render/`; deploy copy stays in sync; render CLI exits non-zero on ffmpeg failure with actionable stderr | M0 |
| **A4** | Encode CPU fallback | pending | P0 | `server-render.mjs`, `deploy/server-render.mjs`, `deploy/server-render/pipelineReliability.mjs`, `src/services/renderer/encoding.ts` | When NVENC/VAAPI/VideoToolbox probe or encode fails, auto-retry with `libx264`; `AUTOTUBE_FORCE_CPU=1` honored; CI/agents without GPU produce valid `-final.mp4`; no default broken NVENC path (Real Pass #3) | A5 |
| **A11** | Success signals | pending | P0 | `server-render.mjs`, `deploy/server-render.mjs`, `deploy/server-render/pipelineReliability.mjs`, `server/routes/serverRender.ts`, `scripts/generate-full-video.mjs`, `scripts/render-fixture-video.mjs` | Pipeline never reports success on 0-byte or missing output; post-render `statSync` size floor enforced; non-zero exit codes propagate through CLI, API, and npm scripts | A5 |
| **A3** | TTS reliability | pending | P1 | `deploy/server-render/narration.mjs`, `server-render.mjs`, `deploy/server-render/audio.mjs`, `src/services/tts/` | Kokoro env documented + probed; edge-tts fallback chain works; no silent narration segments in output AAC (Real Pass #2); segment-level failure surfaces as render abort, not empty audio | A5, A11 |
| **A7** | Background music | pending | P1 | `public/audio/*.aac`, `public/audio/README.md`, `deploy/server-render/audio.mjs`, `src/services/audioMixer.ts`, `src/services/exportPresets.ts`, `src/services/renderer/orchestrator.ts` | Ship non-placeholder `bg-tense.aac`, `bg-uplifting.aac`, `bg-neutral.aac` (+ `ambient-bg.aac`); `musicPreset` resolves and muxes into `-final.mp4` when `backgroundMusic !== false` (Real Pass #5) | A5, A3 |
| **A6** | Visual preload | pending | P2 | `server-render.mjs`, `deploy/server-render.mjs`, `src/services/mediaQualityGate.ts` | Image preload ≥90% of unique URLs before frame loop; failed URLs retry/thumbnail-fallback; gradient procedural fallback rate logged and below threshold in verify run (Real Pass #4) | A5 |
| **A2** | Duration match | pending | P2 | `server-render.mjs`, `deploy/server-render.mjs`, `src/types/project.ts`, `scripts/generate-full-video.mjs` | Output `-final.mp4` duration within ±10% of script segment sum (or configured `duration-select` target); short-fixture mode exempt via env flag | A3, A4 |
| **A1** | E2E product path | pending | P2 | `scripts/generate-full-video.mjs`, `src/store/pipeline/orchestrator.ts`, `src/services/renderer/orchestrator.ts`, `src/services/renderer/encoding.ts` | Full UI/CLI path topic → script → media → narration → server-render produces `-final.mp4` ≥ configured min duration (Real Pass #1); not fixture-only | A3, A4, A5, A6, A7, A12, A14 |
| **A10** | E2E CI | pending | P2 | `e2e/basic-flow.spec.ts`, `tests/user-journey.spec.ts`, `tests/e2e.spec.ts`, `playwright.config.ts`, `package.json` | Playwright journey drives topic → export; asserts `-final.mp4` exists, size > 1 MB, duration ≥ 180 s (or env target) (Real Pass #6) | A1, A12, A11 |
| **R7** | Real Pass verifier | done | P2 | `scripts/verify-real-pass.mjs`, `scripts/lib/real-pass-*.mjs`, `scripts/squad/R7-real-pass.md`, `package.json` (`verify:real-pass`) | Script enforces all 7 Real Pass criteria with clear pass/fail lines; exits 0 only when every check passes; env vars documented (`MIN_DURATION_SEC`, `FORCE_CPU`, `SKIP_GATE_TEST`, etc.); render logs saved to `test-recordings/latest-render.log` | A1–A11 (checks), A9 (gate test) |
| **A9** | Quality gates | pending | P3 | `src/store/pipeline/orchestrator.ts`, `src/store/__tests__/qualityGates.test.ts`, `src/services/blindReview.ts`, `deploy/server-render/aiReviewer.mjs`, `src/services/mediaQualityGate.ts` | Export/render blocked when blind review or assembly gates fail (configurable bypass for CI); AI reviewer scores not inflated by default mocks (Real Pass #7) | A1 |
| **A8** | Hook / cold-open | pending | P3 | `server-render.mjs`, `deploy/server-render.mjs`, `src/store/pipeline/orchestrator.ts` | `COLD_OPEN_FRAMES` > 0 for long-form; hook text overlay in first 0.3 s; cold-open uses highest-scored intro segment media; packaging visible in `-final.mp4` | A5, A6 |
| **A13** | Viral packaging | pending | P3 | `src/services/thumbnail.ts`, `src/store/pipeline/orchestrator.ts`, `src/types/project.ts`, `server-render.mjs` (thumbnail block) | Thumbnail concepts (fear / curiosity / authority) generated and persisted on project; title variants wired through export metadata; at least one concept selected before render | A1, A9 |
| **A15** | P0 checklist automation | pending | P3 | `src/services/qualityScorer.ts`, `src/services/videoQualityChecklist.ts` (if present), `.kiro/specs/video-quality-checklist/bugfix.md`, `scripts/verify-real-pass.mjs` | Top P0 gates from quality bugfix spec (items 2.216–2.225) automated as pre-export checks or verify sub-checks; failures surface actionable messages | A9, R7 |
| **A12** | OpenRouter mocks | pending | P4 | `e2e/fixtures.ts`, `scripts/generate-full-video.mjs`, `tests/user-journey.spec.ts` | Context-aware mock routing covers script, refine, titles, visual director, blind review, hashtags; no paid API key required; deterministic segment payloads for CI | M0 |
| **A14** | Ops / save-project | pending | P4 | `server/routes/saveProject.ts`, `deploy/server/routes/saveProject.ts`, `src/services/renderer/encoding.ts`, `scripts/deploy.sh`, `scripts/ensure-server-render.mjs` | `/api/save-project` contract stable (id sanitization, path echo); server-render reads same path in CI and local; `scripts/deploy.sh` keeps root ↔ deploy in sync | A5 |

---

## Parallel vs sequential execution

### Wave 0 — Kickoff (parallel)
| Agents | Notes |
|--------|-------|
| **M0**, **A12** | M0 publishes board; A12 can start immediately (no render dependency) |

### Wave 1 — Render foundation (parallel)
| Agents | Notes |
|--------|-------|
| **A5**, **A14** | ffmpeg scope + save-project/deploy sync; A14 lightly depends on A5 paths but can start symlink/contract work in parallel |

### Wave 2 — Encode + honesty (parallel after A5)
| Agents | Notes |
|--------|-------|
| **A4**, **A11** | Both need A5 landed; independent of each other |

### Wave 3 — Audio + visuals (parallel after Wave 2)
| Agents | Notes |
|--------|-------|
| **A3**, **A6**, **A7** | A7 also needs A3 narration paths; A6 only needs A5 |

### Wave 4 — Pipeline proof (sequential spine + parallel branches)
| Agents | Notes |
|--------|-------|
| **A2** → **A1** | Duration logic before full-path proof |
| **A8**, **A13** | Parallel with A1 once A5/A6 land; not blocking Real Pass |

### Wave 5 — Gates + CI (parallel after A1)
| Agents | Notes |
|--------|-------|
| **A9**, **A10** | A10 needs A1 + A12; A9 needs blind-review path from A1 |

### Wave 6 — Verifier + checklist (sequential finale)
| Agents | Notes |
|--------|-------|
| **R7** → **A15** → **M0 merge gate** | R7 implements 7 checks; A15 extends with P0 checklist sub-checks; M0 runs `npm run verify:real-pass` |

### Safe parallel pairs (no file conflict if scoped)
- **A4 ∥ A11** (encode vs exit-code plumbing — touch different functions)
- **A3 ∥ A6** (narration.mjs vs preload block)
- **A8 ∥ A13** (server-render hook vs thumbnail/title services)
- **A12 ∥ A5/A4/A11** (test fixtures vs renderer core)

### Must stay sequential
- **A5 before A4, A11, A3, A6, A7, A8**
- **A3 before A7, A2, A1**
- **A4 before A1, A2**
- **A1 before A9, A10, R7**
- **R7 before M0 merge approval**

---

## Critical path (single longest chain to 7-point Real Pass)

```text
M0 assign
  → A5  (ffmpeg scope — render must not crash)
  → A4  (CPU-safe encode — Real Pass #3)
  → A3  (non-silent TTS — Real Pass #2)
  → A7  (music mux — Real Pass #5)
  → A6  (≥90% image preload — Real Pass #4)
  → A1  (full topic→-final.mp4 ≥ min duration — Real Pass #1)
  → A2  (duration ±10% validation)
  → A10 (Playwright size + duration assertions — Real Pass #6)
  → A9  (export blocked on gate failure — Real Pass #7)
  → R7  (scripts/verify-real-pass.mjs all 7 checks exit 0)
  → M0  (merge gate)
```

**Estimated bottleneck:** A1 full pipeline run (UI + server-render ≥3 min) gated by A3 TTS latency and A4 encode stability.

**Off critical path (parallelize freely):** A12, A14, A8, A13, A15 (until R7 stub exists), A11 (parallel with A4 after A5).

---

## Real Pass criterion → owner map

| # | Criterion | Primary owner | Verified by |
|---|-----------|---------------|-------------|
| 1 | Full pipeline → `-final.mp4` ≥ 3 min | A1, A2 | R7, A10 |
| 2 | No silent TTS segments | A3 | R7 |
| 3 | CPU-safe encode (no broken NVENC default) | A4 | R7 |
| 4 | ≥90% images loaded | A6 | R7 |
| 5 | Background music muxed when enabled | A7 | R7 |
| 6 | E2E/verify: size + duration assertions | A10, A11 | R7 |
| 7 | Export blocked when blind review / gates fail | A9 | R7 |

---

## Agent deliverable template

Each agent PR must include:

```markdown
status: done | blocked | in_progress
files_changed: [...]
evidence: <command output or artifact path>
blocks: <agent IDs or "none">
```
