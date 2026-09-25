# Tide Ink v2

A continuous-world rebuild of Tide Ink: one ocean/sky, a traveling camera, particle-ink subjects that stay thumbnail-readable.

~64 seconds · 1920×1080 · 30 fps · zero external assets · score from the same `events` list as the picture.

## Journey

The camera pushes, pans, and orbits through a single world:

1. Open sea — ink gathers
2. Title assembles in the foam
3. Whale swims through light
4. Coast appears — lighthouse approaches
5. Beam sweeps under the moon
6. Storm gathers — ship pitches
7. Lightning and rain
8. Dawn — paper boat on calm water
9. Sky whale as constellation
10. End card

## Technique

**Particle-ink** sampled from silhouette masks in world space. Particles settle into whale / lighthouse / ship / boat shapes; curl noise and event whooshes keep transitions liquid. The ocean, horizon, and sky are always present — cuts are camera moves, not slideshow dissolves.

## API

```js
window.FILM = {
  ready, duration, fps, width, height,
  storyboard,   // demos/code-film/shared/storyboard.schema.json
  canvas / out,
  seek(t),      // frame-pure draw at time t
  renderAudio() // base64 WAV
};
```

## Harness

```bash
node demos/code-film/shared/harness.mjs demos/tide-ink-v2/index.html --preview 2,8,14,26,38,50
node demos/code-film/shared/harness.mjs demos/tide-ink-v2/index.html --check
node demos/code-film/shared/harness.mjs demos/tide-ink-v2/index.html --render
```

Outputs land in `out/` (`*-preview.mp4` for GitHub, `*-web.mp4` for 1080p).

## Watch

Open `index.html` and press **Play with sound**, or play `out/tide-ink-v2-preview.mp4` after a render.
