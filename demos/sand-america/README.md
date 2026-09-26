# Sand America

Opus-bar particle-sand short: grains fall, pile, and pour into US history icons on one table — Liberty Bell, westward wagon & rails, Wright flyer, moon lander, skyline fireworks — then settle on the end card.

~80 seconds · 1920×1080 · 30 fps · zero external assets · score from the same `events` list as the picture.

Inspired by the craft of Michael Guo’s sand-history films; tasteful and silhouette-led, not cartoon-jingo.

## Journey

Sand forms, then pours into the next:

1. Open table — grains gather into a mound
2. Liberty Bell / 1776
3. Covered wagon on rails westward
4. Wright flyer
5. Moon lander + flag
6. Skyline — fireworks settle into the city
7. End card: *written in sand & code*

## Technique

**Particle-sand** (`seekPure: true`). Each grain’s position at time `t` is a pure function: fall from above into a silhouette mask, micro-settle while locked, then cascade/pour into the next form. No stateful simulation — no `warmTo` / `nextFrame`.

## API

```js
window.FILM = {
  ready, duration, fps, width, height,
  storyboard,   // demos/code-film/shared/storyboard.schema.json
  canvas / out,
  seek(t),      // frame-pure draw at time t
  seekPure: true,
  renderAudio() // base64 WAV
};
```

## Harness

```bash
node demos/code-film/shared/harness.mjs demos/sand-america/index.html --preview 3,15,30,45,60,75
node demos/code-film/shared/harness.mjs demos/sand-america/index.html --check
node demos/code-film/shared/harness.mjs demos/sand-america/index.html --render
```

Outputs land in `out/` (`*-preview.mp4` for GitHub, `*-web.mp4` for 1080p).

## Watch

Open `index.html` and press **Play with sound**, or play `out/sand-america-preview.mp4` after a render.
