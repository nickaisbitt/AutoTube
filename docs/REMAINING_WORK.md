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
| `npm run generate:video` (once) | **PASS** | Airline topic → `test-recordings/FINAL-VIDEO-final.mp4` (~70.7 s / ~22.7 MB); Archive-only harvest + espeak narration |
| `npm run watch:video` fail-closed | **PASS** | Exit **1** when not upload-ready; raw brutal **4.0–5.4** on Archive-only artifact; upload-ready **NO**; gates use raw scores |

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
| 1 | **Upload-ready YES** | **OPEN** | Fresh `generate:video` + `watch:video` exit 0 (no `--min-score` override) |
| 2 | **Brutal raw ≥ 7** | **OPEN** | Same artifact: `watch:video --min-score 7` exit 0, no criticals |
| 3 | **Prod deploy currency** | **OPEN** | `RAILWAY_API_TOKEN` → `npm run railway:completion-check` exit 0 |
| 4 | **9.3 stretch** | **OPEN** (after ≥7) | `npm run loop:video -- --until-score 9.3` on cold topics |

Do **not** claim §D.1–2 met from fixture/mock harvest, pre-sweep recordings, or nursing 8.2 artifacts on other branches.

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
