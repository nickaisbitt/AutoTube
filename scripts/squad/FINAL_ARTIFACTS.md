# Final ship artifacts

After a successful full pipeline run, these files exist on disk (not committed — see `.gitignore`):

| Artifact | Path |
|----------|------|
| **Canonical final MP4** | `test-recordings/FINAL-VIDEO-final.mp4` |
| R7 alias | `test-recordings/FINAL-OUTPUT-final.mp4` |
| Manifest | `test-recordings/SHIP_MANIFEST.json` |
| Render log | `test-recordings/latest-render.log` |
| Thumbnail | `test-recordings/thumbnail.png` |

## Regenerate everything

```bash
# Terminal 1
npm run dev -- --port 5173 --host 0.0.0.0

# Terminal 2 — product path (UI → server-render)
npm run generate:video -- "Your topic"

# Or fixture-only (no browser)
npm run render:fixture:full

# Finalize + verify
npm run ship:finalize
npm run squad:gate
npm run ship:complete
```

## Last verified run (2026-06-02)

- **Duration:** 209.5s  
- **Size:** ~40.7 MB  
- **Source:** `npm run generate:video` → `full-*/final-video-final.mp4`  
- **Gates:** R7 7/7, smoke 3/3, full E2E 1/1, unit 1742/1742  
