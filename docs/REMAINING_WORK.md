# AutoTube — Definition of Done (single source)

Last updated: **2026-08-01** — branch `cursor/fix-audit-blockers-b466` @ Wave 5/6 tip (proof pack + KEYS_BLOCKED).

**This file is the only DoD authority** for this branch. Other docs (`FOLLOW_UP_NOW.md`, `SHIP_PLAN_MASTER.md`, `QUALITY_WAVE_SUMMARY.md`) link here for bars and proof commands. Do not mark product quality or deploy currency “complete” anywhere unless every open bar in §B–§C is green on a fresh artifact.

**Keys:** variable names, presence on this VM, and which gates each key unlocks → [`docs/ENV_DOD.md`](ENV_DOD.md).

---

## §A — Code done (not product DoD)

Shipped on this branch tip. These are **code / pipeline honesty** fixes — they do **not** satisfy upload-ready ≥7 or prod deploy currency.

### Audit ship-blockers

Harvest fail-closed, A/V sync, auth gate, SSRF pin, watcher exit codes, `deploy/server` deleted, sprawl cut, espeak TTS fallback, API-key plumbing, CI guards, eval honesty.

### Waves 0–3 (tip `4b84acd`)

| Wave | What shipped |
|------|----------------|
| **0** | Headless-safe TTS timeouts; `run-with-status` npm exit codes; [`docs/ENV_DOD.md`](ENV_DOD.md) key map |
| **1** | Narration hang fix — loop-fast always reaches AI Edit; continue-to-ai-edit wait |
| **2** | Harvest junk filters — airline medical clickbait, wildfire/Google/booking/false-pressure rejects; film-strip/SAF filters |
| **3** | Face-first timeline; keep-best freeze; Chromium crash relaunch (`BROWSER_DISCONNECTED`) |

### Waves A–E (prior on branch)

Keyed vs keyless motion packs, topical per-segment floors, edit pacing, E2E auth mocks, `dod:check` CI guard.

### Fast gates (proven on this VM)

| Command | Status |
|---------|--------|
| `npm run dod:check` | **PASS** — `deploy/server` absent; server-render sync OK |
| `npm run lint` | **PASS** — `tsc --noEmit` exit 0 |

### Wave 5 — narration hang fixes (current tip)

Code shipped on `cursor/fix-audit-blockers-b466` (commits `608ed9d` → `64f261d`):

| Fix | Detail |
|-----|--------|
| Crashpad flags removed | `--disable-crash-reporter` / `--crashpad-handler-pid` flags dropped; headless_shell no longer killed |
| Disconnect fail-fast | Browser `disconnected` event triggers immediate narration error instead of silent hang |
| Invalid Melo BYOK skipped | Melo TTS BYOK path bypassed when server key is invalid; avoids hang before fallback |
| Media → narration race fixed | `sanitize` + volume gate run before Narration starts; prevents race that produced silent/missing audio |
| espeak-ng installed | VM now has `espeak-ng` for server-render TTS fallback when Kokoro is unreachable |

### Wave F + Wave 5 — generate + watch proof (keyless)

**Prior Wave F** — cold airline topic, Archive-only harvest:

| Step | Status | Evidence |
|------|--------|----------|
| `npm run generate:video` | **PASS** | `FINAL-VIDEO-final.mp4` ~94.8 s / ~45.3 MB; `pexels=0 pixabay=0 archive=45`; soft-pass `15v/7segs`; exit **0** |
| `npm run watch:video` | **PASS (fail-closed)** | Exit **1**; brutal raw **2.6**/10; upload-ready **NO**; criticals YES |

**Wave 5 proof pack** (post hang/volume-gate fixes; stock keys still MISSING):

| Topic | Generate | Watch | Notes |
|-------|----------|-------|-------|
| Airline — cabin-pressure failures | Exit **0** · 62.8s · ~24.6 MB | Exit **1** · raw **3.4**/10 · upload-ready **NO** | soft-pass-motion-airline; hang closed past Narration |
| Housing — crash they said never happen | Exit **0** · 81.9s · ~58 MB | Exit **1** · raw **4.6**/10 · upload-ready **NO** | soft-pass-aggregate after re-pad |
| Healthcare — Why AI will change healthcare | Exit **1** | n/a | `HARVEST_VOLUME_FAIL` (4/6 assets/seg after junk filters) |

