# Pixel Wizard

Opus-bar pixel-art wizard film: a fixed **24-color** night scene drawn into a **160×90** buffer, nearest-neighbor scaled to **1920×1080**. State machine: idle bob → charge staff → cast burst → recovery → walk → cast again → title. Spell particles snap to the pixel grid; casts shake the screen. Zero external assets; Web Audio chiptune score; `seekPure: true`.

## Watch / verify

```bash
node demos/code-film/shared/harness.mjs demos/pixel-wizard/index.html --preview 2,8,14,20,28
node demos/code-film/shared/harness.mjs demos/pixel-wizard/index.html --check
```

Full MP4 (optional):

```bash
node demos/code-film/shared/harness.mjs demos/pixel-wizard/index.html --render
```

Interactive: open `index.html` and press Play.

## Spec

| | |
|--|--|
| Duration | 30s @ 30fps |
| Output | 1920×1080 |
| Internal | 160×90 palette indices → hard clamp ≤24 colors |
| Technique | `pixel-buffer-nearest-neighbor` |
| Score | square/triangle arps + noise whooshes on cast events |
