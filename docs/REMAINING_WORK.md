# AutoTube — Definition of Done (single source)

Last updated: **2026-08-02** — branch `cursor/web-harvest-assemble-auth-4556` @ tip (web-harvest quality + Railway token block).

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

### Closeout wave code (2026-08-02 — not product ≥7)

Shipped on `cursor/web-harvest-assemble-auth-4556` while A3/A5 run gen+watch. **No ≥7 claimed from these commits alone.**

| Commit | What |
|--------|------|
| `50d9a49` (A1) | Hard-reject housing crash/fire/council/chart B-roll (`housingOffTopicBrollReason`) |
| `b95f210` (A2) | Housing intro prefers face/apartment over landscape Archive |
| `e377f25` (A4) | Healthcare keyless soft-pass-motion + clinical relevance + vision split (cyber vs AI-medicine) |

### Wave 5 — narration hang fixes (current tip)

Code shipped on `cursor/fix-audit-blockers-b466` (commits `608ed9d` → `64f261d`):

| Fix | Detail |
|-----|--------|
| Crashpad flags removed | `--disable-crash-reporter` / `--crashpad-handler-pid` flags dropped; headless_shell no longer killed |
| Disconnect fail-fast | Browser `disconnected` event triggers immediate narration error instead of silent hang |
| Invalid Melo BYOK skipped | Melo TTS BYOK path bypassed when server key is invalid; avoids hang before fallback |
| Media → narration race fixed | `sanitize` + volume gate run before Narration starts; prevents race that produced silent/missing audio |
| espeak-ng installed | VM now has `espeak-ng` for server-render TTS fallback when Kokoro is unreachable |

### Wave F + Wave 5 — generate + watch proof (web harvest)

**Prior Wave F** — cold airline topic, raw web harvest (Archive-biased CLI; `pexels=0 pixabay=0`):

| Step | Status | Evidence |
|------|--------|----------|
| `npm run generate:video` | **PASS** | `FINAL-VIDEO-final.mp4` ~94.8 s / ~45.3 MB; `pexels=0 pixabay=0 archive=45`; soft-pass `15v/7segs`; exit **0** |
| `npm run watch:video` | **PASS (fail-closed)** | Exit **1**; brutal raw **2.6**/10; upload-ready **NO**; criticals YES |

**Wave 5 proof pack** (post hang/volume-gate fixes; web-harvest / Archive-biased CLI):

| Topic | Generate | Watch | Notes |
|-------|----------|-------|-------|
| Airline — cabin-pressure failures | Exit **0** · 62.8s · ~24.6 MB | Exit **1** · raw **3.4**/10 · upload-ready **NO** | soft-pass-motion-airline; hang closed past Narration |
| Housing — crash they said never happen | Exit **0** · 81.9s · ~58 MB | Exit **1** · raw **4.6**/10 · upload-ready **NO** | soft-pass-aggregate after re-pad |
| Healthcare — Why AI will change healthcare | Exit **1** | n/a | `HARVEST_VOLUME_FAIL` (4/6 assets/seg after junk filters) |

**Quality wave** (hook fontfile + yellow verify, Ken-Burns, face-first fallback, portrait harvest boost, false-empty OCR recovery, reuse cap ≤2 / 30s):