**Quality wave** (hook fontfile + yellow verify, Ken-Burns, face-first fallback, portrait harvest boost, false-empty OCR recovery, reuse cap ≤2 / 30s):

| Topic | Generate | Watch | Notes |
|-------|----------|-------|-------|
| Airline-v2 | Exit **0** · 70.9s · yellowPixels=31761 | Exit **1** · raw **4.4–5.4** · hook PASS on rewatch | still KEYS_BLOCKED; sim reuse addressed in `0bf74d7` |
| Housing-v2 | Exit **1** | n/a | `HARVEST_VOLUME_FAIL` (7 segs, keyless + junk/pHash) |

Watcher honesty is working: raw &lt;7 → exit 1; thin keyless harvest → non-zero generate. Floors have **not** been lowered.

Local proof (gitignored): `test-recordings/dod-proof/{airline,airline-v2,housing,healthcare}/` + `SUMMARY.txt`.

**Not done:** upload-ready YES, brutal raw ≥7, keyed 3-topic green pack, prod deploy currency. Do not claim these from fixture/mock harvest, keyless Archive runs, or pre-sweep recordings on other branches.

---

## §B — Blocked: stock keys → quality ≥7

**Stock keys are MISSING on this VM.** Verified 2026-08-01:

```bash
grep -E '^(PEXELS|PIXABAY|VITE_PEXELS|VITE_PIXABAY)' .env.local || echo "MISSING — stock keys not set"
# → MISSING — stock keys not set
```

`.env.local` has OpenRouter + `AUTOTUBE_API_KEY` only. See [`docs/ENV_DOD.md`](ENV_DOD.md) for the full key table and restart rules.

Without at least one of `PEXELS_API_KEY` / `VITE_PEXELS_KEY` or `PIXABAY_API_KEY` / `VITE_PIXABAY_KEY`, `resolveStockKeyMode()` returns **keyless** → Archive-only harvest → thin motion, `HARVEST_VOLUME_FAIL` on harder topics (proven: healthcare), and watcher raw scores stuck well below 7 even when generate succeeds.

**Terminal status: `KEYS_BLOCKED`** — upload-ready ≥7 cannot be demonstrated on this VM without stock keys. Do not invent passing scores.

| Bar | Status | Unblock |
|-----|--------|---------|
| **Upload-ready YES** | **KEYS_BLOCKED** | Add stock keys per [`ENV_DOD.md`](ENV_DOD.md), restart Vite, regenerate + `watch:video` exit 0 |
| **Brutal raw ≥ 7** | **KEYS_BLOCKED** | Same; Wave 5 keyless raws **3.4** (airline) / **4.6** (housing); healthcare generate exit 1 — do not lower floors |
| **3-topic proof pack** | **KEYS_BLOCKED** | Keyless pack attempted under `test-recordings/dod-proof/`; green (≥7 ×3) only after stock keys |
| **9.3 stretch** | **OPEN** (after ≥7) | `npm run loop:video -- --until-score 9.3` on cold topics |

---

## §C — Railway / prod deploy currency

`RAILWAY_API_TOKEN` is **present** on this VM ([`ENV_DOD.md`](ENV_DOD.md)). Prod deploy currency is still **OPEN** until:

```bash
npm run env:debug-railway    # token must show SET
npm run railway:completion-check
```

Expected when prod image/commit matches local HEAD: exit **0**.

Prod app may still be an **old container** (uptime days) until a fresh deploy from this branch lands. `npm run deploy:status` for live state. Do not claim deploy parity from green CI alone.

### Check run — 2026-08-01 @ branch `cursor/fix-audit-blockers-b466`

Local HEAD: `ce8bc57a32b3d73efe25231ea5e074e99d2da7bc`

Quality-wave commits since last §C snapshot: `70c1981` (harvest portrait boost), `4449589` (overlays fontfile), `de787b1` (watcher OCR recover), `e46c855` (Ken-Burns presets), `ce8bc57` (introFaceTier fallback).

#### `npm run railway:completion-check` — **FAIL** (exit 1)

