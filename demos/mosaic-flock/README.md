# Mosaic Flock

Signature-technique code film: ~9,216 glass and gold-leaf tiles that were never cemented. They lift from a mosaic wall, swim as a school of fish, rise as cranes, pin into a night constellation, then spiral away.

Inspired by the craft of viral glass-tile flock films — every figure *is* a flock of tiles — not a copy of any assets.

## Watch / render

```bash
# previews + checks
node demos/code-film/shared/harness.mjs demos/mosaic-flock/index.html --preview 2,8,16,28,40,52,62
node demos/code-film/shared/harness.mjs demos/mosaic-flock/index.html --contact --check

# full MP4 (playable H.264 ≤4.1 + 720p preview)
node demos/code-film/shared/harness.mjs demos/mosaic-flock/index.html --render
```

Interactive: open `index.html` and press Play.

## Specs

| | |
|---|---|
| Technique | `glass-tile-flock` |
| Duration | 66s @ 30fps |
| Resolution | 1920×1080 |
| Tiles | 128×72 = 9,216 |
| Runtime | `seekPure: true` — pure `seek(t)` |
| Audio | Web Audio from the same storyboard events |

## Journey

wall mosaic → tiles lift → fish swim → cranes form → day-to-night → constellation → spiral disperse → title card
