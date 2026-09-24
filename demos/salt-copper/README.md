# Salt & Copper

A 42-second square **code film** — no stock footage, no image models, no external assets.

An undersea telegraph cable stitches itself across the seafloor, carries a Morse “HELLO,” wakes a buoy light, and briefly remembers a constellation before the transmission ends.

## Watch

- Interactive: open [`index.html`](./index.html) in a browser and hit **Play**
- Rendered: [`out/salt-copper.mp4`](./out/salt-copper.mp4) (after render)

## Render

```bash
# from repo root (playwright + chromium required)
npx playwright install chromium
node demos/salt-copper/render.mjs
```

Output lands in `demos/salt-copper/out/salt-copper.mp4`.
