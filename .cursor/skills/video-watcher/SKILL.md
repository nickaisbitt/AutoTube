# Video Watcher (AutoTube)

Use when the user says a rendered video looks bad, wants review, retention audit, or "watch this MP4".

## MCP tools (preferred)

1. Call **`watch_video`** on the `video-watcher` MCP server (`mode: "quick"` default).
2. If no path given, it uses the latest `docs/artifacts/FINAL-VIDEO-youtube-full.mp4` or review export.
3. Read **`WATCH_REPORT.md`** top fixes (numbered) and **`contact-sheet.jpg`** for visual proof.
4. Reply using **numbered lists only** — reference report item numbers.

### Parameters

| Param | Use |
|-------|-----|
| `mode: "quick"` | First 90s + brutal + hook vision (default) |
| `mode: "full"` | Entire video + repetition scan |
| `skip_vision: true` | Frames only; you analyze JPGs manually |
| `video_path` | Explicit MP4 |

Set `OPENROUTER_API_KEY` in Cursor → Settings → MCP → video-watcher → env for automated vision scores.

## Improvement loop (generate + review + repeat)

```bash
npm run loop:video              # random topic each iteration, forever
npm run loop:video:once         # single cycle
npm run loop:video -- --max 5 --delay 60
```

See `docs/VIDEO_IMPROVEMENT_LOOP.md`.

## CLI fallback

```bash
npm run watch:video
npm run watch:video -- docs/artifacts/FINAL-VIDEO-youtube-full.mp4 --interval 3 --max 90
```

Output: `test-recordings/video-watch-<id>/WATCH_REPORT.md` + frames + contact sheet.

## What "good" means here

**Final quality /100** = retention composite capped by **assembly audit** (contact sheet + frames).

| Score | Meaning |
|-------|---------|
| 91+ | Upload-ready (retention + assembly both strong) |
| 75–90 | Passes gates but assembly weak — not done |
| &lt;75 | Do not ship |

Assembly audit catches what gates miss: off-topic B-roll, repeated clips, caption gibberish, slideshow energy.

Always read **contact-sheet.jpg** and **Assembly issues** in the report before trusting the score.
