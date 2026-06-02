# AutoTube Real-Pass Task Board

**Branch:** `cursor/video-quality-pipeline-dbd4` (PR #17)  
**Merge gate:** `npm run verify:real-pass` (R7) must exit 0  
**Last updated:** 2026-06-02 — Manager M0

---

## Task rows (17)

| ID | Owner | Status | Priority | Files (primary) | Acceptance criteria | Dependencies |
|----|-------|--------|----------|-----------------|---------------------|--------------|
| **M0** | Manager | in_progress | P0 | `scripts/squad/manager.mjs`, `agents.json`, `status.json`, `TASK_BOARD.md` | 17-agent roster + wave plan; `npm run squad:status`; merge blocked until full R7 green | — |
| **A5** | ffmpeg scope + cleanup | done | P0 | `server-render.mjs`, `deploy/server-render.mjs`, `activeFfmpeg` cleanup, `scripts/ensure-server-render.mjs` | ffmpeg scoped; deploy sync; non-zero on failure | M0 |
| **A4** | Encode CPU fallback | done | P0 | `server-render.mjs`, `src/services/renderer/encoding.ts` | NVENC probe + libx264 fallback; `AUTOTUBE_FORCE_CPU=1` | A5 |
| **A11** | Success signals | in_progress | P0 | `server/routes/serverRender.ts`, `pipelineReliability.mjs` | 0-byte rejected; `MIN_RENDER_OUTPUT_BYTES` on API path | A5 |
| **A3** | TTS reliability | done | P1 | `deploy/server-render/narration.mjs`, `scripts/squad/A3-tts-setup.md` | edge-tts chain; fail-fast; Real Pass #2 green on fixture | A5 |
| **A7** | Background music | done | P1 | `public/audio/bg-*.aac`, `deploy/server-render/audio.mjs` | Assets shipped; musicPreset mux wired | A5, A3 |
| **A6** | Visual preload | done | P2 | `server-render.mjs` | `[MediaPreload] load rate` logged; 100% on fixture run | A5 |
| **A2** | Duration match | done | P2 | `server-render.mjs`, `scripts/lib/duration-check.mjs` | TTS guard skips bogus dynamic collapse; ±10% in R7 | A3, A4 |
| **A1** | E2E product path | done | P2 | `scripts/generate-full-video.mjs` | `npm run generate:video` → `-final.mp4` | A3–A7, A12, A14 |
| **A10** | E2E CI | done | P2 | `e2e/full-pipeline.spec.ts`, `npm run test:e2e:full` | Playwright full journey + MP4 gates | A1, A12, A11 |
| **R7** | Real Pass verifier | done | P2 | `scripts/verify-real-pass.mjs`, `R7-real-pass.md` | 7 checks; fixture mode green; full gate needs ≥180s MP4 | A1–A11, A9 |
| **A9** | Quality gates | done | P3 | `orchestrator.ts`, `aiReviewer.mjs` | Export blocked on gate fail; no +2.0 inflation | A1 |
| **A8** | Hook / cold-open | done | P3 | `server-render.mjs` | `COLD_OPEN_SECONDS=2.5`, hook overlay 0.3s | A5, A6 |
| **A13** | Viral packaging | done | P3 | `thumbnail.ts`, `orchestrator.ts` | Thumbnail concepts wired pre-export | A1, A9 |
| **A15** | P0 checklist automation | in_progress | P3 | `videoQualityChecklist.ts`, `qualityScorer.ts` | P0 subset automated; unit tests added | A9, R7 |
| **A12** | OpenRouter mocks | done | P4 | `e2e/openRouterMock.mjs`, `e2e/fixtures.ts` | Context routing; smoke 3/3 | M0 |
| **A14** | Ops / save-project | in_progress | P4 | `server/utils/projectPaths.ts`, `serverRender.ts` | `resolveSavedProjectPath` contract | A5 |

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
