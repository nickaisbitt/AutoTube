# AutoTube — Definition of Done (single source)

Last updated: 2026-08-01 — branch `cursor/fix-audit-blockers-b466`.

**This file is the only DoD authority.** Other docs (`FOLLOW_UP_NOW.md`, `SHIP_PLAN_MASTER.md`, `QUALITY_WAVE_SUMMARY.md`) link here for bars and proof commands. Do not mark product quality or deploy currency “complete” anywhere else unless every bar in §D is green on a fresh artifact.

---

## §A — Code / audit fixes shipped (not product DoD)

Multi-model audit ship-blockers fixed on this branch: harvest fail-closed, A/V sync, auth gate, SSRF pin, watcher exit codes, `deploy/server` deleted, sprawl cut, espeak TTS fallback, API-key plumbing, CI guards, eval honesty.

These are **code honesty** fixes. They do **not** satisfy upload-ready ≥7 or prod deploy currency.

---

## §B — Proven on this VM (`cursor/fix-audit-blockers-b466`)

| Bar | Status | Evidence |
|-----|--------|----------|
| `npm run dod:check` | **PASS** | deploy/server absent; server-render sync OK |
| `npm run lint` | **PASS** | `tsc --noEmit` exit 0 |
| Waves A–E code | **SHIPPED** | Keyless motion packs, topical floors, keep-best freeze, edit pacing, E2E auth mocks, CI `dod:check`, this DoD doc |
| `npm run generate:video` (Wave F) | **PASS** | Airline topic → `FINAL-VIDEO-final.mp4` (~94.8 s / ~45.3 MB); keyless Archive-only (`pexels=0 pixabay=0 archive=45`); soft-pass `15v/7segs`; exit **0** |
| `npm run watch:video` fail-closed | **PASS** | Exit **1**; brutal raw **2.6**/10; upload-ready **NO**; criticals YES; gates use raw scores |
| Stock keys | **MISSING** | `.env.local` has OpenRouter + `AUTOTUBE_API_KEY` only — no `PEXELS_*` / `PIXABAY_*` (re-proven 2026-08-01) |
| Upload-ready ≥7 / 3-topic proof | **BLOCKED** | Plan exit: keys proven missing. Keyless Archive cannot clear brutal ≥7 on this cold topic. |

Local proof notes (gitignored under `test-recordings/dod-proof/`): `airline-RESULT.txt`, `airline-WATCH_REPORT.md`, generate/watch logs.

Watcher honesty is working: low scores are reported and the process exits non-zero. That is the expected outcome without stock API keys.

---

## §C — Required keys

| Key | Env vars | Needed for |
|-----|----------|------------|
| **OpenRouter** | `OPENROUTER_API_KEY` (preferred) or `VITE_OPENROUTER_KEY` | Script generation, vision scoring, `generate:video` |
| **API gate** | `AUTOTUBE_API_KEY` + `VITE_AUTOTUBE_API_KEY` (same value locally) | Every `/api/*` call; dev server + Playwright |
| **Stock media** | `PEXELS_API_KEY` and/or `PIXABAY_API_KEY` (or `VITE_PEXELS_KEY` / `VITE_PIXABAY_KEY`) | **Brutal raw ≥7 / upload-ready YES** on cold topics |

### Proven **missing** on this VM

`.env.local` has OpenRouter + AutoTube keys but **no** Pexels or Pixabay keys:

```bash
grep -E '^(PEXELS|PIXABAY|VITE_PEXELS|VITE_PIXABAY)' .env.local || echo "MISSING — stock keys not set"
```

Without stock keys the harvest pool is Archive/Mixkit-only → thin motion, intermittent `HARVEST_VOLUME_FAIL`, and watcher raw scores stuck well below 7 even when generate succeeds.

Optional (not required for §D quality bar):

- `RAILWAY_API_TOKEN` / `RAILWAY_TOKEN` — prod deploy currency (`railway:completion-check`)
- `SERPER_API_KEY`, `XAI_API_KEY`, etc. — enrichment only

---

## §D — Remaining bars (open)

