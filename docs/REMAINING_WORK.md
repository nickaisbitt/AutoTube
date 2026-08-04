# AutoTube — Definition of Done (single source)

Last updated: **2026-08-04T21:00Z** — tip-best housing **6.4** / healthcare **6.6**; 90m wave13 TIMEBOX (no BOTH≥7). Tier-3 clinician-face preference + housing gate-still exception + evidence-only pool (`fde342f`/`838fe9a`). Wave watches: housing-web4/8/10 INTRO_FACE_FAIL; healthcare-web69 raw **5.6**, web70 **3.8**, web71 **3.6**. No new ≥6.8.

**Housing intro-face evidence broadened (code fix, no fresh watch yet):** Live DDG `v.js` probes of the `housingHostLead` `site:vimeo.com` queries (post `23d3fe9` `:` fix) confirmed Bing/DDG now return genuine face+eviction Vimeo results ("Barcroft TV: Grandmother Faces Eviction...", "Preview Clip ... 'Evicting the American Dream'", "Tenants Rise Up! Fighting for Housing Justice"). The `checkIntroFacePool`/`checkEditTimelineIntroFace` evidence regex only recognized singular `tenant/family/woman/man/couple` and `evict(?:ion|ed|s)?` — missing plurals ("tenants", "families"), kinship/status nouns ("grandmother", "resident", "renter", "homeowner"), and the "evicting"/"evictions" verb forms that are the most common real headline shapes. Extracted a shared `housingIntroFaceEvidenceMatches` helper (used by both the pool and timeline gates, closing a drift risk) with the broadened word list, and fixed a silent query-cap drop where `foreclosure family home`/`eviction documentary` sat past `queryCap=34` so their `housingHostLead` Vimeo variants never fired — moved both into the early face block. Gate thresholds and the intro-face requirement itself are unchanged; this only widens which already-downloadable evidence the existing gate recognizes. No new score claimed — needs a fresh `generate:video` + `watch:video` run to confirm impact.

**This file is the only DoD authority** for this branch. Other docs (`FOLLOW_UP_NOW.md`, `SHIP_PLAN_MASTER.md`, `QUALITY_WAVE_SUMMARY.md`) link here for bars and proof commands. Do not mark product quality or deploy currency “complete” anywhere unless every open bar in §B–§C is green on a fresh artifact.

**Honest score rule:** Do **not** claim brutal raw ≥7 / upload-ready YES unless a fresh `WATCH_REPORT.md` shows it. Airline-web8 remains the only closed ≥7 topic (raw **7.8**). Housing and healthcare have **no** fresh ≥7.

**Continuous closeout (2026-08-03T22:57Z):** **PACK_OPEN** — airline **7.8** YES. Housing tip-best **6.2** (web31). Healthcare tip-best **6.2** (web18). Latest healthcare-web43 raw **3.4** (GeekBeat/Jackthreads/MLK junk — now rejected). Housing soft-pass thin at 4–5v. Floors **not** lowered for watch ≥7. No stock keys. Railway **BLOCKED** without `AUTOTUBE_RAILWAY_TOKEN`.

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

Shipped on `cursor/web-harvest-assemble-auth-4556` while A3/A5/W2 run gen+watch. **No ≥7 claimed from these commits alone.**

| Commit | What |
|--------|------|
| `50d9a49` (A1) | Hard-reject housing crash/fire/council/chart B-roll (`housingOffTopicBrollReason`) |
| `b95f210` (A2) | Housing intro prefers face/apartment over landscape Archive |
| `e377f25` (A4) | Healthcare keyless soft-pass-motion + clinical relevance + vision split (cyber vs AI-medicine) |
| `07027d1` (A8) | Tighter first-15s reuse + motion-first opening for housing/keyless |
| `6ee63fc` (A3) | Housing: reject fire/war Archive junk; evidence-based landscape intro; karaokeCaptions OFF |
| `a0bfe41` (W2-AV) | Default-safe A/V freeze-pad ≤12s without `ALLOW_AUDIO_TRIM` (`avTimelinePolicy.mjs`) |
| `7ac1fc8` (W2-TESTS) | Prefer strong housing Archive over webinar scrapes; webinar opener reject |
| `ec994af` (tip) | Housing shocked-face intro prefer + webinar body demote |

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
| Healthcare — Why AI will change healthcare | Exit **1** (prior) | n/a | Prior `HARVEST_VOLUME_FAIL`; tip soft-pass proven on healthcare-web1 |

