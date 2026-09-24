# Tide Ink

A 66-second, 1920×1080 film written entirely in code: no footage, no image or video models, no audio samples, no image files.

32,000 particles of luminous ink keep re-forming into memories of the sea:

1. a spark blooms into a spiral nebula
2. the title assembles itself
3. a humpback whale swims through light rays
4. a lighthouse sweeps its beam under the moon
5. a ship pitches through a storm, rain and lightning
6. a paper boat rests on a dawn sea
7. the whale returns as a constellation
8. end card

## How it works

- **Shapes** are drawn with Canvas 2D paths offscreen, then sampled into particle targets, weighted by alpha and carrying their colours.
- **Motion** is a spring-and-curl-noise particle simulation with staggered hand-offs between scenes, so every transition becomes an ink swirl. Each shape has its own motion: the whale's body wave, the fin stroke, the ship's roll and heave, the beam sweep, the waves.
- **Rendering** is WebGL2 additive points into a decaying trail buffer, then a custom bloom chain, tone mapping, chromatic fringe, vignette and grain.
- **Score** is Web Audio synthesis. The same code plays live and renders offline: detuned saw pads through a D minor → D major progression, a sub bass, plucked arpeggios, FM lighthouse bells, gliding whale song, wind, rain, thunder, whooshes and impacts, all through a generated convolution reverb.

## Watch

Open one of these in any normal video player (QuickTime, VLC, Chrome, the GitHub file view):

- `out/tide-ink-preview.mp4` — 720p, about 6 MB. This is the one GitHub will play in the browser.
- `out/tide-ink-web.mp4` — 1080p. Download it; GitHub will not preview files this large.

Both are H.264 High profile at level 4.1 or below, with AAC audio and the index at the front of the file, so they start immediately.

Or open `index.html` and press **Play with sound**. That version is drawn live and needs a GPU.

## Render

```bash
npx playwright install chromium
node demos/tide-ink/render.mjs                    # full MP4 -> demos/tide-ink/out/tide-ink.mp4
node demos/tide-ink/render.mjs --preview 16,28,48 # PNG stills for review
```
