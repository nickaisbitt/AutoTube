# Cold release aggregate — 18 topics (slices 1–6, 7–12, 13–18)

Combines the three cold held-out release slices run first-pass, blind, same-model judge
(`xiaomi/mimo-v2.5`, see `eval/JUDGE-LIMITATION.md`). Flags: cold + VisualBeats + BeatVision + whisperAlign.

| Slice | Run | Commit | Offset | Topics |
|-------|-----|--------|--------|--------|
| 1 (1–6)   | `eval-release-2026-07-15T05-27-00-340Z` | `d4d8d63` | 0  | rel-01..06 |
| 2 (7–12)  | `eval-release-2026-07-15T06-58-28-229Z` | `80cc0f8` | 6  | rel-07..12 |
| 3 (13–18) | `eval-release-2026-07-15T07-56-16-789Z` | `1343374` | 12 | rel-13..18 |

## Per topic (18 attempted, 17 watched)

| Id | Category | Topic | Raw | Upload | Critical |
|----|----------|-------|-----|--------|----------|
| rel-01 | infrastructure | rural ambulance GPS routes to demolished addresses | 6.6 | no | yes |
| rel-02 | science | university lab published fake climate sensor calibrations | 8.0 | yes | no |
| rel-03 | consumer | regional airline hid recurring cabin-pressure failures | 7.2 | no | yes |
| rel-04 | policy | city zoning map that erased flood-risk neighborhoods | 7.6 | yes | no |
| rel-05 | culture | indie game studios losing source code in cloud lockouts | 7.6 | yes | no |
| rel-06 | history | museum archive that mislabeled colonial artifacts | 7.4 | yes | no |
| rel-07 | sports | youth soccer league sold player biometric data | 6.6 | no | yes |
| rel-08 | infrastructure | ferry schedule algorithm that stranded night-shift workers | 7.8 | no | yes |
| rel-09 | consumer | language-learning app invented fake fluency certs | 7.2 | yes | no |
| rel-10 | science | wildlife refuge quietly approved oil survey drones | 7.6 | no | yes |
| rel-11 | policy | small-town newspaper leaked sealed juvenile court records | 7.4 | yes | no |
| rel-12 | culture | concert venue that sold the same reserved seats twice | 7.8 | yes | no |
| rel-13 | history | archival film reels dissolved after climate-control upgrade | 7.4 | yes | no |
| rel-14 | sports | marathon timing chip vendor falsified finish times | 6.6 | no | yes |
| rel-15 | infrastructure | water utility billed residents for leaks it caused | 7.8 | yes | no |
| rel-16 | science | observatory delayed reporting near-earth asteroid | 7.0 | no | yes |
| rel-17 | consumer | grocery loyalty cards → insurance pricing | — | — | **generate FAIL** |
| rel-18 | policy | refugee housing lottery gamed by landlords | 7.8 | yes | no |

rel-17 hit `SCRIPT_TIMEOUT` (Source Media never appeared after 240s) and was never watched.

## Aggregate stats

| Metric | Slice 1 | Slice 2 | Slice 3 | **Combined 18** | Bar |
|--------|---------|---------|---------|-----------------|-----|
| Generate success | 100% | 100% | 83.3% | **94.4%** (17/18) | — |
| Watched | 6 | 6 | 5 | **17** | — |
| Upload-ready | 66.7% | 50.0% | 60.0% | **58.8%** (10/17) | ≥50% → **PASS** |
| Critical | 33.3% | 50.0% | 40.0% | **41.2%** (7/17) | ≤25% → **FAIL** |
| Raw median | 7.5 | 7.5 | 7.4 | **7.4** | ≥7.2 → **PASS** |
| Raw p25 / p75 | — | — | 7.0 / 7.8 | **7.2 / 7.8** | ≥6.5 → **PASS** |
| Raw mean / min / max | — | — | 7.32 / 6.6 / 7.8 | **7.38 / 6.6 / 8.0** | — |

### By category (watched)

| Category | Watched | Upload-ready | Critical |
|----------|---------|--------------|----------|
| infrastructure | 3 | 1/3 | 2/3 |
| science | 3 | 1/3 | 2/3 |
| consumer | 2 | 1/2 | 1/2 |
| policy | 3 | 3/3 | 0/3 |
| culture | 2 | 2/2 | 0/2 |
| history | 2 | 2/2 | 0/2 |
| sports | 2 | 0/2 | 2/2 |

## Read

- **Upload-ready** and **raw median/p25** clear their calibrated bars on the combined 18-topic aggregate.
- **Critical** is the persistent blocker at **41.2%** — every slice has landed 33–50%, never near the ≤25% bar.
- Failures cluster in **sports, science, infrastructure**: fragmented/nonsensical text overlays, generic stock-footage montage with no narrative/personality, weak hooks, and caption readability over busy backgrounds.
- **policy / culture / history** topics pass cleanly, suggesting the generator handles narrative-rich civic/story topics better than data/logistics-heavy ones.
- One hard pipeline failure (rel-17 `SCRIPT_TIMEOUT`) is a reliability item, distinct from watch quality.

## Verdict

**Not release-ready.** Two of three release-candidate bars pass on the combined 18-topic aggregate, but critical stays roughly double the ≤25% bar. Do not claim release-ready until (1) critical drops below 25% on held-out topics and (2) results are confirmed with an independent `AUTOTUBE_WATCH_MODEL`. Next window: `--offset 18 --max 6` (topics 19–24).