**Quality wave** (hook fontfile + yellow verify, Ken-Burns, face-first fallback, portrait harvest boost, false-empty OCR recovery, reuse cap ≤2 / 30s):

| Topic | Generate | Watch | Notes |
|-------|----------|-------|-------|
| Airline-v2 | Exit **0** · 70.9s · yellowPixels=31761 | Exit **1** · raw **4.4–5.4** · hook PASS on rewatch | web-motion gate ceiling — watcher honest, raw &lt;7 |
| Airline-v3 (reuse cap) | Exit **0** · 65.9s · yellowPixels=31749 | Exit **1** · raw **2.8–3.6** | thin Archive pool; OCR harden `e3a0642` |
| Airline-web (Bing/Google/DDG) | Exit **0** · 69.6s · injected=26 | Exit **1** · raw **5.6** | web motion path live; variety/pacing still open |
| Airline-web4 (rich-pool pacing) | Exit **0** · 73.5s · injected=16 | Exit **1** · raw **4.2** | rich-pool holds ≤1.5s |
| Airline-web6 (non-YouTube prefer) | Exit **0** · 62s · youtube=0 non-youtube=16 | Exit **1** · raw **4.8** | TikTok proxies failed → medical still fallback (pre-auth fix) |
| Airline-web7 (assemble API auth) | Exit **0** · 83s · injected=33 · youtube=16 | Exit **1** · raw **4.8** | medical stills gone; video-first fallbacks; YouTube still doomed without cookies |
| Airline-web8 (skip doomed proxies) | Exit **0** · 64.9s · injected=17 · youtube=0 · **fallbacks=0** | Exit **0** · raw **7.8** · upload-ready **YES** | Archive-heavy web harvest; no stock keys — **still CLOSED** |
| Housing-web (Bing/Google/DDG) | Exit **0** · 75.0s · injected=13 | Exit **1** · raw **3.8** | archive=0, pure web; variety still weak |
| Housing-web2 (assemble auth) | Exit **0** · 74s · youtube-heavy | Exit **1** · raw **4.8** | browser YouTube kept; Archive stripped |
| Housing-web5 (Archive slice + no YT) | Exit **0** · 71.7s · archive=11 · fallbacks=0 | Exit **1** · raw **5.8** | hook typo/wrong stakes; variety still open — historical housing best |
| Housing-web6 (crash hook + 24 inject) | Exit **0** · 82s · archive=14 · youtube=0 · fallbacks=0 | Exit **1** · raw **5.4** | hook honest; muddy Archive B-roll / no face hook |
| Housing-web7 (apt Archive prefer) | Exit **0** · 69s · archive=10 · youtube=0 | Exit **1** · raw **5.6** | hook PASS; house-graphic×6 + council/quake Archive still tank variety |
| Housing-web8 (reject all Archive) | Exit **1** | n/a | `HARVEST_VOLUME_FAIL` — web proxies thin; Archive body-filler restored in tip |
| Housing-web9 (web-first, no Archive) | Exit **0** · 69s · tiktok=9 · archive=0 | Exit **1** · raw **5.4** | TikTok talking-heads/watermarks; tip now skips cookieless TikTok |
| Housing-web10 (skip TT; Archive −6 bug) | Exit **0** · 78s · injected=1 · soft-pass-aggregate | Exit **1** · raw **5.4** | face-query Archive scored −6 → still pads |
| Housing-web11 (Archive landscape −8) | Exit **1** | n/a | enriched Archive descriptions hit landscape/newsreel −8; tip scores Archive before that demote + per-seg inject retries |
| Housing-web12 (intro score≥2 burn) | Exit **1** | n/a | paddingQueue intro burned Archive (score 0–1) before body |
| Housing-web13 (Archive fills, muddy hook) | Exit **0** · 90s · injected=27 · archive=13 | Exit **1** · raw **4.6** | volume fixed; intro got landscape Archive |
| Housing-web14 (defer weak past intro) | Exit **0** · 84s · injected=25 · archive=11 | Exit **1** · raw **4.6** | volume ok; hook text floor 7 but landscape/crash/council variety still tanks score |
| Housing-web15 (A1/A2 junk+face intro @ `b95f210`) | Exit **0** · 75.7s · soft-pass-motion(12v/6segs) · youtube=0 | Exit **1** · raw **4.2** | hook text floor 7; landscape intro + webcam/variety/pacing still tank |
| Housing-web16 (post `6ee63fc` / A3#2) | Exit **0** · 75.9s | Exit **1** · raw **4.6** | fire/war reject + karaoke-off; still &lt;7 |
| Housing-web17 (A3#3 @ `df46921`) | Exit **0** · 69.7s | Exit **1** · raw **4.6** | webinar intro still low-energy; upload-ready **NO** |
| Housing-web18 (tip `ec994af` shocked-face) | Exit **0** · 84.2s · soft-pass-motion(16v/6segs) | Exit **1** · raw **5.2** | tip-best this wave; static Rolfe opener + Archive junk — still &lt;7 |
| Housing-web19 (post `f150aa4`/`87cd0ca`) | Exit **0** · 76.3s · soft-pass-motion(18v/6segs) | Exit **1** · raw **4.4** | For-Sale/REMAX opener; celebrity/chart pads |
| Housing-web20 (post `31f9ee5`) | Exit **0** · 64.5s · soft-pass-motion(11v/4segs) | Exit **1** · raw **4.8** | protest/fire/rent-strike pads; W2 housing cycles exhausted |
| Healthcare-web1 (A4 soft-pass @ `e377f25`) | Exit **0** · 65.2s · soft-pass-motion-healthcare(15v/3segs) · youtube=0 | Exit **1** · raw **5.2** | volume closed; hook/variety/pacing still open (FEMA/cockroach/clickbait) — healthcare best |
| Healthcare-web2 (A5#2) | Exit **0** · 80s | Exit **1** · raw **3.4** | EXPOSED hook + Giphy/off-topic junk |
| Healthcare-web3 (A5#3 @ `a53ba40`) | Exit **0** · 70.8s · soft-pass-motion-healthcare(8v/4segs) | Exit **1** · raw **4.6** | clinical overlay; talking-head Archive — latest watch `video-watch-1785701024379` |
| Healthcare-web4–web7 (W2) | Exit **1** | n/a | `HARVEST_VOLUME_FAIL` / SCRIPT_TIMEOUT — post-top-up relevance strips motion (`protected-motion`≈0–1) |
| Housing-v2 | Exit **1** | n/a | `HARVEST_VOLUME_FAIL` (7 segs; junk/pHash + thin web pool) |

Watcher honesty is working: raw &lt;7 → exit 1 until quality lands. Floors have **not** been lowered. Airline cold-topic ≥7 landed on **web harvest** (no Pexels/Pixabay) and remains **CLOSED** at raw **7.8** (airline-web8). Remaining pack: housing + healthcare — **no fresh WATCH_REPORT shows ≥7**.

Local proof (gitignored): `test-recordings/dod-proof/` + `SUMMARY.txt` (W2-PACK: **PACK_OPEN**). Status: `/tmp/dod-agents/W2-PACK.md`.

**Not done:** housing/healthcare upload-ready YES, brutal raw ≥7 on those topics, 3-topic web-harvest green pack, prod deploy currency. Do not claim these from fixture/mock harvest, thin Archive-only runs, tip code alone, or in-flight generates without a WATCH_REPORT.

---

## §B — Open: web-harvest quality ≥7

**Primary product path = raw web harvest** (Bing / Google / DDG / Archive.org /
yt-dlp clip download). Pexels and Pixabay are **optional niceties** — not
required for DoD. See [`docs/ENV_DOD.md`](ENV_DOD.md).

Verified 2026-08-01: no Pexels/Pixabay keys in `.env.local`. That is fine for
web-harvest proof. Open bars are pipeline and gate quality, not key absence:

| Bar | Status | Unblock |
|-----|--------|---------|
| **Web-motion gate recognition** | **CLOSED** (airline) | airline-web8 raw **7.8** / upload-ready YES via Archive+web inject — **still CLOSED** |
| **CLI top-up diversity** | **PARTIAL** | Airline + healthcare soft-pass proven (web1/web3 gen exit 0); housing tip gens exit 0; housing-v2 volume historically failed |
| **Upload-ready YES (≥7)** | **PARTIAL** | Airline **YES**; housing + healthcare still **NO** on every fresh WATCH_REPORT |
| **Brutal raw ≥ 7** | **PARTIAL** | Airline-web8 raw **7.8** only. Housing: tip-best **5.2** (web18); web20 **4.8**; hist **5.8** (web5). Healthcare: best **5.2** (web1). **No new ≥7.** |
| **3-topic proof pack** | **OPEN** | W2-PACK 90m poll → **PACK_OPEN** — airline YES @ 7.8 packed; housing + healthcare still &lt;7 — see `dod-proof/SUMMARY.txt` + `/tmp/dod-agents/W2-PACK.md` |
| **9.3 stretch** | **OPEN** (after pack) | `npm run loop:video -- --until-score 9.3 --max 1` — **not started** (pack not green); block: `/tmp/dod-wave-f/loop-9.3.log` |

Do not invent passing scores. Do not claim ≥7 from tip commits or failed volume cycles. Do not claim ≥7 is blocked by missing stock keys.

---

## §C — Railway / prod deploy currency

**Status: BLOCKED** (W2 re-scan 2026-08-02T20:19Z) — no personal/team Railway token on this VM.
Evidence: [`/tmp/dod-agents/W2-RAILWAY.md`](/tmp/dod-agents/W2-RAILWAY.md), prior [`A7-STATUS.md`](/tmp/dod-agents/A7-STATUS.md), [`ENV_DOD.md`](ENV_DOD.md).

`RAILWAY_API_TOKEN` / `RAILWAY_TOKEN` are **present** but are the cursor-worker **runtime service** credential. `AUTOTUBE_RAILWAY_TOKEN` is **absent** (process env + `.env.local`). **Do not force deploy without auth.** Prod deploy currency stays **OPEN / BLOCKED** until:

```bash
npm run env:debug-railway    # exit 0 with source AUTOTUBE_RAILWAY_TOKEN (exit 2 = worker-only credential)
npm run railway:completion-check
```

Expected when prod image/commit matches local HEAD: exit **0**.

Prod app is still an **old container** until a fresh deploy from this branch lands. `npm run deploy:status` / `railway:smoke` for live state. Do not claim deploy parity from green CI or HTTP smoke alone.

### Re-scan — 2026-08-02T20:19Z @ tip `ec994af`

Local HEAD: `ec994afb308263f5a8271b3cb9ac4a58fef1d404`

#### Token presence (names only)

| Location | `AUTOTUBE_RAILWAY_TOKEN` | `RAILWAY_API_TOKEN` | `RAILWAY_TOKEN` |
|----------|--------------------------|---------------------|-----------------|
| Process env | unset | SET (worker) | SET (same worker value) |
| `.env.local` | absent | present (worker) | absent |
| `~/.config/railway/token` | missing | — | — |

#### `npm run env:debug-railway` — exit **2** (worker-only)

```
AUTOTUBE_RAILWAY_TOKEN: unset
RAILWAY_API_TOKEN: SET
✅ Token present (source: RAILWAY_API_TOKEN)
⚠️  Likely Railway *runtime/service* credential … exit 2
```

#### `npm run railway:smoke` — **PASS** (exit 0) — stale SHA

```
Health: {"status":"ok","uptime":1730016,"deploy":{"gitCommit":"3e6f62458c5464e3bb3579751573de3b1a8e80dd","deployImage":"ghcr.io/nickaisbitt/autotube:3e6f62458c5464e3bb3579751573de3b1a8e80dd","sourceConnected":false}}
✓ index: HTTP 200
✓ api health: HTTP 200
Smoke passed.
```

`railway:completion-check` / deploy **not attempted** — would Not Authorize without personal token (prior A7/W2: GraphQL Not Authorized on worker cred).

#### Human unblock (exact)

1. Create a Personal or Team API token at https://railway.app/account/tokens
2. Add to AutoTube `.env.local` (gitignored): `AUTOTUBE_RAILWAY_TOKEN=<token>`
   — or set the same name as a Cursor Environment secret on **railway-AutoTube** and start a new agent
3. Re-run:

```bash
npm run env:debug-railway          # must exit 0, source AUTOTUBE_RAILWAY_TOKEN
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
| `railway:completion-check` | **BLOCKED** (not re-run) | Needs personal token; prior runs Not Authorized |
| `railway:smoke` | **PASS** | Prod live HTTP 200 |
| SHA match (prod vs local HEAD) | **MISMATCH** | prod `3e6f624` ≠ local `ec994af` |
| Deploy currency | **BLOCKED / OPEN** | Needs personal `AUTOTUBE_RAILWAY_TOKEN`, then redeploy |

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