```
Error: Railway GraphQL: Not Authorized.
  The active token is a service/runtime credential and cannot call backboard.railway.app/graphql.
  Fix: create a Personal or Team API token at https://railway.app/account/tokens
  then set it as AUTOTUBE_RAILWAY_TOKEN (preferred) or RAILWAY_API_TOKEN in .env.local.
```

Root cause: the `RAILWAY_API_TOKEN` injected by Railway's runtime is the cursor-worker **service credential**, not a personal/team API token. The `backboard.railway.app/graphql/v2` API requires a user-scoped personal token; the service token is rejected with `Not Authorized`. `env:debug-railway` confirms `RAILWAY_API_TOKEN: SET` (source: RAILWAY_API_TOKEN) but the token is scoped to the `cursor-self-hosted-worker` project, not AutoTube-Deploy.

`railway-completion-check` now emits the above actionable message and still exits **1** (no fake PASS). Token resolution also prefers `AUTOTUBE_RAILWAY_TOKEN` before falling back to `RAILWAY_API_TOKEN`.

Unblock: create a Railway Personal API Token at `railway.app/account/tokens`, set it as `AUTOTUBE_RAILWAY_TOKEN` (preferred) or `RAILWAY_API_TOKEN` in `.env.local`, and re-run.

#### `npm run railway:smoke` — **PASS** (exit 0)

```
Health: {"status":"ok","uptime":1632901,"deploy":{"gitCommit":"3e6f62458c5464e3bb3579751573de3b1a8e80dd","deployImage":"ghcr.io/nickaisbitt/autotube:3e6f62458c5464e3bb3579751573de3b1a8e80dd","sourceConnected":false}}
✓ index: HTTP 200
✓ api health: HTTP 200
Smoke passed.
```

Prod is **live** but running a **stale image**: commit `3e6f6245` (≈18.9 days old, uptime 1 632 901 s). Local HEAD is `ce8bc57a`. Deploy parity is **NOT met** — prod has not been rebuilt from this branch.

#### Summary

| Check | Result | Detail |
|-------|--------|--------|
| `railway:completion-check` | **FAIL** | Runtime token not authorized for backboard GQL; actionable error now printed |
| `railway:smoke` | **PASS** | Prod live HTTP 200 |
| SHA match (prod vs local HEAD) | **MISMATCH** | prod `3e6f6245` ≠ local `ce8bc57a` |
| Deploy currency | **OPEN** | Prod has not been rebuilt from this branch |

---

## §D — Proof pack (required commands)

Run from repo root. Source env once per shell:

```bash
set -a && . ./.env.local && set +a
```

### D1 — Fast gates (no extra keys)

```bash
npm run dod:check
npm run lint
npm run test:unit          # optional; CI runs this separately
```

Expected: all exit **0**.

### D2 — Generate once (needs OpenRouter + API gate + ffmpeg)

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

Expected: MP4 exists, duration ≥ 60 s. Generate may succeed on Archive-only; that does **not** satisfy §B.

### D3 — Watcher fail-closed (needs OpenRouter for vision)

```bash
set -a && . ./.env.local && set +a
npm run watch:video -- test-recordings/FINAL-VIDEO-final.mp4
echo "exit=$?"
```

Expected on keyless VM: exit **1**, upload-ready **NO**, raw brutal **< 7**.

`npm run dod:watch -- <mp4>` is the same gate. `generate:video`, `watch:video`, and `dod:watch` are plain `node …` npm scripts with **no `| tee` pipe**, so the npm exit code is the script's own.

Strict score gate:

```bash
npm run watch:video -- test-recordings/FINAL-VIDEO-final.mp4 --min-score 7
echo "exit=$?"
```

Expected until stock keys + iteration: exit **1**.

### D4 — Quality bar ≥7 (needs Pexels and/or Pixabay)

Add keys per [`docs/ENV_DOD.md`](ENV_DOD.md), restart dev server, then:

```bash
set -a && . ./.env.local && set +a
npm run generate:video -- "The regional airline that hid cabin-pressure failures"
npm run watch:video -- test-recordings/FINAL-VIDEO-final.mp4 --min-score 7
# or iterate:
npm run loop:video -- --until-score 7 --topic "The regional airline that hid cabin-pressure failures"
```

Expected when §B bars met: watch commands exit **0**.

### D5 — Deploy currency (needs Railway token)

```bash
npm run env:debug-railway
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