| Topic | Generate | Watch | Notes |
|-------|----------|-------|-------|
| Airline-v2 | Exit **0** · 70.9s · yellowPixels=31761 | Exit **1** · raw **4.4–5.4** · hook PASS on rewatch | web-motion gate ceiling — watcher honest, raw &lt;7 |
| Airline-v3 (reuse cap) | Exit **0** · 65.9s · yellowPixels=31749 | Exit **1** · raw **2.8–3.6** | thin Archive pool; OCR harden `e3a0642` |
| Airline-web (Bing/Google/DDG) | Exit **0** · 69.6s · injected=26 | Exit **1** · raw **5.6** | web motion path live; variety/pacing still open |
| Airline-web4 (rich-pool pacing) | Exit **0** · 73.5s · injected=16 | Exit **1** · raw **4.2** | rich-pool holds ≤1.5s |
| Airline-web6 (non-YouTube prefer) | Exit **0** · 62s · youtube=0 non-youtube=16 | Exit **1** · raw **4.8** | TikTok proxies failed → medical still fallback (pre-auth fix) |
| Airline-web7 (assemble API auth) | Exit **0** · 83s · injected=33 · youtube=16 | Exit **1** · raw **4.8** | medical stills gone; video-first fallbacks; YouTube still doomed without cookies |
| Airline-web8 (skip doomed proxies) | Exit **0** · 64.9s · injected=17 · youtube=0 · **fallbacks=0** | Exit **0** · raw **7.8** · upload-ready **YES** | Archive-heavy web harvest; no stock keys |
| Housing-web (Bing/Google/DDG) | Exit **0** · 75.0s · injected=13 | Exit **1** · raw **3.8** | archive=0, pure web; variety still weak |
| Housing-web2 (assemble auth) | Exit **0** · 74s · youtube-heavy | Exit **1** · raw **4.8** | browser YouTube kept; Archive stripped |
| Housing-web5 (Archive slice + no YT) | Exit **0** · 71.7s · archive=11 · fallbacks=0 | Exit **1** · raw **5.8** | hook typo/wrong stakes; variety still open |
| Housing-web6 (crash hook + 24 inject) | Exit **0** · 82s · archive=14 · youtube=0 · fallbacks=0 | Exit **1** · raw **5.4** | hook honest; muddy Archive B-roll / no face hook |
| Housing-web7 (apt Archive prefer) | Exit **0** · 69s · archive=10 · youtube=0 | Exit **1** · raw **5.6** | hook PASS; house-graphic×6 + council/quake Archive still tank variety |
| Housing-web8 (reject all Archive) | Exit **1** | n/a | `HARVEST_VOLUME_FAIL` — web proxies thin; Archive body-filler restored in tip |
| Housing-web9 (web-first, no Archive) | Exit **0** · 69s · tiktok=9 · archive=0 | Exit **1** · raw **5.4** | TikTok talking-heads/watermarks; tip now skips cookieless TikTok |
| Housing-web10 (skip TT; Archive −6 bug) | Exit **0** · 78s · injected=1 · soft-pass-aggregate | Exit **1** · raw **5.4** | face-query Archive scored −6 → still pads |
| Housing-web11 (Archive landscape −8) | Exit **1** | n/a | enriched Archive descriptions hit landscape/newsreel −8; tip scores Archive before that demote + per-seg inject retries |
| Housing-web12 (intro score≥2 burn) | Exit **1** | n/a | paddingQueue intro burned Archive (score 0–1) before body |
| Housing-web13 (Archive fills, muddy hook) | Exit **0** · 90s · injected=27 · archive=13 | Exit **1** · raw **4.6** | volume fixed; intro got landscape Archive |
| Housing-web14 (defer weak past intro) | Exit **0** · 84s · injected=25 · archive=11 | Exit **1** · raw **4.6** | volume ok; hook text floor 7 but landscape/crash/council variety still tanks score |
| Housing-v2 | Exit **1** | n/a | `HARVEST_VOLUME_FAIL` (7 segs; junk/pHash + thin web pool) |

Watcher honesty is working: raw &lt;7 → exit 1 until quality lands. Floors have **not** been lowered. Airline cold-topic ≥7 landed on **web harvest** (no Pexels/Pixabay). Remaining pack: housing + healthcare.

Local proof (gitignored): `test-recordings/dod-proof/{airline,airline-v2,housing,healthcare}/` + `SUMMARY.txt`.

**Not done:** upload-ready YES, brutal raw ≥7, 3-topic web-harvest green pack, prod deploy currency. Do not claim these from fixture/mock harvest, thin Archive-only runs, or pre-sweep recordings on other branches.

---

## §B — Open: web-harvest quality ≥7

**Primary product path = raw web harvest** (Bing / Google / DDG / Archive.org /
yt-dlp clip download). Pexels and Pixabay are **optional niceties** — not
required for DoD. See [`docs/ENV_DOD.md`](ENV_DOD.md).

Verified 2026-08-01: no Pexels/Pixabay keys in `.env.local`. That is fine for
web-harvest proof. Open bars are pipeline and gate quality, not key absence:

| Bar | Status | Unblock |
|-----|--------|---------|
| **Web-motion gate recognition** | **CLOSED** (airline) | airline-web8 raw **7.8** / upload-ready YES via Archive+web inject |
| **CLI top-up diversity** | **PARTIAL** | Airline inject healthy; `HARVEST_VOLUME_FAIL` still open on healthcare/housing-v2 |
| **Upload-ready YES (≥7)** | **PARTIAL** | Airline **YES**; housing + healthcare still open |
| **Brutal raw ≥ 7** | **PARTIAL** | Airline-web8 raw **7.8**; housing best raw **5.8** (web5); latest web14 **4.6** (volume ok; landscape/crash/council variety tanks) |
| **3-topic proof pack** | **OPEN** | Need housing + healthcare ≥7 under `test-recordings/dod-proof/` |
| **9.3 stretch** | **OPEN** (after pack) | `npm run loop:video -- --until-score 9.3` on cold topics |

Do not invent passing scores. Do not claim ≥7 is blocked by missing stock keys.

---

## §C — Railway / prod deploy currency

**Status: BLOCKED** (Agent A7, 2026-08-02) — no personal/team Railway token on this VM.
Evidence: [`/tmp/dod-agents/A7-STATUS.md`](/tmp/dod-agents/A7-STATUS.md) and [`ENV_DOD.md`](ENV_DOD.md).