| # | Bar | Status | Unblock |
|---|-----|--------|---------|
| 1 | **Upload-ready YES** | **BLOCKED (keys)** | Add `PEXELS_API_KEY` and/or `PIXABAY_API_KEY`, restart Vite, regenerate + watch exit 0 |
| 2 | **Brutal raw ≥ 7** | **BLOCKED (keys)** | Same; Wave F keyless raw was **2.6** — do not lower floors |
| 3 | **Prod deploy currency** | **OPEN** | `RAILWAY_API_TOKEN` → `npm run railway:completion-check` exit 0 |
| 4 | **9.3 stretch** | **OPEN** (after ≥7) | `npm run loop:video -- --until-score 9.3` on cold topics |
| 5 | **3-topic proof pack** | **BLOCKED (keys)** | Only after §D.1–2 green on three cold topics under `test-recordings/dod-proof/` |

Do **not** claim §D.1–2 met from fixture/mock harvest, pre-sweep recordings, keyless Archive runs, or nursing 8.2 artifacts on other branches.

---

## §E — Proof pack (exact commands)

Run from repo root. Source env once per shell:

```bash
set -a && . ./.env.local && set +a
```

### E1 — Fast gates (no extra keys)

```bash
npm run dod:check
npm run lint
npm run test:unit          # optional; CI runs this separately
```

Expected: all exit **0**.

### E2 — Generate once (needs OpenRouter + API gate + ffmpeg)

Terminal 1:

```bash
npm run dev -- --port 5173 --host 0.0.0.0
```

Terminal 2:

```bash
set -a && . ./.env.local && set +a
npm run generate:video -- "The regional airline that hid cabin-pressure failures"
ls -lh test-recordings/FINAL-VIDEO-final.mp4
```

Expected: MP4 exists, duration ≥ 60 s. Generate may succeed on Archive-only; that does **not** satisfy §D.

### E3 — Watcher fail-closed (needs OpenRouter for vision)

```bash
set -a && . ./.env.local && set +a
npm run watch:video -- test-recordings/FINAL-VIDEO-final.mp4
echo "exit=$?"
```

Expected on keyless VM: exit **1**, upload-ready **NO**, raw brutal **< 7**.

`npm run dod:watch -- <mp4>` is the same gate (`"dod:watch": "node scripts/watch-video.mjs"`). `generate:video`, `watch:video`, and `dod:watch` are plain `node …` npm scripts with **no `| tee` pipe**, so the npm exit code is the script's own (generate failure → 1; watcher gate fail → 1, pass → 0). The `scripts/run-*-proof.sh` / `run-all-three-quality.sh` / `watch-loop-and-chain-93.sh` wrappers that do pipe to `tee` run under `set -euo pipefail`, so pipeline status is the loop's, not tee's.

Strict score gate (§D.2):

```bash
npm run watch:video -- test-recordings/FINAL-VIDEO-final.mp4 --min-score 7
echo "exit=$?"
```

Expected until stock keys + iteration: exit **1**.

### E4 — Quality bar ≥7 (needs Pexels and/or Pixabay)

Add to `.env.local`, restart dev server, then:

```bash
set -a && . ./.env.local && set +a
npm run generate:video -- "The regional airline that hid cabin-pressure failures"
npm run watch:video -- test-recordings/FINAL-VIDEO-final.mp4 --min-score 7
# or iterate:
npm run loop:video -- --until-score 7 --topic "The regional airline that hid cabin-pressure failures"
```

Expected when §D.1–2 met: both watch commands exit **0**.

### E5 — Deploy currency (needs Railway token)

```bash
npm run env:debug-railway    # token must show SET
npm run railway:completion-check
```

Expected when prod matches local HEAD: exit **0**.

---

## Quick reference

| Milestone | Command | Exit 0 means |
|-----------|---------|--------------|
| Script-enforceable | `npm run dod:check` | No deploy/server drift |
| Typecheck | `npm run lint` | No TS errors |
| Pipeline runs | `npm run generate:video -- "<topic>"` | `-final.mp4` produced |
| Honest gate | `npm run watch:video -- <mp4>` | Upload-ready YES |
| Honest gate (alias) | `npm run dod:watch -- <mp4>` | Upload-ready YES |
| Score gate | `npm run watch:video -- <mp4> --min-score 7` | Raw brutal ≥ 7, no criticals |
| Prod parity | `npm run railway:completion-check` | Deployed commit = local HEAD |
