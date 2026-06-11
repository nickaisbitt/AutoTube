# Loop Final Report — Phase 5 Assembly Quality Push
Generated: 2026-06-11T18:35:00Z  
Branch: `cursor/five-agent-quality-push-4719`  
PR: #23

---

## Scoreboard

| Metric | Wave 4 (iter 42) | Phase 5 (iter 46) | Target | Status |
|--------|------------------|-------------------|--------|--------|
| **Final quality** | 60/100 | **50/100** | ≥91 | ❌ FAIL |
| **Assembly audit** | 45/100 | **35/100** | ≥80 | ❌ FAIL (regressed) |
| Retention composite | 91.2/100 | **94.3/100** | — | ✅ +3.1 |
| Objective gate | PASS | **PASS** | PASS | ✅ |
| Scene hook zone | PASS (2.0s) | **PASS (1.7s)** | ≤2s | ✅ |
| Hook score | 95/100 | 90/100 | — | ✅ |
| Placeholder gate | PASS | **PASS (0%)** | PASS | ✅ |

---

## Artifact Paths (Phase 5 best honest score)

| Artifact | Path |
|----------|------|
| Final MP4 | `test-recordings/full-1781202093375/final-video-final.mp4` |
| Contact sheet | `test-recordings/video-watch-1781202826356/contact-sheet.jpg` |
| Watch report | `test-recordings/video-watch-1781202826356/WATCH_REPORT.md` |
| Render manifest (Modal proxy) | `test-recordings/full-1781202093375/ffmpeg-assembly/render-manifest.json` |
| Media sanitize report | `test-recordings/full-1781202093375/media-sanitization.json` |

**MP4 technical specs:** H.264 1920×1080 | 63.3s | ~39 MB Modal encode

---

## Merge Decision: NO ❌

Gate requires final ≥ 91 AND assembly ≥ 80.  
Actual (iter 46): final=50, assembly=35.  
**Do not merge PR #23.**

---

## Phase 5 Shipped (code)

| Commit area | What changed |
|-------------|--------------|
| `assembly-system.mjs` | Clip budget, deferred URL dedup, diversity metrics + proxy gate |
| `harvest-quality.mjs` / `generate-full-video.mjs` | Escalating top-up, lifestyle blocks, volume soft-pass, relaxed rescue |
| `build-edit-timeline.mjs` | 12s URL spacing, per-segment cap, hook zone, spacing in fallbacks |
| `ffmpegOverlays.mjs` | Punctuation-first captions, phraseIsValid, boundary discard |
| `modal-render.mjs` | Local diversity manifest after Modal; spacing proxy warnings |
| `validate-loop-video.mjs` | Diversity gate; Modal spacing proxy bypass to vision audit |

**Tests:** 233 harvest-quality checks + 15 assembly-diversity vitest — all pass.

---

## Contact-sheet honesty (iter 46)

Vision assembly audit issues confirmed on contact sheet:

1. **Louvre pyramid repeat** — frames 1–4 are the same wide Louvre shot with different caption overlays.
2. **Interior repeat** — museum interior appears twice (frames 9 and 12).
3. **Caption fragments** — single-word lines (`THE`, `WHO,`, `TOO,`) still visible despite 3-word min gate.
4. **Off-topic clip** — “WATCH FREE MOVIES ON TIKTOK” promo frame in body.
5. **Thin pool** — sanitize 35→19 assets; 25 timeline clips from ~19 unique sources.

Modal proxy manifest: `uniqueUrlsUsed=25`, `maxUrlSharePct=5%`, `adjacentRepeatCount=0`, but `spacingViolations=7` (proxy metric; vision still flags visual repeats).

---

## Root cause (unchanged)

Retention/objective gates pass routinely (~94 retention). **Assembly audit** is the blocker:

- URL dedup ≠ visual dedup (same Louvre shot, different URLs/thumbnails).
- Harvest sanitization drops many video clips (proxy probe failures) → thin pool → repeat montage.
- Caption phrase gate not fully effective on Modal overlay path (fragments still render).

---

## Next iteration priorities

1. **Timeline visual dedup** — enforce pHash spacing in `build-edit-timeline` pick loop (not just harvest pool).
2. **Caption sentence boundaries** — discard phrases without terminal punctuation unless ≥4 words; verify Modal `ffmpegOverlays` path.
3. **Harvest volume** — reduce aggressive relevance/phash drops when pool near clip budget; keep crime-action queries.
4. **Block promo/lifestyle frames** — extend blocklist for “watch free movies” TikTok promo patterns.