`RAILWAY_API_TOKEN` is **present** but is the cursor-worker **runtime service** credential. `AUTOTUBE_RAILWAY_TOKEN` is **absent**. Prod deploy currency stays **OPEN** until:

```bash
npm run env:debug-railway    # exit 0 with source AUTOTUBE_RAILWAY_TOKEN (exit 2 = worker-only credential)
npm run railway:completion-check
```

Expected when prod image/commit matches local HEAD: exit **0**.

Prod app may still be an **old container** (uptime days) until a fresh deploy from this branch lands. `npm run deploy:status` for live state. Do not claim deploy parity from green CI alone.

### Check run — 2026-08-02 @ branch `cursor/web-harvest-assemble-auth-4556` (Agent A7)

Local HEAD: `d627721905235577377be0e9577281bd28bc11d1`

#### `npm run env:debug-railway` — token SET but wrong scope

```
AUTOTUBE_RAILWAY_TOKEN: unset
RAILWAY_API_TOKEN: SET
✅ Token present (source: RAILWAY_API_TOKEN)
⚠️  Likely Railway *runtime/service* credential … exit 2
```

(Messaging updated so a SET worker credential is no longer mistaken for deploy-ready.)

#### `npm run railway:completion-check` — **FAIL** (exit 1)

```
Error: Railway GraphQL: Not Authorized.
  The active token is a service/runtime credential and cannot call backboard.railway.app/graphql.
  Fix: create a Personal or Team API token at https://railway.app/account/tokens
  then set it as AUTOTUBE_RAILWAY_TOKEN (preferred) or RAILWAY_API_TOKEN in .env.local.
```

Root cause unchanged: Railway injects a service credential for `cursor-self-hosted-worker` / `cursor-worker`. backboard GraphQL requires a user/team token. Scripts prefer `AUTOTUBE_RAILWAY_TOKEN` before falling back to `RAILWAY_API_TOKEN` (no fake PASS).

#### `npm run railway:smoke` — **PASS** (exit 0)

```
Health: {"status":"ok","uptime":1721558,"deploy":{"gitCommit":"3e6f62458c5464e3bb3579751573de3b1a8e80dd","deployImage":"ghcr.io/nickaisbitt/autotube:3e6f62458c5464e3bb3579751573de3b1a8e80dd","sourceConnected":false}}
✓ index: HTTP 200
✓ api health: HTTP 200
Smoke passed.
```

#### `npm run deploy:status`

Local `d627721` ≠ prod `3e6f6245`; uptime ≈478h; `Local matches prod: NO`.

#### Human unblock (exact)

1. Create a Personal or Team API token at https://railway.app/account/tokens
2. Add to AutoTube `.env.local` (gitignored): `AUTOTUBE_RAILWAY_TOKEN=<token>`
   — or set the same name as a Cursor Environment secret on **railway-AutoTube** and start a new agent
3. Re-run:

```bash
npm run env:debug-railway
npm run railway:completion-check
# when GraphQL works but SHA still mismatches:
gh workflow run ghcr-image.yml   # wait green
npm run deploy:railway:registry:pull
npm run railway:completion-check
npm run railway:smoke
```

#### Summary

| Check | Result | Detail |
|-------|--------|--------|
| `env:debug-railway` | **WARN** (exit 2) | Worker `RAILWAY_API_TOKEN` SET; `AUTOTUBE_RAILWAY_TOKEN` unset |
| `railway:completion-check` | **FAIL** | Runtime token Not Authorized for backboard GQL |
| `railway:smoke` | **PASS** | Prod live HTTP 200 |
| SHA match (prod vs local HEAD) | **MISMATCH** | prod `3e6f6245` ≠ local `d627721` |
| Deploy currency | **BLOCKED / OPEN** | Needs personal token, then redeploy |

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

Expected: MP4 exists, duration ≥ 60 s. Generate may succeed on web harvest; that alone does **not** satisfy §B.

### D3 — Watcher fail-closed (needs OpenRouter for vision)

```bash
set -a && . ./.env.local && set +a
npm run watch:video -- test-recordings/FINAL-VIDEO-final.mp4
echo "exit=$?"
```

Expected until §B bars met: exit **1**, upload-ready **NO**, raw brutal **< 7**.

`npm run dod:watch -- <mp4>` is the same gate. `generate:video`, `watch:video`, and `dod:watch` are plain `node …` npm scripts with **no `| tee` pipe**, so the npm exit code is the script's own.

Strict score gate:

```bash
npm run watch:video -- test-recordings/FINAL-VIDEO-final.mp4 --min-score 7
echo "exit=$?"
```

Expected until web-harvest quality + iteration: exit **1**.

### D4 — Quality bar ≥7 (web-harvest proof)

No stock keys required. Iterate on raw web harvest until watcher passes:

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
