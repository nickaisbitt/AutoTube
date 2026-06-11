# Loop Final Report — Wave 4 Quality Gate
Generated: 2026-06-11T15:46:05Z  
Branch: `cursor/five-agent-quality-push-4719`  
PR: #23

---

## Scoreboard

| Metric | Prior Best (iter 41) | Wave 4 (iter 42) | Target | Status |
|--------|---------------------|------------------|--------|--------|
| **Final quality** | 60/100 | **60/100** | ≥91 | ❌ FAIL |
| **Assembly audit** | 45/100 | **45/100** | ≥80 | ❌ FAIL |
| Retention composite | 82.4/100 | **91.2/100** | — | ✅ +8.8 |
| Objective gate | FAIL | **PASS** | PASS | ✅ Fixed |
| Scene hook zone | FAIL (3.8s max) | **PASS (2.0s max)** | ≤2s | ✅ Fixed |
| Hook score | 95/100 | 95/100 | — | ✅ |
| Caption readability | — | 85/100 | — | ✅ |
| Pacing | — | 75/100 | — | ⚠️ |

---

## Artifact Paths

| Artifact | Path |
|----------|------|
| Final MP4 | `test-recordings/full-1781192058689/final-video-final.mp4` |
| Canonical | `test-recordings/FINAL-VIDEO-final.mp4` |
| Contact sheet | `test-recordings/video-watch-1781192696237/contact-sheet.jpg` |
| Watch report | `test-recordings/video-watch-1781192696237/WATCH_REPORT.md` |
| Loop journal | `test-recordings/improvement-loop/JOURNAL.jsonl` |

**MP4 technical specs:** H.264 1920×1080 @ 24fps | AAC 96kHz 2ch | 66.8s | 34.3 MB | 4310 kbps

---

## Merge Decision: NO ❌

Gate requires final ≥ 91 AND assembly ≥ 80.  
Actual: final=60, assembly=45.  
**Do not merge PR #23.**

---

## What Wave 4 Fixed vs What Remains

### Fixed by Wave 4 ✅
1. **Hook zone hold** (`9fe1f3c`): HOOK_MAX_HOLD_SEC=2s enforced in first 10s — hook longest is now 2.0s (was 3.8s, was failing objective gate)
2. **Objective gate**: scene_hook:ok, scene_body:ok, silence:ok, tech_score:ok — all PASS (iter 41 had objectivePass=false)
3. **Retention composite**: 82.4 → 91.2 (+8.8 points) — the content quality, script, and technical execution are now at upload-threshold retention
4. **Caption phrase minimum** (`fc74cea`): 3-word min + boundary carry-forward in place; captionReadability 85/100
5. **Crime-action harvest queries + dedup** (`0c6df91`): dedupHarvestByUrl prevents duplicate URL ingestion; expanded query terms

### Remaining Failures (Assembly = 45/100) ✅
1. **Repeated off-topic clips**: "Woman at table" scene appears at multiple timestamps — aHash detects 0 duplicate runs (slightly different frames) but visually identical scene. Root cause: only 14 assets survive sanitization (26→14, with 28 dropped + 6 video→image conversions) for 3 segments. With minAssetsPerSegment=6 the system is **below quota** and re-uses what it has.
2. **Gibberish caption fragments**: "LOOT AT $120", "CCALLION A", "COMPILATION LIKE", "THAT'S A" — these are mid-sentence whisper-align boundary clips, not standalone phrases. The 3-word min fix prevents very short captions but doesn't prevent fragment clips showing mid-word slices from long words.
3. **Off-topic B-roll**: Yellow-shirt man, interview desk scene — not Louvre/heist-connected. Limited visual pool forces the system to re-use tangentially related clips.
4. **Harvest starvation**: The topic ("museum heist streamed live on TikTok") is niche. After sanitize + dedup + excludedUrls filtering, too few on-topic assets remain. The system needs broader fallback queries or a higher minAssetsPerSegment threshold trigger to force more harvest rounds.

---

## Gap Analysis: What Would Get Assembly to 80+

| Fix | Expected Impact | Difficulty |
|-----|----------------|------------|
| Require ≥3 distinct visual sources per segment (no single source >40% of clips) | Removes repeated-scene issue | Medium — add diversity gate in timeline builder |
| Caption clamp to sentence-end boundaries (not just word-length) | Fixes fragment captions like "THAT'S A" | Low — check punctuation before caption end |
| Broader fallback harvest queries when pool < 6/seg (e.g., "museum security footage", "art theft documentary") | More diverse on-topic B-roll | Low — extend harvest-loop-context query list |
| Stricter visual relevance scoring in media sanitize (penalize clips with no detected art/museum/crowd context) | Remove off-topic clips earlier | Hard — requires vision API in harvest loop |
| Increase minAssetsPerSegment to 9 and add 3rd top-off harvest pass | Forces wider asset search | Low — config change |

---

## Wave 4 Summary vs Prior

Wave 4 landed 4 commits that collectively raised the retention composite from 82.4 → 91.2 and fixed all objective gate failures. The pipeline is now technically clean: hook passes, pacing is within range, captions are legible. The single remaining blocker is **assembly quality** — specifically B-roll diversity and visual relevance for this niche topic. This is a harvest/selection problem, not a render/timing problem.

The prior best (iter 41) and Wave 4 (iter 42) both score 60/45 on the gate metrics, but iter 42 is meaningfully better internally: retention went up 8.8 points and the objective gate now passes. These improvements will compound in future iterations.
