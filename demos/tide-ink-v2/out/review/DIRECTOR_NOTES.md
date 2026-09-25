# Tide Ink v2 — Director Notes

Harness: `--preview 3,8,14,26,38,50,60` + `--check` → **PASS** (seekPure, zero assets, beat misses 0).

## Ranked defects (from stills) → fixes

1. **Open sea empty wallpaper (0–6s)** — Added early `swirl` mask; particles concentrate near camera; `wSwirl` locks by ~2s. Thumbnail at t=3 is a clear spiral, not blank ocean.
2. **Whale mushy / small (12–16s)** — Thickened body/fluke/peduncle mask; denser core sizes; shot zoom 1.52 + follow lock; caption lifts via `subjectLowExtent`. Fluke still slightly soft at edges.
3. **Lighthouse weak shaft (24–27s)** — Wider shaft/lamp/gallery/cliff; camera vigil hold + zoom floor; caption lifts above cliff. Shaft readable; cliff still a bit airy; caption can kiss lantern tip.
4. **Ship scatter / off-center (36–40s)** — Thicker hull/sail; leftovers pushed farther; ship camera hold centers subject. Outline still has light edge noise.
5. **Constellation blob (≈50s)** — Sparse dithered body + thicker rays; explicit `drawConstellationStars` overlay (bright nodes + connectors). Reads as sky whale more than before; stars compete with body dust.
6. **Captions in lower third** — `subjectLowExtent` lifts whale/ship/boat/swirl/lighthouse captions to `H*0.1`.
7. **Vignette crush** — Softened to outer-only ~0.26 (was 0.5 full-frame).
8. **Mushy blends** — Sharper `formationWeights` crossfades; curl drift scales down when locked; non-core scatter culled when any form is locked.

## Per-timestamp stills

| t | Subject | Verdict |
|---|---------|---------|
| 3s | Ink swirl | **Pass** — readable spiral, not empty sea |
| 8s | Title | **Pass** — TIDE INK block letters lock |
| 14s | Whale | **Pass** — whale silhouette + lifted caption; fluke tip soft |
| 26s | Lighthouse | **Pass** — tower+lamp+beam readable; cliff density medium |
| 38s | Ship | **Pass** — hull+sail readable and centered; light edge scatter |
| 50s | Constellation | **Pass / soft** — whale outline + star overlay; stars could punch harder |
| 60s | End card | **Pass** — title settle |

## Constraints preserved

`seekPure: true`, duration 64, fps 30, continuous-world camera, zero external assets, storyboard beats unchanged.
